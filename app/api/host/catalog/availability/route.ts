import { NextResponse } from "next/server";
import {
  authenticateHost,
  failure,
  readJson,
  unauthorized,
  validListingId,
} from "@/lib/host-catalog-store";
import { readListingDates, saveHostBlockedDates } from "@/lib/listing-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_READY_MESSAGE =
  "The calendar needs a one-time database update before it can be used. Ask support to finish setup.";

/** GET ?listingId=: the signed-in host's closed days and guest-booked days for one of their listings. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const listingId = new URL(request.url).searchParams.get("listingId");
    if (!validListingId(listingId)) return failure("Invalid request.", 400);

    const result = await readListingDates(auth.supabase, listingId, { hostId: auth.userId });
    if (!result.ok) {
      if (result.reason === "not_found") return failure("Listing not found.", 404);
      if (result.reason === "not_ready") return failure(NOT_READY_MESSAGE, 503);
      return failure("Could not load your calendar.", 500);
    }
    return NextResponse.json({ ok: true, ...result.dates });
  } catch {
    console.error("host availability read failed");
    return failure("Could not load your calendar.", 500);
  }
}

/** PUT { listingId, blockedDates }: replace the days the host has closed. Guest bookings are never changed. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const body = await readJson(request);
    if (!body || !validListingId(body.listingId) || !Array.isArray(body.blockedDates)) {
      return failure("Invalid request.", 400);
    }

    const saved = await saveHostBlockedDates(
      auth.supabase,
      auth.userId,
      body.listingId,
      body.blockedDates,
    );
    if (!saved.ok) {
      if (saved.reason === "not_found") return failure("Listing not found.", 404);
      if (saved.reason === "not_ready") return failure(NOT_READY_MESSAGE, 503);
      return failure("Could not save your calendar.", 500);
    }

    // Answer with what the database now holds, not what the client sent.
    const fresh = await readListingDates(auth.supabase, body.listingId, { hostId: auth.userId });
    if (!fresh.ok) {
      return failure("Saved, but could not read the calendar back. Refresh the page.", 500);
    }
    return NextResponse.json({ ok: true, ...fresh.dates });
  } catch {
    console.error("host availability save failed");
    return failure("Could not save your calendar.", 500);
  }
}
