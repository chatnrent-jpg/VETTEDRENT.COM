import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getSeamClient } from "@/lib/seam";
import { getStripe, splitWeeklyCapture } from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase";
import { creditVaultCents, type VaultCreditResult } from "@/lib/vault";
import { transitionWarning, type WarningTrigger } from "@/lib/warnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TODO(Henry): replace this process-local map with a Supabase table
 * (subscription_id, warning_count, last_event_id).
 */
export interface SubscriptionWarningRecord {
  subscription_id: string;
  warning_count: number;
  last_event_id: string | null;
  agreement_id: string | null;
  customer: string | null;
  amount_due: number | null;
}

const WARNING_1_MESSAGE =
  "⚠️ VettedRent System Alert: Your weekly room subscription payment bounced. As a result, your room's Wi-Fi network access has been automatically paused. Please open your VettedRent mobile app to update your card details within 48 hours to restore access and prevent Warning 2 utility restrictions.";

const WARNING_2_MESSAGE =
  "⚠️⚠️ VettedRent System Alert: Your account balance is now 48 hours past due. Non-essential power outlets in your room have been programmatically disabled. Your $3,000 Guarantee Fund status is currently at risk of forfeiture. Please resolve your invoice balance within the next 48 hours to prevent complete agreement termination and front door lockout.";

type InvoiceLookup = {
  agreementId: string | null;
  customer: string | null;
  subscriptionId: string | null;
  amountDue: number | null;
};

const warningRecords = new Map<string, SubscriptionWarningRecord>();

/**
 * TODO(Henry): persist processed Stripe event.id so retries are idempotent
 * across processes. This set only dedupes inside the current server process.
 */
const processedEventIds = new Set<string>();

