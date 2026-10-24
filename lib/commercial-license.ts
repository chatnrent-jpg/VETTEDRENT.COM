import { createHash } from "node:crypto";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
  type JurisdictionRule,
} from "@/lib/compliance/jurisdictions";
import { evaluateGeoCompliance, INTENDED_STAY_DAYS } from "@/lib/geo-compliance";
import {
  CALCULATOR_HOST_BPS,
  CALCULATOR_PLATFORM_BPS,
  CALCULATOR_VAULT_BPS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import {
  addUtcDays,
  resolvePurposeCohort,
  type PurposeCohortId,
  type PurposeCohortRule,
} from "@/lib/underwriting-contract";

export type CommercialLicenseStatus = "License_Active" | "License_Revoked";

export type CommercialLicenseInput = {
  agreementId?: string;
  listingId?: string;
  propertyTitle?: string;
  licensorName?: string;
  licenseeIdentifier?: string;
  cohort?: PurposeCohortId | string;
  credentialIdentifier?: string;
  jurisdictionCode?: string;
  weeklyFeeCents?: number;
  stayDays?: number;
  purposeEndDate?: string;
  intendedStayEndDate?: string;
  coverageRatio?: number;
  seamAccessCodeId?: string | null;
  vaultBalanceCents?: number;
  issuedAtIso?: string;
  licenseStatus?: CommercialLicenseStatus;
};

export type CommercialLicenseDocument = {
  documentType: "Revocable Commercial License to Occupy";
  legalFramework: "Hospitality & Purpose-Verified Lodging Framework (Non-Tenancy Commercial License)";
  prohibitedTerminologyNotice: string;
  dualBrandHeader: {
    landlordShield: "Unvetted renting is over.";
    lodgerCreed: "Be Great to Yourself.";
    systemSpecificationSection: "Section 3.C — Revocable Commercial License & 1:1 Weekly Payment Token Binding";
  };
  licenseId: string;
  licenseToken: string;
  licenseStatus: CommercialLicenseStatus;
  issuedAtUtc: string;
  parties: {
    licensorName: string;
    licenseeIdentifier: string;
    agreementId: string;
    listingId: string;
    propertyTitle: string;
  };
  universalCohortBinding: {
    cohortId: PurposeCohortId;
    cohortTitle: string;
    universalCategoryDescription: string;
    credentialLabel: string;
    credentialIdentifier: string;
    purposeEndDate: string;
    intendedStayEndDate: string;
    authorizedStayDays: number;
    cohortMinStayDays: number;
    verifiedCoverageRatio: number;
  };
  jurisdictionGuardrailClause: {
    jurisdictionCode: string;
    jurisdictionName: string;
    maxTransientDays: number;
    judicialRiskTier: JurisdictionRule["judicialRiskTier"];
    rolloverProtected: boolean;
    complianceStatusLabel: string;
    statutoryClauseText: string;
  };
  tokenAndWeeklySplitBinding: {
    weeklyFeeCents: number;
    hostWeeklyPayoutCents: number;
    gmfVaultWeeklyAllocationCents: number;
    platformWeeklyFeeCents: number;
    hostBps: 7550;
    gmfVaultBps: 1430;
    platformBps: 1020;
    upfrontSecurityDepositCents: 0;
    gmfMoveOutVaultTargetCents: 150000;
    currentVaultBalanceCents: number;
    seamAccessCodeId: string;
    oneToOneBindingClause: string;
    payrollDisconnectRevocationClause: string;
  };
};

type PdfLine = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
};

/**
 * Generates the Section 3.C Revocable Commercial License to Occupy payload.
 * Strictly avoids residential lease terminology; binds occupancy 1:1 to
 * weekly micro-deduction confirmations and active payroll/stipend status.
 */
