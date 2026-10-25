import {
  addDaysIsoUtc,
  todayIsoUtc,
  type TierAvailabilitySchedule,
} from "@/lib/availability-calendar";
import {
  DAILY_RATE_PRESET_TIERS,
  clampTierDailyRateCents,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { divideIntegerCentsHalfUp } from "@/lib/marketing-calculator";
import { getSupabaseServerClient } from "@/lib/supabase";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Canonical property UUIDs for the three VettedRent lodging tiers in
 * `public.host_tier_availability` and `public.active_commercial_licenses`.
 */
export const TIER_PROPERTY_UUIDS: Record<DailyRateTierId, string> = {
  RoomSanctuary: "00000000-0000-4000-8000-000000000101",
  PrivateSuite: "00000000-0000-4000-8000-000000000102",
  ExecutiveTownhome: "00000000-0000-4000-8000-000000000103",
};

export function resolvePropertyUuidForTier(
  tierId: DailyRateTierId,
  propertyIdInput?: unknown,
): string {
  if (typeof propertyIdInput === "string" && UUID_RE.test(propertyIdInput.trim())) {
    return propertyIdInput.trim().toLowerCase();
  }
  return TIER_PROPERTY_UUIDS[tierId] ?? TIER_PROPERTY_UUIDS.RoomSanctuary;
}

export function resolveTierFromPropertyUuid(
  propertyIdInput: unknown,
): DailyRateTierId | null {
  if (typeof propertyIdInput !== "string") {
    return null;
  }
  const normalized = propertyIdInput.trim().toLowerCase();
  if (normalized === TIER_PROPERTY_UUIDS.ExecutiveTownhome) {
    return "ExecutiveTownhome";
  }
  if (normalized === TIER_PROPERTY_UUIDS.PrivateSuite) {
    return "PrivateSuite";
  }
  if (normalized === TIER_PROPERTY_UUIDS.RoomSanctuary) {
    return "RoomSanctuary";
  }
  return null;
}

const memorySchedules: Record<DailyRateTierId, TierAvailabilitySchedule> =
  createDefaultSchedules();

function createDefaultSchedules(): Record<DailyRateTierId, TierAvailabilitySchedule> {
  const today = todayIsoUtc();
  return {
    RoomSanctuary: {
      tierId: "RoomSanctuary",
      propertyId: TIER_PROPERTY_UUIDS.RoomSanctuary,
      listingId: "vr-weekly-room",
      configuredDailyRateCents: DAILY_RATE_PRESET_TIERS.RoomSanctuary.grossDailyRateCents,
      weeklyRateCents: DAILY_RATE_PRESET_TIERS.RoomSanctuary.weeklyRateCents,
      availableFromIso: today,
      blockedDates: [],
      updatedAtIso: new Date().toISOString(),
    },
    PrivateSuite: {
      tierId: "PrivateSuite",
      propertyId: TIER_PROPERTY_UUIDS.PrivateSuite,
      listingId: "vr-private-suite",
      configuredDailyRateCents: DAILY_RATE_PRESET_TIERS.PrivateSuite.grossDailyRateCents,
      weeklyRateCents: DAILY_RATE_PRESET_TIERS.PrivateSuite.weeklyRateCents,
      availableFromIso: today,
      blockedDates: [addDaysIsoUtc(today, 18), addDaysIsoUtc(today, 19)],
      updatedAtIso: new Date().toISOString(),
    },
    ExecutiveTownhome: {
      tierId: "ExecutiveTownhome",
      propertyId: TIER_PROPERTY_UUIDS.ExecutiveTownhome,
      listingId: "vr-executive-townhome",
      configuredDailyRateCents: DAILY_RATE_PRESET_TIERS.ExecutiveTownhome.grossDailyRateCents,
      weeklyRateCents: DAILY_RATE_PRESET_TIERS.ExecutiveTownhome.weeklyRateCents,
      availableFromIso: today,
      blockedDates: [
        addDaysIsoUtc(today, 25),
        addDaysIsoUtc(today, 26),
        addDaysIsoUtc(today, 27),
      ],
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

function resolveTierRatesIntegerCents(
  tierId: DailyRateTierId,
  options?: {
    configuredDailyRateCents?: number;
    weeklyRateCents?: number;
  },
): { configuredDailyRateCents: number; weeklyRateCents: number } {
  const current = memorySchedules[tierId];
  if (
    typeof options?.configuredDailyRateCents === "number" &&
    Number.isFinite(options.configuredDailyRateCents) &&
    options.configuredDailyRateCents > 0
  ) {
    const clampedDaily = clampTierDailyRateCents(
      tierId,
      Math.trunc(options.configuredDailyRateCents),
    );
    const clampedWeekly = clampTierWeeklyRateCents(tierId, clampedDaily * 7);
    return {
      configuredDailyRateCents: clampedDaily,
      weeklyRateCents: clampedWeekly,
    };
  }

  if (
    typeof options?.weeklyRateCents === "number" &&
    Number.isFinite(options.weeklyRateCents) &&
    options.weeklyRateCents > 0
  ) {
    const clampedWeekly = clampTierWeeklyRateCents(
      tierId,
      Math.trunc(options.weeklyRateCents),
    );
    const clampedDaily = clampTierDailyRateCents(
      tierId,
      divideIntegerCentsHalfUp(clampedWeekly, 7),
    );
    return {
      configuredDailyRateCents: clampedDaily,
      weeklyRateCents: clampedWeekly,
    };
  }

  return {
    configuredDailyRateCents: current.configuredDailyRateCents,
    weeklyRateCents: current.weeklyRateCents,
  };
}

type HostTierAvailabilityRow = {
  id?: unknown;
  property_id?: unknown;
  tier_name?: unknown;
  configured_daily_rate_cents?: unknown;
  blocked_dates?: unknown;
  updated_at?: unknown;
};

/**
 * Hydrates availability schedules and custom tier rates from `public.host_tier_availability`
 * using the service-role client. Seeds default rows for any missing tier on first access.
 */
export async function hydrateAvailabilitySchedules(): Promise<
  Record<DailyRateTierId, TierAvailabilitySchedule>
> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("host_tier_availability")
      .select(
        "id, property_id, tier_name, configured_daily_rate_cents, blocked_dates, updated_at",
      )
      .order("updated_at", { ascending: false });

    const seen = new Set<DailyRateTierId>();

    if (!error && Array.isArray(data)) {
      for (const rawRow of data as HostTierAvailabilityRow[]) {
        if (!rawRow || typeof rawRow !== "object") {
          continue;
        }
        const tierId = parseAvailabilityTierId(rawRow.tier_name);
        if (!tierId || seen.has(tierId)) {
          continue;
        }
        seen.add(tierId);

        const rawDaily = Number(rawRow.configured_daily_rate_cents);
        const rates = resolveTierRatesIntegerCents(tierId, {
          configuredDailyRateCents: Number.isFinite(rawDaily) ? rawDaily : undefined,
        });
        const blockedDates = sanitizeIsoDates(rawRow.blocked_dates);
        const propertyId = resolvePropertyUuidForTier(tierId, rawRow.property_id);
        const updatedAtIso =
          typeof rawRow.updated_at === "string"
            ? rawRow.updated_at
            : new Date().toISOString();

        memorySchedules[tierId] = {
          ...memorySchedules[tierId],
          propertyId,
          configuredDailyRateCents: rates.configuredDailyRateCents,
          weeklyRateCents: rates.weeklyRateCents,
          blockedDates,
          updatedAtIso,
        };
      }

      // Seed any tier not yet present in public.host_tier_availability
      const allTiers: DailyRateTierId[] = [
        "RoomSanctuary",
        "PrivateSuite",
        "ExecutiveTownhome",
      ];
      const missingRows = allTiers
        .filter((tierId) => !seen.has(tierId))
        .map((tierId) => {
          const sched = memorySchedules[tierId];
          return {
            property_id: sched.propertyId,
            tier_name: sched.tierId,
            configured_daily_rate_cents: sched.configuredDailyRateCents,
            blocked_dates: sched.blockedDates,
            updated_at: sched.updatedAtIso,
          };
        });

      if (missingRows.length > 0) {
        await supabase
          .from("host_tier_availability")
          .upsert(missingRows, { onConflict: "property_id,tier_name" });
      }
    }
  } catch {
    // Keep memory schedule when Supabase env vars or network are unavailable
  }

  return memorySchedules;
}

/**
 * Persists host blocked dates and custom tier rate adjustments directly to
 * `public.host_tier_availability` using the service-role client.
 */
export async function saveTierAvailabilitySchedule(options: {
  tierId: DailyRateTierId;
  propertyId?: string;
  availableFromIso?: string;
  blockedDates: string[];
  hostEmail?: string;
  weeklyRateCents?: number;
  configuredDailyRateCents?: number;
}): Promise<{
  schedule: TierAvailabilitySchedule;
  schedules: Record<DailyRateTierId, TierAvailabilitySchedule>;
  storageSource: "public.host_tier_availability" | "memory_fallback";
}> {
  const safeAvailableFrom =
    typeof options.availableFromIso === "string" &&
    ISO_DATE_RE.test(options.availableFromIso)
      ? options.availableFromIso
      : todayIsoUtc();
  const safeBlocked = sanitizeIsoDates(options.blockedDates);
  const propertyId = resolvePropertyUuidForTier(options.tierId, options.propertyId);
  const rates = resolveTierRatesIntegerCents(options.tierId, {
    configuredDailyRateCents: options.configuredDailyRateCents,
    weeklyRateCents: options.weeklyRateCents,
  });
  const nowIso = new Date().toISOString();

  const updated: TierAvailabilitySchedule = {
    ...memorySchedules[options.tierId],
    propertyId,
    configuredDailyRateCents: rates.configuredDailyRateCents,
    weeklyRateCents: rates.weeklyRateCents,
    availableFromIso: safeAvailableFrom,
    blockedDates: safeBlocked,
    updatedAtIso: nowIso,
  };
  memorySchedules[options.tierId] = updated;

  let storageSource: "public.host_tier_availability" | "memory_fallback" =
    "memory_fallback";

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("host_tier_availability")
      .upsert(
        {
          property_id: propertyId,
          tier_name: options.tierId,
          configured_daily_rate_cents: rates.configuredDailyRateCents,
          blocked_dates: safeBlocked,
          updated_at: nowIso,
        },
        { onConflict: "property_id,tier_name" },
      )
      .select(
        "id, property_id, tier_name, configured_daily_rate_cents, blocked_dates, updated_at",
      )
      .maybeSingle();

    if (!error) {
      storageSource = "public.host_tier_availability";
      if (data && typeof data === "object") {
        const row = data as HostTierAvailabilityRow;
        const dbDaily = Number(row.configured_daily_rate_cents);
        const dbRates = resolveTierRatesIntegerCents(options.tierId, {
          configuredDailyRateCents: Number.isFinite(dbDaily) ? dbDaily : undefined,
        });
        memorySchedules[options.tierId] = {
          ...updated,
          propertyId: resolvePropertyUuidForTier(options.tierId, row.property_id),
          configuredDailyRateCents: dbRates.configuredDailyRateCents,
          weeklyRateCents: dbRates.weeklyRateCents,
          blockedDates: sanitizeIsoDates(row.blocked_dates),
          updatedAtIso:
            typeof row.updated_at === "string" ? row.updated_at : nowIso,
        };
      }
    }
  } catch {
    // Memory schedule remains updated even if DB write is skipped
  }

  return {
    schedule: memorySchedules[options.tierId],
    schedules: memorySchedules,
    storageSource,
  };
}

/**
 * Marks a booked date range (`checkInDate` through `checkInDate + stayDays - 1`)
 * as reserved in `public.host_tier_availability` for the given tier.
 */
export async function reserveStayDatesInAvailability(options: {
  tierId: DailyRateTierId;
  propertyId?: string;
  checkInDate: string;
  stayDays: number;
  applicantEmail?: string;
  weeklyRateCents?: number;
  configuredDailyRateCents?: number;
}): Promise<{
  reservedDates: string[];
  schedule: TierAvailabilitySchedule;
  storageSource: "public.host_tier_availability" | "memory_fallback";
}> {
  await hydrateAvailabilitySchedules();
  const safeStart = ISO_DATE_RE.test(options.checkInDate)
    ? options.checkInDate
    : todayIsoUtc();
  const clampedDays = Math.max(7, Math.min(90, Math.trunc(options.stayDays)));

  const reservedDates: string[] = [];
  for (let i = 0; i < clampedDays; i++) {
    reservedDates.push(addDaysIsoUtc(safeStart, i));
  }

  const existing = memorySchedules[options.tierId]?.blockedDates ?? [];
  const merged = Array.from(new Set([...existing, ...reservedDates])).sort();

  const { schedule, storageSource } = await saveTierAvailabilitySchedule({
    tierId: options.tierId,
    propertyId: options.propertyId,
    availableFromIso:
      memorySchedules[options.tierId]?.availableFromIso ?? todayIsoUtc(),
    blockedDates: merged,
    hostEmail: options.applicantEmail,
    weeklyRateCents: options.weeklyRateCents,
    configuredDailyRateCents: options.configuredDailyRateCents,
  });

  return {
    reservedDates,
    schedule,
    storageSource,
  };
}
