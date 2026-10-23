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

export const DEFAULT_CALCULATOR_WEEKLY_CENTS = 24500;
export const DEFAULT_CALCULATOR_STAY_DAYS = INTENDED_STAY_DAYS;

export type YieldBreakdown = {
  jurisdiction: JurisdictionRule;
  weeklyRateCents: number;
  intendedStayDays: number;
  estimatedWeeks: number;
  hostWeeklyCents: number;
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

  const hostWeeklyCents = Math.round((safeWeeklyCents * CALCULATOR_HOST_BPS) / 10000);
  const vaultWeeklyCents = Math.round((safeWeeklyCents * CALCULATOR_VAULT_BPS) / 10000);
  const platformWeeklyCents = safeWeeklyCents - hostWeeklyCents - vaultWeeklyCents;
  const estimatedWeeks = Math.max(1, Math.round(safeStayDays / 7));

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
    headline: `${rule.name} (${rule.code}) Weekly Stays & Statutory Guardrails`,
    subheadline: `${structureText} · ${rule.maxTransientDays}-Day Max Transient Ceiling · ${riskText}`,
    hostPitch:
      rule.judicialRiskTier === "restricted"
        ? `${rule.name} enforces a ${rule.maxTransientDays}-day residential tenancy threshold. VettedRent automatically blocks revocable lodging matches here to protect property owners from statutory holdover exposure.`
        : `Host verified VettedCare / VettedME contract professionals in ${rule.name} with automated weekly payouts (75.5%), a 14.3% GMF escrow reserve, and a ${rule.maxTransientDays}-day statutory ceiling check.`,
    lodgerPitch: `Zero-credit-check 90-day bank velocity underwriting and smart-lock room access for traveling clinicians and contract specialists assigned to ${rule.name}.`,
  };
}
