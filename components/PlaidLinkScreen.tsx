"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AvailabilityCalendar,
  type InstantBookingConfirmation,
} from "@/components/availability-calendar";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import {
  addDaysIsoUtc,
  formatReadableDate,
  todayIsoUtc,
} from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  SPACE_TIER_CARDS,
  calculateDailyRateComparison,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { intendedStayLengthDays } from "@/lib/geo-compliance";
import {
  divideIntegerCentsHalfUp,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  PURPOSE_COHORTS,
  defaultContractTerm,
  resolvePurposeCohort,
  type ContractTerm,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

const DEFAULT_WEEKLY_STAY_CENTS = 31500;

function diffDaysUtc(startIso: string, endIso: string): number {
  const startMs = Date.parse(`${startIso}T00:00:00Z`);
  const endMs = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 30;
  }
  const diff = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
  return Math.max(7, Math.min(365, diff));
}

export function PlaidLinkScreen() {
  const router = useRouter();
  const initial = defaultContractTerm();
  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>("RoomSanctuary");
  const [weeklyStayCents, setWeeklyStayCents] = useState<number>(DEFAULT_WEEKLY_STAY_CENTS);
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const [prefilledLeadEmail, setPrefilledLeadEmail] = useState<string | null>(null);
  const [prefilledStayDays, setPrefilledStayDays] = useState<number | null>(null);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
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
    const emailParam = params.get("email");

    if (
      !weeklyCentsParam &&
      !tierParam &&
      !cohortParam &&
      !daysParam &&
      !checkInParam &&
      !jurisdictionParam &&
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

    setSelectedTierId(resolvedTier);
    setWeeklyStayCents(
      clampTierWeeklyRateCents(
        resolvedTier,
        Number.isFinite(parsedWeekly) ? parsedWeekly : undefined,
      ),
    );

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

    if (emailParam && emailParam.trim() !== "") {
      setPrefilledLeadEmail(emailParam.trim());
    }
  }, []);

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
  const dailyComparison = calculateDailyRateComparison(
    clampedWeeklyStayCents,
    selectedStayDays,
  );
  const selectedCard =
    SPACE_TIER_CARDS.find((card) => card.id === selectedTierId) ?? SPACE_TIER_CARDS[0];

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

  function updateCheckOutDate(nextCheckOutIso: string) {
    const days = diffDaysUtc(checkInIso, nextCheckOutIso);
    updateStayDurationDays(days);
  }

  async function handleActivateWeeklyBillingAndPass() {
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

      const applicantEmail =
        signedInEmail ?? prefilledLeadEmail ?? "verified.lodger@vettedrent.com";

      const convRes = await fetch("/api/conversion/activate-stay", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant: applicantEmail,
          cohort: contract.credentialType,
          jurisdiction: jurisdictionCode,
          tier: selectedTierId,
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
            : "Could not activate stay via conversion engine";
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
                customerEmail: applicantEmail,
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
        applicant: applicantEmail,
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
        licensee: applicantEmail,
      });
      const commercialLicensePdfHref = `/api/agreements/license?${licenseQuery.toString()}`;

      setConfirmedBooking({
        licenseId,
        licenseToken: tokenPreview,
        agreementId,
        applicant: applicantEmail,
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
        `Booking confirmed (${selectedStayDays} days: ${checkInIso} → ${validUntil}). Digital entry pass ready.`,
      );
      if (decision?.approved) {
        router.push("/dashboard");
      }
    } catch {
      setActivationError("Network error while activating stay.");
    } finally {
      setActivatingPass(false);
    }
  }

  return (
    <main className="google-home" data-perspective="tenant">
      <div
        className="google-hero-backdrop pointer-events-none"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />
      <header
        className="google-topbar relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <Link href="/" className="google-logo">
          <img
            src="/vettedrent-logo-mark.jpg"
            alt="VettedRent Crest"
            className="google-logo-badge"
            width={42}
            height={42}
          />
          <div className="google-logo-lockup">
            <strong>
              VettedRent<em className="google-logo-domain">.Com</em>
            </strong>
            <span>Be Great to Yourself.</span>
          </div>
        </Link>
        <nav className="google-nav" aria-label="Main navigation">
          <Link className="text-button" href="/">
            ← Explore Stays
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      <section
        className="google-stage relative z-10"
        style={{ position: "relative", zIndex: 10 }}
        aria-label="Instant booking and bank verification"
      >
        <div className="google-headline">
          <h1>Complete your reservation in 60 seconds.</h1>
          <p>
            <strong>{selectedCard.title}</strong> ({selectedCard.dailyPriceLabel}) ·{" "}
            <strong>$0 Security Deposit</strong> · <strong>No Credit Check</strong> ·{" "}
            <strong>Instant Bank Link Setup</strong>
          </p>
        </div>

        {/* CONSUMER VALUE BAR */}
        <div className="vr-value-badges" aria-label="Reservation benefits">
          <div className="vr-value-badge">
            <span className="vr-value-badge__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>$0 Security Deposit</strong>
              <span>Move in without upfront deposit lockups</span>
            </div>
          </div>
          <div className="vr-value-badge">
            <span className="vr-value-badge__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>No Credit Check</strong>
              <span>Protect your credit score</span>
            </div>
          </div>
          <div className="vr-value-badge">
            <span className="vr-value-badge__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Instant Bank Link Setup</strong>
              <span>Fast Plaid verification &amp; digital key</span>
            </div>
          </div>
        </div>

        {/* MINIMALIST DESTINATION + CHECK-IN / CHECK-OUT + INSTANT ACTION BAR */}
        <div
          className="google-search-bar vr-clean-booking-bar relative z-10"
          style={{ position: "relative", zIndex: 10 }}
        >
          <label className="google-search-cell vr-search-cell--destination">
            <span>Where are you traveling?</span>
            <select
              value={jurisdictionCode}
              onChange={(e) => setJurisdictionCode(e.target.value)}
            >
              {JURISDICTION_RULES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.name}
                </option>
              ))}
            </select>
          </label>

          <label className="google-search-cell">
            <span>Check-In</span>
            <input
              type="date"
              value={checkInIso}
              onChange={(e) => {
                if (e.target.value) {
                  updateCheckInDate(e.target.value);
                }
              }}
            />
          </label>

          <label className="google-search-cell">
            <span>Check-Out</span>
            <input
              type="date"
              min={addDaysIsoUtc(checkInIso, 7)}
              value={checkOutIso}
              onChange={(e) => {
                if (e.target.value) {
                  updateCheckOutDate(e.target.value);
                }
              }}
            />
          </label>

          {canSimulate ? (
            <button
              type="button"
              className="button google-search-cta"
              disabled={phase === "loading" || checking}
              onClick={() => simulate(contract)}
            >
              {checking ? "Verifying..." : "Instant Bank Link Setup →"}
            </button>
          ) : (
            <button
              type="button"
              className="button google-search-cta"
              disabled={!ready || checking}
              onClick={() => open()}
            >
              Instant Bank Link Setup →
            </button>
          )}

          <button
            type="button"
            className="button button-secondary google-search-cta"
            disabled={activatingPass}
            onClick={() => void handleActivateWeeklyBillingAndPass()}
          >
            {activatingPass ? "Confirming..." : "Confirm & Issue Stay Pass"}
          </button>
        </div>

        {/* SINGLE PREMIUM TIER SELECTOR: 3 VISUAL CARDS */}
        <div
          className="vr-tier-selector-section"
          role="region"
          aria-label="Select your space tier"
        >
          <div className="vr-tier-cards-grid" role="radiogroup" aria-label="Space tiers">
            {SPACE_TIER_CARDS.map((card) => {
              const isSelected = selectedTierId === card.id;
              return (
                <div
                  key={card.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`vr-tier-card${isSelected ? " vr-tier-card--selected" : ""}`}
                  onClick={() => selectTier(card.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectTier(card.id);
                    }
                  }}
                >
                  <div className="vr-tier-card__top">
                    <span className="vr-tier-card__badge">{card.badge}</span>
                    <span className="vr-tier-card__code">{card.codeLabel}</span>
                  </div>
                  <div className="vr-tier-card__title-row">
                    <h3>{card.title}</h3>
                    <div className="vr-tier-card__price">
                      <strong>{card.dailyPriceLabel}</strong>
                      <span>{card.weeklyPriceLabel}</span>
                    </div>
                  </div>
                  <p className="vr-tier-card__summary">{card.summary}</p>
                  <div className="vr-tier-card__footer">
                    <span className="vr-tier-card__select-indicator">
                      {isSelected ? "✓ Selected Space" : "Select Space"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        {decision ? (
          <Decision
            decision={decision}
            weeklyStayCents={clampedWeeklyStayCents}
            jurisdictionCode={jurisdictionCode}
            stayDays={prefilledStayDays ?? activeCohort.defaultStayDays}
            applicantEmail={prefilledLeadEmail}
            activatingPass={activatingPass}
            activationMessage={activationMessage}
            activationError={activationError}
            onActivate={() => void handleActivateWeeklyBillingAndPass()}
          />
        ) : null}

        {confirmedBooking ? (
          <div
            className="vr-booking-confirmation relative z-10"
            style={{ position: "relative", zIndex: 10, width: "100%" }}
            role="region"
            aria-label="Instant Booking Confirmation"
          >
            <div className="stay-card-head" style={{ flexWrap: "wrap" }}>
              <div>
                <p className="pass-kicker">Reservation Confirmed</p>
                <h2>
                  {formatReadableDate(confirmedBooking.checkInDate)} →{" "}
                  {formatReadableDate(confirmedBooking.validUntil)} (
                  {confirmedBooking.stayDays} Nights)
                </h2>
              </div>
              <span className="stay-badge" data-status="active">
                $0 Security Deposit
              </span>
            </div>

            <div className="vr-booking-confirmation__grid">
              <div>
                <span>Space Tier</span>
                <strong>
                  {confirmedBooking.tier} ·{" "}
                  {formatCurrencyCents(confirmedBooking.dailyRateCents)}/day
                </strong>
              </div>
              <div>
                <span>Destination</span>
                <strong>{confirmedBooking.jurisdiction}</strong>
              </div>
            </div>

            <div className="actions" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
              <a
                className="button"
                href={confirmedBooking.passportPdfHref}
                download={`VettedRent-Trust-Passport-${confirmedBooking.cohort}.pdf`}
              >
                Download Stay Passport (PDF) ↓
              </a>
              <a
                className="button button-secondary"
                href={confirmedBooking.commercialLicensePdfHref}
                download={`VettedRent-Commercial-License-${confirmedBooking.cohort}-${confirmedBooking.jurisdiction}.pdf`}
              >
                Download Stay Agreement (PDF) ↓
              </a>
              <Link className="button button-secondary" href="/dashboard">
                Open Digital Key Dashboard →
              </Link>
            </div>
          </div>
        ) : null}

        <div className="google-pill-row">
          <button
            type="button"
            className="google-info-pill google-calendar-trigger"
            onClick={() => setShowCalendar((prev) => !prev)}
          >
            <strong>{showCalendar ? "Hide Date Calendar ▲" : "View Availability Calendar ▼"}</strong>
            <span>
              {formatReadableDate(checkInIso)} → {formatReadableDate(checkOutIso)}
            </span>
          </button>
        </div>

        {showCalendar ? (
          <AvailabilityCalendar
            mode="tenant"
            tierId={selectedTierId}
            weeklyRateCents={clampedWeeklyStayCents}
            onChangeWeeklyRateCents={(next) => setWeeklyStayCents(next)}
            stayDays={selectedStayDays}
            checkInIso={checkInIso}
            onSelectCheckIn={(iso) => updateCheckInDate(iso)}
            cohortId={activeCohort.id}
            jurisdictionCode={jurisdictionCode}
            applicantEmail={prefilledLeadEmail}
            credentialIdentifier={contract.credentialIdentifier}
            context="underwriting"
            onBookingConfirmed={(conf) => setConfirmedBooking(conf)}
          />
        ) : null}

        <details className="google-compare-drawer">
          <summary>Travel Purpose &amp; Verification Details (Optional)</summary>
          <div className="google-compare-drawer__body">
            <div className="simple-grid-2">
              <label className="field">
                <span>Travel Purpose</span>
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
      </section>

      <footer
        className="google-footer relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <span>
          VettedRent · <strong>$0 Security Deposit</strong> · <strong>No Credit Check</strong> ·{" "}
          <strong>Instant Bank Link Setup</strong>
        </span>
        <div className="google-footer__links">
          <Link href="/">Explore Stays</Link>
          <Link href="/dashboard">Sign In</Link>
        </div>
      </footer>
    </main>
  );
}

function Decision({
  decision,
  weeklyStayCents,
  jurisdictionCode,
  stayDays,
  applicantEmail,
  activatingPass,
  activationMessage,
  activationError,
  onActivate,
}: {
  decision: {
    approved: boolean;
    ratio: number;
    monthlyInflowEstimated: number;
    simulated: boolean;
    rejection: string | null;
    credentialType: string;
    credentialIdentifier: string;
    contractEndDate: string;
    intendedStayEndDate: string;
    geoCompliance: string;
  };
  weeklyStayCents: number;
  jurisdictionCode: string;
  stayDays: number;
  applicantEmail: string | null;
  activatingPass: boolean;
  activationMessage: string | null;
  activationError: string | null;
  onActivate: () => void;
}) {
  const passportQuery = new URLSearchParams({
    cohort: decision.credentialType,
    jurisdiction: jurisdictionCode,
    days: String(stayDays),
    weeklyCents: String(weeklyStayCents),
    credentialId: decision.credentialIdentifier,
    ratio: String(decision.ratio),
    monthlyInflow: String(decision.monthlyInflowEstimated),
    contractEnd: decision.contractEndDate,
    stayEnd: decision.intendedStayEndDate,
    ...(applicantEmail ? { applicant: applicantEmail } : {}),
  });
  const passportHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

  const licenseQuery = new URLSearchParams({
    format: "pdf",
    cohort: decision.credentialType,
    jurisdiction: jurisdictionCode,
    days: String(stayDays),
    credentialId: decision.credentialIdentifier,
    ratio: String(decision.ratio),
    weeklyFeeCents: String(weeklyStayCents),
    purposeEnd: decision.contractEndDate,
    stayEnd: decision.intendedStayEndDate,
    ...(applicantEmail ? { licensee: applicantEmail } : {}),
  });
  const licenseHref = `/api/agreements/license?${licenseQuery.toString()}`;

  const decisionComparison = calculateDailyRateComparison(weeklyStayCents, stayDays);

  return (
    <div className="panel stack" style={{ width: "100%", textAlign: "left" }}>
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">Instant Bank Link Setup Complete</p>
          <h2>{decision.approved ? "Approved for $0 Security Deposit Stay" : "Verification Needed"}</h2>
        </div>
        <span
          className="stay-badge"
          data-status={decision.approved ? "active" : "terminated"}
        >
          {decision.approved ? "Verified" : "Action Required"}
        </span>
      </div>

      <p className="note">
        Rate: <strong>{formatCurrencyCents(decisionComparison.grossDailyRateCents)}/day</strong> ·{" "}
        <strong>$0 Security Deposit</strong> · <strong>No Credit Check</strong>
      </p>

      {decision.rejection ? (
        <p className="error" role="alert">
          {decision.rejection}
        </p>
      ) : null}

      {decision.approved ? (
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="button"
            disabled={activatingPass}
            onClick={onActivate}
          >
            {activatingPass
              ? "Activating..."
              : "Activate Stay & Get Door Code →"}
          </button>

          <a
            className="button button-secondary"
            href={passportHref}
            download={`VettedRent-Trust-Passport-${decision.credentialType}.pdf`}
          >
            Stay Passport (PDF) ↓
          </a>
          <a
            className="button button-secondary"
            href={licenseHref}
            download={`VettedRent-Commercial-License-${decision.credentialType}-${jurisdictionCode}.pdf`}
          >
            Stay Agreement (PDF) ↓
          </a>
        </div>
      ) : null}

      {activationMessage ? <p className="payload">{activationMessage}</p> : null}
      {activationError ? <p className="error">{activationError}</p> : null}
    </div>
  );
}
