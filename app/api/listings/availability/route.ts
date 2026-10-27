import { NextResponse } from "next/server";
import { validListingId } from "@/lib/host-catalog-store";
import { readListingDates } from "@/lib/listing-availability";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?listingId=: the days a published listing is not open. Public, and returns dates only:
 * the union of host-closed and guest-booked days, with no way to tell which is which.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const listingId = new URL(request.url).searchParams.get("listingId");
    if (!validListingId(listingId)) {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const result = await readListingDates(getSupabaseServerClient(), listingId, {
      publishedOnly: true,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return NextResponse.json(
          { ok: false, error: "This stay is no longer available." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "Availability is unavailable right now." },
        { status: 503 },
      );
    }

    const unavailableDates = Array.from(
      new Set([...result.dates.blockedDates, ...result.dates.bookedDates]),
    ).sort();
    return NextResponse.json(
      { ok: true, unavailableDates },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Availability is unavailable right now." },
      { status: 503 },
    );
  }
}
