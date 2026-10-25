import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
  type JurisdictionRule,
} from "@/lib/compliance/jurisdictions";
import { evaluateGeoCompliance, INTENDED_STAY_DAYS } from "@/lib/geo-compliance";

/** Host base rent: 75.5% of the captured weekly total. */
export const CALCULATOR_HOST_BPS = 7550;
/** Forced savings vault (GMF): 14.3% of the captured weekly total. */
export const CALCULATOR_VAULT_BPS = 1430;
/** VettedRent platform fee: 10.2%. */
export const CALCULATOR_PLATFORM_BPS = 1020;

export const DEFAULT_CALCULATOR_WEEKLY_CENTS = 31500;
export const DEFAULT_CALCULATOR_STAY_DAYS = INTENDED_STAY_DAYS;

export type IntegerSplitAllocation = {
  grossCents: number;
  hostShareCents: number;
  gmfShareCents: number;
  platformShareCents: number;
};

/**
 * Pure BigInt integer-cents split (75.5% Host / 14.3% GMF / 10.2% Platform).
 * Eliminates all IEEE-754 floating-point math before database persistence.
 * Uses integer half-up basis-point rounding: (gross * bps + 5000) / 10000,
 * and assigns the exact remainder to platformShareCents so
 * hostShareCents + gmfShareCents + platformShareCents === grossCents.
 */
export function allocateIntegerSplitCents(grossCents: number): IntegerSplitAllocation {
  const safeGross =
    typeof grossCents === "number" && Number.isFinite(grossCents) && grossCents > 0
      ? Math.trunc(grossCents)
      : 0;
  const grossBig = BigInt(safeGross);
  const halfBps = BigInt(5000);
  const bpsDenom = BigInt(10000);
  const hostBig = (grossBig * BigInt(CALCULATOR_HOST_BPS) + halfBps) / bpsDenom;
  const gmfBig = (grossBig * BigInt(CALCULATOR_VAULT_BPS) + halfBps) / bpsDenom;
  const platformBig = grossBig - hostBig - gmfBig;
  return {
    grossCents: safeGross,
    hostShareCents: Number(hostBig),
    gmfShareCents: Number(gmfBig),
    platformShareCents: Number(platformBig),
  };
}

/**
 * Pure BigInt integer-cents division with half-up rounding:
 * (numerator * 2 + denominator) / (2 * denominator).
 */
