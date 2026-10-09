import assert from "node:assert/strict";
import Stripe from "stripe";

/** Host base rent: 75.5% of the captured weekly total. */
export const HOST_BPS = 7550;
/** Forced savings vault: 14.3% of the captured weekly total. */
export const VAULT_BPS = 1430;
/** VettedRent platform fee: 10.2%. Remainder cents land here so the parts sum to the charge. */
export const PLATFORM_BPS = 1020;

assert.equal(HOST_BPS + VAULT_BPS + PLATFORM_BPS, 10000);

export type WeeklySplitCents = {
  totalCents: number;
  hostCents: number;
  vaultCents: number;
  platformCents: number;
  applicationFeeCents: number;
};

const MAX_TOTAL_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 10000);

/**
 * Split a captured weekly total in integer cents.
 * Host and vault use floor(totalCents * bps / 10000).
 * Platform cents are the remainder, so host + vault + platform === totalCents.
 * applicationFeeCents stays on the platform (vault + platform). The connected account receives hostCents.
 */
export function splitWeeklyCapture(totalCents: number): WeeklySplitCents {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > MAX_TOTAL_CENTS) {
    throw new Error("totalCents must be a non-negative integer");
  }
  const hostCents = Math.floor((totalCents * HOST_BPS) / 10000);
  const vaultCents = Math.floor((totalCents * VAULT_BPS) / 10000);
  const platformCents = totalCents - hostCents - vaultCents;
  const split: WeeklySplitCents = {
    totalCents,
    hostCents,
    vaultCents,
    platformCents,
    applicationFeeCents: vaultCents + platformCents,
  };
  assert.equal(split.hostCents + split.vaultCents + split.platformCents, totalCents);
  assert.equal(split.applicationFeeCents + split.hostCents, totalCents);
  return split;
}

export type CentsParse =
  | { ok: true; cents: number }
  | { ok: false; error: string };

/**
 * Convert a dollar total_amount to integer cents once.
 * Decimal strings are parsed with integer digits. Numbers are rounded half-up a single time.
 */
export function totalAmountToCents(totalAmount: unknown): CentsParse {
  if (typeof totalAmount === "string") {
    return decimalDollarsToCents(totalAmount);
  }
  if (typeof totalAmount === "number") {
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      return { ok: false, error: "total_amount must be a non-negative amount" };
    }
    const cents = Math.round(totalAmount * 100);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_TOTAL_CENTS) {
      return { ok: false, error: "total_amount is out of range" };
    }
    return { ok: true, cents };
  }
  return { ok: false, error: "total_amount must be a decimal string or a number" };
}

export function weeklySplitMetadata(
  hostAccountId: string,
  split: WeeklySplitCents,
): Record<string, string> {
  return {
    host_account_id: hostAccountId,
    host_rent_cents: String(split.hostCents),
    vault_contribution_cents: String(split.vaultCents),
    platform_fee_cents: String(split.platformCents),
    host_bps: String(HOST_BPS),
    vault_bps: String(VAULT_BPS),
    platform_bps: String(PLATFORM_BPS),
  };
}

/**
 * Server-only Stripe client. Throws when STRIPE_SECRET_KEY is missing. Never logs the key.
 */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(secretKey);
}

function decimalDollarsToCents(raw: string): CentsParse {
  const value = raw.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    return { ok: false, error: "total_amount must be a decimal dollar amount" };
  }
  const dollars = parseUnsignedInteger(match[1]);
  if (dollars === null) {
    return { ok: false, error: "total_amount is out of range" };
  }
  const fraction = match[2] ?? "";
  const centDigits = `${fraction}00`.slice(0, 2);
  const centPart = parseUnsignedInteger(centDigits);
  if (centPart === null) {
    return { ok: false, error: "total_amount is out of range" };
  }
  let cents = dollars * 100 + centPart;
  const remainder = fraction.slice(2);
  if (remainder.length > 0 && remainder.charCodeAt(0) >= 53) {
    cents += 1;
  }
  if (!Number.isSafeInteger(cents) || cents > MAX_TOTAL_CENTS) {
    return { ok: false, error: "total_amount is out of range" };
  }
  return { ok: true, cents };
}

function parseUnsignedInteger(digits: string): number | null {
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  let value = 0;
  for (const char of digits) {
    value = value * 10 + (char.charCodeAt(0) - 48);
    if (!Number.isSafeInteger(value)) {
      return null;
    }
  }
  return value;
}
