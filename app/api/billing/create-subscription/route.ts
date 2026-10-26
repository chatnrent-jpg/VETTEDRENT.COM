import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createGuestAccessCode } from "@/lib/seam";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  BillingConfigError,
  HOST_BPS,
  PLATFORM_BPS,
  VAULT_BPS,
  WEEKLY_CURRENCY,
  WEEKLY_INTERVAL,
  executeWithoutLimitation,
  getStripe,
  resolveWeeklyStayPrice,
  splitWeeklyCapture,
  weeklySplitMetadata,
  type WeeklySplitCents,
} from "@/lib/stripe";
import { applySimulatedWeeklyVault } from "@/lib/simulated-weekly-billing";
import { INTENDED_STAY_DAYS, readListingCompliance } from "@/lib/geo-compliance";
import {
  creditVaultCents,
  recordInstallmentInWeeklyDeductionLedger,
  type LedgerInstallmentSettlementResult,
  type VaultCreditResult,
} from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateSubscriptionBody = {
  customerEmail: string;
  hostAccountId: string;
  totalCents: number;
  tenantId: string;
  hostId: string;
  listingId: string;
  seamDeviceId: string;
};

type VaultOutcome =
  | VaultCreditResult
  | { ok: true; credited: false; reason: "invoice_not_paid" };

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = parseCreateSubscriptionBody(payload);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const split = splitWeeklyCapture(parsed.totalCents);

  let createdCustomerId: string | null = null;
  let createdSubscriptionId: string | null = null;

  try {
    const execution = await executeWithoutLimitation({
      operationName: "stripe.subscriptions.create",
      liveOperation: async () => {
        const stripe = getStripe();
        const weeklyPrice = await resolveWeeklyStayPrice(stripe, split.totalCents);
        const customer = await stripe.customers.create({
          email: parsed.customerEmail,
          metadata: { host_account_id: parsed.hostAccountId },
        });
        createdCustomerId = customer.id;

        const subscription = await stripe.subscriptions.create({
          customer: customer.id,
          items: [{ price: weeklyPrice.priceId }],
          transfer_data: {
            destination: parsed.hostAccountId,
          },
          metadata: weeklySplitMetadata(parsed.hostAccountId, split),
          expand: ["latest_invoice"],
        });
        createdSubscriptionId = subscription.id;

        const onboarded = await engageAgreement({
          tenantId: parsed.tenantId,
          hostId: parsed.hostId,
          listingId: parsed.listingId,
          seamDeviceId: parsed.seamDeviceId,
          subscriptionId: subscription.id,
        });

        const invoice = invoiceFromSubscription(subscription.latest_invoice);
        const applicationFeeStamped = await stampApplicationFee(stripe, invoice, split);

        let vault: VaultOutcome = {
          ok: true,
          credited: false,
          reason: "invoice_not_paid",
        };
        let ledgerInstallment: LedgerInstallmentSettlementResult | null = null;

        if (invoice && invoice.status === "paid") {
          const credit = await creditCapturedInvoice(invoice);
          if (!credit.ok) {
            throw new Error(credit.error);
          }
          vault = credit;

          const paidBasis = Number.isSafeInteger(invoice.amount_paid)
            ? invoice.amount_paid
            : split.totalCents;
          ledgerInstallment = await recordInstallmentInWeeklyDeductionLedger({
            totalCents: paidBasis,
            agreementId: onboarded.agreementId,
            tenantId: parsed.tenantId,
            stripeChargeId: invoice.id,
          });
        } else {
          ledgerInstallment = await recordInstallmentInWeeklyDeductionLedger({
            totalCents: split.totalCents,
            agreementId: onboarded.agreementId,
            tenantId: parsed.tenantId,
            stripeChargeId: subscription.id,
          });
        }

        return NextResponse.json({
          ok: true,
          simulated: false,
          fallbackUsed: false,
          fallbackSource: "live_api",
          subscriptionId: subscription.id,
          customerId: customer.id,
          agreementId: onboarded.agreementId,
          seamAccessCodeId: onboarded.seamAccessCodeId,
          productId: weeklyPrice.productId,
          priceId: weeklyPrice.priceId,
          totalCents: split.totalCents,
          currency: WEEKLY_CURRENCY,
          interval: WEEKLY_INTERVAL,
          split: splitPayload(split, parsed.hostAccountId),
          applicationFeeStamped,
          vault,
          ledgerInstallment,
        });
      },
      rollbackOperation: async () => {
        try {
          if (createdSubscriptionId || createdCustomerId) {
            const stripe = getStripe();
            if (createdSubscriptionId) {
              await stripe.subscriptions.cancel(createdSubscriptionId);
            }
          }
        } catch {
          // Ignore rollback cleanup errors before falling back to internal GMF vault
        }
      },
      fallbackOperation: async () =>
        simulatedWeeklyResponse(parsed.tenantId, parsed.totalCents),
    });

    return execution.value;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
    console.error("create subscription failed", code ?? "error");
    const message =
      error instanceof Error ? error.message : "Subscription creation failed";
    const safeMessage =
      error instanceof BillingConfigError || message.includes("not configured")
        ? message
        : "Subscription creation failed";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}

