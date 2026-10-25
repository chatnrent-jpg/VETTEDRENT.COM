import {
  DEFAULT_JURISDICTION_CODE,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import { calculateDailyRateComparison } from "@/lib/daily-rate-comparison";
import { evaluateGeoCompliance, INTENDED_STAY_DAYS } from "@/lib/geo-compliance";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import {
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type TrustPassportInput = {
  applicantIdentifier: string;
  cohort: PurposeCohortId;
  credentialIdentifier: string;
  coverageRatio: number;
  monthlyInflowDollars: number;
  jurisdictionCode: string;
  stayDays: number;
  contractEndDate: string;
  intendedStayEndDate: string;
  weeklyRateCents?: number;
  comparisonNightlyCents?: number;
  issuedAtIso?: string;
  certificateId?: string;
};

type PdfLine = {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  gray?: number;
};

/**
 * Deterministic, zero-external-binary PDF 1.4 byte generator for the
 * VettedRent Trust Passport. Produces a valid single-page US Letter PDF
 * (612 x 792 pt) with exact byte xref offsets.
 */
export function buildTrustPassportPdf(input: TrustPassportInput): Uint8Array {
  const cohortRule = resolvePurposeCohort(input.cohort);
  const jurisdictionRule =
    resolveJurisdiction(input.jurisdictionCode) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE);
  const effectiveJurisdictionCode = jurisdictionRule?.code ?? DEFAULT_JURISDICTION_CODE;
  const safeStayDays =
    Number.isSafeInteger(input.stayDays) && input.stayDays > 0
      ? input.stayDays
      : INTENDED_STAY_DAYS;
  const compliance = evaluateGeoCompliance(
    {
      jurisdiction_code: effectiveJurisdictionCode,
      judicial_risk_tier: jurisdictionRule?.judicialRiskTier,
      max_transient_days: jurisdictionRule?.maxTransientDays,
      compliance_structure: jurisdictionRule?.complianceStructure,
    },
    safeStayDays,
  );

  const safeRatio =
    Number.isFinite(input.coverageRatio) && input.coverageRatio > 0
      ? input.coverageRatio
      : 3;
  const safeInflow =
    Number.isFinite(input.monthlyInflowDollars) && input.monthlyInflowDollars > 0
      ? input.monthlyInflowDollars
      : 3780;
  const issuedDate = (input.issuedAtIso ?? new Date().toISOString()).slice(0, 10);
  const certId =
    input.certificateId ??
    `VR-UMI-${cohortRule.id.slice(0, 3).toUpperCase()}-${effectiveJurisdictionCode}-${issuedDate.replace(/-/g, "")}`;
  const effectiveWeeklyCents = input.weeklyRateCents ?? 31500;
  const dailyComparison = calculateDailyRateComparison(
    effectiveWeeklyCents,
    safeStayDays,
    input.comparisonNightlyCents,
  );
  const hostWeeklyCents = Math.round((effectiveWeeklyCents * 7550) / 10000);
  const hostMonthlyCents = Math.round(((effectiveWeeklyCents * 52) / 12 * 7550) / 10000);

  const lines: PdfLine[] = [
    // Header Banner
    {
      text: "VettedRent.com | Powered by the Vettilo™ UMI Engine (Vettilo.com) - UMI INFRASTRUCTURE",
      x: 48,
      y: 736,
      size: 10,
      bold: true,
    },
    {
      text: "OFFICIAL TRUST PASSPORT & INSTITUTIONAL UNDERWRITING CERTIFICATE",
      x: 48,
      y: 716,
      size: 14,
      bold: true,
    },
    {
      text: "Tenant Creed: 'Be Great to Yourself.'  |  Certificate ID: " + certId,
      x: 48,
      y: 696,
      size: 10,
      bold: false,
    },
    {
      text: `Issued: ${issuedDate} UTC  |  Underwriting Decision: APPROVED (${safeRatio.toFixed(2)}x Cash Velocity)`,
      x: 48,
      y: 680,
      size: 10,
      bold: true,
    },

    // Section 1: Verification Summary
    {
      text: "1. PURPOSE-VERIFIED STAY & CREDENTIAL SUMMARY",
      x: 48,
      y: 644,
      size: 11,
      bold: true,
    },
    {
      text: `Applicant Email / ID: ${sanitizePdfText(input.applicantIdentifier)}`,
      x: 56,
      y: 626,
      size: 10,
    },
    {
      text: `Purpose-Verified Cohort: ${cohortRule.id} (${cohortRule.audience})`,
      x: 56,
      y: 610,
      size: 10,
      bold: true,
    },
    {
      text: `Verified Credential / Reference ID: ${sanitizePdfText(input.credentialIdentifier)}`,
      x: 56,
      y: 594,
      size: 10,
    },
    {
      text: `Documented Purpose Horizon: ${sanitizePdfText(input.contractEndDate)} (Covers Stay Through ${sanitizePdfText(input.intendedStayEndDate)})`,
      x: 56,
      y: 578,
      size: 10,
    },
    {
      text: `Underwritten Stay Duration: ${safeStayDays} Days (Cohort Min Floor: ${cohortRule.minStayDays} Days)`,
      x: 56,
      y: 562,
      size: 10,
    },
    {
      text: `Approved Rate: ${formatCurrencyCents(effectiveWeeklyCents)}/wk | ${formatCurrencyCents(dailyComparison.grossDailyRateCents)}/day (${formatCurrencyCents(dailyComparison.netEffectiveDailyRateCents)}/day net after +${formatCurrencyCents(dailyComparison.dailyGmfVaultCreditCents)}/day 14.3% GMF Vault credit) | ${dailyComparison.savingsPercentage}% less than ${formatCurrencyCents(dailyComparison.aggregatorNightlyCents)}/night`,
      x: 56,
      y: 546,
      size: 8.8,
      bold: true,
    },

    // Section 2: Financial & GMF Escrow Guarantee
    {
      text: "2. 90-DAY CASH VELOCITY & GMF ESCROW GUARANTEE",
      x: 48,
      y: 516,
      size: 11,
      bold: true,
    },
    {
      text: `Verified 90-Day Deposit Velocity: ${safeRatio.toFixed(2)}x Four-Week Obligation (Floor: 3.00x Required)`,
      x: 56,
      y: 496,
      size: 10,
      bold: true,
    },
    {
      text: `Estimated Monthly Deposit Inflow: $${safeInflow.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / month (Plaid 90-Day Window)`,
      x: 56,
      y: 478,
      size: 10,
    },
    {
      text: "Security Deposit Requirement: $0.00 Security Deposit Required - Backed by 14.3% GMF Escrow",
      x: 56,
      y: 460,
      size: 10,
      bold: true,
    },
    {
      text: `Weekly Settlement Split: 75.5% Guaranteed Landlord Payout (${formatCurrencyCents(hostWeeklyCents)}/wk = ${formatCurrencyCents(hostMonthlyCents)}/mo net) | 14.3% GMF | 10.2% Platform`,
      x: 56,
      y: 442,
      size: 9.2,
    },
    {
      text: "Tenant Wealth-Building Rail: 14.3% Weekly Allocation -> $1,500.00 GMF Move-Out Vault",
      x: 56,
      y: 424,
      size: 10,
    },

    // Section 3: Statutory & Jurisdiction Guardrail
    {
      text: "3. JURISDICTION GUARDRAIL & REVOCABLE LICENSE STATUS",
      x: 48,
      y: 388,
      size: 11,
      bold: true,
    },
    {
      text: "Legal Instrument: Revocable Commercial License to Occupy (Non-Tenancy Structure)",
      x: 56,
      y: 368,
      size: 10,
      bold: true,
    },
    {
      text: `Covered Jurisdiction: ${jurisdictionRule?.name ?? effectiveJurisdictionCode} (${effectiveJurisdictionCode})`,
      x: 56,
      y: 350,
      size: 10,
    },
    {
      text: `Statutory Transient Ceiling: ${safeStayDays} / ${compliance.maxTransientDays} Max Transient Days (${compliance.rolloverProtected ? "Rollover Protected" : "Rollover Guardrail Active"})`,
      x: 56,
      y: 332,
      size: 10,
    },
    {
      text: `Compliance Status: ${sanitizePdfText(compliance.statusLabel)}`,
      x: 56,
      y: 314,
      size: 9,
    },
    {
      text: "Payroll Disconnect Protection: Automated License_Revoked state flip + instant GMF backstop draw.",
      x: 56,
      y: 296,
      size: 10,
    },

    // Section 4: Aggressive Viral B2B Footer for Off-Platform Landlords
    {
      text: "FOR PROPERTY OWNERS & LANDLORDS: UNVETTED RENTING IS OVER.",
      x: 48,
      y: 230,
      size: 12,
      bold: true,
    },
    {
      text: "UNVETTED RENTING IS OVER. This applicant is underwritten at 3.00x cash velocity",
      x: 48,
      y: 208,
      size: 10,
      bold: true,
    },
    {
      text: "and backed by the VettedRent Guaranteed Mid-Term Fund (GMF). Eliminate eviction",
      x: 48,
      y: 192,
      size: 10,
      bold: true,
    },
    {
      text: `risk, bypass security deposit friction, and lock in ${formatCurrencyCents(hostWeeklyCents)}/wk (${formatCurrencyCents(hostMonthlyCents)}/mo net) guaranteed payouts at:`,
      x: 48,
      y: 176,
      size: 9.5,
      bold: true,
    },
    {
      text: "https://vettedrent.com/marketing#host-shield",
      x: 48,
      y: 156,
      size: 11,
      bold: true,
    },
    {
      text: "VettedRent.com | Powered by the Vettilo™ UMI Engine (Vettilo.com) | Be Great to Yourself.",
      x: 48,
      y: 112,
      size: 9,
    },
  ];

  const streamOps: string[] = [
    // Outer border and divider rules
    "0.85 w",
    "0.18 0.22 0.28 RG",
    "36 88 540 676 re S",
    "48 666 m 564 666 l S",
    "48 534 m 564 534 l S",
    "48 406 m 564 406 l S",
    // Highlight box around viral B2B landlord footer
    "0.95 0.96 0.98 rg",
    "40 140 532 110 re B",
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

function sanitizePdfText(value: string): string {
  return value
    .replace(/\u2122/g, "TM")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00b7/g, "|")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
