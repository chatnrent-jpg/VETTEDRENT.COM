/** Default 13-week assignment underwritten as 90 days. */
export const ASSIGNMENT_DAYS = 90;

/** Minimum stay floor for the Seasonal-Remote cohort, in days. */
export const SEASONAL_REMOTE_MIN_DAYS = 14;

export const MID_TERM_EXPOSURE_MESSAGE =
  "Mid-Term Exposure guardrail: the contract ends before the intended stay ends, so underwriting is not approved.";

export const SEASONAL_REMOTE_FLOOR_MESSAGE =
  "Seasonal-Remote guardrail: Seasonal-Remote stays require a 14-day minimum stay floor, so underwriting is not approved.";

export const PURPOSE_COHORT_IDS = [
  "Contract-Assignment",
  "Academic-Enrollment",
  "Seasonal-Remote",
  "Insurance-Relocation",
] as const;

export type PurposeCohortId = (typeof PURPOSE_COHORT_IDS)[number];

export type PurposeCohortRule = {
  id: PurposeCohortId;
  title: string;
  audience: string;
  identifierLabel: string;
  defaultIdentifier: string;
  endDateLabel: string;
  inflowRuleLabel: string;
  minStayDays: number;
  defaultStayDays: number;
  summary: string;
};

export const PURPOSE_COHORTS: readonly PurposeCohortRule[] = [
  {
    id: "Contract-Assignment",
    title: "Contract-Assignment",
    audience: "Healthcare / VettedCare / VettedME / Corporate Contractor",
    identifierLabel: "Assignment / Compact License ID",
    defaultIdentifier: "RN-MD-Compact",
    endDateLabel: "Contract assignment end date",
    inflowRuleLabel: "3.0x 90-day deposit inflow coverage",
    minStayDays: 7,
    defaultStayDays: 90,
    summary:
      "Verifies active staffing assignment ID, contract end date covering the intended stay, and 3.0x deposit velocity.",
  },
  {
    id: "Academic-Enrollment",
    title: "Academic-Enrollment",
    audience: "University Student / Clinical Rotator / Intern",
    identifierLabel: "Registrar / Clinical Rotation / Student ID",
    defaultIdentifier: "UMD-REG-2026-8841",
    endDateLabel: "Semester / rotation end date",
    inflowRuleLabel: "3.0x stipend or guarantor deposit coverage",
    minStayDays: 7,
    defaultStayDays: 90,
    summary:
      "Verifies university registrar or clinical rotation ID, semester/rotation end date, and 3.0x stipend or guarantor coverage.",
  },
  {
    id: "Seasonal-Remote",
    title: "Seasonal-Remote",
    audience: "Extended Vacationer / Snowbird / Digital Nomad",
    identifierLabel: "Primary Residence / Return Itinerary ID",
    defaultIdentifier: "ITIN-DOM-9042-RET",
    endDateLabel: "Verified departure / return itinerary date",
    inflowRuleLabel: "3.0x remote income or liquid reserve coverage (14d min floor)",
    minStayDays: SEASONAL_REMOTE_MIN_DAYS,
    defaultStayDays: 30,
    summary:
      "Enforces a 14-day minimum stay floor, verifies primary residence or return itinerary ID and departure date, and checks 3.0x remote income or reserve inflow.",
  },
  {
    id: "Insurance-Relocation",
    title: "Insurance-Relocation",
    audience: "ALE Insurance Displacement / Corporate Relocation",
    identifierLabel: "ALE Claim / Relocation Authorization ID",
    defaultIdentifier: "ALE-CLM-2026-4410",
    endDateLabel: "Authorized ALE / relocation coverage end date",
    inflowRuleLabel: "3.0x carrier / corporate disbursement coverage",
    minStayDays: 7,
    defaultStayDays: 90,
    summary:
      "Verifies ALE insurance claim or corporate relocation authorization ID, coverage end date, and 3.0x disbursement coverage.",
  },
];

export type ContractTerm = {
  credentialType: string;
  credentialIdentifier: string;
  contractEndDate: string;
  intendedStayEndDate: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function resolvePurposeCohort(value: string | null | undefined): PurposeCohortRule {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    const match = PURPOSE_COHORTS.find((cohort) => cohort.id.toLowerCase() === normalized);
    if (match) {
      return match;
    }
  }
  return PURPOSE_COHORTS[0];
}

export function isPurposeCohortId(value: unknown): value is PurposeCohortId {
  return (
    typeof value === "string" &&
    PURPOSE_COHORT_IDS.some((id) => id.toLowerCase() === value.trim().toLowerCase())
  );
}

export function cohortMinStayDays(credentialType: string | null | undefined): number {
  if (typeof credentialType === "string" && credentialType.trim().toLowerCase() === "seasonal-remote") {
    return SEASONAL_REMOTE_MIN_DAYS;
  }
  return 1;
}

export function meetsCohortStayFloor(
  credentialType: string | null | undefined,
  stayDays: number,
): boolean {
  return stayDays >= cohortMinStayDays(credentialType);
}

export function defaultContractTerm(
  now = new Date(),
  cohortId: PurposeCohortId = "Contract-Assignment",
): ContractTerm {
  const cohort = resolvePurposeCohort(cohortId);
  const end = addUtcDays(now, cohort.defaultStayDays);
  return {
    credentialType: cohort.id,
    credentialIdentifier: cohort.defaultIdentifier,
    contractEndDate: end,
    intendedStayEndDate: end,
  };
}

export function contractCoversStay(contractEndDate: string, intendedStayEndDate: string): boolean {
  return contractEndDate >= intendedStayEndDate;
}

export function resolveContractTerm(
  body: Record<string, unknown>,
  simulated: boolean,
): ContractTerm | { error: string } {
  const requestedType = textOrDefault(body.credentialType, null);
  const cohort = resolvePurposeCohort(requestedType);
  const defaults = defaultContractTerm(new Date(), cohort.id);
  const credentialType = requestedType ?? (simulated ? defaults.credentialType : null);
  const credentialIdentifier = textOrDefault(
    body.credentialIdentifier,
    simulated ? cohort.defaultIdentifier : null,
  );
  const contractEndDate = dateOrDefault(
    body.contractEndDate,
    simulated ? defaults.contractEndDate : null,
  );
  const intendedStayEndDate = dateOrDefault(
    body.intendedStayEndDate,
    simulated ? defaults.intendedStayEndDate : null,
  );
  if (!credentialType) {
    return { error: "Credential type is required" };
  }
  if (!credentialIdentifier) {
    return { error: "Credential identifier is required" };
  }
  if (credentialType.length > 80 || credentialIdentifier.length > 80) {
    return { error: "Credential is too long" };
  }
  if (!contractEndDate) {
    return { error: "Contract end date is required" };
  }
  if (!intendedStayEndDate) {
    return { error: "Intended stay end date is required" };
  }
  return { credentialType, credentialIdentifier, contractEndDate, intendedStayEndDate };
}

export function addUtcDays(now: Date, days: number): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function textOrDefault(value: unknown, fallback: string | null): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return fallback;
}

function dateOrDefault(value: unknown, fallback: string | null): string | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return parseIsoDate(value);
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = ISO_DATE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return value;
}
