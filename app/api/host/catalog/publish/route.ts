import { NextResponse } from "next/server";
import {
  authenticateHost,
  catalogNotReady,
  failure,
  isCheckViolation,
  notReadyResponse,
  readHostListing,
  readJson,
  unauthorized,
  validListingId,
} from "@/lib/host-catalog-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { listingId, published }: publish or unpublish one of the host's listings. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const body = await readJson(request);
    if (!body || !validListingId(body.listingId) || typeof body.published !== "boolean") {
      return failure("Invalid request.", 400);
    }

    const current = await readHostListing(auth, body.listingId);
    if (current && "error" in current) {
      if (catalogNotReady(current.error)) return notReadyResponse();
      return failure("Could not update the listing.", 500);
    }
    if (!current) return failure("Listing not found.", 404);

    if (body.published && current.listing.blockers.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "This listing is not ready to publish yet.",
          blockers: current.listing.blockers,
        },
        { status: 422 },
      );
    }

    // The database trigger re-checks every rule, so this cannot be bypassed.
    const result = await auth.supabase
      .from("listings")
      .update({ is_published: body.published })
      .eq("id", body.listingId)
      .eq("host_id", auth.userId);
    if (result.error) {
      if (catalogNotReady(result.error)) return notReadyResponse();
      if (isCheckViolation(result.error)) {
        return failure("This listing is not ready to publish yet.", 422);
      }
      console.error("host catalog publish failed");
      return failure("Could not update the listing.", 500);
    }

    const fresh = await readHostListing(auth, body.listingId);
    if (!fresh || "error" in fresh) {
      return failure("Updated, but could not read the listing back. Refresh the page.", 500);
    }
    // Report the stored state, not the requested one.
    return NextResponse.json({ ok: true, listing: fresh.listing });
  } catch {
    console.error("host catalog publish failed");
    return failure("Could not update the listing.", 500);
  }
}
