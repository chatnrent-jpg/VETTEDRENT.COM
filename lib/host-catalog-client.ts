import type { HostCatalogListing } from "@/lib/host-catalog-store";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/**
 * Browser-side client for the host listing catalog. No rendering here.
 * Every call returns { ok } and never throws, so the page can show an honest message.
 */

export type CatalogListing = HostCatalogListing;

export type CatalogResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; blockers?: string[] };

async function authedRequest(
  path: string,
  init: { method: string; body?: unknown },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    return { status: 401, body: { error: "Please sign in again." } };
  }
  const response = await fetch(path, {
    method: init.method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

function failed(
  status: number,
  body: Record<string, unknown>,
  fallback: string,
): { ok: false; error: string; blockers?: string[] } {
  const error = typeof body.error === "string" && body.error ? body.error : fallback;
  const blockers = Array.isArray(body.blockers)
    ? body.blockers.filter((item): item is string => typeof item === "string")
    : undefined;
  return { ok: false, error: status === 401 ? "Please sign in again." : error, blockers };
}

async function listingCall(
  path: string,
  method: string,
  payload: unknown,
  fallback: string,
): Promise<CatalogResult<{ listing: CatalogListing }>> {
  try {
    const { status, body } = await authedRequest(path, { method, body: payload });
    const listing = body.listing as CatalogListing | undefined;
    if (status >= 200 && status < 300 && body.ok === true && listing) {
      return { ok: true, listing };
    }
    return failed(status, body, fallback);
  } catch {
    return { ok: false, error: fallback };
  }
}

export async function loadCatalog(): Promise<CatalogResult<{ listings: CatalogListing[] }>> {
  try {
    const { status, body } = await authedRequest("/api/host/catalog", { method: "GET" });
    if (status === 200 && body.ok === true && Array.isArray(body.listings)) {
      return { ok: true, listings: body.listings as CatalogListing[] };
    }
    return failed(status, body, "Could not load your listings.");
  } catch {
    return { ok: false, error: "Could not load your listings." };
  }
}

export type DetailsPayload = {
  title?: string;
  tier?: string;
  weeklyRateCents?: number;
  city?: string;
  countySlug?: string;
  zipCode?: string;
  description?: string;
  features?: string[];
  idealFor?: string;
};

export function createListing(details: DetailsPayload) {
  return listingCall("/api/host/catalog", "POST", details, "Could not create the listing.");
}

export function saveDetails(listingId: string, details: DetailsPayload) {
  return listingCall(
    "/api/host/catalog",
    "PATCH",
    { listingId, ...details },
    "Could not save your changes.",
  );
}

export function setPublished(listingId: string, published: boolean) {
  return listingCall(
    "/api/host/catalog/publish",
    "POST",
    { listingId, published },
    "Could not update the listing.",
  );
}

export function uploadPhoto(listingId: string, image: string, caption?: string) {
  return listingCall(
    "/api/host/catalog/photos",
    "POST",
    { listingId, image, caption },
    "Could not upload the photo.",
  );
}

export function deletePhoto(listingId: string, photoId: string) {
  return listingCall(
    "/api/host/catalog/photos",
    "DELETE",
    { listingId, photoId },
    "Could not remove the photo.",
  );
}

const MAX_EDGE = 1600;
const MAX_DATA_URL_CHARS = 2_600_000;

/** Resizes any browser-readable image to a JPEG data URL small enough to upload. */
export async function fileToJpegDataUrl(
  file: File,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { ok: false, error: `${file.name}: use a JPEG, PNG, or WebP image.` };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      return { ok: false, error: `${file.name}: could not process this image.` };
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.82, 0.7, 0.55]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_DATA_URL_CHARS) {
        return { ok: true, dataUrl };
      }
    }
    return { ok: false, error: `${file.name}: image is too large even after resizing.` };
  } catch {
    return { ok: false, error: `${file.name}: could not read this image.` };
  }
}
