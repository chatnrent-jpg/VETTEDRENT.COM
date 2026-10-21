import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createGuestAccessCode } from "@/lib/seam";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getStripe, splitWeeklyCapture, weeklySplitMetadata } from "@/lib/stripe";

const WEEKLY_CURRENCY = "usd";
const WEEKLY_INTERVAL = "week" as const;
const INVOICE_DAYS_UNTIL_DUE = 7;

export type EnterpriseStayInput = {
  placementId: string;
  tenantId: string;
  workerFullName: string;
  workerEmail: string;
  weeklyStipendCents: number;
  hostAccountId: string;
  hostId: string;
  listingId: string;
  seamDeviceId: string;
  contractStartsAt: string;
  contractEndsAt: string;
};

export type OpenedEnterpriseStay = {
  agreementId: string;
  subscriptionId: string;
  seamAccessCodeId: string | null;
  invoiceGroupId: string;
  alreadyOpen: boolean;
};

/**
 * One Stripe customer for the agency. Every nurse subscription in the batch
 * bills this customer, so the invoices belong to one group.
 */
export async function ensureEnterpriseInvoiceGroup(
  agencyName: string,
  billingEmail: string | null,
  existingCustomerId: string | null,
): Promise<string> {
  try {
    const stripe = getStripe();
    if (existingCustomerId) {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      if ("deleted" in customer && customer.deleted) {
        throw new Error("Subscription creation failed");
      }
      return customer.id;
    }
    const email = billingEmail?.trim().toLowerCase() ?? "";
    if (!email) {
      throw new Error("Subscription creation failed");
    }
    const listed = await stripe.customers.list({ email, limit: 10 });
    const existing = listed.data.find(
      (customer) => customer.metadata?.vettedrent_payer === "enterprise_agency",
    );
    if (existing) {
      return existing.id;
    }
    const created = await stripe.customers.create({
      email,
      name: agencyName,
      metadata: {
        vettedrent_payer: "enterprise_agency",
        agency_name: agencyName,
      },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      throw error;
    }
    throw new Error("Subscription creation failed");
  }
}

/**
 * Opens the weekly billing loop, the agreement, and the door code for one worker.
 * A repeat call for the same placement reuses the subscription and agreement.
 * Seam failure leaves the agreement in place with a null door code.
 */
export async function openEnterpriseStay(
  invoiceGroupId: string,
  worker: EnterpriseStayInput,
): Promise<OpenedEnterpriseStay> {
  const supabase = getSupabaseServerClient();
  const linked = await readPlacementLink(supabase, worker.placementId);
  if (linked?.agreementId && linked.subscriptionId) {
    return {
      agreementId: linked.agreementId,
      subscriptionId: linked.subscriptionId,
      seamAccessCodeId: linked.seamAccessCodeId,
      invoiceGroupId: linked.invoiceGroupId ?? invoiceGroupId,
      alreadyOpen: true,
    };
  }

  const stripe = getStripe();
  const subscription = await createWeeklySubscription(stripe, invoiceGroupId, worker);
  const existing = await agreementForSubscription(supabase, subscription.id);
  if (existing) {
    await linkPlacement(supabase, worker.placementId, {
      agreementId: existing.agreementId,
      subscriptionId: subscription.id,
      seamAccessCodeId: existing.seamAccessCodeId,
      invoiceGroupId,
    });
    return {
      agreementId: existing.agreementId,
      subscriptionId: subscription.id,
      seamAccessCodeId: existing.seamAccessCodeId,
      invoiceGroupId,
      alreadyOpen: true,
    };
  }

  const seamAccessCodeId = await provisionGuestCode(
    worker.seamDeviceId,
    worker.workerFullName,
    worker.contractStartsAt,
    worker.contractEndsAt,
  );
  const agreementId = randomUUID();
  await insertAgreement(supabase, {
    agreementId,
    tenantId: worker.tenantId,
    tenantName: worker.workerFullName,
    hostId: worker.hostId,
    listingId: worker.listingId,
    subscriptionId: subscription.id,
    seamAccessCodeId,
  });
  await rememberAgreementOnSubscription(stripe, subscription.id, agreementId);
  await linkPlacement(supabase, worker.placementId, {
    agreementId,
    subscriptionId: subscription.id,
    seamAccessCodeId,
    invoiceGroupId,
  });
  return {
    agreementId,
    subscriptionId: subscription.id,
    seamAccessCodeId,
    invoiceGroupId,
    alreadyOpen: false,
  };
}

async function createWeeklySubscription(
  stripe: Stripe,
  invoiceGroupId: string,
  worker: EnterpriseStayInput,
): Promise<Stripe.Subscription> {
  let split;
  try {
    split = splitWeeklyCapture(worker.weeklyStipendCents);
  } catch {
    throw new Error("Subscription creation failed");
  }
  try {
    const product = await stripe.products.create({
      name: "VettedRent enterprise weekly stay",
    });
    const subscription = await stripe.subscriptions.create(
      {
        customer: invoiceGroupId,
        collection_method: "send_invoice",
        days_until_due: INVOICE_DAYS_UNTIL_DUE,
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
        transfer_data: { destination: worker.hostAccountId },
        metadata: {
          ...weeklySplitMetadata(worker.hostAccountId, split),
          vettedrent_payer: "enterprise_agency",
          invoice_group: invoiceGroupId,
          placement_id: worker.placementId,
          worker_email: worker.workerEmail,
        },
        expand: ["latest_invoice"],
      },
      { idempotencyKey: `vr_ent_sub_${worker.placementId}` },
    );
    await stampDraftApplicationFee(stripe, subscription.latest_invoice, split.applicationFeeCents);
    return subscription;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      throw error;
    }
    throw new Error("Subscription creation failed");
  }
}

