import { NextResponse } from "next/server";
import {
  MAX_LISTINGS_PER_HOST,
  authenticateHost,
  catalogNotReady,
  failure,
  isCheckViolation,
  notReadyResponse,
  readAllHostListings,
  readHostListing,
  readJson,
  unauthorized,
  validListingId,
} from "@/lib/host-catalog-store";
import { isTierId, parseListingDetails, weeklyRateProblem } from "@/lib/listing-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: the signed-in host's listings with photos and what each still needs to publish. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const result = await readAllHostListings(auth);
    if ("error" in result) {
      if (catalogNotReady(result.error)) return notReadyResponse();
      console.error("host catalog read failed");
      return failure("Could not load your listings.", 500);
    }
    return NextResponse.json({ ok: true, listings: result.listings });
  } catch {
    console.error("host catalog read failed");
    return failure("Could not load your listings.", 500);
  }
}

/** POST: create a new draft listing. Needs a title, space type, and weekly price. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const body = await readJson(request);
    if (!body) return failure("Invalid request.", 400);
    const parsed = parseListingDetails(body);
    if (!parsed.ok) return failure(parsed.error, 400);
    const details = parsed.value;
    if (!details.title || !details.tier || details.weeklyRateCents === undefined) {
      return failure("Title, space type, and weekly price are required.", 400);
    }
    const rateProblem = weeklyRateProblem(details.tier, details.weeklyRateCents);
    if (rateProblem) return failure(rateProblem, 400);

    const existing = await readAllHostListings(auth);
    if ("error" in existing) {
      if (catalogNotReady(existing.error)) return notReadyResponse();
      return failure("Could not create the listing.", 500);
    }
    if (existing.listings.length >= MAX_LISTINGS_PER_HOST) {
      return failure(`You can have at most ${MAX_LISTINGS_PER_HOST} listings.`, 409);
    }

    const id = `vr-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const insert = await auth.supabase.from("listings").insert({
      id,
      host_id: auth.userId,
      title: details.title,
      tier: details.tier,
      weekly_rate_cents: details.weeklyRateCents,
      ...(details.city !== undefined ? { city: details.city } : {}),
      ...(details.countySlug !== undefined ? { county_slug: details.countySlug } : {}),
      ...(details.zipCode !== undefined ? { zip_code: details.zipCode } : {}),
      ...(details.description !== undefined ? { description: details.description } : {}),
      ...(details.features !== undefined ? { features: details.features } : {}),
      ...(details.idealFor !== undefined ? { ideal_for: details.idealFor } : {}),
      is_published: false,
    });
    if (insert.error) {
      if (catalogNotReady(insert.error)) return notReadyResponse();
      console.error("host catalog create failed");
      return failure("Could not create the listing.", 500);
    }

    const created = await readHostListing(auth, id);
    if (!created || "error" in created) {
      return failure("The listing was created but could not be read back. Refresh the page.", 500);
    }
    return NextResponse.json({ ok: true, listing: created.listing }, { status: 201 });
  } catch {
    console.error("host catalog create failed");
    return failure("Could not create the listing.", 500);
  }
}

/** PATCH: update details on one of the host's own listings. */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const body = await readJson(request);
    if (!body || !validListingId(body.listingId)) return failure("Invalid request.", 400);
    const parsed = parseListingDetails(body);
    if (!parsed.ok) return failure(parsed.error, 400);
    const details = parsed.value;

    const current = await readHostListing(auth, body.listingId);
    if (current && "error" in current) {
      if (catalogNotReady(current.error)) return notReadyResponse();
      return failure("Could not save your changes.", 500);
    }
    if (!current) return failure("Listing not found.", 404);

    const nextTier =
      details.tier ?? (isTierId(current.listing.tier) ? current.listing.tier : undefined);
    const nextRate = details.weeklyRateCents ?? current.listing.weeklyRateCents;
    if (
      (details.tier !== undefined || details.weeklyRateCents !== undefined) &&
      nextTier &&
      typeof nextRate === "number"
    ) {
      const rateProblem = weeklyRateProblem(nextTier, nextRate);
      if (rateProblem) return failure(rateProblem, 400);
    }

    const update = {
      ...(details.title !== undefined ? { title: details.title } : {}),
      ...(details.tier !== undefined ? { tier: details.tier } : {}),
      ...(details.weeklyRateCents !== undefined
        ? { weekly_rate_cents: details.weeklyRateCents }
        : {}),
      ...(details.city !== undefined ? { city: details.city } : {}),
      ...(details.countySlug !== undefined ? { county_slug: details.countySlug } : {}),
      ...(details.zipCode !== undefined ? { zip_code: details.zipCode } : {}),
      ...(details.description !== undefined ? { description: details.description } : {}),
      ...(details.features !== undefined ? { features: details.features } : {}),
      ...(details.idealFor !== undefined ? { ideal_for: details.idealFor } : {}),
    };
    if (Object.keys(update).length === 0) return failure("Nothing to update.", 400);

    const saved = await auth.supabase
      .from("listings")
      .update(update)
      .eq("id", body.listingId)
      .eq("host_id", auth.userId);
    if (saved.error) {
      if (catalogNotReady(saved.error)) return notReadyResponse();
      if (isCheckViolation(saved.error)) {
        return failure(
          current.listing.isPublished
            ? "These changes would make a live listing incomplete. Unpublish it first, or fix the details."
            : "Those details are not valid.",
          422,
        );
      }
      console.error("host catalog update failed");
      return failure("Could not save your changes.", 500);
    }

    const fresh = await readHostListing(auth, body.listingId);
    if (!fresh || "error" in fresh) {
      return failure("Saved, but could not read the listing back. Refresh the page.", 500);
    }
    return NextResponse.json({ ok: true, listing: fresh.listing });
  } catch {
    console.error("host catalog update failed");
    return failure("Could not save your changes.", 500);
  }
}