export async function POST(request: Request) {
  const read = await readStripeEvent(request);
  if (!read.ok) {
    return read.response;
  }
  const event = read.event;

  if (processedEventIds.has(event.id)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.type === "invoice.created") {
    try {
      const stamped = await stampDraftApplicationFee(event.data.object);
      processedEventIds.add(event.id);
      return NextResponse.json({
        ok: true,
        handled: true,
        applicationFeeStamped: stamped,
      });
    } catch (error) {
      console.error("stripe webhook handler failed");
      const message =
        error instanceof Error && error.message.includes("not configured")
          ? error.message
          : "Webhook handler failed";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  let vault: VaultCreditResult | { ok: true; credited: false; reason: string } | null =
    null;
  if (event.type === "invoice.paid") {
    const credit = await creditPaidInvoice(event.data.object);
    if (!credit.ok) {
      console.error("vault credit failed");
      return NextResponse.json({ ok: false, error: credit.error }, { status: 500 });
    }
    vault = credit;
  }

  const trigger = triggerFromEvent(event);
  if (!trigger) {
    processedEventIds.add(event.id);
    return NextResponse.json({ ok: true, handled: false });
  }

  const invoiceLookup =
    event.type === "invoice.payment_failed" || event.type === "invoice.paid"
      ? readInvoiceLookup(event.data.object)
      : null;
  const subscriptionId = invoiceLookup
    ? invoiceLookup.subscriptionId
    : subscriptionIdFromEvent(event);
  if (!subscriptionId) {
    return NextResponse.json(
      { ok: false, error: "Stripe event is missing a subscription id" },
      { status: 500 },
    );
  }

  if (trigger.type === "invoice.payment_failed") {
    try {
      const agreementId =
        invoiceLookup?.agreementId ?? (await agreementIdForSubscription(subscriptionId));
      if (!agreementId) {
        console.error("agreement update failed");
        return NextResponse.json(
          { ok: false, error: "Agreement id is required" },
          { status: 500 },
        );
      }
      const applied = await applyPaymentFailedWarning(agreementId);
      const risk = await runSovereignRisk({
        agreementId,
        subscriptionId,
        eventId: event.id,
      });
      processedEventIds.add(event.id);
      return NextResponse.json({
        ok: true,
        handled: true,
        subscriptionId,
        warningCount: applied.warningCount,
        action: applied.action,
        status: applied.status,
        risk,
      });
    } catch (error) {
      const safeMessage =
        error instanceof Error && SAFE_HANDLER_ERRORS.has(error.message)
          ? error.message
          : error instanceof Error && error.message.includes("not configured")
            ? error.message
            : "Webhook handler failed";
      console.error(safeMessage);
      return NextResponse.json({ ok: false, error: safeMessage }, { status: 500 });
    }
  }

  const current = warningRecords.get(subscriptionId);
  const transition = transitionWarning(current?.warning_count ?? 0, trigger);

  try {
    if (transition.action === "notify") {
      if (transition.nextCount === 1 || transition.nextCount === 2) {
        logTwilioPlaceholder(transition.nextCount);
      }
    }
    if (transition.action === "reset") {
      acknowledgeReset(subscriptionId);
    }
  } catch (error) {
    console.error("stripe webhook handler failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Webhook handler failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const record: SubscriptionWarningRecord = {
    subscription_id: subscriptionId,
    warning_count: transition.nextCount,
    last_event_id: event.id,
    agreement_id: invoiceLookup?.agreementId ?? null,
    customer: invoiceLookup?.customer ?? null,
    amount_due: invoiceLookup?.amountDue ?? null,
  };
  warningRecords.set(subscriptionId, record);
  processedEventIds.add(event.id);

  return NextResponse.json({
    ok: true,
    handled: true,
    subscriptionId,
    warningCount: record.warning_count,
    action: transition.action,
    ...(vault ? { vault } : {}),
  });
}

async function stampDraftApplicationFee(invoice: Stripe.Invoice): Promise<boolean> {
  if (invoice.status !== "draft") {
    return false;
  }
  if (!Number.isSafeInteger(invoice.total) || invoice.total < 0) {
    throw new Error("Draft invoice total is not integer cents");
  }
  const fee = splitWeeklyCapture(invoice.total).applicationFeeCents;
  const stripe = getStripe();
  await stripe.invoices.update(invoice.id, {
    application_fee_amount: fee,
  });
  return true;
}

async function creditPaidInvoice(
  invoice: Stripe.Invoice,
): Promise<VaultCreditResult | { ok: true; credited: false; reason: string }> {
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

function payerKeyFromCustomer(customer: Stripe.Invoice["customer"]): string | null {
  if (typeof customer === "string") {
    return customer;
  }
  if (customer && typeof customer === "object" && "id" in customer && typeof customer.id === "string") {
    return customer.id;
  }
  return null;
}

function triggerFromEvent(event: Stripe.Event): WarningTrigger | null {
  if (event.type === "invoice.payment_failed") {
    return { type: "invoice.payment_failed" };
  }
  if (event.type === "invoice.paid") {
    return { type: "invoice.paid" };
  }
  if (event.type === "customer.subscription.updated") {
    const status =
      "status" in event.data.object && typeof event.data.object.status === "string"
        ? event.data.object.status
        : "";
    return { type: "customer.subscription.updated", status };
  }
  return null;
}

function subscriptionIdFromEvent(event: Stripe.Event): string | null {
  if (event.type === "customer.subscription.updated") {
    return typeof event.data.object.id === "string" ? event.data.object.id : null;
  }
  if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
    return subscriptionIdFromInvoice(event.data.object);
  }
  return null;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  if ("subscription" in invoice) {
    const subscription = invoice.subscription;
    if (typeof subscription === "string") {
      return subscription;
    }
    if (subscription && typeof subscription === "object" && "id" in subscription) {
      const id = subscription.id;
      if (typeof id === "string") {
        return id;
      }
    }
  }

  const parent = invoice.parent;
  if (
    parent &&
    parent.type === "subscription_details" &&
    parent.subscription_details
  ) {
    const subscription = parent.subscription_details.subscription;
    if (typeof subscription === "string") {
      return subscription;
    }
    if (subscription && typeof subscription.id === "string") {
      return subscription.id;
    }
  }

  return null;
}

function logTwilioPlaceholder(warningStep: 1 | 2): void {
  console.log(warningStep === 1 ? WARNING_1_MESSAGE : WARNING_2_MESSAGE);
}

const SAFE_HANDLER_ERRORS = new Set([
  "agreement read failed",
  "agreement update failed",
  "listing read failed",
  "seam access wipe failed",
  "agreement audit failed",
  "platform ledger failed",
  "host alert failed",
]);

/** $300.00 weekly baseline paid to the host from the guarantee fund, in integer cents. */
const GUARANTEED_WEEKLY_HOST_CENTS = 30000;

type SovereignRiskResult = {
  paymentStatus: "delinquent";
  riskLevel: "critical";
  checkoutAt: string;
  accessCodeScheduled: boolean;
  guaranteePosted: boolean;
  hostAlerted: boolean;
};

async function agreementIdForSubscription(subscriptionId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("agreements")
      .select("id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (error) {
      throw new Error("agreement read failed");
    }
    return textOrNull(data?.id);
  } catch (error) {
    if (error instanceof Error && error.message === "agreement read failed") {
      throw error;
    }
    throw new Error("agreement read failed");
  }
}

async function runSovereignRisk(input: {
  agreementId: string;
  subscriptionId: string;
  eventId: string;
}): Promise<SovereignRiskResult> {
  const supabase = getSupabaseServerClient();
  const agreement = await readRiskAgreement(supabase, input.agreementId);
  const failedAt = new Date().toISOString();
  const checkoutAt = getNextCheckoutWindow();

  try {
    const { error } = await supabase
      .from("agreements")
      .update({
        payment_status: "delinquent",
        risk_level: "critical",
        last_failed_payment_at: failedAt,
        stripe_subscription_id: input.subscriptionId,
      })
      .eq("id", input.agreementId);
    if (error) {
      throw new Error("agreement update failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "agreement update failed") {
      throw error;
    }
    throw new Error("agreement update failed");
  }

  const accessCodeScheduled = await scheduleAccessCodeExpiry(
    agreement.seamAccessCodeId,
    checkoutAt,
    input.agreementId,
  );
  const guaranteePosted = await postGuaranteePayout(supabase, input.eventId, input.agreementId);
  const hostAlerted = await alertHost(supabase, {
    eventId: input.eventId,
    hostId: agreement.hostId,
    agreementId: input.agreementId,
    checkoutAt,
  });

  return {
    paymentStatus: "delinquent",
    riskLevel: "critical",
    checkoutAt: checkoutAt.toISOString(),
    accessCodeScheduled,
    guaranteePosted,
    hostAlerted,
  };
}

async function readRiskAgreement(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<{ hostId: string | null; seamAccessCodeId: string | null }> {
  try {
    const { data, error } = await supabase
      .from("agreements")
      .select("id, host_id, seam_access_code_id")
      .eq("id", agreementId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("agreement read failed");
    }
    return {
      hostId: textOrNull(data.host_id),
      seamAccessCodeId: textOrNull(data.seam_access_code_id),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "agreement read failed") {
      throw error;
    }
    throw new Error("agreement read failed");
  }
}

async function scheduleAccessCodeExpiry(
  accessCodeId: string | null,
  checkoutAt: Date,
  agreementId: string,
): Promise<boolean> {
  if (!accessCodeId || !seamApiKeyConfigured()) {
    console.error(`[SEAM API ERR] Could not auto-expire access code for agreement ${agreementId}`);
    return false;
  }
  try {
    const seam = getSeamClient();
    await seam.accessCodes.update({
      access_code_id: accessCodeId,
      ends_at: checkoutAt.toISOString(),
    });
    console.error(
      `[RISK PROTOCOL ACTIVE] Lock scheduled to expire at ${checkoutAt.toISOString()} for agreement ${agreementId}`,
    );
    return true;
  } catch {
    console.error(`[SEAM API ERR] Could not auto-expire access code for agreement ${agreementId}`);
    return false;
  }
}

async function postGuaranteePayout(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  eventId: string,
  agreementId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.from("platform_ledger").insert({
      stripe_event_id: eventId,
      agreement_id: agreementId,
      amount_cents: GUARANTEED_WEEKLY_HOST_CENTS,
      type: "guaranteed_fund_payout",
      description: "Automated platform escrow disbursement due to primary guest payment failure.",
    });
    if (error && error.code !== "23505") {
      throw new Error("platform ledger failed");
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "platform ledger failed") {
      throw error;
    }
    throw new Error("platform ledger failed");
  }
}

async function alertHost(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  input: { eventId: string; hostId: string | null; agreementId: string; checkoutAt: Date },
): Promise<boolean> {
  const message = `Critical: weekly payment failed for agreement ${input.agreementId}. The door code expires at the next Monday 11:00 AM checkout (${input.checkoutAt.toISOString()}). A $300 guarantee payout was posted.`;
  try {
    const { error } = await supabase.from("host_alerts").insert({
      stripe_event_id: input.eventId,
      host_id: input.hostId,
      agreement_id: input.agreementId,
      severity: "critical",
      message,
    });
    if (error && error.code !== "23505") {
      throw new Error("host alert failed");
    }
    console.error(message);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === "host alert failed") {
      throw error;
    }
    throw new Error("host alert failed");
  }
}

const EASTERN_WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getNextCheckoutWindow(now: Date = new Date()): Date {
  const today = easternCalendar(now);
  const weekday = EASTERN_WEEKDAY[today.weekday] ?? 0;
  let daysAhead = (1 + 7 - weekday) % 7;
  if (daysAhead === 0) {
    daysAhead = 7;
  }
  const monday = addCalendarDays(today.year, today.month, today.day, daysAhead);
  return easternLocalToUtc(monday.year, monday.month, monday.day, 11, 0);
}

function easternCalendar(now: Date): { weekday: string; year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const bag: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      bag[part.type] = part.value;
    }
  }
  return {
    weekday: bag.weekday ?? "Sun",
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
  };
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function easternLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMinutes = easternOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offsetMinutes * 60_000);
}

