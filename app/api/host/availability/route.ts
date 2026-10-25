import { NextResponse } from "next/server";
import {
  addDaysIsoUtc,
  todayIsoUtc,
  type TierAvailabilitySchedule,
} from "@/lib/availability-calendar";
import type { DailyRateTierId } from "@/lib/daily-rate-comparison";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const memorySchedules: Record<DailyRateTierId, TierAvailabilitySchedule> =
  createDefaultSchedules();

function createDefaultSchedules(): Record<DailyRateTierId, TierAvailabilitySchedule> {
  const today = todayIsoUtc();
  return {
    RoomSanctuary: {
      tierId: "RoomSanctuary",
      listingId: "vr-weekly-room",
      availableFromIso: today,
      blockedDates: [],
      updatedAtIso: new Date().toISOString(),
    },
    PrivateSuite: {
      tierId: "PrivateSuite",
      listingId: "vr-private-suite",
      availableFromIso: today,
      blockedDates: [addDaysIsoUtc(today, 18), addDaysIsoUtc(today, 19)],
      updatedAtIso: new Date().toISOString(),
    },
    ExecutiveTownhome: {
      tierId: "ExecutiveTownhome",
      listingId: "vr-executive-townhome",
      availableFromIso: today,
      blockedDates: [addDaysIsoUtc(today, 25), addDaysIsoUtc(today, 26), addDaysIsoUtc(today, 27)],
      updatedAtIso: new Date().toISOString(),
    },
  };
}

function parseTierId(value: unknown): DailyRateTierId | null {
  if (
    value === "RoomSanctuary" ||
    value === "PrivateSuite" ||
    value === "ExecutiveTownhome"
  ) {
    return value;
  }
  return null;
}

function sanitizeDates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && ISO_DATE_RE.test(item.trim())) {
      unique.add(item.trim());
    }
  }
  return Array.from(unique).sort();
}

async function hydrateFromSupabase(): Promise<void> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("marketing_leads")
      .select("notes, created_at")
      .eq("utm_campaign", "host_availability_calendar")
      .order("created_at", { ascending: false })
      .limit(15);

    if (error || !Array.isArray(data)) {
      return;
    }

    const seen = new Set<DailyRateTierId>();
    for (const row of data) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const notes = (row as { notes?: unknown }).notes;
      if (typeof notes !== "string" || !notes.startsWith("{")) {
        continue;
      }
      try {
        const parsed = JSON.parse(notes) as {
          tierId?: unknown;
          blockedDates?: unknown;
          availableFromIso?: unknown;
        };
        const tierId = parseTierId(parsed.tierId);
        if (!tierId || seen.has(tierId)) {
          continue;
        }
        seen.add(tierId);
        const blockedDates = sanitizeDates(parsed.blockedDates);
        const availableFromIso =
          typeof parsed.availableFromIso === "string" &&
          ISO_DATE_RE.test(parsed.availableFromIso)
            ? parsed.availableFromIso
            : todayIsoUtc();

        memorySchedules[tierId] = {
          ...memorySchedules[tierId],
          availableFromIso,
          blockedDates,
          updatedAtIso:
            typeof (row as { created_at?: unknown }).created_at === "string"
              ? ((row as { created_at: string }).created_at)
              : new Date().toISOString(),
        };
      } catch {
        // Ignore malformed JSON note
      }
    }
  } catch {
    // Keep memory schedule on transient error
  }
}

export async function GET(): Promise<NextResponse> {
  await hydrateFromSupabase();
  return NextResponse.json({
    ok: true,
    schedules: memorySchedules,
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

    const tierId = parseTierId(body.tierId) ?? "RoomSanctuary";
    const blockedDates = sanitizeDates(body.blockedDates);
    const availableFromIso =
      typeof body.availableFromIso === "string" && ISO_DATE_RE.test(body.availableFromIso)
        ? body.availableFromIso
        : todayIsoUtc();
    const hostEmail =
      typeof body.hostEmail === "string" && body.hostEmail.includes("@")
        ? body.hostEmail.trim().toLowerCase()
        : "host-calendar@vettedrent.com";

    const updated: TierAvailabilitySchedule = {
      ...memorySchedules[tierId],
      availableFromIso,
      blockedDates,
      updatedAtIso: new Date().toISOString(),
    };
    memorySchedules[tierId] = updated;

    try {
      const supabase = getSupabaseServerClient();
      await supabase.from("marketing_leads").insert({
        role: "host",
        cohort: "Host-Property",
        email: hostEmail,
        jurisdiction_code: "MD-PG",
        intended_stay_days: 90,
        utm_source: "availability_calendar",
        utm_medium: "host_setup",
        utm_campaign: "host_availability_calendar",
        notes: JSON.stringify({
          tierId,
          availableFromIso,
          blockedDates,
        }),
      });
    } catch {
      // Memory schedule remains updated even if DB write is skipped
    }

    return NextResponse.json({
      ok: true,
      schedule: updated,
      schedules: memorySchedules,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save availability calendar" },
      { status: 500 },
    );
  }
}
