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
      activeStaysCount: milestone.activeStaysCount,
      targetStaysCount: milestone.targetStaysCount,
      progressPercentage: milestone.progressPercentage,
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
      cohort: typeof body.cohort === "string" ? body.cohort : undefined,
      jurisdiction:
        typeof body.jurisdiction === "string"
          ? body.jurisdiction
          : typeof body.jurisdictionCode === "string"
            ? body.jurisdictionCode
            : undefined,
      tier: typeof body.tier === "string" ? body.tier : undefined,
      weeklyRateCents:
        typeof body.weeklyRateCents === "number"
          ? body.weeklyRateCents
          : typeof body.totalCents === "number"
            ? body.totalCents
            : undefined,
      stayDays:
        typeof body.stayDays === "number" ? body.stayDays : undefined,
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
      activeStaysCount: result.milestone.activeStaysCount,
      targetStaysCount: result.milestone.targetStaysCount,
      progressPercentage: result.milestone.progressPercentage,
      license: result.license,
      ledgerEntry: result.ledgerEntry,
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