function easternOffsetMinutes(instant: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) {
    return -300;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
}

type AgreementTier = {
  warningCount: number;
  action: "notify" | "constrain";
  status: "warning_1" | "warning_2" | "terminated";
};

async function applyPaymentFailedWarning(agreementId: string): Promise<AgreementTier> {
  const supabase = getSupabaseServerClient();
  const agreement = await readAgreementWarning(supabase, agreementId);
  const transition = transitionWarning(agreement.warningCount, {
    type: "invoice.payment_failed",
  });
  if (transition.nextCount === 1) {
    await updateAgreementTier(supabase, agreementId, agreement.warningCount, "warning_1", 1);
    logTwilioPlaceholder(1);
    return { warningCount: 1, action: "notify", status: "warning_1" };
  }
  if (transition.nextCount === 2) {
    await updateAgreementTier(supabase, agreementId, agreement.warningCount, "warning_2", 2);
    logTwilioPlaceholder(2);
    return { warningCount: 2, action: "notify", status: "warning_2" };
  }
  await updateAgreementTier(
    supabase,
    agreementId,
    agreement.warningCount,
    "terminated",
    transition.nextCount,
  );
  await wipeListingAccessCodes(supabase, agreementId, agreement.listingId);
  return { warningCount: transition.nextCount, action: "constrain", status: "terminated" };
}

