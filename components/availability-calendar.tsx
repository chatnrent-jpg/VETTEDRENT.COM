"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addDaysIsoUtc,
  buildCalendarWindow,
  formatReadableDate,
  todayIsoUtc,
  type TierAvailabilitySchedule,
} from "@/lib/availability-calendar";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import {
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type InstantBookingConfirmation = {
  licenseId: string;
  licenseToken: string;
  agreementId: string;
  applicant: string;
  cohort: PurposeCohortId;
  credentialIdentifier: string;
  jurisdiction: string;
  tier: DailyRateTierId;
  weeklyRateCents: number;
  dailyRateCents: number;
  stayDays: number;
  checkInDate: string;
  validUntil: string;
  activeStaysCount: number;
  targetStaysCount: number;
  progressPercentage: number;
  reservedDatesCount: number;
  passportPdfHref: string;
  commercialLicensePdfHref: string;
};

const TIER_SUMMARY_LABELS: Record<DailyRateTierId, string> = {
  RoomSanctuary: "RoomSanctuary $45.00/day · $315/wk ($38.56/day net)",
  PrivateSuite: "PrivateSuite $75.00/day · $525/wk ($64.27/day net)",
  ExecutiveTownhome: "ExecutiveTownhome $106.43/day · $745/wk ($91.21/day net)",
};

export function AvailabilityCalendar({
  mode,
  tierId,
  stayDays,
  checkInIso,
  onSelectCheckIn,
  hostEmail,
  cohortId = "Contract-Assignment",
  jurisdictionCode = DEFAULT_JURISDICTION_CODE,
  applicantEmail,
  credentialIdentifier,
  context = "home",
  onBookingConfirmed,
}: {
  mode: "tenant" | "landlord";
  tierId: DailyRateTierId;
  stayDays: number;
  checkInIso: string;
  onSelectCheckIn: (isoDate: string) => void;
  hostEmail?: string;
  cohortId?: PurposeCohortId;
  jurisdictionCode?: string;
  applicantEmail?: string | null;
  credentialIdentifier?: string;
  context?: "home" | "underwriting" | "dashboard";
  onBookingConfirmed?: (confirmation: InstantBookingConfirmation) => void;
}) {
  const [schedules, setSchedules] = useState<
    Record<DailyRateTierId, TierAvailabilitySchedule> | null
  >(null);
  const [localBlocked, setLocalBlocked] = useState<string[]>([]);
  const [newlyBookedDates, setNewlyBookedDates] = useState<string[]>([]);
  const [windowOffsetDays, setWindowOffsetDays] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingConfirmation, setBookingConfirmation] =
    useState<InstantBookingConfirmation | null>(null);

  const tier = DAILY_RATE_PRESET_TIERS[tierId];
  const cohortRule = resolvePurposeCohort(cohortId);

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
          const map = (
            body as { schedules?: Record<DailyRateTierId, TierAvailabilitySchedule> }
          ).schedules;
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

  const weeklyBillingCycles = Math.max(1, Math.round((stayDays / 7) * 10) / 10);
  const cyclesLabel =
    Number.isInteger(weeklyBillingCycles)
      ? `${weeklyBillingCycles} weekly billing cycle${weeklyBillingCycles === 1 ? "" : "s"}`
      : `${weeklyBillingCycles.toFixed(1)} weekly billing cycles`;

  const underwritingBookingHref = `/underwriting?tier=${encodeURIComponent(tierId)}&weeklyCents=${tier.weeklyRateCents}&days=${stayDays}&checkIn=${encodeURIComponent(calendar.checkInIso)}&cohort=${encodeURIComponent(cohortRule.id)}&jurisdiction=${encodeURIComponent(jurisdictionCode)}`;

  async function persistHostBlockedDates(
    nextBlocked: string[],
    confirmationNote: string,
  ) {
    setSaving(true);
    setSaveMessage(confirmationNote);
    try {
      const res = await fetch("/api/host/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId,
          availableFromIso: todayIsoUtc(),
          blockedDates: nextBlocked,
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
        setSaveMessage(confirmationNote);
      } else {
        setSaveMessage("Could not save availability right now.");
      }
    } catch {
      setSaveMessage("Network error while saving availability.");
    } finally {
      setSaving(false);
    }
  }

  function handleCellClick(isoDate: string, isBlocked: boolean) {
    setBookingError(null);
    if (mode === "tenant") {
      if (isBlocked && !newlyBookedDates.includes(isoDate)) {
        setSaveMessage(
          `${formatReadableDate(isoDate)} is currently reserved. Click any green Available date to set Check-In.`,
        );
        return;
      }
      if (newlyBookedDates.includes(isoDate)) {
        // Allow picking another check-in date even after a test booking
        setNewlyBookedDates([]);
      }
      onSelectCheckIn(isoDate);
      const nextCheckOut = addDaysIsoUtc(isoDate, stayDays);
      setSaveMessage(
        `✓ Check-In set to ${formatReadableDate(isoDate)} → Check-Out ${formatReadableDate(nextCheckOut)} (${stayDays} days).`,
      );
      return;
    }

    // Landlord mode: optimistic toggle + immediate POST /api/host/availability persistence
    const willBeBlocked = !localBlocked.includes(isoDate);
    const nextBlocked = willBeBlocked
      ? [...localBlocked, isoDate].sort()
      : localBlocked.filter((d) => d !== isoDate);

    setLocalBlocked(nextBlocked);
    const statusLabel = willBeBlocked ? "Blocked (Reserved)" : "Available (Open)";
    void persistHostBlockedDates(
      nextBlocked,
      `✓ Saved: ${formatReadableDate(isoDate)} marked ${statusLabel} (${nextBlocked.length} blocked day${nextBlocked.length === 1 ? "" : "s"}).`,
    );
  }

  function blockNextSevenDays() {
    const start = todayIsoUtc();
    const nextSeven: string[] = [];
    for (let i = 0; i < 7; i++) {
      nextSeven.push(addDaysIsoUtc(start, i));
    }
    const merged = Array.from(new Set([...localBlocked, ...nextSeven])).sort();
    setLocalBlocked(merged);
    void persistHostBlockedDates(
      merged,
      `✓ Saved: Next 7 days blocked for ${tier.label} (${merged.length} total blocked days).`,
    );
  }

  function openAllDays() {
    setLocalBlocked([]);
    setNewlyBookedDates([]);
    void persistHostBlockedDates(
      [],
      `✓ Saved: All dates opened for ${tier.label} (0 blocked days).`,
    );
  }

  async function saveHostAvailability() {
    await persistHostBlockedDates(
      localBlocked,
      `✓ Saved! ${tier.label} availability is live for renters (${localBlocked.length} blocked day${localBlocked.length === 1 ? "" : "s"}).`,
    );
  }

  async function handleInstantBookStay() {
    setBookingBusy(true);
    setBookingError(null);

    try {
      const effectiveApplicant =
        applicantEmail?.trim() || "verified.lodger@vettedrent.com";
      const effectiveCredential =
        credentialIdentifier?.trim() || cohortRule.defaultIdentifier;

      const res = await fetch("/api/conversion/activate-stay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant: effectiveApplicant,
          cohort: cohortRule.id,
          jurisdiction: jurisdictionCode,
          tier: tierId,
          weeklyRateCents: tier.weeklyRateCents,
          stayDays,
          checkInDate: calendar.checkInIso,
          credentialIdentifier: effectiveCredential,
          coverageRatio: 3.25,
        }),
      });

      const body: unknown = await res.json();
      const record =
        body && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};

      if (!res.ok || record.ok !== true) {
        const errMsg =
          typeof record.error === "string"
            ? record.error
            : "Could not complete instant booking right now.";
        setBookingError(errMsg);
        return;
      }

      const lic =
        record.license && typeof record.license === "object"
          ? (record.license as Record<string, unknown>)
          : {};
      const reserved = Array.isArray(record.reservedDates)
        ? (record.reservedDates.filter((d): d is string => typeof d === "string"))
        : [];

      if (reserved.length > 0) {
        setNewlyBookedDates(reserved);
        setLocalBlocked((prev) => Array.from(new Set([...prev, ...reserved])).sort());
      } else {
        const fallbackReserved: string[] = [];
        for (let i = 0; i < stayDays; i++) {
          fallbackReserved.push(addDaysIsoUtc(calendar.checkInIso, i));
        }
        setNewlyBookedDates(fallbackReserved);
        setLocalBlocked((prev) =>
          Array.from(new Set([...prev, ...fallbackReserved])).sort(),
        );
      }

      const licenseId =
        typeof lic.license_id === "string"
          ? lic.license_id
          : `VR-LIC-${cohortRule.id.slice(0, 3).toUpperCase()}-${jurisdictionCode}`;
      const licenseToken =
        typeof lic.license_token === "string"
          ? lic.license_token
          : `vrtl_${jurisdictionCode.replace(/[^A-Z0-9]/g, "")}_${cohortRule.id.slice(0, 3).toUpperCase()}_ACTIVE`;
      const agreementId =
        typeof lic.agreement_id === "string"
          ? lic.agreement_id
          : "00000000-0000-4000-8000-000000000001";
      const validUntil =
        typeof lic.valid_until === "string"
          ? lic.valid_until
          : calendar.checkOutIso;
      const activeStaysCount =
        typeof record.activeStaysCount === "number"
          ? record.activeStaysCount
          : 5;
      const targetStaysCount =
        typeof record.targetStaysCount === "number"
          ? record.targetStaysCount
          : 45;
      const progressPercentage =
        typeof record.progressPercentage === "number"
          ? record.progressPercentage
          : Math.round((activeStaysCount / targetStaysCount) * 100);

      const passportQuery = new URLSearchParams({
        cohort: cohortRule.id,
        jurisdiction: jurisdictionCode,
        days: String(stayDays),
        weeklyCents: String(tier.weeklyRateCents),
        credentialId: effectiveCredential,
        ratio: "3.25",
        contractEnd: validUntil,
        stayEnd: validUntil,
        applicant: effectiveApplicant,
      });
      const passportPdfHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

      const licenseQuery = new URLSearchParams({
        format: "pdf",
        agreementId,
        cohort: cohortRule.id,
        jurisdiction: jurisdictionCode,
        days: String(stayDays),
        credentialId: effectiveCredential,
        ratio: "3.25",
        weeklyFeeCents: String(tier.weeklyRateCents),
        purposeEnd: validUntil,
        stayEnd: validUntil,
        licensee: effectiveApplicant,
      });
      const commercialLicensePdfHref = `/api/agreements/license?${licenseQuery.toString()}`;

      const confirmation: InstantBookingConfirmation = {
        licenseId,
        licenseToken,
        agreementId,
        applicant: effectiveApplicant,
        cohort: cohortRule.id,
        credentialIdentifier: effectiveCredential,
        jurisdiction: jurisdictionCode,
        tier: tierId,
        weeklyRateCents: tier.weeklyRateCents,
        dailyRateCents: tier.grossDailyRateCents,
        stayDays,
        checkInDate: calendar.checkInIso,
        validUntil,
        activeStaysCount,
        targetStaysCount,
        progressPercentage,
        reservedDatesCount: reserved.length || stayDays,
        passportPdfHref,
        commercialLicensePdfHref,
      };

      setBookingConfirmation(confirmation);
      setSaveMessage(
        `✓ Vettilo™ Pass Issued! ${formatReadableDate(calendar.checkInIso)} → ${formatReadableDate(validUntil)} (${stayDays} days) marked Booked / Reserved.`,
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("vettedrent:stay-activated", {
            detail: {
              milestone: record.milestone,
              license: record.license,
            },
          }),
        );
      }

      if (onBookingConfirmed) {
        onBookingConfirmed(confirmation);
      }
    } catch {
      setBookingError("Network error while activating stay and issuing Vettilo™ Pass.");
    } finally {
      setBookingBusy(false);
    }
  }

  return (
    <div
      className="vr-calendar-box relative z-10"
      style={{ position: "relative", zIndex: 10 }}
      aria-label="Availability calendar"
    >
      <div className="vr-calendar-head relative z-10">
        <div className="vr-calendar-title">
          <strong>
            {mode === "tenant"
              ? `Interactive Stay Calendar · ${tier.label}`
              : `Landlord Availability Setup · ${tier.label}`}
          </strong>
          <span>
            {mode === "tenant"
              ? `Click any open date to set Check-In: ${formatReadableDate(calendar.checkInIso)} → Check-Out: ${formatReadableDate(calendar.checkOutIso)} (${stayDays} days)`
              : "Click any date cell to immediately toggle Available (green) or Blocked (red) with live /api/host/availability persistence."}
          </span>
        </div>

        <div className="vr-calendar-controls">
          {mode === "tenant" ? (
            <span
              className="vr-calendar-status"
              data-available={!calendar.hasConflict ? "true" : "false"}
            >
              {!calendar.hasConflict
                ? `✓ ${stayDays}-Day Window Available (${formatReadableDate(calendar.checkInIso)} → ${formatReadableDate(calendar.checkOutIso)})`
                : newlyBookedDates.length > 0
                  ? `✓ Reserved by Your Vettilo™ Pass (${newlyBookedDates.length} days)`
                  : `⚠ ${calendar.conflictingDates.length} blocked day(s) in range`}
            </span>
          ) : (
            <>
              <button
                type="button"
                className="vr-cal-btn"
                disabled={saving}
                onClick={openAllDays}
              >
                Open All Days
              </button>
              <button
                type="button"
                className="vr-cal-btn"
                disabled={saving}
                onClick={blockNextSevenDays}
              >
                Block Next 7 Days
              </button>
              <button
                type="button"
                className="vr-cal-btn vr-cal-btn--gold"
                disabled={saving}
                onClick={() => void saveHostAvailability()}
              >
                {saving ? "Persisting..." : "Save Available Days →"}
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

      {saveMessage ? (
        <div
          className="vr-calendar-confirmation-banner relative z-10"
          role="status"
          aria-live="polite"
        >
          <strong>{saveMessage}</strong>
        </div>
      ) : null}

      <div
        className="vr-calendar-grid relative z-10"
        style={{ position: "relative", zIndex: 10 }}
        role="grid"
      >
        {calendar.cells.map((cell) => {
          const isNewlyBooked = newlyBookedDates.includes(cell.isoDate);
          const isInWindow = mode === "tenant" && cell.isInSelectedStay;
          const state =
            cell.isBlocked && !isNewlyBooked && !isInWindow
              ? "blocked"
              : isInWindow
                ? "selected"
                : cell.isBlocked
                  ? "blocked"
                  : "available";

          let badgeLabel = "AVAILABLE";
          if (mode === "landlord") {
            badgeLabel = cell.isBlocked ? "BLOCKED" : "AVAILABLE";
          } else if (cell.isSelectedStart) {
            badgeLabel = "CHECK-IN";
          } else if (cell.isSelectedEnd) {
            badgeLabel = "CHECK-OUT";
          } else if (cell.isInSelectedStay) {
            badgeLabel = isNewlyBooked ? "RESERVED" : "STAY WINDOW";
          } else if (cell.isBlocked) {
            badgeLabel = "BOOKED";
          }

          return (
            <button
              key={cell.isoDate}
              type="button"
              className="vr-calendar-day relative z-10"
              style={{ position: "relative", zIndex: 10, pointerEvents: "auto" }}
              data-state={state}
              data-start={cell.isSelectedStart ? "true" : undefined}
              data-end={cell.isSelectedEnd ? "true" : undefined}
              data-window={
                cell.isInSelectedStay && !cell.isSelectedStart && !cell.isSelectedEnd
                  ? "true"
                  : undefined
              }
              aria-pressed={
                mode === "tenant" ? cell.isInSelectedStay : cell.isBlocked
              }
              onClick={() => handleCellClick(cell.isoDate, cell.isBlocked)}
              title={
                mode === "landlord"
                  ? `${cell.isoDate} — Click to toggle Available / Blocked`
                  : cell.isBlocked && !isNewlyBooked
                    ? `${cell.isoDate} — Booked / Reserved`
                    : `${cell.isoDate} — Click to set Check-In (${stayDays} days)`
              }
            >
              <span className="vr-calendar-day__dow">{cell.weekdayShort}</span>
              <strong className="vr-calendar-day__num">
                {cell.monthShort} {cell.dayOfMonth}
              </strong>
              <span className="vr-calendar-day__tag">{badgeLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="vr-calendar-legend relative z-10">
        <span>
          <i className="vr-dot vr-dot--open" /> Available
        </span>
        {mode === "tenant" ? (
          <>
            <span>
              <i className="vr-dot vr-dot--selected" /> Check-In / Check-Out
            </span>
            <span>
              <i className="vr-dot vr-dot--window" /> Stay Window ({stayDays} Days)
            </span>
          </>
        ) : null}
        <span>
          <i className="vr-dot vr-dot--blocked" /> Blocked / Booked
        </span>
      </div>

      {/* LIVE SELECTED STAY BOOKING BAR */}
      {mode === "tenant" ? (
        <div
          className="vr-booking-bar relative z-10"
          style={{ position: "relative", zIndex: 10 }}
          role="region"
          aria-label="Selected Stay Booking Bar"
        >
          <div className="vr-booking-bar__summary">
            <div className="vr-booking-bar__dates">
              <span className="vr-booking-bar__kicker">
                Selected Stay Window · VettedRent.com · Powered by Vettilo™
              </span>
              <strong>
                {formatReadableDate(calendar.checkInIso)} →{" "}
                {formatReadableDate(calendar.checkOutIso)}{" "}
                <span>
                  ({stayDays} days / {cyclesLabel})
                </span>
              </strong>
            </div>
            <div className="vr-booking-bar__tier">
              <span>Selected Tier:</span>{" "}
              <strong>{TIER_SUMMARY_LABELS[tierId]}</strong>
              <span>
                · Total:{" "}
                <strong>
                  {formatCurrencyCents(tier.grossDailyRateCents * stayDays)}
                </strong>{" "}
                ($0.00 Security Deposit)
              </span>
            </div>
          </div>

          <div className="vr-booking-bar__actions">
            {context === "home" ? (
              <>
                <Link className="button" href={underwritingBookingHref}>
                  Book Selected Dates ({formatReadableDate(calendar.checkInIso)} →{" "}
                  {formatReadableDate(calendar.checkOutIso)}) →
                </Link>
                <button
                  type="button"
                  className="button button-secondary vr-test-book-btn"
                  disabled={bookingBusy}
                  onClick={() => void handleInstantBookStay()}
                >
                  {bookingBusy
                    ? "Issuing Vettilo™ Pass..."
                    : "1-Click Test Book & Issue Vettilo™ Pass"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="button"
                  disabled={bookingBusy}
                  onClick={() => void handleInstantBookStay()}
                >
                  {bookingBusy
                    ? "Issuing Vettilo™ Pass..."
                    : "Confirm Dates & Issue Vettilo™ Pass Now →"}
                </button>
                <button
                  type="button"
                  className="button button-secondary vr-test-book-btn"
                  disabled={bookingBusy}
                  onClick={() => void handleInstantBookStay()}
                >
                  {bookingBusy
                    ? "Booking..."
                    : "1-Click Test Book & Issue Vettilo™ Pass"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {bookingError ? (
        <p className="error relative z-10" role="alert">
          {bookingError}
        </p>
      ) : null}

      {/* INSTANT BOOKING CONFIRMATION CARD */}
      {bookingConfirmation ? (
        <div
          className="vr-booking-confirmation relative z-10"
          style={{ position: "relative", zIndex: 10 }}
          role="region"
          aria-label="Instant Booking Confirmation"
        >
          <div className="stay-card-head" style={{ flexWrap: "wrap" }}>
            <div>
              <p className="pass-kicker">
                Vettilo™ UMI Engine · Instant Booking &amp; Commercial License Confirmed
              </p>
              <h3>
                Booked: {formatReadableDate(bookingConfirmation.checkInDate)} →{" "}
                {formatReadableDate(bookingConfirmation.validUntil)} (
                {bookingConfirmation.stayDays} Days)
              </h3>
            </div>
            <span className="stay-badge" data-status="active">
              Active Stays: {bookingConfirmation.activeStaysCount} /{" "}
              {bookingConfirmation.targetStaysCount} ({bookingConfirmation.progressPercentage}%)
            </span>
          </div>

          <div className="vr-booking-confirmation__grid">
            <div>
              <span>Cryptographic License Token</span>
              <code>{bookingConfirmation.licenseToken}</code>
            </div>
            <div>
              <span>Agreement ID</span>
              <code>{bookingConfirmation.agreementId}</code>
            </div>
            <div>
              <span>Tier &amp; Weekly Rate</span>
              <strong>
                {bookingConfirmation.tier} ·{" "}
                {formatCurrencyCents(bookingConfirmation.dailyRateCents)}/day (
                {formatCurrencyCents(bookingConfirmation.weeklyRateCents)}/wk)
              </strong>
            </div>
            <div>
              <span>Cohort &amp; Jurisdiction</span>
              <strong>
                {bookingConfirmation.cohort} · {bookingConfirmation.jurisdiction}
              </strong>
            </div>
          </div>

          <div className="actions" style={{ marginTop: "0.4rem", flexWrap: "wrap" }}>
            <a
              className="button"
              href={bookingConfirmation.passportPdfHref}
              download={`VettedRent-Trust-Passport-${bookingConfirmation.cohort}.pdf`}
            >
              Download Trust Passport (PDF) ↓
            </a>
            <a
              className="button button-secondary"
              href={bookingConfirmation.commercialLicensePdfHref}
              download={`VettedRent-Commercial-License-${bookingConfirmation.cohort}-${bookingConfirmation.jurisdiction}.pdf`}
            >
              Download Commercial License (PDF) ↓
            </a>
            <Link className="button button-secondary" href="/dashboard">
              Open Stay Pass Dashboard →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
