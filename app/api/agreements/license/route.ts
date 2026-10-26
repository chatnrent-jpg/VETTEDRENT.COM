import { NextResponse } from "next/server";
import {
  buildCommercialLicensePdf,
  generateCommercialLicense,
  type CommercialLicenseInput,
  type CommercialLicenseStatus,
} from "@/lib/commercial-license";
import {
  DEFAULT_JURISDICTION_CODE,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import { INTENDED_STAY_DAYS } from "@/lib/geo-compliance";
import { DEFAULT_CALCULATOR_WEEKLY_CENTS } from "@/lib/marketing-calculator";
import { resolvePurposeCohort } from "@/lib/underwriting-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const formatParam = (url.searchParams.get("format") ?? "pdf").trim().toLowerCase();

    const cohortRule = resolvePurposeCohort(url.searchParams.get("cohort"));
    const jurisdictionRule =
      resolveJurisdiction(
        url.searchParams.get("jurisdiction") ?? url.searchParams.get("jurisdictionCode"),
      ) ?? resolveJurisdiction(DEFAULT_JURISDICTION_CODE);
    const jurisdictionCode = jurisdictionRule?.code ?? DEFAULT_JURISDICTION_CODE;

    const rawDays = Number(url.searchParams.get("days") ?? url.searchParams.get("stayDays"));
    const stayDays =
      Number.isSafeInteger(rawDays) && rawDays >= 1 && rawDays <= 365
        ? rawDays
        : cohortRule.defaultStayDays || INTENDED_STAY_DAYS;

    const rawWeeklyCents = Number(
      url.searchParams.get("weeklyFeeCents") ?? url.searchParams.get("weeklyRateCents"),
    );
    const weeklyFeeCents =
      Number.isSafeInteger(rawWeeklyCents) && rawWeeklyCents >= 5000 && rawWeeklyCents <= 500000
        ? rawWeeklyCents
        : DEFAULT_CALCULATOR_WEEKLY_CENTS;

    const rawRatio = Number(url.searchParams.get("ratio") ?? url.searchParams.get("coverageRatio"));
    const coverageRatio =
      Number.isFinite(rawRatio) && rawRatio >= 2.5 && rawRatio <= 50 ? rawRatio : 3.0;

    const rawVaultCents = Number(url.searchParams.get("vaultBalanceCents"));
    const vaultBalanceCents =
      Number.isSafeInteger(rawVaultCents) && rawVaultCents >= 0 ? rawVaultCents : 41004;

    const rawStatus = url.searchParams.get("status") ?? url.searchParams.get("licenseStatus");
    const licenseStatus: CommercialLicenseStatus =
      rawStatus === "License_Revoked" ? "License_Revoked" : "License_Active";

    const licenseeFullName =
      url.searchParams.get("fullName") ??
      url.searchParams.get("licenseeName") ??
      url.searchParams.get("name") ??
      undefined;
    const licenseeEmail =
      url.searchParams.get("email") ??
      url.searchParams.get("licensee") ??
      url.searchParams.get("applicant") ??
      undefined;

    const licenseInput: CommercialLicenseInput = {
      agreementId: url.searchParams.get("agreementId") ?? undefined,
      listingId: url.searchParams.get("listingId") ?? undefined,
      propertyTitle: url.searchParams.get("propertyTitle") ?? undefined,
      licensorName: url.searchParams.get("licensor") ?? undefined,
      licenseeFullName,
      licenseeEmail,
      licenseeIdentifier:
        licenseeFullName && licenseeEmail
          ? `${licenseeFullName} (${licenseeEmail})`
          : (licenseeFullName ?? licenseeEmail ?? undefined),
      cohort: cohortRule.id,
      credentialIdentifier:
        url.searchParams.get("credentialId") ??
        url.searchParams.get("credentialIdentifier") ??
        cohortRule.defaultIdentifier,
      jurisdictionCode,
      weeklyFeeCents,
      stayDays,
      purposeEndDate:
        url.searchParams.get("purposeEnd") ?? url.searchParams.get("contractEnd") ?? undefined,
      intendedStayEndDate:
        url.searchParams.get("stayEnd") ?? url.searchParams.get("intendedStayEndDate") ?? undefined,
      coverageRatio,
      seamAccessCodeId: url.searchParams.get("seamAccessCodeId") ?? undefined,
      vaultBalanceCents,
      licenseStatus,
    };

    if (formatParam === "json") {
      const license = generateCommercialLicense(licenseInput);
      return NextResponse.json({
        ok: true,
        license,
      });
    }

    const pdfBytes = buildCommercialLicensePdf(licenseInput);
    const filename = `VettedRent-Commercial-License-${cohortRule.id}-${jurisdictionCode}.pdf`;
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("commercial license GET failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not generate Revocable Commercial License";
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

    const formatParam =
      typeof body.format === "string" ? body.format.trim().toLowerCase() : "json";

    const cohortRule = resolvePurposeCohort(
      typeof body.cohort === "string" ? body.cohort : undefined,
    );
    const jurisdictionRule =
      resolveJurisdiction(
        typeof body.jurisdictionCode === "string"
          ? body.jurisdictionCode
          : typeof body.jurisdiction === "string"
            ? body.jurisdiction
            : undefined,
      ) ?? resolveJurisdiction(DEFAULT_JURISDICTION_CODE);
    const jurisdictionCode = jurisdictionRule?.code ?? DEFAULT_JURISDICTION_CODE;

    const rawDays = Number(body.stayDays ?? body.days);
    const stayDays =
      Number.isSafeInteger(rawDays) && rawDays >= 1 && rawDays <= 365
        ? rawDays
        : cohortRule.defaultStayDays || INTENDED_STAY_DAYS;

    const rawWeeklyCents = Number(body.weeklyFeeCents ?? body.weeklyRateCents);
    const weeklyFeeCents =
      Number.isSafeInteger(rawWeeklyCents) && rawWeeklyCents >= 5000 && rawWeeklyCents <= 500000
        ? rawWeeklyCents
        : DEFAULT_CALCULATOR_WEEKLY_CENTS;

    const rawRatio = Number(body.coverageRatio ?? body.ratio);
    const coverageRatio =
      Number.isFinite(rawRatio) && rawRatio >= 2.5 && rawRatio <= 50 ? rawRatio : 3.0;

    const rawVaultCents = Number(body.vaultBalanceCents);
    const vaultBalanceCents =
      Number.isSafeInteger(rawVaultCents) && rawVaultCents >= 0 ? rawVaultCents : 41004;

    const licenseStatus: CommercialLicenseStatus =
      body.licenseStatus === "License_Revoked" ? "License_Revoked" : "License_Active";

    const licenseInput: CommercialLicenseInput = {
      agreementId: typeof body.agreementId === "string" ? body.agreementId : undefined,
      listingId: typeof body.listingId === "string" ? body.listingId : undefined,
      propertyTitle: typeof body.propertyTitle === "string" ? body.propertyTitle : undefined,
      licensorName: typeof body.licensorName === "string" ? body.licensorName : undefined,
      licenseeIdentifier:
        typeof body.licenseeIdentifier === "string"
          ? body.licenseeIdentifier
          : typeof body.applicant === "string"
            ? body.applicant
            : undefined,
      cohort: cohortRule.id,
      credentialIdentifier:
        typeof body.credentialIdentifier === "string"
          ? body.credentialIdentifier
          : cohortRule.defaultIdentifier,
      jurisdictionCode,
      weeklyFeeCents,
      stayDays,
      purposeEndDate: typeof body.purposeEndDate === "string" ? body.purposeEndDate : undefined,
      intendedStayEndDate:
        typeof body.intendedStayEndDate === "string" ? body.intendedStayEndDate : undefined,
      coverageRatio,
      seamAccessCodeId:
        typeof body.seamAccessCodeId === "string" ? body.seamAccessCodeId : undefined,
      vaultBalanceCents,
      licenseStatus,
    };

    if (formatParam === "pdf") {
      const pdfBytes = buildCommercialLicensePdf(licenseInput);
      const filename = `VettedRent-Commercial-License-${cohortRule.id}-${jurisdictionCode}.pdf`;
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const license = generateCommercialLicense(licenseInput);
    return NextResponse.json({
      ok: true,
      license,
    });
  } catch (error) {
    console.error("commercial license POST failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not generate Revocable Commercial License";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
