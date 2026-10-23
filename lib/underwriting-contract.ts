/** A 13-week assignment underwritten as 90 days. */
export const ASSIGNMENT_DAYS = 90;

export const MID_TERM_EXPOSURE_MESSAGE =
  "Mid-Term Exposure guardrail: the contract ends before the intended stay ends, so underwriting is not approved.";

export type ContractTerm = {
  credentialType: string;
  credentialIdentifier: string;
  contractEndDate: string;
  intendedStayEndDate: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function defaultContractTerm(now = new Date()): ContractTerm {
  const end = addUtcDays(now, ASSIGNMENT_DAYS);
  return {
    credentialType: "Contract-Assignment",
    credentialIdentifier: "RN-MD-Compact",
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
  const defaults = defaultContractTerm();
  const credentialType = textOrDefault(body.credentialType, simulated ? defaults.credentialType : null);
  const credentialIdentifier = textOrDefault(
    body.credentialIdentifier,
    simulated ? defaults.credentialIdentifier : null,
  );
  const contractEndDate = dateOrDefault(body.contractEndDate, simulated ? defaults.contractEndDate : null);
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
