"use client";

import { useEffect, useState } from "react";
import {
  addDaysIsoUtc,
  buildCalendarWindow,
  formatReadableDate,
  todayIsoUtc,
  type TierAvailabilitySchedule,
} from "@/lib/availability-calendar";
import {
  DAILY_RATE_PRESET_TIERS,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";

export function AvailabilityCalendar({
  mode,
  tierId,
  stayDays,
  checkInIso,
  onSelectCheckIn,
  hostEmail,
}: {
  mode: "tenant" | "landlord";
  tierId: DailyRateTierId;
  stayDays: number;
  checkInIso: string;
  onSelectCheckIn: (isoDate: string) => void;
  hostEmail?: string;
}) {
  const [schedules, setSchedules] = useState<
    Record<DailyRateTierId, TierAvailabilitySchedule> | null
  >(null);
  const [localBlocked, setLocalBlocked] = useState<string[]>([]);
  const [windowOffsetDays, setWindowOffsetDays] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const tier = DAILY_RATE_PRESET_TIERS[tierId];

  useEffect(() => {
    let cancelled = false;
    async function loadSchedules() {
      try {
        const res = await fetch("/api/host/availability", { cache: "no-store" });
        if (!res.ok) {
          return;
        }
        const body: unknown = await res.json();
        if (!cancelled && body && typeof body === "object") {
          const map = (body as { schedules?: Record<DailyRateTierId, TierAvailabilitySchedule> })
            .schedules;
          if (map) {
            setSchedules(map);
            setLocalBlocked(map[tierId]?.blockedDates ?? []);
          }
        }
      } catch {
        // Keep current state on network hiccup
      }
    }
    void loadSchedules();
    return () => {
      cancelled = true;
    };
  }, [tierId]);

  useEffect(() => {
    if (schedules && schedules[tierId]) {
      setLocalBlocked(schedules[tierId].blockedDates);
    }
  }, [schedules, tierId]);

  const windowStartIso = addDaysIsoUtc(todayIsoUtc(), windowOffsetDays);
  const calendar = buildCalendarWindow({
    startIso: windowStartIso,
    totalDays: 35, // 5 clean weeks (35 days) per view
    checkInIso,
    stayDays,
    blockedDates: localBlocked,
  });

  function handleCellClick(isoDate: string, isBlocked: boolean) {
    setSaveMessage(null);
    if (mode === "tenant") {
      if (!isBlocked) {
        onSelectCheckIn(isoDate);
      }
      return;
    }

    // Landlord mode: toggle date between Available and Blocked
    setLocalBlocked((prev) =>
      prev.includes(isoDate) ? prev.filter((d) => d !== isoDate) : [...prev, isoDate].sort(),
    );
  }

  function blockNextSevenDays() {
    setSaveMessage(null);
    const start = todayIsoUtc();
    const nextSeven: string[] = [];
    for (let i = 0; i < 7; i++) {
      nextSeven.push(addDaysIsoUtc(start, i));
    }
    setLocalBlocked((prev) => Array.from(new Set([...prev, ...nextSeven])).sort());
  }

  function openAllDays() {
    setSaveMessage(null);
    setLocalBlocked([]);
  }

  async function saveHostAvailability() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/host/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId,
          availableFromIso: todayIsoUtc(),
          blockedDates: localBlocked,
          hostEmail: hostEmail?.trim() || undefined,
        }),
      });
      const body: unknown = await res.json();
      if (res.ok && body && typeof body === "object") {
        const nextMap = (
          body as { schedules?: Record<DailyRateTierId, TierAvailabilitySchedule> }
        ).schedules;
        if (nextMap) {
          setSchedules(nextMap);
        }
        setSaveMessage(
          `Saved! ${tier.label} availability is now live for renters (${localBlocked.length} blocked day${localBlocked.length === 1 ? "" : "s"}).`,
        );
      } else {
        setSaveMessage("Could not save availability right now.");
      }
    } catch {
      setSaveMessage("Network error while saving availability.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vr-calendar-box" aria-label="Availability calendar">
      <div className="vr-calendar-head">
        <div className="vr-calendar-title">
          <strong>
            {mode === "tenant"
              ? `Available Dates · ${tier.label}`
              : `Set Your Available Days · ${tier.label}`}
          </strong>
          <span>
            {mode === "tenant"
              ? `Check-in: ${formatReadableDate(calendar.checkInIso)} → Check-out: ${formatReadableDate(calendar.checkOutIso)} (${stayDays} days)`
              : "Click any date to mark it Available (green) or Blocked (red), then click Save."}
          </span>
        </div>

        <div className="vr-calendar-controls">
          {mode === "tenant" ? (
            <span
              className="vr-calendar-status"
              data-available={!calendar.hasConflict ? "true" : "false"}
            >
              {!calendar.hasConflict
                ? `✓ Available for ${stayDays} days`
                : `⚠ ${calendar.conflictingDates.length} blocked day(s) in range`}
            </span>
          ) : (
            <>
              <button type="button" className="vr-cal-btn" onClick={openAllDays}>
                Open All Days
              </button>
              <button type="button" className="vr-cal-btn" onClick={blockNextSevenDays}>
                Block Next 7 Days
              </button>
              <button
                type="button"
                className="vr-cal-btn vr-cal-btn--gold"
                disabled={saving}
                onClick={() => void saveHostAvailability()}
              >
                {saving ? "Saving..." : "Save Available Days →"}
              </button>
            </>
          )}

          <div className="vr-calendar-nav">
            <button
              type="button"
              className="vr-cal-btn"
              disabled={windowOffsetDays <= 0}
              onClick={() => setWindowOffsetDays((prev) => Math.max(0, prev - 14))}
            >
              ← Earlier
            </button>
            <button
              type="button"
              className="vr-cal-btn"
              disabled={windowOffsetDays >= 90}
              onClick={() => setWindowOffsetDays((prev) => Math.min(90, prev + 14))}
            >
              Later →
            </button>
          </div>
        </div>
      </div>

      <div className="vr-calendar-grid" role="grid">
        {calendar.cells.map((cell) => {
          const state = cell.isBlocked
            ? "blocked"
            : mode === "tenant" && cell.isInSelectedStay
              ? "selected"
              : "available";

          return (
            <button
              key={cell.isoDate}
              type="button"
              className="vr-calendar-day"
              data-state={state}
              data-start={cell.isSelectedStart ? "true" : undefined}
              data-end={cell.isSelectedEnd ? "true" : undefined}
              onClick={() => handleCellClick(cell.isoDate, cell.isBlocked)}
              title={
                cell.isBlocked
                  ? `${cell.isoDate} — Blocked / Reserved`
                  : `${cell.isoDate} — Available`
              }
            >
              <span className="vr-calendar-day__dow">{cell.weekdayShort}</span>
              <strong className="vr-calendar-day__num">
                {cell.monthShort} {cell.dayOfMonth}
              </strong>
              <span className="vr-calendar-day__tag">
                {cell.isBlocked
                  ? "Booked"
                  : mode === "tenant" && cell.isSelectedStart
                    ? "Check-In"
                    : mode === "tenant" && cell.isSelectedEnd
                      ? "Check-Out"
                      : mode === "tenant" && cell.isInSelectedStay
                        ? "Your Stay"
                        : "Open"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="vr-calendar-legend">
        <span>
          <i className="vr-dot vr-dot--open" /> Available
        </span>
        {mode === "tenant" ? (
          <span>
            <i className="vr-dot vr-dot--selected" /> Your Selected Stay ({stayDays} Days)
          </span>
        ) : null}
        <span>
          <i className="vr-dot vr-dot--blocked" /> Blocked / Booked
        </span>
        {saveMessage ? <strong className="vr-calendar-saved">{saveMessage}</strong> : null}
      </div>
    </div>
  );
}
