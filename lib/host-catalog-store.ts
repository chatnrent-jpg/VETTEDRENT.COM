import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { LISTING_ID_RE, publishBlockers } from "@/lib/listing-catalog";
import { LISTING_PHOTO_BUCKET, listingPhotoUrl } from "@/lib/public-listings";
import { getSupabaseServerClient } from "@/lib/supabase";

/** Shared plumbing for the host listing-catalog routes. */

export const MAX_LISTINGS_PER_HOST = 20;

export type HostAuth = { supabase: SupabaseClient; userId: string };

export type HostCatalogPhoto = {
  id: string;
  url: string;
  caption: string;
  sortOrder: number;
};

export type HostCatalogListing = {
  id: string;
  title: string;
  tier: string | null;
  weeklyRateCents: number | null;
  city: string;
  countySlug: string | null;
  zipCode: string;
  description: string;
  features: string[];
  idealFor: string;
  isPublished: boolean;
  photos: HostCatalogPhoto[];
  blockers: string[];
};

export const LISTING_COLUMNS =
  "id, title, tier, weekly_rate_cents, city, county_slug, zip_code, description, features, ideal_for, is_published";

export async function authenticateHost(request: Request): Promise<HostAuth | null> {
  const header = request.headers.get("authorization");
  const token = header ? (/^Bearer\s+(\S+)$/i.exec(header.trim())?.[1] ?? null) : null;
  if (!token) {
    return null;
  }
  const supabase = getSupabaseServerClient();
  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return null;
  }
  const role = await resolveCallerRole(supabase, userResult.data.user);
  if (!isHostRole(role)) {
    return null;
  }
  return { supabase, userId: userResult.data.user.id };
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Host session required" }, { status: 401 });
}

export function failure(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

type DbError = { code?: string; message?: string } | null | undefined;

/** True when the catalog migration has not been applied to this database yet. */
export function catalogNotReady(error: DbError): boolean {
  if (!error) return false;
  return ["42703", "42P01", "PGRST200", "PGRST204", "PGRST205"].includes(error.code ?? "");
}

export function notReadyResponse(): NextResponse {
  return failure("The listing catalog is not set up yet. Apply the catalog migration first.", 503);
}

export function isCheckViolation(error: DbError): boolean {
  return error?.code === "23514";
}

export function validListingId(value: unknown): value is string {
  return typeof value === "string" && LISTING_ID_RE.test(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Reads one host-owned listing with its photos. Returns null when it is not theirs. */
export async function readHostListing(
  auth: HostAuth,
  listingId: string,
): Promise<{ listing: HostCatalogListing } | { error: DbError } | null> {
  const row = await auth.supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", listingId)
    .eq("host_id", auth.userId)
    .maybeSingle();
  if (row.error) {
    return { error: row.error };
  }
  if (!row.data) {
    return null;
  }
  const photos = await auth.supabase
    .from("listing_photos")
    .select("id, storage_path, caption, sort_order")
    .eq("listing_id", listingId)
    .order("sort_order", { ascending: true });
  if (photos.error) {
    return { error: photos.error };
  }
  return { listing: shapeListing(auth.supabase, row.data, photos.data ?? []) };
}

export async function readAllHostListings(
  auth: HostAuth,
): Promise<{ listings: HostCatalogListing[] } | { error: DbError }> {
  const rows = await auth.supabase
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("host_id", auth.userId)
    .order("id", { ascending: true })
    .limit(MAX_LISTINGS_PER_HOST * 2);
  if (rows.error) {
    return { error: rows.error };
  }
  const ids = (rows.data ?? []).map((row) => text((row as { id?: unknown }).id)).filter(Boolean);
  const photoRows =
    ids.length === 0
      ? { data: [], error: null }
      : await auth.supabase
          .from("listing_photos")
          .select("id, listing_id, storage_path, caption, sort_order")
          .in("listing_id", ids)
          .order("sort_order", { ascending: true });
  if (photoRows.error) {
    return { error: photoRows.error };
  }
  const listings = (rows.data ?? []).map((row) =>
    shapeListing(
      auth.supabase,
      row,
      (photoRows.data ?? []).filter(
        (photo) => text((photo as { listing_id?: unknown }).listing_id) === text((row as { id?: unknown }).id),
      ),
    ),
  );
  return { listings };
}

function shapeListing(
  supabase: SupabaseClient,
  row: unknown,
  photoRows: unknown[],
): HostCatalogListing {
  const r = row as Record<string, unknown>;
  const photos: HostCatalogPhoto[] = photoRows.map((photo) => {
    const p = photo as Record<string, unknown>;
    return {
      id: text(p.id),
      url: listingPhotoUrl(supabase, text(p.storage_path)),
      caption: text(p.caption),
      sortOrder: typeof p.sort_order === "number" ? p.sort_order : 0,
    };
  });
  const weeklyRateCents =
    typeof r.weekly_rate_cents === "number" && Number.isSafeInteger(r.weekly_rate_cents)
      ? r.weekly_rate_cents
      : null;
  const tier = typeof r.tier === "string" ? r.tier : null;
  const countySlug = typeof r.county_slug === "string" ? r.county_slug : null;
  const listing: HostCatalogListing = {
    id: text(r.id),
    title: text(r.title),
    tier,
    weeklyRateCents,
    city: text(r.city),
    countySlug,
    zipCode: text(r.zip_code),
    description: text(r.description),
    features: Array.isArray(r.features)
      ? r.features.filter((item): item is string => typeof item === "string")
      : [],
    idealFor: text(r.ideal_for),
    isPublished: r.is_published === true,
    photos,
    blockers: [],
  };
  listing.blockers = publishBlockers({
    title: listing.title,
    tier: listing.tier,
    weeklyRateCents: listing.weeklyRateCents,
    city: listing.city,
    countySlug: listing.countySlug,
    zipCode: listing.zipCode,
    photoCount: photos.length,
  });
  return listing;
}

export async function removeStorageObject(supabase: SupabaseClient, path: string): Promise<void> {
  try {
    await supabase.storage.from(LISTING_PHOTO_BUCKET).remove([path]);
  } catch {
    // Best effort: an orphaned file is harmless, a failed response is not.
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
