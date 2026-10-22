import { getSupabaseServerClient } from "@/lib/supabase";

export type WebhookClaim = "claimed" | "duplicate" | "in_progress";

export type WebhookClaimResult =
  | { ok: true; result: WebhookClaim }
  | { ok: false; error: string };

export type StoredSubscriptionWarning = {
  warningCount: number;
  lastEventId: string | null;
  agreementId: string | null;
  customer: string | null;
  amountDue: number | null;
};

export type WarningSaveResult =
  | { ok: true; alreadyApplied: boolean; warningCount: number }
  | { ok: false; error: string };

type SavePayload = {
  already_applied?: boolean;
  warning_count?: number | string;
};

/**
 * Claim one Stripe event id. A processed id returns duplicate.
 * A failed claim, or a processing claim older than two minutes, can be claimed again.
 */
export async function claimStripeWebhookEvent(
  eventId: string,
  eventType: string,
): Promise<WebhookClaimResult> {
  const id = eventId.trim();
  const type = eventType.trim();
  if (!id || !type) {
    return { ok: false, error: "Stripe event is missing an id" };
  }
  const missing = missingSupabaseEnv();
  if (missing) {
    return { ok: false, error: missing };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("claim_stripe_webhook_event", {
      p_event_id: id,
      p_event_type: type,
    });
    if (error) {
      console.error("stripe webhook claim failed");
      return { ok: false, error: "Webhook claim failed" };
    }
    if (data === "claimed" || data === "duplicate" || data === "in_progress") {
      return { ok: true, result: data };
    }
    console.error("stripe webhook claim failed");
    return { ok: false, error: "Webhook claim failed" };
  } catch (error) {
    console.error("stripe webhook claim failed");
    if (error instanceof Error && error.message.includes("not configured")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Webhook claim failed" };
  }
}

export async function completeStripeWebhookEvent(
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return markStripeWebhookEvent(eventId, "complete_stripe_webhook_event");
}

export async function failStripeWebhookEvent(
  eventId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return markStripeWebhookEvent(eventId, "fail_stripe_webhook_event");
}

export async function readSubscriptionWarning(
  subscriptionId: string,
): Promise<{ ok: true; record: StoredSubscriptionWarning | null } | { ok: false; error: string }> {
  const id = subscriptionId.trim();
  if (!id) {
    return { ok: false, error: "subscription id is required" };
  }
  const missing = missingSupabaseEnv();
  if (missing) {
    return { ok: false, error: missing };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("subscription_warnings")
      .select("warning_count, last_event_id, agreement_id, customer, amount_due")
      .eq("subscription_id", id)
      .maybeSingle();
    if (error) {
      console.error("subscription warning read failed");
      return { ok: false, error: "subscription warning failed" };
    }
    if (!data) {
      return { ok: true, record: null };
    }
    const warningCount = parseCount(data.warning_count);
    if (warningCount === null) {
      console.error("subscription warning read failed");
      return { ok: false, error: "subscription warning failed" };
    }
    return {
      ok: true,
      record: {
        warningCount,
        lastEventId: textOrNull(data.last_event_id),
        agreementId: textOrNull(data.agreement_id),
        customer: textOrNull(data.customer),
        amountDue: parseAmount(data.amount_due),
      },
    };
  } catch (error) {
    console.error("subscription warning read failed");
    if (error instanceof Error && error.message.includes("not configured")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "subscription warning failed" };
  }
}

/**
 * Persist the next warning count for a subscription.
 * The same event id returns the stored count and does not write again.
 */
export async function saveSubscriptionWarning(input: {
  subscriptionId: string;
  eventId: string;
  expectedCount: number;
  warningCount: number;
  agreementId: string | null;
  customer: string | null;
  amountDue: number | null;
}): Promise<WarningSaveResult> {
  const subscriptionId = input.subscriptionId.trim();
  const eventId = input.eventId.trim();
  if (!subscriptionId) {
    return { ok: false, error: "subscription id is required" };
  }
  if (!eventId) {
    return { ok: false, error: "Stripe event is missing an id" };
  }
  if (!validCount(input.expectedCount) || !validCount(input.warningCount)) {
    return { ok: false, error: "subscription warning failed" };
  }
  if (
    input.amountDue !== null &&
    (!Number.isSafeInteger(input.amountDue) || input.amountDue < 0)
  ) {
    return { ok: false, error: "subscription warning failed" };
  }
  const missing = missingSupabaseEnv();
  if (missing) {
    return { ok: false, error: missing };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("save_subscription_warning", {
      p_subscription_id: subscriptionId,
      p_event_id: eventId,
      p_expected_count: input.expectedCount,
      p_warning_count: input.warningCount,
      p_agreement_id: input.agreementId,
      p_customer: input.customer,
      p_amount_due: input.amountDue,
    });
    if (error) {
      console.error("subscription warning save failed");
      return { ok: false, error: "subscription warning failed" };
    }
    const row = asSavePayload(data);
    const warningCount = parseCount(row?.warning_count);
    if (!row || warningCount === null) {
      console.error("subscription warning save failed");
      return { ok: false, error: "subscription warning failed" };
    }
    return {
      ok: true,
      alreadyApplied: row.already_applied === true,
      warningCount,
    };
  } catch (error) {
    console.error("subscription warning save failed");
    if (error instanceof Error && error.message.includes("not configured")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "subscription warning failed" };
  }
}

async function markStripeWebhookEvent(
  eventId: string,
  fn: "complete_stripe_webhook_event" | "fail_stripe_webhook_event",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = eventId.trim();
  if (!id) {
    return { ok: false, error: "Stripe event is missing an id" };
  }
  const missing = missingSupabaseEnv();
  if (missing) {
    return { ok: false, error: missing };
  }
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc(fn, { p_event_id: id });
    if (error) {
      console.error("stripe webhook status update failed");
      return { ok: false, error: "Webhook status update failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("stripe webhook status update failed");
    if (error instanceof Error && error.message.includes("not configured")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Webhook status update failed" };
  }
}

function missingSupabaseEnv(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return "NEXT_PUBLIC_SUPABASE_URL is not configured";
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "SUPABASE_SERVICE_ROLE_KEY is not configured";
  }
  return null;
}

function asSavePayload(data: unknown): SavePayload | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === "object" ? (row as SavePayload) : null;
  }
  if (data && typeof data === "object") {
    return data as SavePayload;
  }
  return null;
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 3) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 3) {
      return parsed;
    }
  }
  return null;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 3;
}
