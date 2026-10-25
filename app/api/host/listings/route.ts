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

    const listings = await readHostListings(supabase, userResult.data.user.id);
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

const WEEKLY_STAY_CENTS = 31500;

async function readHostListings(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  hostId: string,
): Promise<HostListing[] | null> {
  const withRate = await supabase
    .from("listings")
    .select("id, title, weekly_rate_cents")
    .eq("host_id", hostId)
    .order("id", { ascending: true });
  if (!withRate.error) {
    return parseListings(withRate.data, "weekly_rate_cents");
  }
  if (!missingPriceColumn(withRate.error)) {
    return null;
  }

  const withPrice = await supabase
    .from("listings")
    .select("id, title, weekly_price_cents")
    .eq("host_id", hostId)
    .order("id", { ascending: true });
  if (!withPrice.error) {
    return parseListings(withPrice.data, "weekly_price_cents");
  }
  if (!missingPriceColumn(withPrice.error)) {
    return null;
  }

  const plain = await supabase
    .from("listings")
    .select("id, title")
    .eq("host_id", hostId)
    .order("id", { ascending: true });
  if (plain.error) {
    return null;
  }
  return parseListings(plain.data, null);
}

function missingPriceColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === "42703" || error.code === "PGRST204") {
    return true;
  }
  const message = error.message ?? "";
  return message.includes("weekly_rate_cents") || message.includes("weekly_price_cents");
}

function parseListings(
  value: unknown,
  priceField: "weekly_rate_cents" | "weekly_price_cents" | null,
): HostListing[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const listings: HostListing[] = [];
  for (const row of value) {
    const listing = parseListing(row, priceField);
    if (!listing) {
      return null;
    }
    listings.push(listing);
  }
  return listings;
}

function parseListing(
  value: unknown,
  priceField: "weekly_rate_cents" | "weekly_price_cents" | null,
): HostListing | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = textOrNull(row.id);
  const weeklyRateCents = priceField === null ? WEEKLY_STAY_CENTS : positiveCents(row[priceField]);
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
