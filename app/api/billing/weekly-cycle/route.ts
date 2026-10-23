import { NextResponse } from "next/server";
import { resolveCallerRole } from "@/lib/host-access";
import { applySimulatedWeeklyVault, SIMULATED_WEEKLY_CENTS } from "@/lib/simulated-weekly-billing";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if ((process.env.STRIPE_SECRET_KEY ?? "").trim() !== "") {
      return NextResponse.json({ ok: false, error: "Stripe billing is configured" }, { status: 400 });
    }
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    }
    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
    }
    const role = await resolveCallerRole(supabase, userResult.data.user);
    const stay =
      role === "lodger"
        ? await activeStayForTenant(supabase, userResult.data.user.id)
        : role === "host"
          ? await activeStayForHost(supabase, userResult.data.user.id)
          : null;
    if (!stay) {
      return NextResponse.json({ ok: false, error: "No active agreement" }, { status: role === "lodger" || role === "host" ? 404 : 401 });
    }
    const result = await applySimulatedWeeklyVault({
      payerKey: stay.tenantId,
      agreementId: stay.agreementId,
      totalCents: SIMULATED_WEEKLY_CENTS,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("weekly billing failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Weekly billing failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function activeStayForTenant(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<{ tenantId: string; agreementId: string } | null> {
  const agreement = await supabase
    .from("agreements")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1);
  if (agreement.error) {
    throw new Error("weekly billing failed");
  }
  const row = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
  const agreementId = row && typeof row.id === "string" ? row.id : "";
  return agreementId ? { tenantId, agreementId } : null;
}

async function activeStayForHost(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  hostId: string,
): Promise<{ tenantId: string; agreementId: string } | null> {
  const listing = await supabase.from("listings").select("id").eq("host_id", hostId).limit(1);
  if (listing.error) {
    throw new Error("weekly billing failed");
  }
  const listingRow = Array.isArray(listing.data) ? listing.data[0] : listing.data;
  const listingId = listingRow && typeof listingRow.id === "string" ? listingRow.id : "";
  if (!listingId) {
    return null;
  }
  const agreement = await supabase
    .from("agreements")
    .select("id, tenant_id")
    .eq("listing_id", listingId)
    .eq("status", "active")
    .limit(1);
  if (agreement.error) {
    throw new Error("weekly billing failed");
  }
  const row = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
  const agreementId = row && typeof row.id === "string" ? row.id : "";
  const tenantId = row && typeof row.tenant_id === "string" ? row.tenant_id : "";
  return agreementId && tenantId ? { tenantId, agreementId } : null;
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
