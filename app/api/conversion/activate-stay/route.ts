import { NextResponse } from "next/server";
import {
  isDeliverableEmail,
  sendBookingConfirmationEmail,
  type BookingEmailStatus,
} from "@/lib/booking-email";
import {
  activateStayFromUnderwriting,
  getValuationMilestoneSnapshot,
  type ActivateStayPayload,
} from "@/lib/conversion-engine";
import { ListingBookingError } from "@/lib/listing-availability";
import { loadPublishedListing } from "@/lib/public-listings";
import { getSupabaseServerClient } from "@/lib/supabase";

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

    // A real listing is authoritative for tier and price. The client is only told what to book,
    // never what it costs. The client sends listingId only for published listings, so a miss
    // means it was taken down (or could not be verified) and the booking is refused.
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    if (listingId) {
      let listing = null;
      try {
        listing = await loadPublishedListing(getSupabaseServerClient(), listingId);
      } catch {
        listing = null;
      }
      if (!listing) {
        return NextResponse.json(
          { ok: false, error: "This stay is no longer available." },
          { status: 409 },
        );
      }
      payload.tier = listing.tier;
      payload.weeklyRateCents = listing.weeklyRate * 100;
      // The engine reserves this listing's own calendar before it creates anything.
      payload.listingId = listing.id;
    }

    let result: Awaited<ReturnType<typeof activateStayFromUnderwriting>>;
    try {
      result = await activateStayFromUnderwriting(payload);
    } catch (error) {
      if (error instanceof ListingBookingError) {
        if (error.reason === "conflict") {
          return NextResponse.json(
            {
              ok: false,
              error: "Some of those dates were just taken. Pick different dates and try again.",
            },
            { status: 409 },
          );
        }
        if (error.reason === "not_found") {
          return NextResponse.json(
            { ok: false, error: "This stay is no longer available." },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { ok: false, error: "Booking is briefly unavailable. Please try again soon." },
          { status: 503 },
        );
      }
      throw error;
    }

    // Email is best-effort and reported honestly: the booking above is already complete.
    const guestEmail = typeof body.guestEmail === "string" ? body.guestEmail.trim() : "";
    const guestName =
      typeof body.guestName === "string" ? body.guestName.trim().slice(0, 120) : "";
    let emailStatus: BookingEmailStatus | "not_requested" = "not_requested";
    if (
      isDeliverableEmail(guestEmail) &&
      guestName.length >= 2 &&
      typeof payload.weeklyRateCents === "number" &&
      payload.credentialIdentifier
    ) {
      emailStatus = await sendBookingConfirmationEmail({
        guestName,
        checkInDate: result.license.check_in_date,
        licenseId: result.license.license_id,
        stay: {
          cohort: result.license.cohort,
          jurisdiction: result.license.jurisdiction,
          stayDays: payload.stayDays ?? 7,
          weeklyRateCents: payload.weeklyRateCents,
          credentialId: payload.credentialIdentifier,
          validUntil: result.license.valid_until,
          fullName: guestName,
          email: guestEmail,
          applicant: payload.applicant ?? `${guestName} (${guestEmail})`,
          agreementId: result.license.agreement_id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      emailStatus,
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
