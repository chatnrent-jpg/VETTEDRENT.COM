import { NextResponse } from "next/server";
import {
  activateStayFromUnderwriting,
  getValuationMilestoneSnapshot,
  type ActivateStayPayload,
} from "@/lib/conversion-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const milestone = await getValuationMilestoneSnapshot();
    return NextResponse.json({
      ok: true,
      coBranding: milestone.coBranding,
      activeStaysCount: milestone.activeStaysCount,
      targetStaysCount: milestone.targetStaysCount,
      progressPercentage: milestone.progressPercentage,
      target45StayBaseTimingFloatCents: milestone.target45StayBaseTimingFloatCents,
      universalFloorPricing: milestone.universalFloorPricing,
      milestone,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load 45-stay valuation milestone snapshot" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const payload: ActivateStayPayload = {
      applicant:
        typeof body.applicant === "string"
          ? body.applicant
          : typeof body.customerEmail === "string"
            ? body.customerEmail
            : undefined,
      tenantId:
        typeof body.tenantId === "string"
          ? body.tenantId
          : typeof body.tenant_id === "string"
            ? body.tenant_id
            : undefined,
      propertyId:
        typeof body.propertyId === "string"
          ? body.propertyId
          : typeof body.property_id === "string"
            ? body.property_id
            : undefined,
      cohort: typeof body.cohort === "string" ? body.cohort : undefined,
      jurisdiction:
        typeof body.jurisdiction === "string"
          ? body.jurisdiction
          : typeof body.jurisdictionCode === "string"
            ? body.jurisdictionCode
            : undefined,
      tier: typeof body.tier === "string" ? body.tier : undefined,
      weeklyRateCents:
        typeof body.weeklyRateCents === "number" && Number.isFinite(body.weeklyRateCents)
          ? Math.trunc(body.weeklyRateCents)
          : typeof body.totalCents === "number" && Number.isFinite(body.totalCents)
            ? Math.trunc(body.totalCents)
            : undefined,
      stayDays:
        typeof body.stayDays === "number" && Number.isFinite(body.stayDays)
          ? Math.trunc(body.stayDays)
          : undefined,
      checkInDate:
        typeof body.checkInDate === "string" ? body.checkInDate : undefined,
      credentialIdentifier:
        typeof body.credentialIdentifier === "string"
          ? body.credentialIdentifier
          : undefined,
      coverageRatio:
        typeof body.coverageRatio === "number" ? body.coverageRatio : undefined,
    };

    const result = await activateStayFromUnderwriting(payload);

    return NextResponse.json({
      ok: true,
      coBranding: result.milestone.coBranding,
      activeStaysCount: result.milestone.activeStaysCount,
      targetStaysCount: result.milestone.targetStaysCount,
      progressPercentage: result.milestone.progressPercentage,
      target45StayBaseTimingFloatCents: result.milestone.target45StayBaseTimingFloatCents,
      universalFloorPricing: result.milestone.universalFloorPricing,
      license: result.license,
      ledgerEntry: result.ledgerEntry,
      ledgerInstallments: result.ledgerInstallments,
      reservedDates: result.reservedDates,
      persistence: result.persistence,
      milestone: result.milestone,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not activate stay from underwriting" },
      { status: 500 },
    );
  }
}
