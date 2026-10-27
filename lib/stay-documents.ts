/**
 * Shared builders for the Stay Passport and signed-license download links.
 * Used by the booking UI (relative links) and the confirmation email (absolute links),
 * so both always point at the same documents.
 */

export type StayDocumentInput = {
  cohort: string;
  jurisdiction: string;
  stayDays: number;
  weeklyRateCents: number;
  credentialId: string;
  validUntil: string;
  fullName: string;
  email: string;
  applicant: string;
  agreementId: string;
  coverageRatio?: string;
};

export function buildPassportHref(input: StayDocumentInput, origin = ""): string {
  const query = new URLSearchParams({
    cohort: input.cohort,
    jurisdiction: input.jurisdiction,
    days: String(input.stayDays),
    weeklyCents: String(input.weeklyRateCents),
    credentialId: input.credentialId,
    ratio: input.coverageRatio ?? "3.25",
    contractEnd: input.validUntil,
    stayEnd: input.validUntil,
    fullName: input.fullName,
    email: input.email,
    applicant: input.applicant,
  });
  return `${origin}/api/underwriting/trust-passport?${query.toString()}`;
}

export function buildLicenseHref(input: StayDocumentInput, origin = ""): string {
  const query = new URLSearchParams({
    format: "pdf",
    agreementId: input.agreementId,
    cohort: input.cohort,
    jurisdiction: input.jurisdiction,
    days: String(input.stayDays),
    credentialId: input.credentialId,
    ratio: input.coverageRatio ?? "3.25",
    weeklyFeeCents: String(input.weeklyRateCents),
    purposeEnd: input.validUntil,
    stayEnd: input.validUntil,
    fullName: input.fullName,
    email: input.email,
    licensee: input.applicant,
  });
  return `${origin}/api/agreements/license?${query.toString()}`;
}
