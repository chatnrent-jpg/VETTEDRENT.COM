import type { SupabaseClient } from "@supabase/supabase-js";
import { INTENDED_STAY_DAYS, defaultGeoStatusLabel, readListingCompliance } from "@/lib/geo-compliance";

export type HostProperty = {
  id: string;
  name: string;
  lockConnected: boolean;
  weeklyPriceCents: number | null;
  jurisdictionCode: string;
  geoCompliance: string;
};

/** Weekly stay rate used when a listing has no weekly_price_cents yet. */
const WEEKLY_STAY_CENTS = 24500;

const FEATURED_LISTING_ID = "vr-weekly-room";
const FEATURED_LISTING_NAME = "VettedRent Weekly Room";

export type FeaturedStay = {
  name: string;
  weeklyPriceCents: number;
  geoCompliance: string;
};

/**
 * The public featured stay. Missing price columns fall back to $245.00.
 * A database miss still returns the weekly room at that rate.
 */
export async function getFeaturedStay(supabase: SupabaseClient): Promise<FeaturedStay> {
  try {
    const row = await readFeaturedRow(supabase);
    if (!row) {
      return {
        name: FEATURED_LISTING_NAME,
        weeklyPriceCents: WEEKLY_STAY_CENTS,
        geoCompliance: defaultGeoStatusLabel(),
      };
    }
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const listed = weeklyPriceCents(row.weekly_rate_cents) ?? weeklyPriceCents(row.weekly_price_cents);
    const compliance = await readListingCompliance(supabase, FEATURED_LISTING_ID, INTENDED_STAY_DAYS);
    return {
      name: title === "" ? FEATURED_LISTING_NAME : title,
      weeklyPriceCents: listed ?? WEEKLY_STAY_CENTS,
      geoCompliance: compliance.statusLabel,
    };
  } catch {
    return {
      name: FEATURED_LISTING_NAME,
      weeklyPriceCents: WEEKLY_STAY_CENTS,
      geoCompliance: defaultGeoStatusLabel(),
    };
  }
}

/**
 * The listing tied to this host. listings is service-role only and keyed by host_id.
 * weekly_price_cents is optional until that column is present. The linked agreement
 * does not store rent; vault_balance_cents is escrow. The weekly stay rate is the fallback.
 */
export async function getActiveHostProperty(
  supabase: SupabaseClient,
  hostId: string,
): Promise<HostProperty | null> {
  const row = await readListingRow(supabase, hostId);
  if (!row) {
    return null;
  }
  const listed = weeklyPriceCents(row.weekly_price_cents);
  if (typeof row.id !== "string" || row.id.trim() === "") {
    return null;
  }
  const agreed = listed === null ? await agreementWeeklyCents(supabase, row.id) : null;
  const compliance = await readListingCompliance(supabase, row.id.trim(), INTENDED_STAY_DAYS);
  return propertyFromRow(row, listed ?? agreed ?? WEEKLY_STAY_CENTS, compliance.jurisdictionCode, compliance.statusLabel);
}

async function readListingRow(
  supabase: SupabaseClient,
  hostId: string,
): Promise<{ id?: unknown; title?: unknown; seam_device_id?: unknown; weekly_price_cents?: unknown } | undefined> {
  const withRate = await supabase
    .from("listings")
    .select("id, title, seam_device_id, weekly_price_cents")
    .eq("host_id", hostId)
    .limit(1);
  if (withRate.error && missingColumn(withRate.error, "weekly_price_cents")) {
    const withoutRate = await supabase
      .from("listings")
      .select("id, title, seam_device_id")
      .eq("host_id", hostId)
      .limit(1);
    if (withoutRate.error) {
      throw new Error("host listing read failed");
    }
    return withoutRate.data?.[0];
  }
  if (withRate.error) {
    throw new Error("host listing read failed");
  }
  return withRate.data?.[0];
}

async function agreementWeeklyCents(
  supabase: SupabaseClient,
  listingId: string,
): Promise<number | null> {
  const result = await supabase
    .from("agreements")
    .select("weekly_price_cents")
    .eq("listing_id", listingId)
    .limit(1);
  if (result.error && missingColumn(result.error, "weekly_price_cents")) {
    return null;
  }
  if (result.error) {
    throw new Error("host listing read failed");
  }
  return weeklyPriceCents(result.data?.[0]?.weekly_price_cents);
}

function propertyFromRow(
  row: { id?: unknown; title?: unknown; seam_device_id?: unknown },
  weeklyPriceCents: number | null,
  jurisdictionCode: string,
  geoCompliance: string,
): HostProperty | null {
  if (typeof row.id !== "string" || row.id.trim() === "") {
    return null;
  }
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const lockId = typeof row.seam_device_id === "string" ? row.seam_device_id.trim() : "";
  return {
    id: row.id.trim(),
    name: title === "" ? "Untitled listing" : title,
    lockConnected: lockId !== "",
    weeklyPriceCents,
    jurisdictionCode,
    geoCompliance,
  };
}

async function readFeaturedRow(
  supabase: SupabaseClient,
): Promise<{ title?: unknown; weekly_rate_cents?: unknown; weekly_price_cents?: unknown } | null> {
  const withRate = await supabase
    .from("listings")
    .select("id, title, weekly_rate_cents")
    .order("id", { ascending: true })
    .limit(20);
  if (!withRate.error) {
    return chooseFeatured(withRate.data);
  }
  if (!missingPriceColumn(withRate.error)) {
    throw new Error("featured listing read failed");
  }

  const withPrice = await supabase
    .from("listings")
    .select("id, title, weekly_price_cents")
    .order("id", { ascending: true })
    .limit(20);
  if (!withPrice.error) {
    return chooseFeatured(withPrice.data);
  }
  if (!missingPriceColumn(withPrice.error)) {
    throw new Error("featured listing read failed");
  }

  const plain = await supabase
    .from("listings")
    .select("id, title")
    .order("id", { ascending: true })
    .limit(20);
  if (plain.error) {
    throw new Error("featured listing read failed");
  }
  return chooseFeatured(plain.data);
}

function chooseFeatured(
  rows: unknown,
): { title?: unknown; weekly_rate_cents?: unknown; weekly_price_cents?: unknown } | null {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const preferred = rows.find((row) => {
    return row && typeof row === "object" && (row as { id?: unknown }).id === FEATURED_LISTING_ID;
  });
  const chosen = preferred ?? rows[0];
  if (!chosen || typeof chosen !== "object") {
    return null;
  }
  return chosen as { title?: unknown; weekly_rate_cents?: unknown; weekly_price_cents?: unknown };
}

function missingPriceColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === "42703" || error.code === "PGRST204") {
    return true;
  }
  const message = error.message ?? "";
  return message.includes("weekly_rate_cents") || message.includes("weekly_price_cents");
}

function weeklyPriceCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  return null;
}

function missingColumn(error: { code?: string; message?: string }, column: string): boolean {
  return error.code === "42703" || (error.message ?? "").includes(column);
}