export function divideIntegerCentsHalfUp(
  numeratorCents: number,
  denominator: number,
): number {
  if (!Number.isFinite(numeratorCents) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const num = BigInt(Math.max(0, Math.trunc(numeratorCents)));
  const den = BigInt(Math.max(1, Math.trunc(denominator)));
  const two = BigInt(2);
  return Number((num * two + den) / (two * den));
}

/**
 * Pure BigInt monthly host net payout across 52/12 calendar weeks at 75.5% (7550 bps):
 * ((weeklyCents * 52 * 7550) * 2 + 120000) / 240000.
 */
export function calculateMonthlyHostNetCents(weeklyGrossCents: number): number {
  if (!Number.isFinite(weeklyGrossCents) || weeklyGrossCents <= 0) {
    return 0;
  }
  const weeklyBig = BigInt(Math.trunc(weeklyGrossCents));
  const num = weeklyBig * BigInt(52) * BigInt(CALCULATOR_HOST_BPS);
  const den = BigInt(12) * BigInt(10000);
  const two = BigInt(2);
  return Number((num * two + den) / (two * den));
}

export type YieldBreakdown = {
  jurisdiction: JurisdictionRule;
  weeklyRateCents: number;
  intendedStayDays: number;
  estimatedWeeks: number;
  hostWeeklyCents: number;
  hostMonthlyCents: number;
  vaultWeeklyCents: number;
  platformWeeklyCents: number;
  hostTotalCents: number;
  vaultTotalCents: number;
  platformTotalCents: number;
  grossTotalCents: number;
  allowed: boolean;
  rolloverProtected: boolean;
  statusLabel: string;
  blockReason: string | null;
};

/**
 * Pure read-only statutory & GMF yield calculation.
 * Never mutates Supabase or the live vr-weekly-room listing state.
 */
export function calculateJurisdictionYield(
  jurisdictionCode: string,
  weeklyRateCents = DEFAULT_CALCULATOR_WEEKLY_CENTS,
  intendedStayDays = DEFAULT_CALCULATOR_STAY_DAYS,
): YieldBreakdown {
  const rule =
    resolveJurisdiction(jurisdictionCode) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE) ??
    JURISDICTION_RULES[0];
  const safeWeeklyCents =
    Number.isSafeInteger(weeklyRateCents) && weeklyRateCents > 0
      ? weeklyRateCents
      : DEFAULT_CALCULATOR_WEEKLY_CENTS;
  const safeStayDays =
    Number.isSafeInteger(intendedStayDays) && intendedStayDays > 0
      ? intendedStayDays
      : DEFAULT_CALCULATOR_STAY_DAYS;

  const split = allocateIntegerSplitCents(safeWeeklyCents);
  const hostWeeklyCents = split.hostShareCents;
  const hostMonthlyCents = calculateMonthlyHostNetCents(safeWeeklyCents);
  const vaultWeeklyCents = split.gmfShareCents;
  const platformWeeklyCents = split.platformShareCents;
  const estimatedWeeks = Math.max(1, divideIntegerCentsHalfUp(safeStayDays, 7));

  const compliance = evaluateGeoCompliance(
    {
      jurisdiction_code: rule.code,
      judicial_risk_tier: rule.judicialRiskTier,
      max_transient_days: rule.maxTransientDays,
      compliance_structure: rule.complianceStructure,
    },
    safeStayDays,
  );

  return {
    jurisdiction: rule,
    weeklyRateCents: safeWeeklyCents,
    intendedStayDays: safeStayDays,
    estimatedWeeks,
    hostWeeklyCents,
    hostMonthlyCents,
    vaultWeeklyCents,
    platformWeeklyCents,
    hostTotalCents: hostWeeklyCents * estimatedWeeks,
    vaultTotalCents: vaultWeeklyCents * estimatedWeeks,
    platformTotalCents: platformWeeklyCents * estimatedWeeks,
    grossTotalCents: safeWeeklyCents * estimatedWeeks,
    allowed: compliance.allowed,
    rolloverProtected: compliance.rolloverProtected,
    statusLabel: compliance.statusLabel,
    blockReason: compliance.blockReason,
  };
}

export function formatCurrencyCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const dollars = Math.trunc(safe / 100);
  const remainder = Math.abs(safe) % 100;
  return `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}

export function jurisdictionMarketSummary(rule: JurisdictionRule): {
  headline: string;
  subheadline: string;
  hostPitch: string;
  lodgerPitch: string;
} {
  const structureText =
    rule.complianceStructure === "revocable_lodging_license"
      ? "Revocable Lodging License"
      : "Residential Tenancy";
  const riskText =
    rule.judicialRiskTier === "low"
      ? "Low Judicial Backlog"
      : rule.judicialRiskTier === "medium"
        ? "Medium Judicial Backlog"
        : "Restricted Statutory Regime";

  return {
    headline: `${rule.name} (${rule.code}) Purpose-Verified Weekly Stays & Statutory Guardrails`,
    subheadline: `${structureText} · ${rule.maxTransientDays}-Day Max Transient Ceiling · ${riskText}`,
    hostPitch:
      rule.judicialRiskTier === "restricted"
        ? `${rule.name} enforces a ${rule.maxTransientDays}-day residential tenancy threshold. VettedRent automatically blocks revocable lodging matches here to protect property owners from statutory holdover exposure.`
        : `Host verified Contract-Assignment, Academic-Enrollment, Seasonal-Remote, and Insurance-Relocation guests in ${rule.name} with automated weekly payouts (75.5%), a 14.3% GMF escrow reserve, and a ${rule.maxTransientDays}-day statutory ceiling check.`,
    lodgerPitch: `Zero-credit-check 90-day bank velocity underwriting (3.0x coverage) and smart-lock room access across all 4 Purpose-Verified Stay cohorts in ${rule.name}.`,
  };
}
