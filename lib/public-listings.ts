import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_RATE_PRESET_TIERS, type DailyRateTierId } from "@/lib/daily-rate-comparison";
import { MARYLAND_SEO_REGISTRY } from "@/lib/seo-registry";
import { PURPOSE_COHORT_IDS } from "@/lib/underwriting-contract";
import type { PropertyCardProps } from "@/src/components/ListingGrid";

/**
 * Public, read-only view of published listings.
 *
 * Only safe fields leave the server: title, tier, city, county, ZIP, price, photos,
 * features. Never host_id, seam_device_id, Stripe ids, or street addresses.
 * Any failure (including the catalog migration not being applied yet) returns an
 * empty list, so the site falls back to its sample stays instead of breaking.
 */

export const LISTING_PHOTO_BUCKET = "listing-photos";

type Tier = DailyRateTierId;

/** Weekly price bounds per tier, from the same presets the checkout uses. */
export function tierWeeklyLimits(tier: Tier): { min: number; max: number } {
  const preset = DAILY_RATE_PRESET_TIERS[tier];
  return { min: preset.minWeeklyRateCents, max: preset.maxWeeklyRateCents };
}

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && value in DAILY_RATE_PRESET_TIERS;
}

export function listingPhotoUrl(supabase: SupabaseClient, storagePath: string): string {
  return supabase.storage.from(LISTING_PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

type ListingRow = {
  id?: unknown;
  title?: unknown;
  tier?: unknown;
  city?: unknown;
  county_slug?: unknown;
  zip_code?: unknown;
  description?: unknown;
  features?: unknown;
  ideal_for?: unknown;
  weekly_rate_cents?: unknown;
};

type PhotoRow = {
  listing_id?: unknown;
  storage_path?: unknown;
  caption?: unknown;
  sort_order?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toPropertyCard(
  row: ListingRow,
  photos: { url: string; caption: string }[],
): PropertyCardProps | null {
  const id = text(row.id);
  const title = text(row.title);
  const city = text(row.city);
  const zipCode = text(row.zip_code);
  const county = MARYLAND_SEO_REGISTRY[text(row.county_slug)];
  const weeklyCents = row.weekly_rate_cents;
  if (!id || !title || !city || !zipCode || !county || !isTier(row.tier)) {
    return null;
  }
  if (typeof weeklyCents !== "number" || !Number.isSafeInteger(weeklyCents)) {
    return null;
  }
  const limits = tierWeeklyLimits(row.tier);
  if (weeklyCents < limits.min || weeklyCents > limits.max || photos.length === 0) {
    return null;
  }
  const features = Array.isArray(row.features)
    ? row.features.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

  return {
    id,
    title,
    tier: row.tier,
    location: `${city}, MD`,
    zipCode,
    dailyRate: Math.round(weeklyCents / 700),
    weeklyRate: Math.round(weeklyCents / 100),
    commuteMinutes: 0,
    convenienceBadge: features.slice(0, 3).join(" · "),
    proximityTag: county.countyName,
    idealForLabel: text(row.ideal_for),
    // Real listings are open to every audience unless filtered by the search.
    cohorts: [...PURPOSE_COHORT_IDS],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    defaultImageUrl: photos[0].url,
    galleryPhotos: photos,
    features,
  };
}

export async function loadPublishedListings(
  supabase: SupabaseClient,
): Promise<PropertyCardProps[]> {
  try {
    const listings = await supabase
      .from("listings")
      .select(
        "id, title, tier, city, county_slug, zip_code, description, features, ideal_for, weekly_rate_cents",
      )
      .eq("is_published", true)
      .order("weekly_rate_cents", { ascending: true })
      .limit(200);
    if (listings.error || !Array.isArray(listings.data) || listings.data.length === 0) {
      return [];
    }

    const ids = listings.data
      .map((row: ListingRow) => text(row.id))
      .filter((id) => id !== "");
    const photoResult = await supabase
      .from("listing_photos")
      .select("listing_id, storage_path, caption, sort_order")
      .in("listing_id", ids)
      .order("sort_order", { ascending: true });
    if (photoResult.error || !Array.isArray(photoResult.data)) {
      return [];
    }

    const photosByListing = new Map<string, { url: string; caption: string }[]>();
    for (const photo of photoResult.data as PhotoRow[]) {
      const listingId = text(photo.listing_id);
      const path = text(photo.storage_path);
      if (!listingId || !path) {
        continue;
      }
      const list = photosByListing.get(listingId) ?? [];
      list.push({ url: listingPhotoUrl(supabase, path), caption: text(photo.caption) });
      photosByListing.set(listingId, list);
    }

    const cards: PropertyCardProps[] = [];
    for (const row of listings.data as ListingRow[]) {
      const card = toPropertyCard(row, photosByListing.get(text(row.id)) ?? []);
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  } catch {
    return [];
  }
}

export async function loadPublishedListing(
  supabase: SupabaseClient,
  listingId: string,
): Promise<PropertyCardProps | null> {
  const all = await loadPublishedListings(supabase);
  return all.find((card) => card.id === listingId) ?? null;
}