async function stampDraftApplicationFee(
  stripe: Stripe,
  latest: Stripe.Subscription["latest_invoice"],
  applicationFeeCents: number,
): Promise<void> {
  if (!latest || typeof latest === "string" || latest.status !== "draft") {
    return;
  }
  await stripe.invoices.update(latest.id, { application_fee_amount: applicationFeeCents });
}

async function provisionGuestCode(
  deviceId: string,
  tenantName: string,
  startsAt: string,
  endsAt: string,
): Promise<string | null> {
  try {
    return await createGuestAccessCode(deviceId, tenantName, { startsAt, endsAt });
  } catch {
    console.error("enterprise door code was not created");
    return null;
  }
}

async function insertAgreement(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  input: {
    agreementId: string;
    tenantId: string;
    tenantName: string;
    hostId: string;
    listingId: string;
    subscriptionId: string;
    seamAccessCodeId: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("agreements").insert({
      id: input.agreementId,
      tenant_id: input.tenantId,
      host_id: input.hostId,
      listing_id: input.listingId,
      tenant_name: input.tenantName,
      status: "active",
      stripe_subscription_id: input.subscriptionId,
      seam_access_code_id: input.seamAccessCodeId,
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
}

async function rememberAgreementOnSubscription(
  stripe: Stripe,
  subscriptionId: string,
  agreementId: string,
): Promise<void> {
  try {
    await stripe.subscriptions.update(subscriptionId, {
      metadata: { agreement_id: agreementId },
    });
  } catch {
    console.error("enterprise subscription metadata failed");
  }
}

type PlacementLink = {
  agreementId: string | null;
  subscriptionId: string | null;
  seamAccessCodeId: string | null;
  invoiceGroupId: string | null;
};

async function readPlacementLink(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  placementId: string,
): Promise<PlacementLink | null> {
  try {
    const { data, error } = await supabase
      .from("corporate_placements")
      .select("agreement_id, stripe_subscription_id, seam_access_code_id, invoice_group_id")
      .eq("id", placementId)
      .maybeSingle();
    if (error) {
      throw new Error("placement record failed");
    }
    if (!data) {
      return null;
    }
    return {
      agreementId: textOrNull(data.agreement_id),
      subscriptionId: textOrNull(data.stripe_subscription_id),
      seamAccessCodeId: textOrNull(data.seam_access_code_id),
      invoiceGroupId: textOrNull(data.invoice_group_id),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "placement record failed") {
      throw error;
    }
    throw new Error("placement record failed");
  }
}

async function agreementForSubscription(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  subscriptionId: string,
): Promise<{ agreementId: string; seamAccessCodeId: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from("agreements")
      .select("id, seam_access_code_id")
      .eq("stripe_subscription_id", subscriptionId)
      .limit(1);
    if (error) {
      throw new Error("agreement insert failed");
    }
    const row = Array.isArray(data) ? data[0] : null;
    const agreementId = textOrNull(row?.id);
    if (!agreementId) {
      return null;
    }
    return {
      agreementId,
      seamAccessCodeId: textOrNull(row?.seam_access_code_id),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "agreement insert failed") {
      throw error;
    }
    throw new Error("agreement insert failed");
  }
}

async function linkPlacement(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  placementId: string,
  link: {
    agreementId: string;
    subscriptionId: string;
    seamAccessCodeId: string | null;
    invoiceGroupId: string;
  },
): Promise<void> {
  try {
    const { error } = await supabase
      .from("corporate_placements")
      .update({
        agreement_id: link.agreementId,
        stripe_subscription_id: link.subscriptionId,
        seam_access_code_id: link.seamAccessCodeId,
        invoice_group_id: link.invoiceGroupId,
      })
      .eq("id", placementId);
    if (error) {
      throw new Error("placement record failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "placement record failed") {
      throw error;
    }
    throw new Error("placement record failed");
  }
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
