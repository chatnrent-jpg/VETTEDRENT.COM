import { NextResponse } from "next/server";
import { resolveCallerRole } from "@/lib/host-access";
import { INTENDED_STAY_DAYS, readListingCompliance } from "@/lib/geo-compliance";
import {
  applySimulatedWeeklyVault,
  SIMULATED_WEEKLY_CENTS,
} from "@/lib/simulated-weekly-billing";
import {
  executeWithoutLimitation,
  getStripe,
  splitWeeklyCapture,
  WEEKLY_CURRENCY,
} from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  creditAgreementVault,
  creditVaultCents,
  recordInstallmentInWeeklyDeductionLedger,
} from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveStayRecord = {
  tenantId: string;
  agreementId: string;
  listingId: string | null;
  weeklyCents: number;
  stripeSubscriptionId: string | null;
  hostAccountId: string | null;
};

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    }
    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    }
    const role = await resolveCallerRole(supabase, userResult.data.user);
    const stay =
      role === "lodger"
        ? await activeStayForTenant(supabase, userResult.data.user.id)
        : role === "host"
          ? await activeStayForHost(supabase, userResult.data.user.id)
          : null;
    if (!stay) {
      return NextResponse.json(
        { ok: false, error: "No active agreement" },
        { status: role === "lodger" || role === "host" ? 404 : 401 },
      );
    }
    const compliance = await readListingCompliance(
      supabase,
      stay.listingId,
      INTENDED_STAY_DAYS,
    );
    if (!compliance.allowed) {
      return NextResponse.json({
        ok: false,
        error: compliance.blockReason ?? "This stay is outside the jurisdiction rules.",
        geoCompliance: compliance.statusLabel,
      });
    }

    const totalCents =
      stay.weeklyCents > 0 ? stay.weeklyCents : SIMULATED_WEEKLY_CENTS;
    const split = splitWeeklyCapture(totalCents);

    let createdInvoiceId: string | null = null;

    // Attempt live Stripe Connect destination charge / invoice resolution first,
    // with atomic rollback to the internal GMF vault mechanism on network or credential failure.
    const execution = await executeWithoutLimitation<{
      ok: true;
      simulated: boolean;
      invoiceId: string;
      totalCents: number;
      currency?: string;
      split: {
        hostCents: number;
        vaultCents: number;
        platformCents: number;
      };
      vaultBalanceCents: number;
      agreementVaultBalanceCents: number;
      ledgerInstallment: Awaited<
        ReturnType<typeof recordInstallmentInWeeklyDeductionLedger>
      >;
    }>({
      operationName: "stripe.weeklyCycleInstallment",
      liveOperation: async () => {
        const stripe = getStripe();

        if (stay.stripeSubscriptionId) {
          const sub = await stripe.subscriptions.retrieve(stay.stripeSubscriptionId, {
            expand: ["latest_invoice"],
          });
          const latestInvoice =
            sub.latest_invoice && typeof sub.latest_invoice === "object"
              ? sub.latest_invoice
              : null;

          if (latestInvoice && latestInvoice.status === "open" && latestInvoice.id) {
            createdInvoiceId = latestInvoice.id;
            const paid = await stripe.invoices.pay(latestInvoice.id);
            const chargeId = paid.id ?? stay.stripeSubscriptionId;
            const ledgerInstallment = await recordInstallmentInWeeklyDeductionLedger({
              totalCents: split.totalCents,
              agreementId: stay.agreementId,
              tenantId: stay.tenantId,
              stripeChargeId: chargeId,
            });
            const vaultCredit = await creditVaultCents({
              payerKey: stay.tenantId,
              invoiceId: chargeId,
              vaultCents: split.vaultCents,
            });
            const agrCredit = await creditAgreementVault({
              agreementId: stay.agreementId,
              invoiceId: chargeId,
              vaultCents: split.vaultCents,
            });

            return {
              ok: true,
              simulated: false,
              invoiceId: chargeId,
              totalCents: split.totalCents,
              currency: WEEKLY_CURRENCY,
              split: {
                hostCents: split.hostCents,
                vaultCents: split.vaultCents,
                platformCents: split.platformCents,
              },
              vaultBalanceCents: vaultCredit.ok
                ? vaultCredit.vaultBalanceCents
                : (ledgerInstallment.gmfFloatPoolBalanceCents ?? split.vaultCents),
              agreementVaultBalanceCents: agrCredit.ok
                ? agrCredit.vaultBalanceCents
                : split.vaultCents,
              ledgerInstallment,
            };
          }
        }

        if (stay.hostAccountId && stay.hostAccountId.startsWith("acct_")) {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: split.totalCents,
            currency: WEEKLY_CURRENCY,
            application_fee_amount: split.applicationFeeCents,
            transfer_data: {
              destination: stay.hostAccountId,
            },
            metadata: {
              agreement_id: stay.agreementId,
              tenant_id: stay.tenantId,
              host_rent_cents: String(split.hostCents),
              vault_contribution_cents: String(split.vaultCents),
              platform_fee_cents: String(split.platformCents),
            },
          });
          createdInvoiceId = paymentIntent.id;

          const ledgerInstallment = await recordInstallmentInWeeklyDeductionLedger({
            totalCents: split.totalCents,
            agreementId: stay.agreementId,
            tenantId: stay.tenantId,
            stripeChargeId: paymentIntent.id,
          });
          const vaultCredit = await creditVaultCents({
            payerKey: stay.tenantId,
            invoiceId: paymentIntent.id,
            vaultCents: split.vaultCents,
          });
          const agrCredit = await creditAgreementVault({
            agreementId: stay.agreementId,
            invoiceId: paymentIntent.id,
            vaultCents: split.vaultCents,
          });

          return {
            ok: true,
            simulated: false,
            invoiceId: paymentIntent.id,
            totalCents: split.totalCents,
            currency: WEEKLY_CURRENCY,
            split: {
              hostCents: split.hostCents,
              vaultCents: split.vaultCents,
              platformCents: split.platformCents,
            },
            vaultBalanceCents: vaultCredit.ok
              ? vaultCredit.vaultBalanceCents
              : (ledgerInstallment.gmfFloatPoolBalanceCents ?? split.vaultCents),
            agreementVaultBalanceCents: agrCredit.ok
              ? agrCredit.vaultBalanceCents
              : split.vaultCents,
            ledgerInstallment,
          };
        }

        throw new Error("Stripe connected destination account not attached to stay");
      },
      rollbackOperation: async () => {
        try {
          if (createdInvoiceId && createdInvoiceId.startsWith("pi_")) {
            const stripe = getStripe();
            await stripe.paymentIntents.cancel(createdInvoiceId);
          }
        } catch {
          // Ignore rollback cleanup errors before falling back to internal GMF vault
        }
      },
      fallbackOperation: async () =>
        applySimulatedWeeklyVault({
          payerKey: stay.tenantId,
          agreementId: stay.agreementId,
          totalCents: split.totalCents,
        }),
    });

    return NextResponse.json({
      ...execution.value,
      fallbackUsed: execution.usedFallback,
      fallbackSource: execution.fallbackSource,
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

async function activeStayForTenant(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<ActiveStayRecord | null> {
  const agreement = await supabase
    .from("agreements")
    .select("id, listing_id, stripe_subscription_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1);
  if (agreement.error) {
    throw new Error("weekly billing failed");
  }
  const row = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
  const agreementId = row && typeof row.id === "string" ? row.id : "";
  const listingId = row && typeof row.listing_id === "string" ? row.listing_id : null;
  const stripeSubscriptionId =
    row && typeof (row as { stripe_subscription_id?: unknown }).stripe_subscription_id === "string"
      ? (row as { stripe_subscription_id: string }).stripe_subscription_id
      : null;

  if (!agreementId) {
    return null;
  }

  const listingMeta = await readListingRateAndAccount(supabase, listingId);
  return {
    tenantId,
    agreementId,
    listingId,
    weeklyCents: listingMeta.weeklyCents,
    stripeSubscriptionId,
    hostAccountId: listingMeta.hostAccountId,
  };
}

async function activeStayForHost(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  hostId: string,
): Promise<ActiveStayRecord | null> {
  const listing = await supabase
    .from("listings")
    .select("id, weekly_price_cents, stripe_host_account_id")
    .eq("host_id", hostId)
    .limit(1);
  if (listing.error) {
    throw new Error("weekly billing failed");
  }
  const listingRow = Array.isArray(listing.data) ? listing.data[0] : listing.data;
  const listingId = listingRow && typeof listingRow.id === "string" ? listingRow.id : "";
  if (!listingId) {
    return null;
  }
  const weeklyCents =
    listingRow &&
    typeof (listingRow as { weekly_price_cents?: unknown }).weekly_price_cents === "number" &&
    (listingRow as { weekly_price_cents: number }).weekly_price_cents > 0
      ? Math.trunc((listingRow as { weekly_price_cents: number }).weekly_price_cents)
      : SIMULATED_WEEKLY_CENTS;
  const hostAccountId =
    listingRow &&
    typeof (listingRow as { stripe_host_account_id?: unknown }).stripe_host_account_id === "string"
      ? (listingRow as { stripe_host_account_id: string }).stripe_host_account_id
      : null;

  const agreement = await supabase
    .from("agreements")
    .select("id, tenant_id, stripe_subscription_id")
    .eq("listing_id", listingId)
    .eq("status", "active")
    .limit(1);
  if (agreement.error) {
    throw new Error("weekly billing failed");
  }
  const row = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
  const agreementId = row && typeof row.id === "string" ? row.id : "";
  const tenantId = row && typeof row.tenant_id === "string" ? row.tenant_id : "";
  const stripeSubscriptionId =
    row && typeof (row as { stripe_subscription_id?: unknown }).stripe_subscription_id === "string"
      ? (row as { stripe_subscription_id: string }).stripe_subscription_id
      : null;

  return agreementId && tenantId
    ? {
        tenantId,
        agreementId,
        listingId,
        weeklyCents,
        stripeSubscriptionId,
        hostAccountId,
      }
    : null;
}

async function readListingRateAndAccount(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  listingId: string | null,
): Promise<{ weeklyCents: number; hostAccountId: string | null }> {
  if (!listingId) {
    return { weeklyCents: SIMULATED_WEEKLY_CENTS, hostAccountId: null };
  }
  try {
    const { data } = await supabase
      .from("listings")
      .select("weekly_price_cents, stripe_host_account_id")
      .eq("id", listingId)
      .maybeSingle();
    if (!data || typeof data !== "object") {
      return { weeklyCents: SIMULATED_WEEKLY_CENTS, hostAccountId: null };
    }
    const r = data as Record<string, unknown>;
    const weeklyCents =
      typeof r.weekly_price_cents === "number" && r.weekly_price_cents > 0
        ? Math.trunc(r.weekly_price_cents)
        : SIMULATED_WEEKLY_CENTS;
    const hostAccountId =
      typeof r.stripe_host_account_id === "string" && r.stripe_host_account_id.trim() !== ""
        ? r.stripe_host_account_id.trim()
        : null;
    return { weeklyCents, hostAccountId };
  } catch {
    return { weeklyCents: SIMULATED_WEEKLY_CENTS, hostAccountId: null };
  }
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