type EngagedAgreement = {
  agreementId: string;
  seamAccessCodeId: string | null;
};

async function simulatedWeeklyResponse(
  tenantId: string,
  totalCents: number,
): Promise<NextResponse> {
  try {
    const supabase = getSupabaseServerClient();
    const agreement = await supabase
      .from("agreements")
      .select("id, listing_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(1);

    const row = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
    let agreementId = row && typeof row.id === "string" ? row.id : "";
    const listingId =
      row && typeof row.listing_id === "string" ? row.listing_id : "vr-weekly-room";

    if (!agreementId) {
      const { data: commLic } = await supabase
        .from("active_commercial_licenses")
        .select("id")
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(1);
      const firstComm = Array.isArray(commLic) ? commLic[0] : null;
      if (firstComm && typeof (firstComm as { id?: unknown }).id === "string") {
        agreementId = (firstComm as { id: string }).id;
      } else {
        agreementId = tenantId;
      }
    }

    const compliance = await readListingCompliance(
      supabase,
      listingId,
      INTENDED_STAY_DAYS,
    );
    if (!compliance.allowed) {
      return NextResponse.json({
        ok: false,
        error: compliance.blockReason ?? "This stay is outside the jurisdiction rules.",
        geoCompliance: compliance.statusLabel,
      });
    }
    const result = await applySimulatedWeeklyVault({
      payerKey: tenantId,
      agreementId,
      totalCents,
    });
    return NextResponse.json({
      ...result,
      fallbackUsed: true,
      fallbackSource: "internal_gmf_vault_rollback",
    });
  } catch (error) {
    console.error("weekly billing failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Weekly billing failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function engageAgreement(input: {
  tenantId: string;
  hostId: string;
  listingId: string;
  seamDeviceId: string;
  subscriptionId: string;
}): Promise<EngagedAgreement> {
  const supabase = getSupabaseServerClient();
  const tenantName = await readTenantDisplayName(supabase, input.tenantId);
  const seamAccessCodeId = await provisionGuestCode(input.seamDeviceId, tenantName);
  const agreementId = randomUUID();

  try {
    const { error } = await supabase.from("agreements").insert({
      id: agreementId,
      tenant_id: input.tenantId,
      host_id: input.hostId,
      listing_id: input.listingId,
      tenant_name: tenantName,
      status: "active",
      stripe_subscription_id: input.subscriptionId,
      seam_access_code_id: seamAccessCodeId,
      payment_status: "current",
      risk_level: "clear",
      vault_balance_cents: 0,
    });
    if (error) {
      throw new Error("agreement insert failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "agreement insert failed") {
      throw error;
    }
    throw new Error("agreement insert failed");
  }

  console.log(`[AGREEMENT ENGAGED] agreement ${agreementId}`);
  return { agreementId, seamAccessCodeId };
}

async function readTenantDisplayName(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", tenantId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("profile read failed");
    }
    const fullName = textOrNull(data.full_name);
    if (fullName) {
      return fullName;
    }
    const email = textOrNull(data.email);
    if (email) {
      return email;
    }
    return `Tenant-${tenantId.slice(0, 5)}`;
  } catch (error) {
    if (error instanceof Error && error.message === "profile read failed") {
      throw error;
    }
    throw new Error("profile read failed");
  }
}

async function provisionGuestCode(
  deviceId: string,
  tenantName: string,
): Promise<string | null> {
  try {
    const seamAccessCodeId = await createGuestAccessCode(deviceId, tenantName);
    console.log(`[ACCESS PROVISIONED] Seam code ${seamAccessCodeId}`);
    return seamAccessCodeId;
  } catch {
    console.error(
      "[SEAM HARDWARE TIMEOUT] Guest code was not created. Agreement insert will continue.",
    );
    return null;
  }
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function splitPayload(split: WeeklySplitCents, hostAccountId: string) {
  return {
    hostCents: split.hostCents,
    vaultCents: split.vaultCents,
    platformCents: split.platformCents,
    applicationFeeCents: split.applicationFeeCents,
    hostBps: HOST_BPS,
    vaultBps: VAULT_BPS,
    platformBps: PLATFORM_BPS,
    hostAccountId,
  };
}

async function stampApplicationFee(
  stripe: Stripe,
  invoice: Stripe.Invoice | null,
  fallback: WeeklySplitCents,
): Promise<boolean> {
  if (!invoice || invoice.status !== "draft") {
    return false;
  }
  const basis = Number.isSafeInteger(invoice.total) ? invoice.total : fallback.totalCents;
  const fee = splitWeeklyCapture(basis).applicationFeeCents;
  await stripe.invoices.update(invoice.id, {
    application_fee_amount: fee,
  });
  return true;
}

async function creditCapturedInvoice(
  invoice: Stripe.Invoice,
): Promise<VaultCreditResult> {
  if (!Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid < 0) {
    return { ok: false, error: "Paid invoice amount is not integer cents" };
  }
  const payerKey = payerKeyFromCustomer(invoice.customer);
  if (!payerKey) {
    return { ok: false, error: "Paid invoice is missing a payer" };
  }
  const split = splitWeeklyCapture(invoice.amount_paid);
  return creditVaultCents({
    payerKey,
    invoiceId: invoice.id,
    vaultCents: split.vaultCents,
  });
}

function invoiceFromSubscription(
  latest: Stripe.Subscription["latest_invoice"],
): Stripe.Invoice | null {
  if (!latest || typeof latest === "string") {
    return null;
  }
  return latest;
}

function payerKeyFromCustomer(
  customer: Stripe.Invoice["customer"],
): string | null {
  if (typeof customer === "string") {
    return customer;
  }
  if (
    customer &&
    typeof customer === "object" &&
    "id" in customer &&
    typeof customer.id === "string"
  ) {
    return customer.id;
  }
  return null;
}

function parseCreateSubscriptionBody(
  payload: unknown,
): CreateSubscriptionBody | { error: string } {
  if (!payload || typeof payload !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.customerEmail !== "string" || !p.customerEmail.includes("@")) {
    return { error: "Missing or invalid customerEmail" };
  }
  if (typeof p.hostAccountId !== "string" || !p.hostAccountId.startsWith("acct_")) {
    return { error: "Missing or invalid Stripe hostAccountId" };
  }
  if (
    typeof p.totalCents !== "number" ||
    !Number.isSafeInteger(p.totalCents) ||
    p.totalCents <= 0
  ) {
    return { error: "Missing or invalid totalCents amount" };
  }
  if (typeof p.tenantId !== "string" || p.tenantId.length === 0) {
    return { error: "Missing or invalid tenantId" };
  }
  if (typeof p.hostId !== "string" || p.hostId.length === 0) {
    return { error: "Missing or invalid hostId" };
  }
  if (typeof p.listingId !== "string" || p.listingId.length === 0) {
    return { error: "Missing or invalid listingId" };
  }
  if (typeof p.seamDeviceId !== "string" || p.seamDeviceId.length === 0) {
    return { error: "Missing or invalid seamDeviceId" };
  }

  return {
    customerEmail: p.customerEmail,
    hostAccountId: p.hostAccountId,
    totalCents: p.totalCents,
    tenantId: p.tenantId,
    hostId: p.hostId,
    listingId: p.listingId,
    seamDeviceId: p.seamDeviceId,
  };
}
