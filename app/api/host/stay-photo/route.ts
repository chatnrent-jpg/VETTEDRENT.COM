import { NextResponse } from "next/server";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "stay-photos";
const MAX_JPEG_BYTES = 1_500_000;

type PhotoKind = "face" | "id";

type PhotoBody = {
  tenant_id: string;
  agreement_id: string;
  photoKind: PhotoKind;
  image: string;
};

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Host session required" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = parsePhotoBody(payload);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const bytes = jpegBytes(parsed.image);
    if (!bytes) {
      return NextResponse.json({ error: "A JPEG photo is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ error: "Host session required" }, { status: 401 });
    }
    const role = await resolveCallerRole(supabase, userResult.data.user);
    if (!isHostRole(role)) {
      return NextResponse.json({ error: "Host session required" }, { status: 401 });
    }

    const agreement = await supabase
      .from("agreements")
      .select("id")
      .eq("id", parsed.agreement_id)
      .eq("tenant_id", parsed.tenant_id)
      .maybeSingle();
    if (agreement.error) {
      throw new Error("stay photo read failed");
    }
    if (!agreement.data) {
      return NextResponse.json({ error: "No agreement matches this code" }, { status: 404 });
    }

    const path = `${parsed.agreement_id}/${parsed.photoKind}.jpg`;
    await storeJpeg(supabase, path, bytes);

    const patch =
      parsed.photoKind === "face" ? { face_photo_path: path } : { id_photo_path: path };
    const saved = await supabase
      .from("agreements")
      .update(patch)
      .eq("id", parsed.agreement_id)
      .eq("tenant_id", parsed.tenant_id)
      .select("id")
      .maybeSingle();
    if (saved.error) {
      if (photoColumnMissing(saved.error)) {
        return NextResponse.json({ ok: true, path });
      }
      throw new Error("stay photo update failed");
    }
    if (!saved.data) {
      return NextResponse.json({ error: "No agreement matches this code" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, path });
  } catch (error) {
    console.error("stay photo failed");
    return NextResponse.json({ error: clientMessage(error) }, { status: 500 });
  }
}

async function storeJpeg(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const first = await uploadJpeg(supabase, path, bytes);
  if (first === "ok") {
    return;
  }
  const created = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_JPEG_BYTES,
    allowedMimeTypes: ["image/jpeg"],
  });
  const alreadyExists = created.error?.message.toLowerCase().includes("already");
  if (created.error && !alreadyExists) {
    throw new Error("stay photo upload failed");
  }
  const second = await uploadJpeg(supabase, path, bytes);
  if (second !== "ok") {
    throw new Error("stay photo upload failed");
  }
}

async function uploadJpeg(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  path: string,
  bytes: Uint8Array,
): Promise<"ok" | "missing-bucket"> {
  const uploaded = await supabase.storage.from(BUCKET).upload(path, jpegBlob(bytes), {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (!uploaded.error) {
    return "ok";
  }
  const message = uploaded.error.message.toLowerCase();
  if (message.includes("bucket") && message.includes("not found")) {
    return "missing-bucket";
  }
  throw new Error("stay photo upload failed");
}

function jpegBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: "image/jpeg" });
}

function photoColumnMissing(error: { code?: string; message?: string }): boolean {
  if (error.code === "42703") {
    return true;
  }
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" &&
    (message.includes("face_photo_path") || message.includes("id_photo_path"))
  );
}

function clientMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Could not save the photo.";
  }
  if (error.message.includes("not configured")) {
    return error.message;
  }
  if (error.message === "stay photo columns are not ready") {
    return "Stay photo columns are not ready.";
  }
  return "Could not save the photo.";
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function parsePhotoBody(value: unknown): PhotoBody | { error: string } {
  if (value === null || typeof value !== "object") {
    return { error: "Expected a JSON object" };
  }
  const body = value as Record<string, unknown>;
  const tenantId = textField(body.tenant_id);
  const agreementId = textField(body.agreement_id);
  if (!tenantId) {
    return { error: "tenant_id must be a string" };
  }
  if (!agreementId || !/^[A-Za-z0-9_-]{1,80}$/.test(agreementId)) {
    return { error: "agreement_id must be a string" };
  }
  if (body.photoKind !== "face" && body.photoKind !== "id") {
    return { error: "photoKind must be face or id" };
  }
  if (typeof body.image !== "string" || body.image.trim() === "") {
    return { error: "image must be a string" };
  }
  return {
    tenant_id: tenantId,
    agreement_id: agreementId,
    photoKind: body.photoKind,
    image: body.image.trim(),
  };
}

function textField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function jpegBytes(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0 || bytes.length > MAX_JPEG_BYTES) {
    return null;
  }
  return bytes;
}
