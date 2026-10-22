import type { SupabaseClient } from "@supabase/supabase-js";

export type HostProperty = {
  id: string;
  name: string;
  lockConnected: boolean;
  weeklyPriceCents: number | null;
};

/**
 * The listing tied to this host. listings is service-role only and keyed by host_id.
 * weekly_price_cents is optional until that column is present.
 */
export async function getActiveHostProperty(
  supabase: SupabaseClient,
  hostId: string,
): Promise<HostProperty | null> {
  const withRate = await supabase
    .from("listings")
    .select("id, title, seam_device_id, weekly_price_cents")
    .eq("host_id", hostId)
    .limit(1);
  if (withRate.error && missingWeeklyPriceColumn(withRate.error)) {
    const withoutRate = await supabase
      .from("listings")
      .select("id, title, seam_device_id")
      .eq("host_id", hostId)
      .limit(1);
    if (withoutRate.error) {
      throw new Error("host listing read failed");
    }
    return propertyFromRow(withoutRate.data?.[0], null);
  }
  if (withRate.error) {
    throw new Error("host listing read failed");
  }
  const row = withRate.data?.[0];
  return propertyFromRow(row, row ? weeklyPriceCents(row.weekly_price_cents) : null);
}

function propertyFromRow(
  row: { id?: unknown; title?: unknown; seam_device_id?: unknown } | undefined,
  weeklyPriceCents: number | null,
): HostProperty | null {
  if (!row || typeof row.id !== "string" || row.id.trim() === "") {
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

function missingWeeklyPriceColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || (error.message ?? "").includes("weekly_price_cents");
}
