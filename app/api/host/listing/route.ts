import { NextResponse } from "next/server";
import { getActiveHostProperty } from "@/lib/host-listing";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Host session required" }, { status: 401 });
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

    const listing = await getActiveHostProperty(supabase, userResult.data.user.id);
    return NextResponse.json({ listing });
  } catch (error) {
    console.error("host listing failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not load the property.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
