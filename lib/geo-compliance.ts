import type { SupabaseClient } from "@supabase/supabase-js";
import { addUtcDays } from "@/lib/underwriting-contract";

export const DEFAULT_JURISDICTION_CODE = "MD-PG";
export const DEFAULT_JUDICIAL_RISK_TIER = "low";
export const DEFAULT_MAX_TRANSIENT_DAYS = 180;
export const DEFAULT_COMPLIANCE_STRUCTURE = "revocable_lodging_license";
/** Underwritten weekly assignment, in days. */
export const INTENDED_STAY_DAYS = 90;

export type ListingCompliance = {
  jurisdictionCode: string;
  judicialRiskTier: string;
  maxTransientDays: number;
  complianceStructure: string;
  intendedStayDays: number;
  allowed: boolean;
  rolloverProtected: boolean;
  statusLabel: string;
  blockReason: string | null;
};

export function intendedStayLengthDays(intendedStayEndDate: string | null, now = new Date()): number {
  if (!intendedStayEndDate || !/^\d{4}-\d{2}-\d{2}$/.test(intendedStayEndDate)) {
    return INTENDED_STAY_DAYS;
  }
  const today = addUtcDays(now, 0);
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${intendedStayEndDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return INTENDED_STAY_DAYS;
  }
  const days = Math.round((end - start) / 86_400_000);
  return days > 0 ? days : INTENDED_STAY_DAYS;
}

export function evaluateGeoCompliance(
  row: {
    jurisdiction_code?: unknown;
    judicial_risk_tier?: unknown;
    max_transient_days?: unknown;
    compliance_structure?: unknown;
  } | null,
  intendedStayDays = INTENDED_STAY_DAYS,
): ListingCompliance {
  const jurisdictionCode = text(row?.jurisdiction_code) ?? DEFAULT_JURISDICTION_CODE;
  const judicialRiskTier = (text(row?.judicial_risk_tier) ?? DEFAULT_JUDICIAL_RISK_TIER).toLowerCase();
  const parsedMax = positiveInteger(row?.max_transient_days);
  const maxTransientDays = parsedMax ?? DEFAULT_MAX_TRANSIENT_DAYS;
  const complianceStructure = text(row?.compliance_structure) ?? DEFAULT_COMPLIANCE_STRUCTURE;
  const stayDays = positiveInteger(intendedStayDays) ?? INTENDED_STAY_DAYS;
  const restricted = judicialRiskTier === "restricted";
  const exceedsCeiling = stayDays > maxTransientDays;
  const allowed = !restricted && !exceedsCeiling;
  const rolloverProtected = allowed;
  const blockReason = restricted
    ? `Jurisdiction ${jurisdictionCode} is restricted, so this stay is not matched.`
    : exceedsCeiling
      ? `The ${stayDays}-day stay exceeds the ${maxTransientDays}-day transient ceiling and would trigger statutory indefinite tenancy rollover.`
      : null;
  return {
    jurisdictionCode,
    judicialRiskTier,
    maxTransientDays,
    complianceStructure,
    intendedStayDays: stayDays,
    allowed,
    rolloverProtected,
    blockReason,
    statusLabel: geoStatusLabel({
      jurisdictionCode,
      judicialRiskTier,
      maxTransientDays,
      complianceStructure,
      intendedStayDays: stayDays,
      rolloverProtected,
    }),
  };
}

export function defaultGeoStatusLabel(): string {
  return evaluateGeoCompliance(null).statusLabel;
}

/**
 * Read listing geo columns. A missing column (42703 / PGRST204) uses the
 * MD-PG defaults so callers can still return 200.
 */
export async function readListingCompliance(
  supabase: SupabaseClient,
  listingId: string | null,
  intendedStayDays = INTENDED_STAY_DAYS,
): Promise<ListingCompliance> {
  if (!listingId) {
    return evaluateGeoCompliance(null, intendedStayDays);
  }
  try {
    const result = await supabase
      .from("listings")
      .select("jurisdiction_code, judicial_risk_tier, max_transient_days, compliance_structure")
      .eq("id", listingId)
      .limit(1);
    if (result.error) {
      if (missingGeoColumn(result.error)) {
        return evaluateGeoCompliance(null, intendedStayDays);
      }
      return evaluateGeoCompliance(null, intendedStayDays);
    }
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row || typeof row !== "object") {
      return evaluateGeoCompliance(null, intendedStayDays);
    }
    return evaluateGeoCompliance(row, intendedStayDays);
  } catch {
    return evaluateGeoCompliance(null, intendedStayDays);
  }
}

function geoStatusLabel(input: {
  jurisdictionCode: string;
  judicialRiskTier: string;
  maxTransientDays: number;
  complianceStructure: string;
  intendedStayDays: number;
  rolloverProtected: boolean;
}): string {
  const protection = input.rolloverProtected ? "Rollover Protected" : "Rollover Exposure";
  return `Jurisdiction: ${input.jurisdictionCode} (${riskLabel(input.judicialRiskTier)}) · Structure: ${structureLabel(input.complianceStructure)} · Term: ${input.intendedStayDays} / ${input.maxTransientDays} Max Transient Days (${protection}).`;
}

function riskLabel(tier: string): string {
  if (tier === "low") {
    return "Low Judicial Backlog";
  }
  if (tier === "restricted") {
    return "Restricted";
  }
  return titleWords(tier);
}

function structureLabel(structure: string): string {
  if (structure === "revocable_lodging_license") {
    return "Revocable Lodging License";
  }
  return titleWords(structure);
}

function titleWords(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function missingGeoColumn(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    message.includes("jurisdiction_code") ||
    message.includes("judicial_risk_tier") ||
    message.includes("max_transient_days") ||
    message.includes("compliance_structure")
  );
}