export function generateCommercialLicense(
  input: CommercialLicenseInput = {},
): CommercialLicenseDocument {
  const cohortRule = resolvePurposeCohort(input.cohort);
  const jurisdictionRule =
    resolveJurisdiction(input.jurisdictionCode) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE) ??
    JURISDICTION_RULES[0];

  const safeStayDays =
    typeof input.stayDays === "number" &&
    Number.isSafeInteger(input.stayDays) &&
    input.stayDays >= 1 &&
    input.stayDays <= 365
      ? input.stayDays
      : cohortRule.defaultStayDays || INTENDED_STAY_DAYS;

  const safeWeeklyCents =
    typeof input.weeklyFeeCents === "number" &&
    Number.isSafeInteger(input.weeklyFeeCents) &&
    input.weeklyFeeCents >= 5000 &&
    input.weeklyFeeCents <= 500000
      ? input.weeklyFeeCents
      : DEFAULT_CALCULATOR_WEEKLY_CENTS;

  const hostWeeklyPayoutCents = Math.round((safeWeeklyCents * CALCULATOR_HOST_BPS) / 10000);
  const gmfVaultWeeklyAllocationCents = Math.round(
    (safeWeeklyCents * CALCULATOR_VAULT_BPS) / 10000,
  );
  const platformWeeklyFeeCents =
    safeWeeklyCents - hostWeeklyPayoutCents - gmfVaultWeeklyAllocationCents;

  const issuedAtUtc = (input.issuedAtIso ?? new Date().toISOString()).slice(0, 19) + "Z";
  const issuedDate = issuedAtUtc.slice(0, 10);
  const defaultEnd = addUtcDays(new Date(), safeStayDays);
  const purposeEndDate = cleanIsoDate(input.purposeEndDate) ?? defaultEnd;
  const intendedStayEndDate = cleanIsoDate(input.intendedStayEndDate) ?? defaultEnd;

  const agreementId =
    cleanText(input.agreementId, 80) ?? "00000000-0000-0000-0000-000000000000";
  const listingId = cleanText(input.listingId, 80) ?? "vr-weekly-room";
  const propertyTitle =
    cleanText(input.propertyTitle, 140) ??
    `VettedRent Verified Lodging Sanctuary (${listingId} · ${jurisdictionRule.code})`;
  const licensorName =
    cleanText(input.licensorName, 120) ??
    `Verified VettedRent Host (${jurisdictionRule.code} Host Shield)`;
  const licenseeIdentifier =
    cleanText(input.licenseeIdentifier, 120) ?? "Verified VettedRent Professional";
  const credentialIdentifier =
    cleanText(input.credentialIdentifier, 80) ?? cohortRule.defaultIdentifier;
  const verifiedCoverageRatio =
    typeof input.coverageRatio === "number" &&
    Number.isFinite(input.coverageRatio) &&
    input.coverageRatio >= 2.5 &&
    input.coverageRatio <= 50
      ? input.coverageRatio
      : 3.0;
  const currentVaultBalanceCents =
    typeof input.vaultBalanceCents === "number" &&
    Number.isSafeInteger(input.vaultBalanceCents) &&
    input.vaultBalanceCents >= 0
      ? input.vaultBalanceCents
      : 41004;
  const seamAccessCodeId =
    cleanText(input.seamAccessCodeId ?? undefined, 80) ?? "access_code_mock_12345";
  const licenseStatus: CommercialLicenseStatus =
    input.licenseStatus === "License_Revoked" ? "License_Revoked" : "License_Active";

  const compliance = evaluateGeoCompliance(
    {
      jurisdiction_code: jurisdictionRule.code,
      judicial_risk_tier: jurisdictionRule.judicialRiskTier,
      max_transient_days: jurisdictionRule.maxTransientDays,
      compliance_structure: "revocable_lodging_license",
    },
    safeStayDays,
  );

  const tokenDigest = createHash("sha256")
    .update(
      [
        agreementId,
        listingId,
        licenseeIdentifier,
        cohortRule.id,
        credentialIdentifier,
        jurisdictionRule.code,
        String(safeWeeklyCents),
        String(safeStayDays),
        purposeEndDate,
        intendedStayEndDate,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  const licenseId = `VR-LIC-${cohortRule.id.slice(0, 3).toUpperCase()}-${jurisdictionRule.code}-${issuedDate.replace(/-/g, "")}`;
  const licenseToken = `vrtl_${jurisdictionRule.code.replace(/[^A-Z0-9]/g, "")}_${cohortRule.id.slice(0, 3).toUpperCase()}_${tokenDigest}`;

  const statutoryClauseText = buildStatutoryGuardrailClause(
    jurisdictionRule,
    safeStayDays,
    compliance.rolloverProtected,
  );

  return {
    documentType: "Revocable Commercial License to Occupy",
    legalFramework:
      "Hospitality & Purpose-Verified Lodging Framework (Non-Tenancy Commercial License)",
    prohibitedTerminologyNotice:
      "NON-TENANCY NOTICE: This instrument is strictly a Revocable Commercial License to Occupy under hospitality and transient lodging doctrine. It is NOT a residential lease, does not convey a leasehold estate or exclusive possession, and all weekly occupancy fees are commercial license fees.",
    dualBrandHeader: {
      landlordShield: "Unvetted renting is over.",
      lodgerCreed: "Be Great to Yourself.",
      systemSpecificationSection:
        "Section 3.C — Revocable Commercial License & 1:1 Weekly Payment Token Binding",
    },
    licenseId,
    licenseToken,
    licenseStatus,
    issuedAtUtc,
    parties: {
      licensorName,
      licenseeIdentifier,
      agreementId,
      listingId,
      propertyTitle,
    },
    universalCohortBinding: {
      cohortId: cohortRule.id,
      cohortTitle: cohortRule.title,
      universalCategoryDescription: describeUniversalCohort(cohortRule),
      credentialLabel: cohortRule.identifierLabel,
      credentialIdentifier,
      purposeEndDate,
      intendedStayEndDate,
      authorizedStayDays: safeStayDays,
      cohortMinStayDays: cohortRule.minStayDays,
      verifiedCoverageRatio,
    },
    jurisdictionGuardrailClause: {
      jurisdictionCode: jurisdictionRule.code,
      jurisdictionName: jurisdictionRule.name,
      maxTransientDays: jurisdictionRule.maxTransientDays,
      judicialRiskTier: jurisdictionRule.judicialRiskTier,
      rolloverProtected: compliance.rolloverProtected,
      complianceStatusLabel: compliance.statusLabel,
      statutoryClauseText,
    },
    tokenAndWeeklySplitBinding: {
      weeklyFeeCents: safeWeeklyCents,
      hostWeeklyPayoutCents,
      gmfVaultWeeklyAllocationCents,
      platformWeeklyFeeCents,
      hostBps: 7550,
      gmfVaultBps: 1430,
      platformBps: 1020,
      upfrontSecurityDepositCents: 0,
      gmfMoveOutVaultTargetCents: 150000,
      currentVaultBalanceCents,
      seamAccessCodeId,
      oneToOneBindingClause: `1:1 CRYPTOGRAPHIC TOKEN BINDING: Digital entry token ${licenseToken} (Seam keyway ${seamAccessCodeId}) is cryptographically bound 1:1 to each confirmed 7-day micro-deduction of ${formatCurrencyCents(safeWeeklyCents)} (${formatCurrencyCents(hostWeeklyPayoutCents)} [75.5%] Host Payout / ${formatCurrencyCents(gmfVaultWeeklyAllocationCents)} [14.3%] GMF Escrow & $1,500.00 Move-Out Vault / ${formatCurrencyCents(platformWeeklyFeeCents)} [10.2%] Platform Rail). $0.00 security deposit is collected.`,
      payrollDisconnectRevocationClause:
        "AUTOMATIC REVOCATION ON STREAM DISCONNECT: Upon any missed weekly micro-deduction or verified payroll/stipend/ALE stream disconnect signal (PAYROLL_DISCONNECTED, DIRECT_DEPOSIT_SWITCHED, EMPLOYMENT_TERMINATED, INCOME_STREAM_REVOKED), system state immediately transitions to License_Revoked, Seam smart-lock access is revoked, and the GMF Escrow pool routes up to $300.00 in instant host backstop funding.",
    },
  };
}

/**
 * Deterministic, zero-external-binary US Letter PDF 1.4 generator for the
 * Section 3.C Revocable Commercial License to Occupy.
 */
export function buildCommercialLicensePdf(input: CommercialLicenseInput = {}): Uint8Array {
  const doc = generateCommercialLicense(input);
  const split = doc.tokenAndWeeklySplitBinding;
  const cohort = doc.universalCohortBinding;
  const guardrail = doc.jurisdictionGuardrailClause;

  const lines: PdfLine[] = [
    // Dual-Brand Header Banner
    {
      text: "VETTEDRENT.COM - SECTION 3.C UNDERWRITTEN MID-TERM INFRASTRUCTURE (UMI)",
      x: 44,
      y: 742,
      size: 10,
      bold: true,
    },
    {
      text: "REVOCABLE COMMERCIAL LICENSE TO OCCUPY (NON-TENANCY LODGING INSTRUMENT)",
      x: 44,
      y: 724,
      size: 13,
      bold: true,
    },
    {
      text: `Landlord Shield: "${doc.dualBrandHeader.landlordShield}"  |  Lodger Creed: "${doc.dualBrandHeader.lodgerCreed}"`,
      x: 44,
      y: 706,
      size: 10,
      bold: true,
    },
    {
      text: `License ID: ${doc.licenseId}  |  State: ${doc.licenseStatus}  |  Issued: ${doc.issuedAtUtc.slice(0, 10)} UTC`,
      x: 44,
      y: 690,
      size: 9,
    },

    // Section 1: Non-Tenancy Commercial Framework & Parties
    {
      text: "1. HOSPITALITY & PURPOSE-VERIFIED COMMERCIAL LICENSE FRAMEWORK (NO LEASEHOLD)",
      x: 44,
      y: 658,
      size: 10,
      bold: true,
    },
    {
      text: `Licensor (Host Shield): ${doc.parties.licensorName}  |  Listing: ${doc.parties.listingId}`,
      x: 52,
      y: 640,
      size: 9,
    },
    {
      text: `Licensee (Verified Lodger): ${doc.parties.licenseeIdentifier}  |  Agreement ID: ${doc.parties.agreementId}`,
      x: 52,
      y: 625,
      size: 9,
    },
    {
      text: "Express Non-Tenancy Covenant: This agreement is strictly a Revocable Commercial License to Occupy.",
      x: 52,
      y: 610,
      size: 9,
      bold: true,
    },
    {
      text: "Residential lease terminology, leasehold possession, and indefinite holdover rights are expressly prohibited.",
      x: 52,
      y: 595,
      size: 9,
    },

    // Section 2: Universal Cohort & Purpose Binding
    {
      text: "2. UNIVERSAL PURPOSE-VERIFIED STAY COHORT & CREDENTIAL BINDING",
      x: 44,
      y: 565,
      size: 10,
      bold: true,
    },
    {
      text: `Active Universal Cohort: ${cohort.cohortId} (${cohort.universalCategoryDescription})`,
      x: 52,
      y: 547,
      size: 9,
      bold: true,
    },
    {
      text: `${cohort.credentialLabel}: ${cohort.credentialIdentifier}  |  Verified Cash Velocity: ${cohort.verifiedCoverageRatio.toFixed(2)}x (3.00x Floor)`,
      x: 52,
      y: 532,
      size: 9,
    },
    {
      text: `Verified Purpose Horizon: ${cohort.purposeEndDate}  |  Authorized Stay Window: ${cohort.authorizedStayDays} Days (Through ${cohort.intendedStayEndDate})`,
      x: 52,
      y: 517,
      size: 9,
    },
    {
      text: "Universal Coverage Scope: Temporary Workers/Contractors, University/Vocational Students, 14d+ Remote Pros & ALE Families.",
      x: 52,
      y: 502,
      size: 8.5,
    },

    // Section 3: Jurisdiction Statutory Guardrail Clause
    {
      text: "3. JURISDICTION STATUTORY GUARDRAIL & ROLLOVER DEFENSE CLAUSE",
      x: 44,
      y: 472,
      size: 10,
      bold: true,
    },
    {
      text: `Covered Jurisdiction: ${guardrail.jurisdictionName} (${guardrail.jurisdictionCode})  |  Judicial Backlog Tier: ${guardrail.judicialRiskTier.toUpperCase()}`,
      x: 52,
      y: 454,
      size: 9,
      bold: true,
    },
    {
      text: `Statutory Transient Ceiling: ${cohort.authorizedStayDays} / ${guardrail.maxTransientDays} Max Transient Days (${guardrail.rolloverProtected ? "Rollover Protected" : "Statutory Ceiling Guardrail Enforced"})`,
      x: 52,
      y: 439,
      size: 9,
    },
    {
      text: guardrail.statutoryClauseText.slice(0, 108),
      x: 52,
      y: 424,
      size: 8.5,
    },
    {
      text: guardrail.statutoryClauseText.slice(108, 220),
      x: 52,
      y: 410,
      size: 8.5,
    },

    // Section 4: Cryptographic License Token & 1:1 Weekly Payment Binding
    {
      text: "4. CRYPTOGRAPHIC LICENSE TOKEN & 1:1 WEEKLY MICRO-DEDUCTION BINDING",
      x: 44,
      y: 380,
      size: 10,
      bold: true,
    },
    {
      text: `Cryptographic License Token: ${doc.licenseToken}  |  Seam Smart-Lock Keyway: ${split.seamAccessCodeId}`,
      x: 52,
      y: 362,
      size: 9,
      bold: true,
    },
    {
      text: `Weekly Commercial License Fee: ${formatCurrencyCents(split.weeklyFeeCents)}/wk  |  Upfront Security Deposit: $0.00 (Zero Deposit Friction)`,
      x: 52,
      y: 347,
      size: 9,
    },
    {
      text: `1:1 Weekly Split: 75.5% Host Payout (${formatCurrencyCents(split.hostWeeklyPayoutCents)}) | 14.3% GMF Escrow & Vault (${formatCurrencyCents(split.gmfVaultWeeklyAllocationCents)}) | 10.2% Platform (${formatCurrencyCents(split.platformWeeklyFeeCents)})`,
      x: 52,
      y: 332,
      size: 9,
      bold: true,
    },
    {
      text: `Lodger GMF Move-Out Vault Progress: ${formatCurrencyCents(split.currentVaultBalanceCents)} / $1,500.00 Target ("Be Great to Yourself.")`,
      x: 52,
      y: 317,
      size: 9,
    },
    {
      text: "Token Validity Rule: Digital entry token remains valid ONLY for the 7-day window funded by each settled weekly split.",
      x: 52,
      y: 302,
      size: 8.5,
    },
    {
      text: "Revocation Trigger: Payroll/stipend disconnect or failed weekly settlement immediately flips state to License_Revoked,",
      x: 52,
      y: 288,
      size: 8.5,
    },
    {
      text: "terminates Seam smart-lock access, and routes up to $300.00 in instant GMF Escrow backstop funds to the Licensor.",
      x: 52,
      y: 274,
      size: 8.5,
    },

    // Section 5: Digital Execution & Verification Block
    {
      text: "DIGITAL EXECUTION & CRYPTOGRAPHIC VERIFICATION",
      x: 48,
      y: 222,
      size: 11,
      bold: true,
    },
    {
      text: `UNVETTED RENTING IS OVER. Bound to Token ${doc.licenseToken} under VettedRent UMI Section 3.C.`,
      x: 48,
      y: 204,
      size: 9.5,
      bold: true,
    },
    {
      text: `Verify live license status or onboard properties at https://vettedrent.com/marketing#host-shield`,
      x: 48,
      y: 188,
      size: 9.5,
    },
    {
      text: `Host Shield Portal: https://vettedrent.com/jurisdictions/${guardrail.jurisdictionCode}  |  Lodger Creed: "Be Great to Yourself."`,
      x: 48,
      y: 172,
      size: 9,
    },
    {
      text: "Electronically executed via VettedRent Automated Underwriting & GMF Escrow Rail.",
      x: 44,
      y: 116,
      size: 8.5,
    },
  ];

  const streamOps: string[] = [
    "0.85 w",
    "0.16 0.20 0.27 RG",
    "34 96 544 668 re S",
    "44 676 m 568 676 l S",
    "44 580 m 568 580 l S",
    "44 488 m 568 488 l S",
    "44 396 m 568 396 l S",
    "0.95 0.96 0.98 rg",
    "40 156 532 84 re B",
    "0 0 0 rg",
  ];

  for (const line of lines) {
    const fontKey = line.bold ? "/F2" : "/F1";
    const escaped = escapePdfLiteral(sanitizePdfText(line.text));
    streamOps.push(
      `BT ${fontKey} ${line.size} Tf 1 0 0 1 ${line.x} ${line.y} Tm (${escaped}) Tj ET`,
    );
  }

  const contentStream = streamOps.join("\n") + "\n";
  const contentLength = Buffer.byteLength(contentStream, "ascii");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
    `6 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}endstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "ascii"));
}

function describeUniversalCohort(cohort: PurposeCohortRule): string {
  switch (cohort.id) {
    case "Contract-Assignment":
      return "All Temporary Workers, Corporate/IT/Engineering/Industrial & Healthcare Contractors";
    case "Academic-Enrollment":
      return "University, Graduate, Clinical Rotation & Vocational Students";
    case "Seasonal-Remote":
      return "14-Day+ Seasonal Residents, Digital Nomads & Remote Professionals";
    case "Insurance-Relocation":
      return "ALE Insurance Policyholders & Corporate Relocating Families";
  }
}

function buildStatutoryGuardrailClause(
  rule: JurisdictionRule,
  stayDays: number,
  rolloverProtected: boolean,
): string {
  if (rolloverProtected) {
    return `${rule.name} (${rule.code}) caps transient lodging at ${rule.maxTransientDays} days (${rule.judicialRiskTier} judicial backlog). This ${stayDays}-day Revocable Commercial License remains strictly below the statutory ceiling, preventing residential tenancy rollover.`;
  }
  return `${rule.name} (${rule.code}) enforces a ${rule.maxTransientDays}-day statutory threshold (${rule.judicialRiskTier} judicial backlog). Occupancy is automatically bounded and subject to mandatory license renewal/checkout prior to day ${rule.maxTransientDays} to prevent statutory holdover.`;
}

function cleanIsoDate(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function cleanText(value: string | undefined, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00b7/g, "|")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
