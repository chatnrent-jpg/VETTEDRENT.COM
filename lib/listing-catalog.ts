import { DAILY_RATE_PRESET_TIERS, type DailyRateTierId } from "@/lib/daily-rate-comparison";
import { MARYLAND_SEO_REGISTRY } from "@/lib/seo-registry";

/**
 * Validation for host-edited listing details and photos. Pure functions, no I/O.
 * The database enforces the same rules (supabase/migrations/20261026220000_*);
 * this layer exists so a host gets a clear message instead of a constraint error.
 */

export const MAX_LISTING_PHOTOS = 12;
export const MAX_PHOTO_BYTES = 2_000_000;
export const LISTING_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

const ZIP_MIN = 20601;
const ZIP_MAX = 21930;

export type ListingDetailsInput = {
  title?: string;
  tier?: DailyRateTierId;
  weeklyRateCents?: number;
  city?: string;
  countySlug?: string;
  zipCode?: string;
  description?: string;
  features?: string[];
  idealFor?: string;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function clean(value: string): string {
  // Strip control characters and collapse whitespace.
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultiline(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isTierId(value: unknown): value is DailyRateTierId {
  return typeof value === "string" && value in DAILY_RATE_PRESET_TIERS;
}

export function weeklyRateProblem(tier: DailyRateTierId, weeklyRateCents: number): string | null {
  const preset = DAILY_RATE_PRESET_TIERS[tier];
  if (!Number.isSafeInteger(weeklyRateCents) || weeklyRateCents % 100 !== 0) {
    return "Weekly price must be a whole-dollar amount.";
  }
  if (
    weeklyRateCents < preset.minWeeklyRateCents ||
    weeklyRateCents > preset.maxWeeklyRateCents
  ) {
    return `${preset.shortLabel} weekly price must be between $${preset.minWeeklyRateCents / 100} and $${preset.maxWeeklyRateCents / 100}.`;
  }
  return null;
}

export function parseListingDetails(input: unknown): ParseResult<ListingDetailsInput> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Listing details are required." };
  }
  const raw = input as Record<string, unknown>;
  const out: ListingDetailsInput = {};

  if (raw.title !== undefined) {
    if (typeof raw.title !== "string") return bad("Title must be text.");
    const title = clean(raw.title);
    if (title.length < 3 || title.length > 80) return bad("Title must be 3 to 80 characters.");
    out.title = title;
  }

  if (raw.tier !== undefined) {
    if (!isTierId(raw.tier)) return bad("Choose Room, Suite, or Townhome.");
    out.tier = raw.tier;
  }

  if (raw.weeklyRateCents !== undefined) {
    if (typeof raw.weeklyRateCents !== "number") return bad("Weekly price must be a number.");
    out.weeklyRateCents = raw.weeklyRateCents;
  }

  if (raw.city !== undefined) {
    if (typeof raw.city !== "string") return bad("City must be text.");
    const city = clean(raw.city);
    if (!/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(city)) return bad("Enter a valid city name.");
    out.city = city;
  }

  if (raw.countySlug !== undefined) {
    if (typeof raw.countySlug !== "string" || !(raw.countySlug in MARYLAND_SEO_REGISTRY)) {
      return bad("Choose a Maryland county.");
    }
    out.countySlug = raw.countySlug;
  }

  if (raw.zipCode !== undefined) {
    if (typeof raw.zipCode !== "string" || !/^\d{5}$/.test(raw.zipCode.trim())) {
      return bad("ZIP must be 5 digits.");
    }
    const zip = Number(raw.zipCode.trim());
    if (zip < ZIP_MIN || zip > ZIP_MAX) return bad("ZIP must be a Maryland ZIP code.");
    out.zipCode = raw.zipCode.trim();
  }

  if (raw.description !== undefined) {
    if (typeof raw.description !== "string") return bad("Description must be text.");
    const description = cleanMultiline(raw.description);
    if (description.length > 2000) return bad("Description must be 2000 characters or fewer.");
    out.description = description;
  }

  if (raw.features !== undefined) {
    if (!Array.isArray(raw.features) || raw.features.some((item) => typeof item !== "string")) {
      return bad("Features must be a list of short phrases.");
    }
    const features = (raw.features as string[]).map(clean).filter((item) => item !== "");
    if (features.length > 12) return bad("Add at most 12 features.");
    if (features.some((item) => item.length < 2 || item.length > 40)) {
      return bad("Each feature must be 2 to 40 characters.");
    }
    out.features = [...new Set(features)];
  }

  if (raw.idealFor !== undefined) {
    if (typeof raw.idealFor !== "string") return bad("Ideal-for must be text.");
    const idealFor = clean(raw.idealFor);
    if (idealFor.length > 60) return bad("Ideal-for must be 60 characters or fewer.");
    out.idealFor = idealFor;
  }

  return { ok: true, value: out };
}

function bad(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** What a listing still needs before it can go public. Empty means ready. */
export function publishBlockers(listing: {
  title?: string | null;
  tier?: string | null;
  weeklyRateCents?: number | null;
  city?: string | null;
  countySlug?: string | null;
  zipCode?: string | null;
  photoCount: number;
}): string[] {
  const missing: string[] = [];
  if (!listing.title?.trim()) missing.push("Add a title");
  if (!isTierId(listing.tier)) {
    missing.push("Choose a space type");
  } else if (
    typeof listing.weeklyRateCents !== "number" ||
    weeklyRateProblem(listing.tier, listing.weeklyRateCents) !== null
  ) {
    missing.push("Set a weekly price within the range for this space type");
  }
  if (!listing.city?.trim()) missing.push("Add the city");
  if (!listing.countySlug || !(listing.countySlug in MARYLAND_SEO_REGISTRY)) {
    missing.push("Choose the county");
  }
  if (!listing.zipCode || !/^\d{5}$/.test(listing.zipCode)) missing.push("Add the ZIP code");
  if (listing.photoCount < 1) missing.push("Upload at least one photo");
  return missing;
}

/** Decodes an uploaded `data:image/jpeg;base64,...` string and checks it really is a JPEG. */
export function decodeJpegDataUrl(dataUrl: unknown): ParseResult<Uint8Array> {
  if (typeof dataUrl !== "string") return bad("Photo is required.");
  // Bound the string before the regex so a huge payload is rejected cheaply.
  if (dataUrl.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64) {
    return bad("Photo is too large. Use a smaller image.");
  }
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return bad("Photo must be a JPEG image.");
  const bytes = Uint8Array.from(Buffer.from(match[1], "base64"));
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
    return bad("Photo is too large. Use a smaller image.");
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return bad("That file is not a valid JPEG image.");
  }
  return { ok: true, value: bytes };
}

export function parseCaption(value: unknown): ParseResult<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return bad("Caption must be text.");
  const caption = clean(value);
  if (caption.length > 160) return bad("Caption must be 160 characters or fewer.");
  return { ok: true, value: caption === "" ? null : caption };
}

/** Lowest unused slot in 0..11, or null when the listing already has 12 photos. */
export function nextPhotoSlot(used: readonly number[]): number | null {
  const taken = new Set(used);
  for (let slot = 0; slot < MAX_LISTING_PHOTOS; slot += 1) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}
