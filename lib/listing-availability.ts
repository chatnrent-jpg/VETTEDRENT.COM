import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysIsoUtc, todayIsoUtc } from "@/lib/availability-calendar";

/**
 * Per-listing availability (server only). Dates are ISO strings ('YYYY-MM-DD').
 *
 *   blocked_dates  closed by the host (host-editable)
 *   booked_dates   taken by guest bookings (only reserve_listing_dates writes it)
 *
 * Guests see the union. Every host write is scoped to host_id, so one host can never
 * read or change another host's calendar. Schema: supabase/migrations/20261027210000_*.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How far ahead a host can open or close days. */
export const MAX_AVAILABILITY_DAYS_AHEAD = 600;
const MAX_STORED_DATES = 1000;

type DbError = { code?: string; message?: string } | null | undefined;

export type ListingDates = {
  blockedDates: string[];
  bookedDates: string[];
  isPublished: boolean;
};

export type DatesReadResult =
  | { ok: true; dates: ListingDates }
  | { ok: false; reason: "not_found" | "not_ready" | "error" };

export type ReserveResult =
  | { ok: true; reservedDates: string[] }
  | { ok: false; reason: "conflict" | "not_found" | "not_ready" | "error" };

/** True when the availability migration has not been applied to this database yet. */
export function availabilityNotReady(error: DbError): boolean {
  if (!error) return false;
  return ["42703", "42883", "42P01", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(
    error.code ?? "",
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  // Reject impossible dates such as 2026-02-31.
  return addDaysIsoUtc(value, 0) === value;
}

/** Valid, unique, sorted, upcoming dates inside the allowed window. */
export function cleanDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const today = todayIsoUtc();
  const last = addDaysIsoUtc(today, MAX_AVAILABILITY_DAYS_AHEAD);
  const unique = new Set<string>();
  for (const item of value) {
    if (isIsoDate(item) && item >= today && item <= last) {
      unique.add(item);
    }
  }
  return Array.from(unique).sort();
}

function storedDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isIsoDate).sort();
}

/** The consecutive days a stay occupies: check-in day through the day before check-out. */
export function stayDates(checkInIso: string, stayDays: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < stayDays; i++) {
    days.push(addDaysIsoUtc(checkInIso, i));
  }
  return days;
}

/** Reads a listing's dates. Pass hostId for an owner read, omit it for the public published view. */
export async function readListingDates(
  supabase: SupabaseClient,
  listingId: string,
  scope: { hostId: string } | { publishedOnly: true },
): Promise<DatesReadResult> {
  try {
    let query = supabase
      .from("listings")
      .select("blocked_dates, booked_dates, is_published")
      .eq("id", listingId);
    query = "hostId" in scope ? query.eq("host_id", scope.hostId) : query.eq("is_published", true);
    const result = await query.maybeSingle();
    if (result.error) {
      return { ok: false, reason: availabilityNotReady(result.error) ? "not_ready" : "error" };
    }
    if (!result.data) {
      return { ok: false, reason: "not_found" };
    }
    const row = result.data as Record<string, unknown>;
    return {
      ok: true,
      dates: {
        blockedDates: storedDates(row.blocked_dates),
        bookedDates: storedDates(row.booked_dates),
        isPublished: row.is_published === true,
      },
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Replaces the host's blocked days. Booked days are never touched here. */
export async function saveHostBlockedDates(
  supabase: SupabaseClient,
  hostId: string,
  listingId: string,
  requested: unknown,
): Promise<{ ok: true; blockedDates: string[] } | { ok: false; reason: "not_found" | "not_ready" | "error" }> {
  const blockedDates = cleanDates(requested);
  if (blockedDates.length > MAX_STORED_DATES) {
    return { ok: false, reason: "error" };
  }
  try {
    const result = await supabase
      .from("listings")
      .update({ blocked_dates: blockedDates })
      .eq("id", listingId)
      .eq("host_id", hostId)
      .select("id");
    if (result.error) {
      return { ok: false, reason: availabilityNotReady(result.error) ? "not_ready" : "error" };
    }
    if (!result.data || result.data.length === 0) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, blockedDates };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Atomically reserves a stay on a published listing. The database function locks the row, so two
 * guests can never take the same day. Nothing is reported as reserved unless the database said so.
 */
export async function reserveListingStay(
  supabase: SupabaseClient,
  listingId: string,
  checkInIso: string,
  stayDays: number,
): Promise<ReserveResult> {
  if (!isIsoDate(checkInIso) || !Number.isInteger(stayDays) || stayDays < 1 || stayDays > 90) {
    return { ok: false, reason: "error" };
  }
  const reservedDates = stayDates(checkInIso, stayDays);
  try {
    const result = await supabase.rpc("reserve_listing_dates", {
      p_listing_id: listingId,
      p_dates: reservedDates,
    });
    if (result.error) {
      return { ok: false, reason: availabilityNotReady(result.error) ? "not_ready" : "error" };
    }
    if (result.data === "reserved") return { ok: true, reservedDates };
    if (result.data === "conflict") return { ok: false, reason: "conflict" };
    if (result.data === "not_found") return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Thrown by the booking engine so the route can answer with the right status. */
export class ListingBookingError extends Error {
  constructor(
    readonly reason: "conflict" | "not_found" | "not_ready" | "error",
  ) {
    super(`listing booking refused: ${reason}`);
    this.name = "ListingBookingError";
  }
}
