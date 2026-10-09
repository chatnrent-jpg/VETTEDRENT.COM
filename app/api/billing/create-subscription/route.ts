import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  HOST_BPS,
  PLATFORM_BPS,
  VAULT_BPS,
  getStripe,
  splitWeeklyCapture,
  totalAmountToCents,
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
  value: unknown,
): CreateSubscriptionBody | { error: string } {
  if (value === null || typeof value !== "object") {
    return { error: "Expected a JSON object" };
  }
  const body = value as Record<string, unknown>;
  const customerEmail = body.customerEmail;
  const hostAccountId = body.hostAccountId;
  const total = totalAmountToCents(body.total_amount);
  if (!total.ok) {
    return { error: total.error };
  }
  if (typeof customerEmail !== "string" || !isEmail(customerEmail)) {
    return { error: "customerEmail must be an email address" };
  }
  if (typeof hostAccountId !== "string" || !hostAccountId.startsWith("acct_")) {
    return { error: "hostAccountId must be a Stripe connected account id" };
  }
  return {
    customerEmail: customerEmail.trim(),
    hostAccountId: hostAccountId.trim(),
    totalCents: total.cents,
  };
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
