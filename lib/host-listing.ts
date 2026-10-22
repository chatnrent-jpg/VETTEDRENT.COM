import type { SupabaseClient } from "@supabase/supabase-js";

export type HostProperty = {
  id: string;
  name: string;
  lockConnected: boolean;
  weeklyPriceCents: number | null;
};

/** Weekly stay rate used when a listing has no weekly_price_cents yet. */
const WEEKLY_STAY_CENTS = 24500;

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
  const agreed = listed === null ? await agreementWeeklyCents(supabase, row.id) : null;
  return propertyFromRow(row, listed ?? agreed ?? WEEKLY_STAY_CENTS);
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
  };
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
