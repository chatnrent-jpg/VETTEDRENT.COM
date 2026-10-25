"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AvailabilityCalendar,
  type InstantBookingConfirmation,
} from "@/components/availability-calendar";
import { ValuationCounter } from "@/components/ValuationCounter";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import {
  STAY_DURATION_OPTIONS,
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
  DAILY_RATE_TIER_LIST,
  EXTERNAL_OFFER_PRESETS,
  calculateDailyRateComparison,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { intendedStayLengthDays } from "@/lib/geo-compliance";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  PURPOSE_COHORTS,
  SEASONAL_REMOTE_MIN_DAYS,
  addUtcDays,
  defaultContractTerm,
  resolvePurposeCohort,
  type ContractTerm,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

/** Default weekly stay rate in integer cents ($315.00/wk = $45.00/day Universal Floor). */
const DEFAULT_WEEKLY_STAY_CENTS = 31500;

export function PlaidLinkScreen() {
  const router = useRouter();
  const initial = defaultContractTerm();
  const [weeklyStayCents, setWeeklyStayCents] = useState<number>(DEFAULT_WEEKLY_STAY_CENTS);
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const [prefilledLeadEmail, setPrefilledLeadEmail] = useState<string | null>(null);
  const [prefilledStayDays, setPrefilledStayDays] = useState<number | null>(null);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [showCalendar, setShowCalendar] = useState<boolean>(true);
  const [comparisonNightlyDollars, setComparisonNightlyDollars] = useState("277");
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

    if (weeklyCentsParam) {
      const parsedWeekly = Number(weeklyCentsParam);
      if (Number.isFinite(parsedWeekly) && parsedWeekly >= 5000 && parsedWeekly <= 500000) {
        setWeeklyStayCents(Math.round(parsedWeekly));
      }
    } else if (
      tierParam === "RoomSanctuary" ||
      tierParam === "PrivateSuite" ||
      tierParam === "ExecutiveTownhome"
    ) {
      setWeeklyStayCents(DAILY_RATE_PRESET_TIERS[tierParam as DailyRateTierId].weeklyRateCents);
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

    if (emailParam && emailParam.trim() !== "") {
      setPrefilledLeadEmail(emailParam.trim());
    }
  }, []);

  const { phase, error, decision, ready, open, canSimulate, simulate } = usePlaidLinkFlow(
    weeklyStayCents,
    contract,
    jurisdictionCode,
  );
  const checking = phase === "checking";
  const activeCohort = resolvePurposeCohort(contract.credentialType);
  const selectedStayDays = Math.max(
    activeCohort.minStayDays,
    prefilledStayDays ?? intendedStayLengthDays(contract.intendedStayEndDate),
  );
  const comparisonNightlyCents = Math.max(
    3500,
    Math.round((Number(comparisonNightlyDollars) || 277) * 100),
  );
  const dailyComparison = calculateDailyRateComparison(
    weeklyStayCents,
    selectedStayDays,
    comparisonNightlyCents,
  );

  const selectedTierId: DailyRateTierId =
    weeklyStayCents === 74500
      ? "ExecutiveTownhome"
      : weeklyStayCents === 52500 || weeklyStayCents === 49000
        ? "PrivateSuite"
        : "RoomSanctuary";

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
    setShowCalendar(true);
    const targetEndDate = addDaysIsoUtc(nextCheckInIso, selectedStayDays);
    setContract((prev) => ({
      ...prev,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    }));
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

      // 1. Trigger Phase 8 Automated Lead-to-Stay Conversion Engine
      const convRes = await fetch("/api/conversion/activate-stay", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant: applicantEmail,
          cohort: contract.credentialType,
          jurisdiction: jurisdictionCode,
          tier: selectedTierId,
          weeklyRateCents: weeklyStayCents,
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

      // 2. If signed in, also run weekly billing cycle / subscription sync
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
        weeklyCents: String(weeklyStayCents),
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
        weeklyFeeCents: String(weeklyStayCents),
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
        weeklyRateCents: weeklyStayCents,
        dailyRateCents: Math.round(weeklyStayCents / 7),
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
        `Stay activated (${selectedStayDays} days: ${checkInIso} → ${validUntil})! License Token: ${tokenPreview} · Agreement ID: ${agreementId} · Active Stays: ${activeStaysCount}/45.`,
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
            alt="VettedRent.Com Crest"
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
            ← Home
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      <section
        className="google-stage relative z-10"
        style={{ position: "relative", zIndex: 10 }}
        aria-label="Bank connection"
      >
        <div
          className="vettilo-fintech-badge"
          aria-label="VettedRent.com · Powered by Vettilo™ UMI Engine"
        >
          <span className="vettilo-fintech-badge__top">
            <span className="fintech-live-dot" aria-hidden="true" />
            VettedRent.com · Powered by Vettilo™
          </span>
          <span className="vettilo-fintech-badge__sub">
            Vettilo (vettilo.com) proprietary Underwritten Mid-Term Infrastructure (UMI) engine
            powering payroll webhooks, the 14.3% GMF Escrow Vault &amp; revocable commercial
            license tokens
          </span>
        </div>

        <div className="google-headline">
          <h1>Get approved in 60 seconds.</h1>
          <p>
            <strong>{formatCents(weeklyStayCents)}/wk</strong> ·{" "}
            <strong>{formatCurrencyCents(dailyComparison.grossDailyRateCents)}/day</strong> (
            <strong>{formatCurrencyCents(dailyComparison.netEffectiveDailyRateCents)}/day net</strong>{" "}
            after +{formatCurrencyCents(dailyComparison.dailyGmfVaultCreditCents)}/day 14.3% GMF
            Vault credit) · <strong>{dailyComparison.savingsPercentage}% less</strong> than{" "}
            <strong>{formatCurrencyCents(dailyComparison.aggregatorNightlyCents)}/night</strong>{" "}
            hotel &amp; aggregator rates · <strong>$0.00 Security Deposit</strong>
          </p>
        </div>

        {/* ONE HORIZONTAL BAR FOR RENTER APPLICATION */}
        <div
          className="google-search-bar relative z-10"
          style={{ position: "relative", zIndex: 10 }}
        >
          <label className="google-search-cell">
            <span>Space</span>
            <select
              value={weeklyStayCents}
              onChange={(e) => setWeeklyStayCents(Number(e.target.value) || 31500)}
            >
              {DAILY_RATE_TIER_LIST.map((tier) => (
                <option key={tier.id} value={tier.weeklyRateCents}>
                  {tier.label}
                </option>
              ))}
            </select>
          </label>

          <label className="google-search-cell">
            <span>Reason</span>
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

          <label className="google-search-cell">
            <span>Stay Length (7 to 90 Days)</span>
            <select
              value={selectedStayDays}
              onChange={(e) => updateStayDurationDays(Number(e.target.value) || 90)}
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

          <label className="google-search-cell">
            <span>Check-In Date</span>
            <input
              type="date"
              value={checkInIso}
              onFocus={() => setShowCalendar(true)}
              onChange={(e) => {
                if (e.target.value) {
                  updateCheckInDate(e.target.value);
                }
              }}
            />
          </label>

          <label className="google-search-cell">
            <span>Location</span>
            <select
              value={jurisdictionCode}
              onChange={(e) => setJurisdictionCode(e.target.value)}
            >
              {JURISDICTION_RULES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.name} ({rule.code})
                </option>
              ))}
            </select>
          </label>

          {canSimulate ? (
            <button
              type="button"
              className="button google-search-cta"
              disabled={phase === "loading" || checking}
              onClick={() => simulate(contract)}
            >
              {checking ? "Verifying..." : "Verify Income & Get Approved →"}
            </button>
          ) : (
            <button
              type="button"
              className="button google-search-cta"
              disabled={!ready || checking}
              onClick={() => open()}
            >
              Connect Bank &amp; Verify →
            </button>
          )}

          <button
            type="button"
            className="button button-secondary google-search-cta"
            disabled={activatingPass}
            onClick={() => void handleActivateWeeklyBillingAndPass()}
          >
            {activatingPass
              ? "Issuing Vettilo™ Pass..."
              : "Confirm Dates & Issue Vettilo™ Pass Now"}
          </button>
        </div>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        {decision ? (
          <Decision
            decision={decision}
            weeklyStayCents={weeklyStayCents}
            jurisdictionCode={jurisdictionCode}
            stayDays={prefilledStayDays ?? activeCohort.defaultStayDays}
            comparisonNightlyCents={comparisonNightlyCents}
            applicantEmail={prefilledLeadEmail}
            activatingPass={activatingPass}
            activationMessage={activationMessage}
            activationError={activationError}
            onActivate={() => void handleActivateWeeklyBillingAndPass()}
          />
        ) : null}

        <div className="google-pill-row">
          <div className="google-info-pill">
            <strong>
              {formatCents(weeklyStayCents)}/wk ·{" "}
              {formatCurrencyCents(dailyComparison.grossDailyRateCents)}/day
            </strong>
            <span>
              ({formatCurrencyCents(dailyComparison.netEffectiveDailyRateCents)}/day net after +
              {formatCurrencyCents(dailyComparison.dailyGmfVaultCreditCents)}/day 14.3% GMF Vault
              credit)
            </span>
          </div>
          <div className="google-info-pill">
            <strong>Save {formatCurrencyCents(dailyComparison.totalSavingsVsAggregatorCents)}</strong>
            <span>
              ({dailyComparison.savingsPercentage}% less than{" "}
              {formatCurrencyCents(dailyComparison.aggregatorNightlyCents)}/night hotel &amp;
              aggregator rates)
            </span>
          </div>
          <div className="google-info-pill">
            <strong>$0.00 Deposit</strong>
            <span>Landlord guaranteed $237.83/wk ($1,030.58/mo net)</span>
          </div>
          <button
            type="button"
            className="google-info-pill google-calendar-trigger"
            onClick={() => setShowCalendar((prev) => !prev)}
          >
            <strong>{showCalendar ? "Hide Calendar ▲" : "View Available Dates ▼"}</strong>
            <span>Check-in {checkInIso}</span>
          </button>
        </div>

        {confirmedBooking ? (
          <div
            className="vr-booking-confirmation relative z-10"
            style={{ position: "relative", zIndex: 10, width: "100%" }}
            role="region"
            aria-label="Instant Booking Confirmation"
          >
            <div className="stay-card-head" style={{ flexWrap: "wrap" }}>
              <div>
                <p className="pass-kicker">
                  Vettilo™ UMI Engine · Sandbox / Demo Stay Confirmed
                </p>
                <h2>
                  Pass Issued: {formatReadableDate(confirmedBooking.checkInDate)} →{" "}
                  {formatReadableDate(confirmedBooking.validUntil)} (
                  {confirmedBooking.stayDays} Days)
                </h2>
              </div>
              <span className="stay-badge" data-status="active">
                Active Stays: {confirmedBooking.activeStaysCount} /{" "}
                {confirmedBooking.targetStaysCount} ({confirmedBooking.progressPercentage}%)
              </span>
            </div>

            <div className="vr-booking-confirmation__grid">
              <div>
                <span>Cryptographic License Token</span>
                <code>{confirmedBooking.licenseToken}</code>
              </div>
              <div>
                <span>Agreement ID</span>
                <code>{confirmedBooking.agreementId}</code>
              </div>
              <div>
                <span>Tier &amp; Weekly Rate</span>
                <strong>
                  {confirmedBooking.tier} ·{" "}
                  {formatCurrencyCents(confirmedBooking.dailyRateCents)}/day (
                  {formatCurrencyCents(confirmedBooking.weeklyRateCents)}/wk)
                </strong>
              </div>
              <div>
                <span>Cohort &amp; Jurisdiction</span>
                <strong>
                  {confirmedBooking.cohort} · {confirmedBooking.jurisdiction}
                </strong>
              </div>
            </div>

            <div className="actions" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
              <a
                className="button"
                href={confirmedBooking.passportPdfHref}
                download={`VettedRent-Trust-Passport-${confirmedBooking.cohort}.pdf`}
              >
                Download Trust Passport (PDF) ↓
              </a>
              <a
                className="button button-secondary"
                href={confirmedBooking.commercialLicensePdfHref}
                download={`VettedRent-Commercial-License-${confirmedBooking.cohort}-${confirmedBooking.jurisdiction}.pdf`}
              >
                Download Commercial License (PDF) ↓
              </a>
              <Link className="button button-secondary" href="/dashboard">
                Open Stay Pass Dashboard →
              </Link>
            </div>
          </div>
        ) : null}

        {showCalendar ? (
          <AvailabilityCalendar
            mode="tenant"
            tierId={selectedTierId}
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

        <ValuationCounter variant="compact" />

        <details className="google-compare-drawer">
          <summary>
            Optional: Edit verification ID ({contract.credentialIdentifier}), dates, or compare
            against hotels
          </summary>
          <div className="google-compare-drawer__body">
            <div className="simple-grid-2">
              <label className="field">
                <span>{activeCohort.identifierLabel}</span>
                <input
                  value={contract.credentialIdentifier}
                  onChange={(event) =>
                    setContract({ ...contract, credentialIdentifier: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Stay End Date</span>
                <input
                  type="date"
                  value={contract.intendedStayEndDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setContract({
                      ...contract,
                      intendedStayEndDate: nextDate,
                      contractEndDate: nextDate,
                    });
                  }}
                />
              </label>
            </div>
            <div className="actions" style={{ justifyContent: "center" }}>
              {EXTERNAL_OFFER_PRESETS.map((preset) => {
                const dollars = String(Math.round(preset.nightlyRateCents / 100));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={
                      comparisonNightlyDollars === dollars ? "button" : "button button-secondary"
                    }
                    onClick={() => setComparisonNightlyDollars(dollars)}
                  >
                    {preset.providerLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}

function Decision({
  decision,
  weeklyStayCents,
  jurisdictionCode,
  stayDays,
  comparisonNightlyCents,
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
  comparisonNightlyCents: number;
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
    comparisonNightlyCents: String(comparisonNightlyCents),
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

  const decisionComparison = calculateDailyRateComparison(
    weeklyStayCents,
    stayDays,
    comparisonNightlyCents,
  );

  return (
    <div className="panel stack" style={{ width: "100%", textAlign: "left" }}>
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">Instant Decision · Be Great to Yourself.</p>
          <h2>{decision.approved ? "Approved for $0 Deposit Stay" : "Not Approved Yet"}</h2>
        </div>
        <span
          className="stay-badge"
          data-status={decision.approved ? "active" : "terminated"}
        >
          {decision.ratio.toFixed(2)}x Verified ({formatDollars(decision.monthlyInflowEstimated)}/mo)
        </span>
      </div>

      <p className="note">
        {formatCurrencyCents(decisionComparison.grossDailyRateCents)}/day gross ·{" "}
        {formatCurrencyCents(decisionComparison.netEffectiveDailyRateCents)}/day net · Save{" "}
        {formatCurrencyCents(decisionComparison.totalSavingsVsAggregatorCents)} (
        {decisionComparison.savingsPercentage}% Off) vs.{" "}
        {formatCurrencyCents(decisionComparison.aggregatorNightlyCents)}/night.
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
            Trust Passport (PDF) ↓
          </a>
          <a
            className="button button-secondary"
            href={licenseHref}
            download={`VettedRent-Commercial-License-${decision.credentialType}-${jurisdictionCode}.pdf`}
          >
            Lodging License (PDF) ↓
          </a>
        </div>
      ) : null}

      {activationMessage ? <p className="payload">{activationMessage}</p> : null}
      {activationError ? <p className="error">{activationError}</p> : null}
    </div>
  );
}

function formatCents(cents: number): string {
  return formatDollars(cents / 100);
}

function formatDollars(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
