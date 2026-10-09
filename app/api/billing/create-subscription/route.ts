import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createGuestAccessCode } from "@/lib/seam";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  HOST_BPS,
  PLATFORM_BPS,
  VAULT_BPS,
  getStripe,
  splitWeeklyCapture,
  weeklySplitMetadata,
  type WeeklySplitCents,
} from "@/lib/stripe";
import { creditVaultCents, type VaultCreditResult } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKLY_CURRENCY = "usd";
const WEEKLY_INTERVAL = "week" as const;

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

  try {
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email: parsed.customerEmail,
      metadata: { host_account_id: parsed.hostAccountId },
    });

    // TODO(Henry): reuse one stable Price instead of creating a product per call.
    const product = await stripe.products.create({
      name: "VettedRent weekly stay",
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        {
          price_data: {
            currency: WEEKLY_CURRENCY,
            unit_amount: split.totalCents,
            recurring: { interval: WEEKLY_INTERVAL },
            product: product.id,
          },
        },
      ],
      transfer_data: {
        destination: parsed.hostAccountId,
      },
      metadata: weeklySplitMetadata(parsed.hostAccountId, split),
      expand: ["latest_invoice"],
    });

    const onboarded = await engageAgreement({
      tenantId: parsed.tenantId,
      hostId: parsed.hostId,
      listingId: parsed.listingId,
      seamDeviceId: parsed.seamDeviceId,
      subscriptionId: subscription.id,
    });

    const invoice = invoiceFromSubscription(subscription.latest_invoice);
    const applicationFeeStamped = await stampApplicationFee(stripe, invoice, split);

    let vault: VaultOutcome = { ok: true, credited: false, reason: "invoice_not_paid" };
    if (invoice && invoice.status === "paid") {
      const credit = await creditCapturedInvoice(invoice);
      if (!credit.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: credit.error,
            subscriptionId: subscription.id,
            customerId: customer.id,
            agreementId: onboarded.agreementId,
            seamAccessCodeId: onboarded.seamAccessCodeId,
            split: splitPayload(split, parsed.hostAccountId),
            applicationFeeStamped,
            vault: credit,
          },
          { status: 500 },
        );
      }
      vault = credit;
    }

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.id,
      customerId: customer.id,
      agreementId: onboarded.agreementId,
      seamAccessCodeId: onboarded.seamAccessCodeId,
      totalCents: split.totalCents,
      currency: WEEKLY_CURRENCY,
      interval: WEEKLY_INTERVAL,
      split: splitPayload(split, parsed.hostAccountId),
      applicationFeeStamped,
      vault,
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
    console.error("create subscription failed", code ?? "error");
    const message =
      error instanceof Error ? error.message : "Subscription creation failed";
    const safeMessage = message.includes("not configured")
      ? message
      : "Subscription creation failed";
    return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
  }
}

type EngagedAgreement = {
  agreementId: string;
  seamAccessCodeId: string | null;
};

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

async function provisionGuestCode(deviceId: string, tenantName: string): Promise<string | null> {
  try {
    const seamAccessCodeId = await createGuestAccessCode(deviceId, tenantName);
    console.log(`[ACCESS PROVISIONED] Seam code ${seamAccessCodeId}`);
    return seamAccessCodeId;
  } catch {
    console.error("[SEAM HARDWARE TIMEOUT] Guest code was not created. Agreement insert will continue.");
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

async function creditCapturedInvoice(invoice: Stripe.Invoice): Promise<VaultCreditResult> {
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
  if (customer && typeof customer === "object" && "id" in customer && typeof customer.id === "string") {
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
