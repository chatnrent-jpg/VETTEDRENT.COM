import type { DailyRateTierId } from "@/lib/daily-rate-comparison";

export const STAY_DURATION_OPTIONS = [
  { days: 7, label: "7 Days (1 Week)" },
  { days: 14, label: "14 Days (2 Weeks)" },
  { days: 21, label: "21 Days (3 Weeks)" },
  { days: 30, label: "30 Days (1 Month)" },
  { days: 60, label: "60 Days (2 Months)" },
  { days: 90, label: "90 Days (3 Months)" },
] as const;

export type CalendarDayCell = {
  isoDate: string;
  dayOfMonth: number;
  monthShort: string;
  weekdayShort: string;
  isBlocked: boolean;
  isSelectedStart: boolean;
  isSelectedEnd: boolean;
  isInSelectedStay: boolean;
};

export type TierAvailabilitySchedule = {
  tierId: DailyRateTierId;
  listingId: string;
  availableFromIso: string;
  blockedDates: string[];
  updatedAtIso: string;
};

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function todayIsoUtc(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export function addDaysIsoUtc(startIso: string, daysToAdd: number): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  const base = parts
    ? new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
    : new Date();
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return base.toISOString().slice(0, 10);
}

export function formatReadableDate(isoDate: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!parts) {
    return isoDate;
  }
  const year = Number(parts[1]);
  const monthIdx = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const month = MONTH_NAMES_SHORT[monthIdx] ?? parts[2];
  return `${month} ${day}, ${year}`;
}

export function buildCalendarWindow(options: {
  startIso?: string;
  totalDays?: number;
  checkInIso: string;
  stayDays: number;
  blockedDates: readonly string[];
}): {
  cells: CalendarDayCell[];
  checkInIso: string;
  checkOutIso: string;
  hasConflict: boolean;
  conflictingDates: string[];
  availableDaysCount: number;
} {
  const baseIso = options.startIso ?? todayIsoUtc();
  const totalDays = Math.max(28, Math.min(120, options.totalDays ?? 42));
  const blockedSet = new Set(options.blockedDates);

  const checkInIso = options.checkInIso || baseIso;
  const stayDays = Math.max(7, Math.min(365, options.stayDays));
  const checkOutIso = addDaysIsoUtc(checkInIso, stayDays);

  const conflictingDates: string[] = [];
  for (let i = 0; i < stayDays; i++) {
    const d = addDaysIsoUtc(checkInIso, i);
    if (blockedSet.has(d)) {
      conflictingDates.push(d);
    }
  }

  const cells: CalendarDayCell[] = [];
  let availableDaysCount = 0;

  for (let offset = 0; offset < totalDays; offset++) {
    const isoDate = addDaysIsoUtc(baseIso, offset);
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    const dateObj = parts
      ? new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))
      : new Date();

    const isBlocked = blockedSet.has(isoDate);
    if (!isBlocked) {
      availableDaysCount++;
    }

    const isSelectedStart = isoDate === checkInIso;
    const isSelectedEnd = isoDate === addDaysIsoUtc(checkInIso, stayDays - 1);
    const isInSelectedStay = isoDate >= checkInIso && isoDate < checkOutIso;

    cells.push({
      isoDate,
      dayOfMonth: dateObj.getUTCDate(),
      monthShort: MONTH_NAMES_SHORT[dateObj.getUTCMonth()] ?? "",
      weekdayShort: WEEKDAY_NAMES_SHORT[dateObj.getUTCDay()] ?? "",
      isBlocked,
      isSelectedStart,
      isSelectedEnd,
      isInSelectedStay,
    });
  }

  return {
    cells,
    checkInIso,
    checkOutIso,
    hasConflict: conflictingDates.length > 0,
    conflictingDates,
    availableDaysCount,
  };
}
