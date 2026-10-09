export type WarningAction = "notify" | "constrain" | "reset" | "none";

export type WarningTrigger =
  | { type: "invoice.payment_failed" }
  | { type: "invoice.paid" }
  | { type: "customer.subscription.updated"; status: string }
  | { type: "other" };

export interface WarningTransition {
  nextCount: number;
  action: WarningAction;
}

/** Cap for the 3-warning automation engine. */
export const MAX_WARNING_COUNT = 3;

/**
 * Statuses that reset the warning count on customer.subscription.updated.
 * TODO(Henry): confirm which Stripe statuses count as the healthy path.
 */
export const HEALTHY_SUBSCRIPTION_STATUSES: readonly string[] = ["active"];

function clampCount(count: number): number {
  if (!Number.isFinite(count)) {
    return 0;
  }
  return Math.min(MAX_WARNING_COUNT, Math.max(0, Math.trunc(count)));
}

/**
 * Pure warning transition. No I/O.
 * payment_failed advances 1 → notify, 2 → notify, 3 → constrain (stays at 3).
 * invoice.paid, or a healthy subscription update, resets to 0.
 */
export function transitionWarning(
  currentCount: number,
  trigger: WarningTrigger,
): WarningTransition {
  const count = clampCount(currentCount);

  if (trigger.type === "invoice.paid") {
    return count === 0
      ? { nextCount: 0, action: "none" }
      : { nextCount: 0, action: "reset" };
  }

  if (trigger.type === "customer.subscription.updated") {
    const healthy = HEALTHY_SUBSCRIPTION_STATUSES.includes(trigger.status);
    if (!healthy) {
      return { nextCount: count, action: "none" };
    }
    return count === 0
      ? { nextCount: 0, action: "none" }
      : { nextCount: 0, action: "reset" };
  }

  if (trigger.type === "invoice.payment_failed") {
    const nextCount = Math.min(MAX_WARNING_COUNT, count + 1);
    return {
      nextCount,
      action: nextCount >= MAX_WARNING_COUNT ? "constrain" : "notify",
    };
  }

  return { nextCount: count, action: "none" };
}
