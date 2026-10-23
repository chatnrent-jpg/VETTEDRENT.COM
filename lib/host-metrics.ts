import assert from "node:assert/strict";
import type { DisplayStayStatus } from "@/lib/stay-status";

/** A 13-week contract stay underwritten by the GMF escrow vault, in days. */
export const UNDERWRITTEN_CONTRACT_DAYS = 90;

const DAY_MS = 86_400_000;

export function underwrittenTenancyDays(input: {
  startDate: string | null;
  endDate: string | null;
  vaultBalanceCents: number;
}): number {
  const spanned = contractSpanDays(input.startDate, input.endDate);
  if (spanned !== null) {
    return spanned;
  }
  if (nonNegativeInteger(input.vaultBalanceCents) > 0) {
    return UNDERWRITTEN_CONTRACT_DAYS;
  }
  return 0;
}

export function delinquentWeeklyCents(input: {
  status: DisplayStayStatus;
  warningCount: number;
  weeklyCents: number;
}): number {
  if (input.status !== "warning") {
    return 0;
  }
  const weeks = nonNegativeInteger(input.warningCount);
  const weekly = nonNegativeInteger(input.weeklyCents);
  const count = weeks > 0 ? weeks : 1;
  const cents = count * weekly;
  return Number.isSafeInteger(cents) ? cents : 0;
}

export function landlordRiskExposureCents(delinquentCents: number, vaultBalanceCents: number): number {
  return Math.max(0, nonNegativeInteger(delinquentCents) - nonNegativeInteger(vaultBalanceCents));
}

function contractSpanDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) {
    return null;
  }
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${endDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const days = Math.round((end - start) / DAY_MS);
  return days > 0 ? days : 0;
}

function nonNegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    return 0;
  }
  return value;
}

assert.equal(
  underwrittenTenancyDays({ startDate: null, endDate: null, vaultBalanceCents: 37500 }),
  90,
);
assert.equal(
  underwrittenTenancyDays({ startDate: "2026-01-01", endDate: "2026-04-01", vaultBalanceCents: 37500 }),
  90,
);
assert.equal(delinquentWeeklyCents({ status: "active", warningCount: 0, weeklyCents: 24500 }), 0);
assert.equal(delinquentWeeklyCents({ status: "warning", warningCount: 1, weeklyCents: 24500 }), 24500);
assert.equal(landlordRiskExposureCents(0, 37500), 0);
assert.equal(landlordRiskExposureCents(24500, 37500), 0);
