import { NextResponse } from "next/server";
import { parseJurisdictionCode } from "@/lib/compliance/jurisdictions";
import { INTENDED_STAY_DAYS, evaluateGeoCompliance, persistListingJurisdiction } from "@/lib/geo-compliance";
import { resolveCallerRole } from "@/lib/host-access";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
    const selected = parseJurisdictionCode(
      payload && typeof payload === "object" ? (payload as { jurisdictionCode?: unknown }).jurisdictionCode : undefined,
    );
    if (selected === null) {
      return NextResponse.json({ ok: false, error: "Listing location is required" }, { status: 400 });
    }
    if (typeof selected !== "string") {
      return NextResponse.json({ ok: false, error: selected.error }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    }
    const role = await resolveCallerRole(supabase, userResult.data.user);
    const listingId = await listingForRole(supabase, userResult.data.user.id, role);
    if (!listingId) {
      return NextResponse.json({ ok: false, error: "No listing is tied to this account" }, { status: 404 });
    }

    const persisted = await persistListingJurisdiction(supabase, listingId, selected);
    const compliance = evaluateGeoCompliance({ jurisdiction_code: selected }, INTENDED_STAY_DAYS);
    if (persisted === "rejected") {
      return NextResponse.json({ ok: false, error: "Could not save the listing location." }, { status: 200 });
    }
    return NextResponse.json({
      ok: true,
      persisted: persisted === "saved",
      jurisdictionCode: compliance.jurisdictionCode,
      geoCompliance: compliance.statusLabel,
      allowed: compliance.allowed,
      blockReason: compliance.blockReason,
    });
  } catch (error) {
    console.error("jurisdiction save failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not save the listing location.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function listingForRole(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
  role: string | null,
): Promise<string | null> {
  if (role === "host") {
    const listing = await supabase.from("listings").select("id").eq("host_id", userId).limit(1);
    const row = Array.isArray(listing.data) ? listing.data[0] : listing.data;
    return row && typeof row.id === "string" && row.id.trim() !== "" ? row.id.trim() : null;
  }
  if (role === "lodger") {
    const agreement = await supabase
      .from("agreements")
      .select("listing_id")
      .eq("tenant_id", userId)
      .eq("status", "active")
      .limit(1);
    const row = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
    const listingId = row && typeof row.listing_id === "string" ? row.listing_id.trim() : "";
    return listingId === "" ? null : listingId;
  }
  return null;
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
