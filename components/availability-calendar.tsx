"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  STAY_DURATION_OPTIONS,
  addDaysIsoUtc,
  buildCalendarWindow,
  formatReadableDate,
  todayIsoUtc,
  type TierAvailabilitySchedule,
} from "@/lib/availability-calendar";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  calculateDailyRateComparison,
  clampTierWeeklyRateCents,
  getTierRateOptions,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import {
  divideIntegerCentsHalfUp,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { PremiumCheckoutCard } from "@/components/premium-checkout-card";
import {
  SEASONAL_REMOTE_MIN_DAYS,
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type InstantBookingConfirmation = {
  licenseId: string;
  licenseToken: string;
  agreementId: string;
  applicantFullName?: string;
  applicantEmail?: string;
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

export function AvailabilityCalendar({
  mode,
  tierId,
  weeklyRateCents,
  onChangeWeeklyRateCents,
  stayDays,
  onChangeStayDays,
  checkInIso,
  onSelectCheckIn,
  hostEmail,
  cohortId = "Contract-Assignment",
  jurisdictionCode = DEFAULT_JURISDICTION_CODE,
  applicantFullName: initialApplicantFullName,
  applicantEmail: initialApplicantEmail,
  credentialIdentifier,
  context = "home",
  onChangeCohort,
  onBookingConfirmed,
}: {
  mode: "tenant" | "landlord";
  tierId: DailyRateTierId;
  weeklyRateCents?: number;
  onChangeWeeklyRateCents?: (weeklyRateCents: number) => void;
  stayDays: number;
  onChangeStayDays?: (stayDays: number) => void;
  checkInIso: string;
  onSelectCheckIn: (isoDate: string) => void;
  hostEmail?: string;
  cohortId?: PurposeCohortId;
  jurisdictionCode?: string;
  applicantFullName?: string | null;
  applicantEmail?: string | null;
  credentialIdentifier?: string;
  context?: "home" | "underwriting" | "dashboard";
  onChangeCohort?: (cohortId: PurposeCohortId) => void;
  onBookingConfirmed?: (confirmation: InstantBookingConfirmation) => void;
}) {
  const router = useRouter();
  const [schedules, setSchedules] = useState<
    Record<DailyRateTierId, TierAvailabilitySchedule> | null
  >(null);
  const [localBlocked, setLocalBlocked] = useState<string[]>([]);
  const [localWeeklyCents, setLocalWeeklyCents] = useState<number>(
    () => clampTierWeeklyRateCents(tierId, weeklyRateCents),
  );
  const [localStayDays, setLocalStayDays] = useState<number>(() =>
    Math.max(7, Math.min(90, stayDays || 7)),
  );
  const [guestFullName, setGuestFullName] = useState<string>(
    () => initialApplicantFullName?.trim() ?? "",
  );
  const [guestEmail, setGuestEmail] = useState<string>(
    () => initialApplicantEmail?.trim() ?? "",
  );
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
  const rateOptions = getTierRateOptions(tierId);
  const effectiveWeeklyCents = clampTierWeeklyRateCents(
    tierId,
    weeklyRateCents ?? localWeeklyCents,
  );
  const effectiveStayDays = Math.max(7, Math.min(90, localStayDays));
  const rateComparison = calculateDailyRateComparison(
    effectiveWeeklyCents,
    effectiveStayDays,
  );

  useEffect(() => {
    setLocalWeeklyCents(clampTierWeeklyRateCents(tierId, weeklyRateCents));
  }, [tierId, weeklyRateCents]);

  useEffect(() => {
    setLocalStayDays(Math.max(7, Math.min(90, stayDays || 7)));
  }, [stayDays]);

  useEffect(() => {
    if (initialApplicantFullName) {
      setGuestFullName(initialApplicantFullName.trim());
    }
  }, [initialApplicantFullName]);

  useEffect(() => {
    if (initialApplicantEmail) {
      setGuestEmail(initialApplicantEmail.trim());
    }
  }, [initialApplicantEmail]);

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
            const savedWeekly = map[tierId]?.weeklyRateCents;
            if (typeof savedWeekly === "number" && weeklyRateCents === undefined) {
              setLocalWeeklyCents(clampTierWeeklyRateCents(tierId, savedWeekly));
            }
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
  }, [tierId, weeklyRateCents]);

  useEffect(() => {
    if (schedules && schedules[tierId]) {
      setLocalBlocked(schedules[tierId].blockedDates);
      const savedWeekly = schedules[tierId].weeklyRateCents;
      if (typeof savedWeekly === "number" && weeklyRateCents === undefined) {
        setLocalWeeklyCents(clampTierWeeklyRateCents(tierId, savedWeekly));
      }
    }
  }, [schedules, tierId, weeklyRateCents]);

  const windowStartIso = addDaysIsoUtc(todayIsoUtc(), windowOffsetDays);
  const calendar = buildCalendarWindow({
    startIso: windowStartIso,
    totalDays: 35,
    checkInIso,
    stayDays: effectiveStayDays,
    blockedDates: localBlocked,
  });

  const underwritingBookingHref = `/underwriting?tier=${encodeURIComponent(tierId)}&weeklyCents=${effectiveWeeklyCents}&days=${effectiveStayDays}&checkIn=${encodeURIComponent(calendar.checkInIso)}&cohort=${encodeURIComponent(cohortRule.id)}&jurisdiction=${encodeURIComponent(jurisdictionCode)}${guestFullName.trim() ? `&fullName=${encodeURIComponent(guestFullName.trim())}` : ""}${guestEmail.trim() ? `&email=${encodeURIComponent(guestEmail.trim())}` : ""}`;

  function handleDurationChange(nextDaysRaw: number) {
    const minDays =
      cohortRule.id === "Seasonal-Remote" ? SEASONAL_REMOTE_MIN_DAYS : 7;
    const clamped = Math.max(minDays, Math.min(90, Math.round(nextDaysRaw) || 7));
    setLocalStayDays(clamped);
    onChangeStayDays?.(clamped);
    const nextCheckOut = addDaysIsoUtc(calendar.checkInIso, clamped);
    setSaveMessage(
      `✓ Stay length set to ${clamped} days (${Math.round((clamped / 7) * 10) / 10} weeks): ${formatReadableDate(calendar.checkInIso)} → ${formatReadableDate(nextCheckOut)}. Click any start date below to select your ${clamped}-day span.`,
    );
  }

  async function persistHostBlockedDates(
    nextBlocked: string[],
    confirmationNote: string,
    overrideWeeklyCents?: number,
  ) {
    const targetWeeklyCents = clampTierWeeklyRateCents(
      tierId,
      overrideWeeklyCents ?? effectiveWeeklyCents,
    );
    const targetDailyCents = divideIntegerCentsHalfUp(targetWeeklyCents, 7);
    setSaving(true);
    setSaveMessage(confirmationNote);
    try {
      const res = await fetch("/api/host/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId,
          weeklyRateCents: targetWeeklyCents,
          configuredDailyRateCents: targetDailyCents,
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

  function handleRateSelectChange(nextWeeklyCentsRaw: number) {
    const clamped = clampTierWeeklyRateCents(tierId, nextWeeklyCentsRaw);
    setLocalWeeklyCents(clamped);
    if (onChangeWeeklyRateCents) {
      onChangeWeeklyRateCents(clamped);
    }
    const nextDailyCents = divideIntegerCentsHalfUp(clamped, 7);
    if (mode === "landlord") {
      void persistHostBlockedDates(
        localBlocked,
        `✓ Saved ${tier.shortLabel} rate: ${formatCurrencyCents(nextDailyCents)}/day (${formatCurrencyCents(clamped)}/wk).`,
        clamped,
      );
    } else {
      setSaveMessage(
        `✓ Rate updated to ${formatCurrencyCents(nextDailyCents)}/day (${formatCurrencyCents(clamped)}/wk).`,
      );
    }
  }

  function handleCellClick(isoDate: string, isBlocked: boolean) {
    setBookingError(null);
    if (mode === "tenant") {
      if (isBlocked && !newlyBookedDates.includes(isoDate)) {
        setSaveMessage(
          `${formatReadableDate(isoDate)} is already BOOKED. Click any Available date to select the next ${effectiveStayDays} days.`,
        );
        return;
      }
      onSelectCheckIn(isoDate);
      const nextCheckOut = addDaysIsoUtc(isoDate, effectiveStayDays);

      if (guestFullName.trim().length >= 2 && guestEmail.includes("@")) {
        const autoSpanDates: string[] = [];
        for (let i = 0; i < effectiveStayDays; i++) {
          autoSpanDates.push(addDaysIsoUtc(isoDate, i));
        }
        setNewlyBookedDates(autoSpanDates);
        setLocalBlocked((prev) => {
          const withoutPrevNew = prev.filter((d) => !newlyBookedDates.includes(d));
          return Array.from(new Set([...withoutPrevNew, ...autoSpanDates])).sort();
        });
        void handleInstantBookStay(isoDate, effectiveStayDays);
      } else {
        setSaveMessage(
          `✓ Selected ${effectiveStayDays}-day stay: ${formatReadableDate(isoDate)} → ${formatReadableDate(nextCheckOut)}. Sign below to activate your Stay Passport.`,
        );
        document.getElementById("legalFullName")?.focus();
      }
      return;
    }

    // Landlord mode: clicking an available date books the next `effectiveStayDays` days (or unbooks if already booked)
    const isAlreadyBooked = localBlocked.includes(isoDate);
    if (isAlreadyBooked) {
      const nextBlocked = localBlocked.filter((d) => d !== isoDate);
      setLocalBlocked(nextBlocked);
      void persistHostBlockedDates(
        nextBlocked,
        `✓ Saved: ${formatReadableDate(isoDate)} marked AVAILABLE.`,
      );
      return;
    }

    const spanToBook: string[] = [];
    for (let i = 0; i < effectiveStayDays; i++) {
      spanToBook.push(addDaysIsoUtc(isoDate, i));
    }
    const nextBlocked = Array.from(new Set([...localBlocked, ...spanToBook])).sort();
    setLocalBlocked(nextBlocked);
    const endIso = addDaysIsoUtc(isoDate, effectiveStayDays);
    void persistHostBlockedDates(
      nextBlocked,
      `✓ Automatically booked ${effectiveStayDays} days (${formatReadableDate(isoDate)} → ${formatReadableDate(endIso)}) — marked BOOKED.`,
    );
  }

  function bookNextSpanDays() {
    const start = calendar.checkInIso || todayIsoUtc();
    const span: string[] = [];
    for (let i = 0; i < effectiveStayDays; i++) {
      span.push(addDaysIsoUtc(start, i));
    }
    const merged = Array.from(new Set([...localBlocked, ...span])).sort();
    setLocalBlocked(merged);
    void persistHostBlockedDates(
      merged,
      `✓ Saved: Next ${effectiveStayDays} days marked BOOKED for ${tier.shortLabel}.`,
    );
  }

  function openAllDays() {
    setLocalBlocked([]);
    setNewlyBookedDates([]);
    void persistHostBlockedDates(
      [],
      `✓ Saved: All dates opened for ${tier.shortLabel}.`,
    );
  }

  async function saveHostAvailability() {
    await persistHostBlockedDates(
      localBlocked,
      `✓ Saved! ${tier.shortLabel} availability is live for guests.`,
    );
  }

  async function handleInstantBookStay(
    overrideCheckInIso?: string,
    overrideStayDays?: number,
  ) {
    const trimmedName = guestFullName.trim();
    const trimmedEmail = guestEmail.trim();

    if (trimmedName.length < 2) {
      setBookingError(
        "Please input your full legal name to affirm documentation execution.",
      );
      document.getElementById("legalFullName")?.focus();
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setBookingError(
        "Please enter a verified email address to bind your Stay Passport.",
      );
      return;
    }

    const targetCheckInIso = overrideCheckInIso ?? calendar.checkInIso;
    const targetStayDays = overrideStayDays ?? effectiveStayDays;
    const targetCheckOutIso = addDaysIsoUtc(targetCheckInIso, targetStayDays);

    setBookingBusy(true);
    setBookingError(null);

    try {
      const effectiveApplicant = `${trimmedName} (${trimmedEmail})`;
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
          weeklyRateCents: effectiveWeeklyCents,
          stayDays: targetStayDays,
          checkInDate: targetCheckInIso,
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
        for (let i = 0; i < targetStayDays; i++) {
          fallbackReserved.push(addDaysIsoUtc(targetCheckInIso, i));
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
          : targetCheckOutIso;
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
        days: String(targetStayDays),
        weeklyCents: String(effectiveWeeklyCents),
        credentialId: effectiveCredential,
        ratio: "3.25",
        contractEnd: validUntil,
        stayEnd: validUntil,
        fullName: trimmedName,
        email: trimmedEmail,
        applicant: effectiveApplicant,
      });
      const passportPdfHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

      const licenseQuery = new URLSearchParams({
        format: "pdf",
        agreementId,
        cohort: cohortRule.id,
        jurisdiction: jurisdictionCode,
        days: String(targetStayDays),
        credentialId: effectiveCredential,
        ratio: "3.25",
        weeklyFeeCents: String(effectiveWeeklyCents),
        purposeEnd: validUntil,
        stayEnd: validUntil,
        fullName: trimmedName,
        email: trimmedEmail,
        licensee: effectiveApplicant,
      });
      const commercialLicensePdfHref = `/api/agreements/license?${licenseQuery.toString()}`;

      const confirmation: InstantBookingConfirmation = {
        licenseId,
        licenseToken,
        agreementId,
        applicantFullName: trimmedName,
        applicantEmail: trimmedEmail,
        applicant: effectiveApplicant,
        cohort: cohortRule.id,
        credentialIdentifier: effectiveCredential,
        jurisdiction: jurisdictionCode,
        tier: tierId,
        weeklyRateCents: effectiveWeeklyCents,
        dailyRateCents: rateComparison.grossDailyRateCents,
        stayDays: targetStayDays,
        checkInDate: targetCheckInIso,
        validUntil,
        activeStaysCount,
        targetStaysCount,
        progressPercentage,
        reservedDatesCount: reserved.length || targetStayDays,
        passportPdfHref,
        commercialLicensePdfHref,
      };

      setBookingConfirmation(confirmation);
      setSaveMessage(
        `✓ Executed & BOOKED (${targetStayDays} days) for ${trimmedName} (${trimmedEmail}): ${formatReadableDate(targetCheckInIso)} → ${formatReadableDate(validUntil)}.`,
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
      setBookingError("Network error while confirming reservation.");
    } finally {
      setBookingBusy(false);
    }
  }

  const isSimpleGuestHome = mode === "tenant" && context === "home";

  if (isSimpleGuestHome && bookingConfirmation) {
    return <BookingConfirmation confirmation={bookingConfirmation} />;
  }

  if (isSimpleGuestHome) {
    return (
      <div className="vr-simple-book" aria-label="Book your stay">
        <div className="vr-simple-book__when">
          <label>
            <span>Check-in</span>
            <input
              type="date"
              aria-label="Check-in date"
              value={calendar.checkInIso}
              onChange={(event) => {
                if (event.target.value) {
                  onSelectCheckIn(event.target.value);
                }
              }}
            />
          </label>
          <label>
            <span>How long</span>
            <select
              aria-label="Stay length"
              value={effectiveStayDays}
              onChange={(event) => handleDurationChange(Number(event.target.value))}
            >
              {STAY_DURATION_OPTIONS.map((opt) => (
                <option
                  key={opt.days}
                  value={opt.days}
                  disabled={
                    cohortRule.id === "Seasonal-Remote" &&
                    opt.days < SEASONAL_REMOTE_MIN_DAYS
                  }
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PremiumCheckoutCard
          tierId={tierId}
          dailyRateCents={rateComparison.grossDailyRateCents}
          stayDays={effectiveStayDays}
          checkInIso={calendar.checkInIso}
          checkOutIso={calendar.checkOutIso}
          jurisdictionCode={jurisdictionCode}
          cohortId={cohortRule.id}
          guestFullName={guestFullName}
          guestEmail={guestEmail}
          onChangeFullName={(value) => {
            setGuestFullName(value);
            setBookingError(null);
          }}
          onChangeEmail={(value) => {
            setGuestEmail(value);
            setBookingError(null);
          }}
          onChangeCohort={onChangeCohort}
          submitBusy={bookingBusy}
          errorMessage={bookingError}
          onSubmit={() => {
            const signed = guestFullName.trim().length >= 2;
            if (!signed || !guestEmail.includes("@")) {
              setBookingError(
                "Please input your full legal name and verified email to affirm documentation execution.",
              );
              return;
            }
            if (effectiveStayDays >= 30) {
              router.push(underwritingBookingHref);
              return;
            }
            void handleInstantBookStay();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="vr-calendar-box relative z-10"
      style={{ position: "relative", zIndex: 10 }}
      aria-label="7 to 90 Day Weekly & Mid-Term Booking Calendar"
    >
      <div className="vr-calendar-head relative z-10">
        <div className="vr-calendar-title">
          <strong>
            {mode === "tenant"
              ? `Choose your ${effectiveStayDays}-day stay`
              : `Host 7-to-90-Day Availability Calendar · ${tier.shortLabel}`}
          </strong>
          <span>
            {mode === "tenant"
              ? `Click any open start date to reserve ${formatReadableDate(calendar.checkInIso)} → ${formatReadableDate(calendar.checkOutIso)}.`
              : `Select your stay length, then click any start day to book or open dates.`}
          </span>
        </div>

        <div className="vr-calendar-controls">
          {/* 1-CLICK 7 TO 90 DAY STAY LENGTH SELECTOR */}
          <label
            className="vr-cal-btn vr-cal-btn--gold"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
          >
            <span>Stay Length:</span>
            <select
              aria-label="Stay Length (7 to 90 Days)"
              value={effectiveStayDays}
              onChange={(e) => handleDurationChange(Number(e.target.value))}
              style={{
                background: "transparent",
                color: "inherit",
                border: "none",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {STAY_DURATION_OPTIONS.map((opt) => (
                <option
                  key={opt.days}
                  value={opt.days}
                  disabled={
                    cohortRule.id === "Seasonal-Remote" &&
                    opt.days < SEASONAL_REMOTE_MIN_DAYS
                  }
                  style={{ color: "#0b1220" }}
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {mode === "landlord" ? (
            <label
              className="vr-cal-btn"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
            >
              <span>Rate:</span>
              <select
                aria-label={`${tier.shortLabel} rate`}
                value={effectiveWeeklyCents}
                onChange={(e) => handleRateSelectChange(Number(e.target.value))}
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "none",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {rateOptions.map((opt) => (
                  <option
                    key={opt.weeklyRateCents}
                    value={opt.weeklyRateCents}
                    style={{ color: "#0b1220" }}
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {mode === "tenant" ? (
            <span
              className="vr-calendar-status"
              data-available={!calendar.hasConflict ? "true" : "false"}
            >
              {!calendar.hasConflict
                ? `✓ ${effectiveStayDays}-Day Span Available (${formatReadableDate(calendar.checkInIso)} → ${formatReadableDate(calendar.checkOutIso)})`
                : newlyBookedDates.length > 0
                  ? `✓ BOOKED (${newlyBookedDates.length} days)`
                  : `⚠ ${calendar.conflictingDates.length} BOOKED day(s) in range`}
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
                onClick={bookNextSpanDays}
              >
                Book Next {effectiveStayDays} Days
              </button>
              <button
                type="button"
                className="vr-cal-btn vr-cal-btn--gold"
                disabled={saving}
                onClick={() => void saveHostAvailability()}
              >
                {saving ? "Saving..." : "Save Calendar →"}
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

      {mode === "landlord" ? (
        <div
          className="vr-swipe-sort-pills"
          role="group"
          aria-label="Quick select 7 to 90 day booking duration"
          style={{ justifyContent: "flex-start" }}
        >
          {STAY_DURATION_OPTIONS.map((opt) => {
            const isActive = effectiveStayDays === opt.days;
            return (
              <button
                key={opt.days}
                type="button"
                aria-pressed={isActive}
                disabled={
                  cohortRule.id === "Seasonal-Remote" &&
                  opt.days < SEASONAL_REMOTE_MIN_DAYS
                }
                onClick={() => handleDurationChange(opt.days)}
                className={`vr-swipe-pill${isActive ? " vr-swipe-pill--active" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}

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
          const isBookedCell = cell.isBlocked || isNewlyBooked;
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
          if (isBookedCell) {
            badgeLabel = "BOOKED";
          } else if (mode === "tenant" && cell.isSelectedStart) {
            badgeLabel = "CHECK-IN";
          } else if (mode === "tenant" && cell.isSelectedEnd) {
            badgeLabel = "CHECK-OUT";
          } else if (mode === "tenant" && cell.isInSelectedStay) {
            badgeLabel = `BOOKED (${effectiveStayDays}D)`;
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
                mode === "tenant" ? cell.isInSelectedStay : isBookedCell
              }
              onClick={() => handleCellClick(cell.isoDate, cell.isBlocked)}
              title={
                isBookedCell
                  ? `${cell.isoDate} — BOOKED`
                  : `${cell.isoDate} — Click to select ${effectiveStayDays} days`
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
          <i className="vr-dot vr-dot--open" /> Available (Click Any Day to Select{" "}
          {effectiveStayDays} Days)
        </span>
        {mode === "tenant" ? (
          <>
            <span>
              <i className="vr-dot vr-dot--selected" /> Check-In / Check-Out
            </span>
            <span>
              <i className="vr-dot vr-dot--window" /> {effectiveStayDays}-Day Booking Span
            </span>
          </>
        ) : null}
        <span>
          <i className="vr-dot vr-dot--blocked" /> Booked
        </span>
      </div>

      {mode === "tenant" ? (
        <PremiumCheckoutCard
          tierId={tierId}
          dailyRateCents={rateComparison.grossDailyRateCents}
          stayDays={effectiveStayDays}
          checkInIso={calendar.checkInIso}
          checkOutIso={calendar.checkOutIso}
          jurisdictionCode={jurisdictionCode}
          cohortId={cohortRule.id}
          guestFullName={guestFullName}
          guestEmail={guestEmail}
          onChangeFullName={(value) => {
            setGuestFullName(value);
            setBookingError(null);
          }}
          onChangeEmail={(value) => {
            setGuestEmail(value);
            setBookingError(null);
          }}
          onChangeCohort={onChangeCohort}
          submitBusy={bookingBusy}
          errorMessage={bookingError}
          onSubmit={() => {
            const signed = guestFullName.trim().length >= 2;
            if (!signed || !guestEmail.includes("@")) {
              setBookingError(
                "Please input your full legal name and verified email to affirm documentation execution.",
              );
              return;
            }
            if (effectiveStayDays >= 30 && context === "home") {
              router.push(underwritingBookingHref);
              return;
            }
            void handleInstantBookStay();
          }}
        />
      ) : null}

      {bookingError && mode !== "tenant" ? (
        <p className="error relative z-10" role="alert">
          {bookingError}
        </p>
      ) : null}

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
                Signed &amp; Executed · Licensee:{" "}
                {bookingConfirmation.applicantFullName || bookingConfirmation.applicant}
              </p>
              <h3>
                BOOKED: {formatReadableDate(bookingConfirmation.checkInDate)} →{" "}
                {formatReadableDate(bookingConfirmation.validUntil)} (
                {bookingConfirmation.stayDays} Days)
              </h3>
            </div>
            <span className="stay-badge" data-status="active">
              Signed: /s/ {bookingConfirmation.applicantFullName || "Verified Guest"}
            </span>
          </div>

          <div className="vr-booking-confirmation__grid">
            <div>
              <span>Licensee Legal Full Name</span>
              <strong>
                {bookingConfirmation.applicantFullName || bookingConfirmation.applicant}
              </strong>
            </div>
            <div>
              <span>Verified Email</span>
              <strong>{bookingConfirmation.applicantEmail || bookingConfirmation.applicant}</strong>
            </div>
            <div>
              <span>Space Tier &amp; Rate</span>
              <strong>
                {bookingConfirmation.tier} ·{" "}
                {formatCurrencyCents(bookingConfirmation.dailyRateCents)}/day (
                {formatCurrencyCents(bookingConfirmation.weeklyRateCents)}/wk)
              </strong>
            </div>
            <div>
              <span>Electronic Signature &amp; Token</span>
              <code>
                /s/ {bookingConfirmation.applicantFullName} · {bookingConfirmation.licenseToken}
              </code>
            </div>
          </div>

          <div className="actions" style={{ marginTop: "0.4rem", flexWrap: "wrap" }}>
            <a
              className="button"
              href={bookingConfirmation.passportPdfHref}
              download={`VettedRent-Trust-Passport-${(bookingConfirmation.applicantFullName || "Guest").replace(/\s+/g, "-")}.pdf`}
            >
              Download Signed Stay Passport (PDF) ↓
            </a>
            <a
              className="button button-secondary"
              href={bookingConfirmation.commercialLicensePdfHref}
              download={`VettedRent-Commercial-License-${(bookingConfirmation.applicantFullName || "Guest").replace(/\s+/g, "-")}.pdf`}
            >
              Download Signed Commercial License (PDF) ↓
            </a>
            <Link className="button button-secondary" href="/dashboard">
              Open Digital Key Dashboard →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
