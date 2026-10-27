/** Platform match thresholds for a weekly lodging stay in each covered state. */
export const DEFAULT_JURISDICTION_CODE = "MD-PG";
export const DEFAULT_JUDICIAL_RISK_TIER = "low";
export const DEFAULT_MAX_TRANSIENT_DAYS = 180;
export const DEFAULT_COMPLIANCE_STRUCTURE = "revocable_lodging_license";

export type JudicialRiskTier = "low" | "medium" | "restricted";
export type AgreementStructure = "revocable_lodging_license" | "residential_tenancy";

export type JurisdictionRule = {
  code: string;
  name: string;
  maxTransientDays: number;
  judicialRiskTier: JudicialRiskTier;
  complianceStructure: AgreementStructure;
};

export const JURISDICTION_RULES: readonly JurisdictionRule[] = [
  {
    code: "MD-PG",
    name: "Prince George's County, Maryland",
    maxTransientDays: 180,
    judicialRiskTier: "low",
    complianceStructure: "revocable_lodging_license",
  },
  {
    code: "MD",
    name: "Maryland",
    maxTransientDays: 180,
    judicialRiskTier: "low",
    complianceStructure: "revocable_lodging_license",
  },
  {
    code: "FL",
    name: "Florida",
    maxTransientDays: 180,
    judicialRiskTier: "medium",
    complianceStructure: "revocable_lodging_license",
  },
  {
    code: "TX",
    name: "Texas",
    maxTransientDays: 90,
    judicialRiskTier: "low",
    complianceStructure: "revocable_lodging_license",
  },
  {
    code: "CA",
    name: "California",
    maxTransientDays: 30,
    judicialRiskTier: "medium",
    complianceStructure: "revocable_lodging_license",
  },
  {
    code: "NY",
    name: "New York",
    maxTransientDays: 30,
    judicialRiskTier: "restricted",
    complianceStructure: "residential_tenancy",
  },
];

/**
 * Locations a person can choose on screen. VettedRent is Maryland-only, so
 * the pickers offer Maryland and nothing else. The full rule list above stays
 * for the server and for older agreements that still carry another code.
 */
export const MARYLAND_JURISDICTION_RULES: readonly JurisdictionRule[] = JURISDICTION_RULES.filter(
  (rule) => rule.code === "MD" || rule.code.startsWith("MD-"),
);

export function resolveJurisdiction(code: string | null | undefined): JurisdictionRule | null {
  if (typeof code !== "string") {
    return null;
  }
  const normalized = code.trim().toUpperCase();
  if (normalized === "") {
    return null;
  }
  return JURISDICTION_RULES.find((rule) => rule.code.toUpperCase() === normalized) ?? null;
}

/** Absent means the caller did not choose a location. An unknown code is an error. */
export function parseJurisdictionCode(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return { error: "Unknown listing location" };
  }
  const rule = resolveJurisdiction(value);
  if (!rule) {
    return { error: "Unknown listing location" };
  }
  return rule.code;
}
