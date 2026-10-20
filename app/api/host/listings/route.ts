import { NextResponse } from "next/server";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HostListing = {
  id: string;
  title: string | null;
  weeklyRateCents: number;
};

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

    const { data, error } = await supabase
      .from("listings")
      .select("id, title, weekly_rate_cents")
      .eq("host_id", userResult.data.user.id)
      .order("id", { ascending: true });

    if (error) {
      console.error("host listings failed");
      return NextResponse.json({ error: "Could not load listing rates" }, { status: 500 });
    }

    const listings = parseListings(data);
    if (!listings) {
      console.error("host listings failed");
      return NextResponse.json({ error: "Could not load listing rates" }, { status: 500 });
    }

    return NextResponse.json({ listings });
  } catch (error) {
    console.error("host listings failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not load listing rates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseListings(value: unknown): HostListing[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const listings: HostListing[] = [];
  for (const row of value) {
    const listing = parseListing(row);
    if (!listing) {
      return null;
    }
    listings.push(listing);
  }
  return listings;
}

function parseListing(value: unknown): HostListing | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = textOrNull(row.id);
  const weeklyRateCents = positiveCents(row.weekly_rate_cents);
  if (!id || weeklyRateCents === null) {
    return null;
  }
  return {
    id,
    title: textOrNull(row.title),
    weeklyRateCents,
  };
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function positiveCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}
