"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { InstantBookingConfirmation } from "@/components/availability-calendar";
import { BookingConfirmation } from "@/components/booking-confirmation";
import { SimpleShell } from "@/components/simple-shell";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import {
  STAY_DURATION_OPTIONS,
  addDaysIsoUtc,
  formatReadableDate,
  todayIsoUtc,
} from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  MARYLAND_JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  SPACE_TIER_CARDS,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { intendedStayLengthDays } from "@/lib/geo-compliance";
import { divideIntegerCentsHalfUp } from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { PropertyCardProps } from "@/src/components/ListingGrid";
import {
  PURPOSE_COHORTS,
  SEASONAL_REMOTE_MIN_DAYS,
  defaultContractTerm,
  resolvePurposeCohort,
  type ContractTerm,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

const DEFAULT_WEEKLY_STAY_CENTS = 31500;

type CalendarState = "idle" | "loading" | "ready" | "error";

/** First check-in on or after `fromIso` whose whole stay is clear of `taken`, within a year. */
function nextOpenCheckIn(fromIso: string, stayDays: number, taken: ReadonlySet<string>): string | null {
  for (let offset = 0; offset < 365; offset++) {
    const start = addDaysIsoUtc(fromIso, offset);
    let clear = true;
    for (let i = 0; i < stayDays; i++) {
      if (taken.has(addDaysIsoUtc(start, i))) {
        clear = false;
        break;
      }
    }
    if (clear) {
      return start;
    }
  }
  return null;
}

export function PlaidLinkScreen({
  liveListing = null,
  listingRequested = false,
  catalogIsLive = false,
}: {
  /** The published listing named in the URL, resolved on the server. It sets tier and price. */
  liveListing?: PropertyCardProps | null;
  /** True when the URL named a listing (even one that is no longer available). */
  listingRequested?: boolean;
  /** True once any real listing is published; generic bookings then need a listing. */
  catalogIsLive?: boolean;
}) {
  const router = useRouter();
  const initial = defaultContractTerm();
  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>(
    liveListing?.tier ?? "RoomSanctuary",
  );
  const [weeklyStayCents, setWeeklyStayCents] = useState<number>(
    liveListing ? liveListing.weeklyRate * 100 : DEFAULT_WEEKLY_STAY_CENTS,
  );
  const [takenDates, setTakenDates] = useState<Set<string>>(new Set());
  const [calendarState, setCalendarState] = useState<CalendarState>(
    liveListing ? "loading" : "idle",
  );
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const [guestFullName, setGuestFullName] = useState<string>("");
  const [prefilledLeadEmail, setPrefilledLeadEmail] = useState<string>("");
  const [licenseSigned, setLicenseSigned] = useState<boolean>(false);
  const [prefilledStayDays, setPrefilledStayDays] = useState<number | null>(null);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [activatingPass, setActivatingPass] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] =
    useState<InstantBookingConfirmation | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const weeklyCentsParam = params.get("weeklyCents");
    const tierParam = params.get("tier");
    const cohortParam = params.get("cohort");
    const daysParam = params.get("days");
    const checkInParam = params.get("checkIn");
    const jurisdictionParam = params.get("jurisdiction");
    const fullNameParam = params.get("fullName");
    const emailParam = params.get("email");

    if (
      !weeklyCentsParam &&
      !tierParam &&
      !cohortParam &&
      !daysParam &&
      !checkInParam &&
      !jurisdictionParam &&
      !fullNameParam &&
      !emailParam
    ) {
      return;
    }

    const parsedWeekly = weeklyCentsParam ? Number(weeklyCentsParam) : NaN;
    let resolvedTier: DailyRateTierId = "RoomSanctuary";
    if (
      tierParam === "RoomSanctuary" ||
      tierParam === "PrivateSuite" ||
      tierParam === "ExecutiveTownhome"
    ) {
      resolvedTier = tierParam;
    } else if (Number.isFinite(parsedWeekly)) {
      if (parsedWeekly >= 74500) {
        resolvedTier = "ExecutiveTownhome";
      } else if (parsedWeekly === 52500 || parsedWeekly === 49000) {
        resolvedTier = "PrivateSuite";
      }
    }

    // A real listing sets its own tier and price; the URL must not override them.
    if (!liveListing) {
      setSelectedTierId(resolvedTier);
      setWeeklyStayCents(
        clampTierWeeklyRateCents(
          resolvedTier,
          Number.isFinite(parsedWeekly) ? parsedWeekly : undefined,
        ),
      );
    }

    const startIso =
      checkInParam && /^\d{4}-\d{2}-\d{2}$/.test(checkInParam)
        ? checkInParam
        : todayIsoUtc();
    setCheckInIso(startIso);

    const matchedCohort = resolvePurposeCohort(cohortParam);
    const parsedDays = daysParam ? Number(daysParam) : NaN;
    const stayDays =
      Number.isFinite(parsedDays) && parsedDays >= 7 && parsedDays <= 365
        ? Math.max(matchedCohort.minStayDays, Math.round(parsedDays))
        : matchedCohort.defaultStayDays;
    const targetEndDate = addDaysIsoUtc(startIso, stayDays);

    setContract({
      credentialType: matchedCohort.id,
      credentialIdentifier: matchedCohort.defaultIdentifier,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    });
    setPrefilledStayDays(stayDays);

    if (jurisdictionParam) {
      const rule = resolveJurisdiction(jurisdictionParam);
      if (rule) {
        setJurisdictionCode(rule.code);
      }
    }

    if (fullNameParam && fullNameParam.trim() !== "") {
      setGuestFullName(fullNameParam.trim());
    }

    if (emailParam && emailParam.trim() !== "") {
      setPrefilledLeadEmail(emailParam.trim());
    }
  }, [liveListing]);

  // A real listing owns its calendar: load which days are taken so guests only pick open dates.
  const liveListingId = liveListing?.id ?? null;
  useEffect(() => {
    if (!liveListingId) {
      return;
    }
    let cancelled = false;
    setCalendarState("loading");
    async function loadTakenDates() {
      try {
        const res = await fetch(
          `/api/listings/availability?listingId=${encodeURIComponent(liveListingId ?? "")}`,
          { cache: "no-store" },
        );
        const body: unknown = await res.json();
        const dates =
          body && typeof body === "object"
            ? (body as { unavailableDates?: unknown }).unavailableDates
            : undefined;
        if (cancelled) {
          return;
        }
        if (!res.ok || !Array.isArray(dates)) {
          setCalendarState("error");
          return;
        }
        setTakenDates(new Set(dates.filter((d): d is string => typeof d === "string")));
        setCalendarState("ready");
      } catch {
        if (!cancelled) {
          setCalendarState("error");
        }
      }
    }
    void loadTakenDates();
    return () => {
      cancelled = true;
    };
  }, [liveListingId]);

  const clampedWeeklyStayCents = clampTierWeeklyRateCents(
    selectedTierId,
    weeklyStayCents,
  );

  const { phase, error, decision, ready, open, canSimulate, simulate } = usePlaidLinkFlow(
    clampedWeeklyStayCents,
    contract,
    jurisdictionCode,
  );
  const checking = phase === "checking";
  const activeCohort = resolvePurposeCohort(contract.credentialType);
  const selectedStayDays = Math.max(
    activeCohort.minStayDays,
    prefilledStayDays ?? intendedStayLengthDays(contract.intendedStayEndDate),
  );
  const checkOutIso = addDaysIsoUtc(checkInIso, selectedStayDays);
  const selectedCard =
    SPACE_TIER_CARDS.find((card) => card.id === selectedTierId) ?? SPACE_TIER_CARDS[0];

  const today = todayIsoUtc();
  const conflictingDays: string[] = [];
  if (liveListing && calendarState === "ready") {
    for (let i = 0; i < selectedStayDays; i++) {
      const day = addDaysIsoUtc(checkInIso, i);
      if (takenDates.has(day)) {
        conflictingDays.push(day);
      }
    }
  }
  const datesTaken = conflictingDays.length > 0;
  const suggestedCheckIn =
    datesTaken && liveListing
      ? nextOpenCheckIn(checkInIso < today ? today : checkInIso, selectedStayDays, takenDates)
      : null;
  const listingBlocking = Boolean(liveListing) && calendarState !== "ready";
  const priceLabel = liveListing
    ? `$${liveListing.weeklyRate.toLocaleString("en-US")} / week`
    : selectedCard.weeklyPriceLabel;

  function selectTier(nextTierId: DailyRateTierId) {
    setSelectedTierId(nextTierId);
    setWeeklyStayCents(DAILY_RATE_PRESET_TIERS[nextTierId].weeklyRateCents);
  }

  function selectCohort(cohortId: PurposeCohortId) {
    const nextCohort = resolvePurposeCohort(cohortId);
    const nextDays = Math.max(nextCohort.minStayDays, selectedStayDays);
    const targetEndDate = addDaysIsoUtc(checkInIso, nextDays);
    setContract({
      credentialType: nextCohort.id,
      credentialIdentifier: nextCohort.defaultIdentifier,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    });
    setPrefilledStayDays(nextDays);
  }

  function updateStayDurationDays(days: number) {
    const clamped = Math.max(activeCohort.minStayDays, Math.min(365, Math.round(days)));
    const targetEndDate = addDaysIsoUtc(checkInIso, clamped);
    setPrefilledStayDays(clamped);
    setContract((prev) => ({
      ...prev,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    }));
  }

  function updateCheckInDate(nextCheckInIso: string) {
    setCheckInIso(nextCheckInIso);
    const targetEndDate = addDaysIsoUtc(nextCheckInIso, selectedStayDays);
    setContract((prev) => ({
      ...prev,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    }));
  }

  async function handleActivateWeeklyBillingAndPass() {
    const trimmedName = guestFullName.trim();
    const trimmedEmail = prefilledLeadEmail.trim();

    if (trimmedName.length < 2) {
      setActivationError(
        "Please enter your full name so your stay agreement and stay pass are issued in your name.",
      );
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setActivationError(
        "Please enter your email so we can send your stay agreement and stay pass.",
      );
      return;
    }
    if (!licenseSigned) {
      setActivationError(
        "Please check the box to sign the Stay Agreement before booking.",
      );
      return;
    }
    if (liveListing) {
      if (calendarState !== "ready") {
        setActivationError(
          calendarState === "error"
            ? "We couldn't load this stay's open dates. Refresh the page and try again."
            : "Still loading this stay's open dates. Try again in a moment.",
        );
        return;
      }
      if (checkInIso < todayIsoUtc()) {
        setActivationError("Pick a check-in date that isn't in the past.");
        return;
      }
      if (datesTaken) {
        setActivationError("Some of those dates are already taken. Pick different dates.");
        return;
      }
    }

    setActivatingPass(true);
    setActivationMessage(null);
    setActivationError(null);

    try {
      let signedInEmail: string | null = null;
      let signedInUserId: string | null = null;
      let token: string | null = null;

      try {
        const supabase = getSupabaseBrowserClient();
        const session = await supabase.auth.getSession();
        token = session.data.session?.access_token ?? null;
        signedInEmail = session.data.session?.user?.email ?? null;
        signedInUserId = session.data.session?.user?.id ?? null;
      } catch {
        // Proceed with automated conversion engine even if not signed in yet
      }

      const finalEmail = signedInEmail ?? trimmedEmail;
      const effectiveApplicant = `${trimmedName} (${finalEmail})`;

      const convRes = await fetch("/api/conversion/activate-stay", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant: effectiveApplicant,
          cohort: contract.credentialType,
          jurisdiction: jurisdictionCode,
          tier: selectedTierId,
          ...(liveListing ? { listingId: liveListing.id } : {}),
          weeklyRateCents: clampedWeeklyStayCents,
          stayDays: selectedStayDays,
          checkInDate: checkInIso,
          credentialIdentifier: contract.credentialIdentifier,
          coverageRatio: decision?.ratio ?? 3.0,
        }),
      });
      const convBody: unknown = await convRes.json();
      const convRecord =
        convBody && typeof convBody === "object"
          ? (convBody as Record<string, unknown>)
          : {};

      if (!convRes.ok || convRecord.ok !== true) {
        const errText =
          typeof convRecord.error === "string"
            ? convRecord.error
            : "We couldn't complete your booking. Please try again.";
        setActivationError(errText);
        return;
      }

      if (token && signedInUserId) {
        try {
          const cycleRes = await fetch("/api/billing/weekly-cycle", {
            method: "POST",
            credentials: "same-origin",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cycleRes.ok) {
            await fetch("/api/billing/create-subscription", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerEmail: finalEmail,
                hostAccountId: "acct_simulated_host",
                totalCents: weeklyStayCents,
                tenantId: signedInUserId,
                hostId: signedInUserId,
                listingId: "vr-weekly-room",
                seamDeviceId: "seam_device_mock",
              }),
            });
          }
        } catch {
          // Conversion engine already recorded the license & ledger
        }
      }

      const activeStaysCount =
        typeof convRecord.activeStaysCount === "number"
          ? convRecord.activeStaysCount
          : 5;
      const targetStaysCount =
        typeof convRecord.targetStaysCount === "number"
          ? convRecord.targetStaysCount
          : 45;
      const progressPercentage =
        typeof convRecord.progressPercentage === "number"
          ? convRecord.progressPercentage
          : Math.round((activeStaysCount / targetStaysCount) * 100);
      const licObj =
        convRecord.license && typeof convRecord.license === "object"
          ? (convRecord.license as Record<string, unknown>)
          : {};
      const tokenPreview =
        typeof licObj.license_token === "string"
          ? licObj.license_token
          : "vrtl_active";
      const agreementId =
        typeof licObj.agreement_id === "string"
          ? licObj.agreement_id
          : "00000000-0000-4000-8000-000000000001";
      const licenseId =
        typeof licObj.license_id === "string"
          ? licObj.license_id
          : `VR-LIC-${activeCohort.id.slice(0, 3).toUpperCase()}-${jurisdictionCode}`;
      const validUntil =
        typeof licObj.valid_until === "string"
          ? licObj.valid_until
          : addDaysIsoUtc(checkInIso, selectedStayDays);

      const passportQuery = new URLSearchParams({
        cohort: activeCohort.id,
        jurisdiction: jurisdictionCode,
        days: String(selectedStayDays),
        weeklyCents: String(clampedWeeklyStayCents),
        credentialId: contract.credentialIdentifier,
        ratio: String(decision?.ratio ?? 3.25),
        contractEnd: validUntil,
        stayEnd: validUntil,
        fullName: trimmedName,
        email: finalEmail,
        applicant: effectiveApplicant,
      });
      const passportPdfHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

      const licenseQuery = new URLSearchParams({
        format: "pdf",
        agreementId,
        cohort: activeCohort.id,
        jurisdiction: jurisdictionCode,
        days: String(selectedStayDays),
        credentialId: contract.credentialIdentifier,
        ratio: String(decision?.ratio ?? 3.25),
        weeklyFeeCents: String(clampedWeeklyStayCents),
        purposeEnd: validUntil,
        stayEnd: validUntil,
        fullName: trimmedName,
        email: finalEmail,
        licensee: effectiveApplicant,
      });
      const commercialLicensePdfHref = `/api/agreements/license?${licenseQuery.toString()}`;

      setConfirmedBooking({
        licenseId,
        licenseToken: tokenPreview,
        agreementId,
        applicantFullName: trimmedName,
        applicantEmail: finalEmail,
        applicant: effectiveApplicant,
        cohort: activeCohort.id,
        credentialIdentifier: contract.credentialIdentifier,
        jurisdiction: jurisdictionCode,
        tier: selectedTierId,
        weeklyRateCents: clampedWeeklyStayCents,
        dailyRateCents: divideIntegerCentsHalfUp(clampedWeeklyStayCents, 7),
        stayDays: selectedStayDays,
        checkInDate: checkInIso,
        validUntil,
        activeStaysCount,
        targetStaysCount,
        progressPercentage,
        reservedDatesCount: selectedStayDays,
        passportPdfHref,
        commercialLicensePdfHref,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("vettedrent:stay-activated", {
            detail: {
              milestone: convRecord.milestone,
              license: convRecord.license,
            },
          }),
        );
      }

      setActivationMessage(
        `You're booked: ${selectedStayDays} days, ${checkInIso} to ${validUntil}. Your stay pass is ready.`,
      );
      if (decision?.approved) {
        router.push("/dashboard");
      }
    } catch {
      setActivationError("Network problem while booking. Check your connection and try again.");
    } finally {
      setActivatingPass(false);
    }
  }

  const nights = selectedStayDays;
  const bankVerified = Boolean(decision?.approved);

  return (
    <SimpleShell
      nav={
        <>
          <Link className="text-button" href="/">
            Find a Stay
          </Link>
          <Link className="text-button" href="/dashboard">
            My Account
          </Link>
        </>
      }
    >
      <div className="vr-page" aria-label="Book your stay">
        {confirmedBooking ? (
          <BookingConfirmation confirmation={confirmedBooking} />
        ) : listingRequested && !liveListing ? (
          <div className="vr-card vr-card--center" role="alert">
            <h2>This stay is no longer available</h2>
            <p>It may have been taken down. Pick another stay to continue.</p>
            <Link className="button" href="/">
              Browse stays
            </Link>
          </div>
        ) : !liveListing && catalogIsLive ? (
          <div className="vr-card vr-card--center">
            <h2>Pick a stay to book</h2>
            <p>Choose a place first, then come back here to sign and get your stay pass.</p>
            <Link className="button" href="/">
              Browse stays
            </Link>
          </div>
        ) : (
          <>
            <div className="vr-page__head">
              <h1>Book your stay</h1>
              <p>
                {liveListing
                  ? `${liveListing.title} · ${liveListing.location} · $${liveListing.dailyRate} / day`
                  : `${selectedCard.title} · ${selectedCard.dailyPriceLabel}`}{" "}
                · $0 deposit · No credit check
              </p>
            </div>

            <section className="vr-card vr-step" aria-label="Step 1: About you">
              <div className="vr-step__head">
                <span className="vr-step__num">1</span>
                <h2>About you</h2>
              </div>
              <div className="vr-form-grid">
                <label className="field">
                  <span>Full name</span>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    placeholder="Jordan Taylor"
                    value={guestFullName}
                    onChange={(e) => setGuestFullName(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={prefilledLeadEmail}
                    onChange={(e) => setPrefilledLeadEmail(e.target.value)}
                  />
                </label>
              </div>
              <p className="vr-help">
                Use your name as it appears on your ID. It goes on your stay agreement.
              </p>
            </section>

            <section className="vr-card vr-step" aria-label="Step 2: Your stay">
              <div className="vr-step__head">
                <span className="vr-step__num">2</span>
                <h2>Your stay</h2>
              </div>
              <div className="vr-form-grid">
                <label className="field">
                  <span>Where</span>
                  <select
                    value={jurisdictionCode}
                    onChange={(e) => setJurisdictionCode(e.target.value)}
                  >
                    {MARYLAND_JURISDICTION_RULES.map((rule) => (
                      <option key={rule.code} value={rule.code}>
                        {rule.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>How long</span>
                  <select
                    aria-label="How long"
                    value={selectedStayDays}
                    onChange={(e) => updateStayDurationDays(Number(e.target.value) || 7)}
                  >
                    {STAY_DURATION_OPTIONS.map((opt) => (
                      <option
                        key={opt.days}
                        value={opt.days}
                        disabled={
                          activeCohort.id === "Seasonal-Remote" &&
                          opt.days < SEASONAL_REMOTE_MIN_DAYS
                        }
                      >
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Check-in</span>
                  <input
                    type="date"
                    min={today}
                    value={checkInIso}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateCheckInDate(e.target.value);
                      }
                    }}
                  />
                </label>
              </div>
              <div className="vr-total">
                <span>
                  {formatReadableDate(checkInIso)} to {formatReadableDate(checkOutIso)} ({nights}{" "}
                  days)
                </span>
                <strong>{priceLabel}</strong>
              </div>
              {liveListing && calendarState === "loading" ? (
                <p className="vr-help" role="status">
                  Checking which days are open...
                </p>
              ) : null}
              {liveListing && calendarState === "error" ? (
                <p className="error" role="alert">
                  We couldn&apos;t load this stay&apos;s open dates. Refresh the page to try again.
                </p>
              ) : null}
              {liveListing && calendarState === "ready" && !datesTaken ? (
                <p>
                  <span className="vr-pill">Dates open</span> Those days are free.
                </p>
              ) : null}
              {datesTaken ? (
                <div role="alert">
                  <p className="error">
                    Some of those days are already taken ({formatReadableDate(conflictingDays[0])}
                    {conflictingDays.length > 1 ? ` and ${conflictingDays.length - 1} more` : ""}).
                  </p>
                  {suggestedCheckIn ? (
                    <div className="vr-cta-row">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => updateCheckInDate(suggestedCheckIn)}
                      >
                        Use {formatReadableDate(suggestedCheckIn)} instead
                      </button>
                    </div>
                  ) : (
                    <p className="vr-help">No open dates found in the next year for this length of stay.</p>
                  )}
                </div>
              ) : null}
              {!liveListing ? (
                <p className="vr-help">
                  Want to see which days are open? <Link href="/">Browse stays</Link> and pick your
                  dates there.
                </p>
              ) : null}
            </section>

            <section className="vr-card vr-step" aria-label="Step 3: Sign and book">
              <div className="vr-step__head">
                <span className="vr-step__num">3</span>
                <h2>Sign and book</h2>
              </div>

              <label className="vr-check">
                <input
                  type="checkbox"
                  checked={licenseSigned}
                  onChange={(e) => setLicenseSigned(e.target.checked)}
                />
                <span>
                  I&apos;m <strong>{guestFullName.trim() || "(your name)"}</strong>. I agree to the{" "}
                  <strong>Stay Agreement</strong> for {nights} days. It&apos;s a short-term
                  license to stay, not a lease. I agree to weekly billing and a digital key for
                  my stay.
                </span>
              </label>

              <div className="vr-cta-row">
                <button
                  type="button"
                  className="button"
                  disabled={activatingPass || listingBlocking || datesTaken}
                  onClick={() => void handleActivateWeeklyBillingAndPass()}
                >
                  {activatingPass ? "Booking..." : "Sign and get my stay pass"}
                </button>
                {canSimulate ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={phase === "loading" || checking}
                    onClick={() => simulate(contract)}
                  >
                    {checking ? "Checking..." : "Verify with my bank (optional)"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={!ready || checking}
                    onClick={() => open()}
                  >
                    {checking ? "Checking..." : "Verify with my bank (optional)"}
                  </button>
                )}
              </div>

              {bankVerified ? (
                <p>
                  <span className="vr-pill">Bank verified</span> You&apos;re approved for a $0
                  deposit stay.
                </p>
              ) : null}
              {decision && !decision.approved ? (
                <p className="error" role="alert">
                  {decision.rejection ?? "We couldn't verify your bank yet. You can still book."}
                </p>
              ) : null}
              {activationError ? (
                <p className="error" role="alert">
                  {activationError}
                </p>
              ) : null}
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
              {activationMessage ? <p className="payload">{activationMessage}</p> : null}

              <p className="vr-help">
                Verifying your bank is optional and helps speed up approval. Your agreement and
                stay pass are emailed to you after you book.
              </p>
            </section>

            <details className="vr-card vr-fold">
              <summary>Why are you staying? (optional)</summary>
              <div className="vr-fold__body">
                <div className="vr-form-grid">
                  <label className="field">
                    <span>Reason for your stay</span>
                    <select
                      value={activeCohort.id}
                      onChange={(e) => selectCohort(e.target.value as PurposeCohortId)}
                    >
                      {PURPOSE_COHORTS.map((cohort) => (
                        <option key={cohort.id} value={cohort.id}>
                          {cohort.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{activeCohort.identifierLabel}</span>
                    <input
                      value={contract.credentialIdentifier}
                      onChange={(event) =>
                        setContract({ ...contract, credentialIdentifier: event.target.value })
                      }
                    />
                  </label>
                </div>
              </div>
            </details>
          </>
        )}
      </div>
    </SimpleShell>
  );
}