async function readAgreementWarning(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<{ warningCount: number; listingId: string | null }> {
  try {
    const { data, error } = await supabase
      .from("agreements")
      .select("id, warning_count, listing_id")
      .eq("id", agreementId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("agreement read failed");
    }
    return {
      warningCount: requiredCount(data.warning_count),
      listingId: textOrNull(data.listing_id),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "agreement read failed") {
      throw error;
    }
    throw new Error("agreement read failed");
  }
}

async function updateAgreementTier(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
  currentCount: number,
  status: AgreementTier["status"],
  warningCount: number,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("agreements")
      .update({ status, warning_count: warningCount })
      .eq("id", agreementId)
      .eq("warning_count", currentCount)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new Error("agreement update failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "agreement update failed") {
      throw error;
    }
    throw new Error("agreement update failed");
  }
}

async function wipeListingAccessCodes(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
  listingId: string | null,
): Promise<void> {
  const deviceId = await seamDeviceIdForListing(supabase, listingId);
  const seamConfigured = seamApiKeyConfigured();
  if (!deviceId || !seamConfigured) {
    console.log("Seam device action was not sent");
    await insertDeactivationAudit(supabase, agreementId, deviceId, "seam_device_action_not_sent");
    return;
  }
  try {
    await deleteDeviceAccessCodes(deviceId);
  } catch (error) {
    if (error instanceof Error && error.message === "seam access wipe failed") {
      throw error;
    }
    throw new Error("seam access wipe failed");
  }
  console.log(`Seam device action: access codes deleted ${deviceId}`);
  await insertDeactivationAudit(supabase, agreementId, deviceId, "access_codes_deleted");
}

async function seamDeviceIdForListing(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  listingId: string | null,
): Promise<string | null> {
  if (!listingId) {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("seam_device_id")
      .eq("id", listingId)
      .maybeSingle();
    if (error) {
      throw new Error("listing read failed");
    }
    return textOrNull(data?.seam_device_id);
  } catch (error) {
    if (error instanceof Error && error.message === "listing read failed") {
      throw error;
    }
    throw new Error("listing read failed");
  }
}

