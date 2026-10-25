import {
  addDaysIsoUtc,
  todayIsoUtc,
  type TierAvailabilitySchedule,
} from "@/lib/availability-calendar";
import {
  DAILY_RATE_PRESET_TIERS,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { getSupabaseServerClient } from "@/lib/supabase";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const memorySchedules: Record<DailyRateTierId, TierAvailabilitySchedule> =
  createDefaultSchedules();

function createDefaultSchedules(): Record<DailyRateTierId, TierAvailabilitySchedule> {
  const today = todayIsoUtc();
  return {
    RoomSanctuary: {
      tierId: "RoomSanctuary",
      listingId: "vr-weekly-room",
      weeklyRateCents: DAILY_RATE_PRESET_TIERS.RoomSanctuary.weeklyRateCents,
      availableFromIso: today,
      blockedDates: [],
      updatedAtIso: new Date().toISOString(),
    },
    PrivateSuite: {
      tierId: "PrivateSuite",
      listingId: "vr-private-suite",
      weeklyRateCents: DAILY_RATE_PRESET_TIERS.PrivateSuite.weeklyRateCents,
      availableFromIso: today,
      blockedDates: [addDaysIsoUtc(today, 18), addDaysIsoUtc(today, 19)],
      updatedAtIso: new Date().toISOString(),
    },
    ExecutiveTownhome: {
      tierId: "ExecutiveTownhome",
      listingId: "vr-executive-townhome",
      weeklyRateCents: DAILY_RATE_PRESET_TIERS.ExecutiveTownhome.weeklyRateCents,
      availableFromIso: today,
      blockedDates: [addDaysIsoUtc(today, 25), addDaysIsoUtc(today, 26), addDaysIsoUtc(today, 27)],
      updatedAtIso: new Date().toISOString(),
    },
  };
}

export function parseAvailabilityTierId(value: unknown): DailyRateTierId | null {
  if (
    value === "RoomSanctuary" ||
    value === "PrivateSuite" ||
    value === "ExecutiveTownhome"
  ) {
    return value;
  }
  return null;
}

export function sanitizeIsoDates(value: unknown): string[] {
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

export async function hydrateAvailabilitySchedules(): Promise<
  Record<DailyRateTierId, TierAvailabilitySchedule>
> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("marketing_leads")
      .select("notes, created_at")
      .eq("utm_campaign", "host_availability_calendar")
      .order("created_at", { ascending: false })
      .limit(15);

    if (!error && Array.isArray(data)) {
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
            weeklyRateCents?: unknown;
          };
          const tierId = parseAvailabilityTierId(parsed.tierId);
          if (!tierId || seen.has(tierId)) {
            continue;
          }
          seen.add(tierId);
          const blockedDates = sanitizeIsoDates(parsed.blockedDates);
          const availableFromIso =
            typeof parsed.availableFromIso === "string" &&
            ISO_DATE_RE.test(parsed.availableFromIso)
              ? parsed.availableFromIso
              : todayIsoUtc();
          const hydratedWeekly =
            typeof parsed.weeklyRateCents === "number" &&
            Number.isFinite(parsed.weeklyRateCents)
              ? clampTierWeeklyRateCents(tierId, parsed.weeklyRateCents)
              : memorySchedules[tierId].weeklyRateCents;

          memorySchedules[tierId] = {
            ...memorySchedules[tierId],
            weeklyRateCents: hydratedWeekly,
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
    }
  } catch {
    // Keep memory schedule when Supabase env vars or network are unavailable
  }

  return memorySchedules;
}

export async function saveTierAvailabilitySchedule(options: {
  tierId: DailyRateTierId;
  availableFromIso?: string;
  blockedDates: string[];
  hostEmail?: string;
  weeklyRateCents?: number;
}): Promise<{
  schedule: TierAvailabilitySchedule;
  schedules: Record<DailyRateTierId, TierAvailabilitySchedule>;
}> {
  const safeAvailableFrom =
    typeof options.availableFromIso === "string" && ISO_DATE_RE.test(options.availableFromIso)
      ? options.availableFromIso
      : todayIsoUtc();
  const safeBlocked = sanitizeIsoDates(options.blockedDates);
  const hostEmail =
    typeof options.hostEmail === "string" && options.hostEmail.includes("@")
      ? options.hostEmail.trim().toLowerCase()
      : "host-calendar@vettedrent.com";
  const clampedWeeklyCents = clampTierWeeklyRateCents(
    options.tierId,
    options.weeklyRateCents ?? memorySchedules[options.tierId]?.weeklyRateCents,
  );

  const updated: TierAvailabilitySchedule = {
    ...memorySchedules[options.tierId],
    weeklyRateCents: clampedWeeklyCents,
    availableFromIso: safeAvailableFrom,
    blockedDates: safeBlocked,
    updatedAtIso: new Date().toISOString(),
  };
  memorySchedules[options.tierId] = updated;

  try {
    const supabase = getSupabaseServerClient();
    await supabase.from("marketing_leads").insert({
      role: "host",
      cohort: "Host-Property",
      email: hostEmail,
      jurisdiction_code: "MD-PG",
      weekly_rate_cents: clampedWeeklyCents,
      intended_stay_days: 90,
      utm_source: "availability_calendar",
      utm_medium: "host_setup",
      utm_campaign: "host_availability_calendar",
      notes: JSON.stringify({
        tierId: options.tierId,
        weeklyRateCents: clampedWeeklyCents,
        availableFromIso: safeAvailableFrom,
        blockedDates: safeBlocked,
      }),
    });
  } catch {
    // Memory schedule remains updated even if DB write is skipped
  }

  return { schedule: updated, schedules: memorySchedules };
}

/**
 * Marks a booked date range (`checkInDate` through `checkInDate + stayDays - 1`)
 * as reserved in the availability schedule for the given tier.
 */
export async function reserveStayDatesInAvailability(options: {
  tierId: DailyRateTierId;
  checkInDate: string;
  stayDays: number;
  applicantEmail?: string;
}): Promise<{
  reservedDates: string[];
  schedule: TierAvailabilitySchedule;
}> {
  await hydrateAvailabilitySchedules();
  const safeStart = ISO_DATE_RE.test(options.checkInDate)
    ? options.checkInDate
    : todayIsoUtc();
  const clampedDays = Math.max(7, Math.min(90, Math.round(options.stayDays)));

  const reservedDates: string[] = [];
  for (let i = 0; i < clampedDays; i++) {
    reservedDates.push(addDaysIsoUtc(safeStart, i));
  }

  const existing = memorySchedules[options.tierId]?.blockedDates ?? [];
  const merged = Array.from(new Set([...existing, ...reservedDates])).sort();

  const { schedule } = await saveTierAvailabilitySchedule({
    tierId: options.tierId,
    availableFromIso: memorySchedules[options.tierId]?.availableFromIso ?? todayIsoUtc(),
    blockedDates: merged,
    hostEmail: options.applicantEmail,
  });

  return {
    reservedDates,
    schedule,
  };
}
