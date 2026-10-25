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
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const tierId = parseAvailabilityTierId(body.tierId) ?? "RoomSanctuary";
    const blockedDates = sanitizeIsoDates(body.blockedDates);
    const availableFromIso =
      typeof body.availableFromIso === "string" ? body.availableFromIso : undefined;
    const hostEmail =
      typeof body.hostEmail === "string" ? body.hostEmail : undefined;

    const { schedule, schedules } = await saveTierAvailabilitySchedule({
      tierId,
      availableFromIso,
      blockedDates,
      hostEmail,
    });

    return NextResponse.json({
      ok: true,
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