async function deleteDeviceAccessCodes(deviceId: string): Promise<void> {
  const seam = getSeamClient();
  let pageCursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const request = seam.accessCodes.list({
      device_id: deviceId,
      ...(pageCursor ? { page_cursor: pageCursor } : {}),
    });
    const body = await request.fetchResponse();
    const codes = Array.isArray(body.access_codes) ? body.access_codes : [];
    for (const code of codes) {
      if (typeof code.access_code_id !== "string" || code.access_code_id.trim() === "") {
        continue;
      }
      await seam.accessCodes.delete({
        access_code_id: code.access_code_id,
        device_id: deviceId,
      });
    }
    const next = (body as { next_page_cursor?: unknown }).next_page_cursor;
    if (typeof next !== "string" || next.trim() === "" || next === pageCursor) {
      return;
    }
    pageCursor = next;
  }
  throw new Error("seam access wipe failed");
}

async function insertDeactivationAudit(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
  seamDeviceId: string | null,
  action: "seam_device_action_not_sent" | "access_codes_deleted",
): Promise<void> {
  try {
    const { error } = await supabase.from("agreement_deactivation_audits").insert({
      agreement_id: agreementId,
      seam_device_id: seamDeviceId,
      action,
      created_at: new Date().toISOString(),
    });
    if (error) {
      throw new Error("agreement audit failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "agreement audit failed") {
      throw error;
    }
    throw new Error("agreement audit failed");
  }
}

function seamApiKeyConfigured(): boolean {
  const seamKey = process.env.SEAM_API_KEY;
  return typeof seamKey === "string" && seamKey.trim() !== "";
}

function requiredCount(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  throw new Error("agreement read failed");
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

async function readStripeEvent(
  request: Request,
): Promise<{ ok: true; event: Stripe.Event } | { ok: false; response: NextResponse }> {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    if (process.env.NODE_ENV !== "development") {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Invalid Stripe signature" },
          { status: 400 },
        ),
      };
    }
    return parseDevelopmentEvent(rawBody);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "STRIPE_WEBHOOK_SECRET is not configured" },
        { status: 500 },
      ),
    };
  }

  try {
    const stripe = getStripe();
    return { ok: true, event: stripe.webhooks.constructEvent(rawBody, signature, webhookSecret) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: error.message }, { status: 500 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Invalid Stripe signature" },
        { status: 400 },
      ),
    };
  }
}

function parseDevelopmentEvent(
  rawBody: string,
): { ok: true; event: Stripe.Event } | { ok: false; response: NextResponse } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }),
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Invalid Stripe event" }, { status: 400 }),
    };
  }
  const record = parsed as Record<string, unknown>;
  const data = record.data;
  if (typeof record.type !== "string" || !data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Invalid Stripe event" }, { status: 400 }),
    };
  }
  const object = (data as { object?: unknown }).object;
  if (!object || typeof object !== "object" || Array.isArray(object)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Invalid Stripe event" }, { status: 400 }),
    };
  }
  const invoiceId = "id" in object && typeof object.id === "string" ? object.id : null;
  const eventId = typeof record.id === "string" && record.id.trim() !== "" ? record.id : invoiceId;
  if (!eventId) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Stripe event is missing an id" }, { status: 400 }),
    };
  }
  const event = {
    id: eventId,
    object: "event",
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: record.type,
    data: { object },
  } as Stripe.Event;
  return { ok: true, event };
}

function readInvoiceLookup(invoice: Stripe.Invoice): InvoiceLookup {
  return {
    agreementId: agreementIdFromInvoice(invoice),
    customer: payerKeyFromCustomer(invoice.customer),
    subscriptionId: subscriptionIdFromInvoice(invoice),
    amountDue: amountDueFromInvoice(invoice),
  };
}

function agreementIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const metadata = invoice.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const value = metadata.agreement_id;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function amountDueFromInvoice(invoice: Stripe.Invoice): number | null {
  const amount = invoice.amount_due;
  if (typeof amount === "number" && Number.isSafeInteger(amount)) {
    return amount;
  }
  return null;
}

function acknowledgeReset(subscriptionId: string): void {
  // TODO(Henry): clear any host/lodger notice tied to this subscription.
  void subscriptionId;
}
