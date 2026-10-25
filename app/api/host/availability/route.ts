import { NextResponse } from "next/server";
import {
  hydrateAvailabilitySchedules,
  parseAvailabilityTierId,
  sanitizeIsoDates,
  saveTierAvailabilitySchedule,
} from "@/lib/host-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const schedules = await hydrateAvailabilitySchedules();
  return NextResponse.json({
    ok: true,
    storageSource: "public.host_tier_availability",
    schedules,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const tierId =
      parseAvailabilityTierId(body.tierId) ??
      parseAvailabilityTierId(body.tierName) ??
      parseAvailabilityTierId(body.tier_name) ??
      "RoomSanctuary";
    const blockedDates = sanitizeIsoDates(
      Array.isArray(body.blockedDates) ? body.blockedDates : body.blocked_dates,
    );
    const availableFromIso =
      typeof body.availableFromIso === "string" ? body.availableFromIso : undefined;
    const hostEmail =
      typeof body.hostEmail === "string" ? body.hostEmail : undefined;
    const propertyId =
      typeof body.propertyId === "string"
        ? body.propertyId
        : typeof body.property_id === "string"
          ? body.property_id
          : undefined;
    const weeklyRateCents =
      typeof body.weeklyRateCents === "number" && Number.isFinite(body.weeklyRateCents)
        ? Math.trunc(body.weeklyRateCents)
        : undefined;
    const rawDaily =
      typeof body.configuredDailyRateCents === "number" &&
      Number.isFinite(body.configuredDailyRateCents)
        ? body.configuredDailyRateCents
        : typeof body.configured_daily_rate_cents === "number" &&
            Number.isFinite(body.configured_daily_rate_cents)
          ? body.configured_daily_rate_cents
          : typeof body.dailyRateCents === "number" &&
              Number.isFinite(body.dailyRateCents)
            ? body.dailyRateCents
            : undefined;
    const configuredDailyRateCents =
      rawDaily !== undefined ? Math.trunc(rawDaily) : undefined;

    const { schedule, schedules, storageSource } = await saveTierAvailabilitySchedule({
      tierId,
      propertyId,
      availableFromIso,
      blockedDates,
      hostEmail,
      weeklyRateCents,
      configuredDailyRateCents,
    });

    return NextResponse.json({
      ok: true,
      storageSource,
      schedule,
      schedules,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save availability calendar" },
      { status: 500 },
    );
  }
}
