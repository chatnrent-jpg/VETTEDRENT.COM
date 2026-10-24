import { NextResponse } from "next/server";
import {
  DEFAULT_JURISDICTION_CODE,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import { INTENDED_STAY_DAYS, intendedStayLengthDays } from "@/lib/geo-compliance";
import { buildTrustPassportPdf } from "@/lib/trust-passport-pdf";
import {
  addUtcDays,
  resolvePurposeCohort,
} from "@/lib/underwriting-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const cohortRule = resolvePurposeCohort(url.searchParams.get("cohort"));
    const jurisdictionRule =
      resolveJurisdiction(url.searchParams.get("jurisdiction")) ??
      resolveJurisdiction(DEFAULT_JURISDICTION_CODE);
    const jurisdictionCode = jurisdictionRule?.code ?? DEFAULT_JURISDICTION_CODE;

    const rawDays = Number(url.searchParams.get("days"));
    const stayEndParam = url.searchParams.get("stayEnd");
    const stayDays =
      Number.isSafeInteger(rawDays) && rawDays >= 1 && rawDays <= 365
        ? rawDays
        : stayEndParam
          ? intendedStayLengthDays(stayEndParam)
          : cohortRule.defaultStayDays || INTENDED_STAY_DAYS;

    const defaultEnd = addUtcDays(new Date(), stayDays);
    const contractEndDate = cleanDate(url.searchParams.get("contractEnd")) ?? defaultEnd;
    const intendedStayEndDate = cleanDate(stayEndParam) ?? defaultEnd;

    const rawRatio = Number(url.searchParams.get("ratio"));
    const coverageRatio =
      Number.isFinite(rawRatio) && rawRatio >= 2.5 && rawRatio <= 50 ? rawRatio : 3.0;

    const rawInflow = Number(url.searchParams.get("monthlyInflow"));
    const monthlyInflowDollars =
      Number.isFinite(rawInflow) && rawInflow >= 500 && rawInflow <= 500000
        ? rawInflow
        : 2940;

    const credentialIdentifier =
      cleanText(url.searchParams.get("credentialId"), 80) ?? cohortRule.defaultIdentifier;
    const applicantIdentifier =
      cleanText(url.searchParams.get("applicant"), 120) ?? "Verified VettedRent Professional";

    const pdfBytes = buildTrustPassportPdf({
      applicantIdentifier,
      cohort: cohortRule.id,
      credentialIdentifier,
      coverageRatio,
      monthlyInflowDollars,
      jurisdictionCode,
      stayDays,
      contractEndDate,
      intendedStayEndDate,
    });

    const filename = `VettedRent-Trust-Passport-${cohortRule.id}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("trust passport PDF generation failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not generate Trust Passport PDF";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const cohortRule = resolvePurposeCohort(
      typeof body.cohort === "string" ? body.cohort : undefined,
    );
    const jurisdictionRule =
      resolveJurisdiction(
        typeof body.jurisdictionCode === "string" ? body.jurisdictionCode : undefined,
      ) ?? resolveJurisdiction(DEFAULT_JURISDICTION_CODE);
    const jurisdictionCode = jurisdictionRule?.code ?? DEFAULT_JURISDICTION_CODE;

    const rawDays = Number(body.stayDays);
    const stayDays =
      Number.isSafeInteger(rawDays) && rawDays >= 1 && rawDays <= 365
        ? rawDays
        : cohortRule.defaultStayDays;

    const defaultEnd = addUtcDays(new Date(), stayDays);
    const contractEndDate =
      cleanDate(typeof body.contractEndDate === "string" ? body.contractEndDate : null) ??
      defaultEnd;
    const intendedStayEndDate =
      cleanDate(
        typeof body.intendedStayEndDate === "string" ? body.intendedStayEndDate : null,
      ) ?? defaultEnd;

    const rawRatio = Number(body.coverageRatio);
    const coverageRatio =
      Number.isFinite(rawRatio) && rawRatio >= 2.5 && rawRatio <= 50 ? rawRatio : 3.0;

    const rawInflow = Number(body.monthlyInflowDollars);
    const monthlyInflowDollars =
      Number.isFinite(rawInflow) && rawInflow >= 500 && rawInflow <= 500000
        ? rawInflow
        : 2940;

    const credentialIdentifier =
      cleanText(
        typeof body.credentialIdentifier === "string" ? body.credentialIdentifier : null,
        80,
      ) ?? cohortRule.defaultIdentifier;
    const applicantIdentifier =
      cleanText(
        typeof body.applicantIdentifier === "string" ? body.applicantIdentifier : null,
        120,
      ) ?? "Verified VettedRent Professional";

    const pdfBytes = buildTrustPassportPdf({
      applicantIdentifier,
      cohort: cohortRule.id,
      credentialIdentifier,
      coverageRatio,
      monthlyInflowDollars,
      jurisdictionCode,
      stayDays,
      contractEndDate,
      intendedStayEndDate,
    });

    const filename = `VettedRent-Trust-Passport-${cohortRule.id}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not generate Trust Passport PDF" },
      { status: 500 },
    );
  }
}

function cleanText(value: string | null, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, maxLength);
}

function cleanDate(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}
