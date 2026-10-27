import { NextResponse } from "next/server";
import {
  authenticateHost,
  catalogNotReady,
  failure,
  isCheckViolation,
  notReadyResponse,
  readHostListing,
  readJson,
  removeStorageObject,
  unauthorized,
  validListingId,
} from "@/lib/host-catalog-store";
import {
  MAX_LISTING_PHOTOS,
  decodeJpegDataUrl,
  nextPhotoSlot,
  parseCaption,
} from "@/lib/listing-catalog";
import { LISTING_PHOTO_BUCKET } from "@/lib/public-listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { listingId, image (JPEG data URL), caption? }: add one photo. */
export async function POST(request: Request): Promise<NextResponse> {
  let uploadedPath: string | null = null;
  let auth: Awaited<ReturnType<typeof authenticateHost>> = null;
  try {
    auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const body = await readJson(request);
    if (!body || !validListingId(body.listingId)) return failure("Invalid request.", 400);
    const image = decodeJpegDataUrl(body.image);
    if (!image.ok) return failure(image.error, 400);
    const caption = parseCaption(body.caption);
    if (!caption.ok) return failure(caption.error, 400);

    const current = await readHostListing(auth, body.listingId);
    if (current && "error" in current) {
      if (catalogNotReady(current.error)) return notReadyResponse();
      return failure("Could not upload the photo.", 500);
    }
    if (!current) return failure("Listing not found.", 404);

    const slot = nextPhotoSlot(current.listing.photos.map((photo) => photo.sortOrder));
    if (slot === null) {
      return failure(`A listing can have at most ${MAX_LISTING_PHOTOS} photos.`, 409);
    }

    const path = `${body.listingId}/${crypto.randomUUID()}.jpg`;
    const upload = await auth.supabase.storage
      .from(LISTING_PHOTO_BUCKET)
      .upload(path, image.value, { contentType: "image/jpeg", upsert: false });
    if (upload.error) {
      console.error("host catalog photo upload failed");
      return failure("Could not upload the photo.", 500);
    }
    uploadedPath = path;

    const insert = await auth.supabase.from("listing_photos").insert({
      listing_id: body.listingId,
      storage_path: path,
      caption: caption.value,
      sort_order: slot,
    });
    if (insert.error) {
      await removeStorageObject(auth.supabase, path);
      uploadedPath = null;
      if (catalogNotReady(insert.error)) return notReadyResponse();
      if (insert.error.code === "23505") {
        return failure("Another upload was in progress. Please try again.", 409);
      }
      console.error("host catalog photo insert failed");
      return failure("Could not save the photo.", 500);
    }

    const fresh = await readHostListing(auth, body.listingId);
    if (!fresh || "error" in fresh) {
      return failure("Uploaded, but could not read the listing back. Refresh the page.", 500);
    }
    return NextResponse.json({ ok: true, listing: fresh.listing }, { status: 201 });
  } catch {
    // Do not leave an uploaded file behind if a later step threw.
    if (auth && uploadedPath) {
      await removeStorageObject(auth.supabase, uploadedPath);
    }
    console.error("host catalog photo upload failed");
    return failure("Could not upload the photo.", 500);
  }
}

/** DELETE { listingId, photoId }: remove one photo. */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const auth = await authenticateHost(request);
    if (!auth) return unauthorized();

    const body = await readJson(request);
    if (
      !body ||
      !validListingId(body.listingId) ||
      typeof body.photoId !== "string" ||
      !/^[0-9a-fA-F-]{36}$/.test(body.photoId)
    ) {
      return failure("Invalid request.", 400);
    }

    // Ownership is checked through the listing, never from the photo id alone.
    const current = await readHostListing(auth, body.listingId);
    if (current && "error" in current) {
      if (catalogNotReady(current.error)) return notReadyResponse();
      return failure("Could not remove the photo.", 500);
    }
    if (!current) return failure("Listing not found.", 404);

    const photoRow = await auth.supabase
      .from("listing_photos")
      .select("id, storage_path")
      .eq("id", body.photoId)
      .eq("listing_id", body.listingId)
      .maybeSingle();
    if (photoRow.error) return failure("Could not remove the photo.", 500);
    if (!photoRow.data) return failure("Photo not found.", 404);

    const removal = await auth.supabase
      .from("listing_photos")
      .delete()
      .eq("id", body.photoId)
      .eq("listing_id", body.listingId);
    if (removal.error) {
      if (isCheckViolation(removal.error)) {
        return failure(
          "A live listing needs at least one photo. Unpublish it before removing the last photo.",
          409,
        );
      }
      console.error("host catalog photo delete failed");
      return failure("Could not remove the photo.", 500);
    }

    const storagePath = (photoRow.data as { storage_path?: unknown }).storage_path;
    if (typeof storagePath === "string") {
      await removeStorageObject(auth.supabase, storagePath);
    }

    const fresh = await readHostListing(auth, body.listingId);
    if (!fresh || "error" in fresh) {
      return failure("Removed, but could not read the listing back. Refresh the page.", 500);
    }
    return NextResponse.json({ ok: true, listing: fresh.listing });
  } catch {
    console.error("host catalog photo delete failed");
    return failure("Could not remove the photo.", 500);
  }
}
