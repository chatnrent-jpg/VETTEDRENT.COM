"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
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

/** Default weekly stay rate in integer cents ($245.00/wk = $35.00/day). */
const DEFAULT_WEEKLY_STAY_CENTS = 24500;

export function PlaidLinkScreen() {
  const router = useRouter();
  const initial = defaultContractTerm();
  const [weeklyStayCents, setWeeklyStayCents] = useState<number>(DEFAULT_WEEKLY_STAY_CENTS);
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const [prefilledLeadEmail, setPrefilledLeadEmail] = useState<string | null>(null);
  const [prefilledStayDays, setPrefilledStayDays] = useState<number | null>(null);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [comparisonNightlyDollars, setComparisonNightlyDollars] = useState("144");
  const [activatingPass, setActivatingPass] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

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
    Math.round((Number(comparisonNightlyDollars) || 144) * 100),
  );
  const dailyComparison = calculateDailyRateComparison(
    weeklyStayCents,
    selectedStayDays,
    comparisonNightlyCents,
  );

  const selectedTierId: DailyRateTierId =
    weeklyStayCents === 74500
      ? "ExecutiveTownhome"
      : weeklyStayCents === 49000
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
      const supabase = getSupabaseBrowserClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const user = session.data.session?.user;
      if (session.error || !token || !user) {
        setActivationError("Sign in on the dashboard first to activate weekly micro-billing.");
        return;
      }

      const cycleRes = await fetch("/api/billing/weekly-cycle", {
        method: "POST",
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${token}` },
      });
      const cycleBody: unknown = await cycleRes.json();
      const cycleRecord =
        cycleBody && typeof cycleBody === "object"
          ? (cycleBody as Record<string, unknown>)
          : {};

      if (cycleRes.ok && cycleRecord.ok === true) {
        const vaultBalanceCents =
          typeof cycleRecord.vaultBalanceCents === "number"
            ? cycleRecord.vaultBalanceCents
            : 41004;
        setActivationMessage(
          `Weekly micro-billing activated! GMF Move-Out Vault balance: ${formatCents(vaultBalanceCents)}. Redirecting to your active QR Lodger Pass...`,
        );
        router.push("/dashboard");
        return;
      }

      const subRes = await fetch("/api/billing/create-subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: user.email ?? prefilledLeadEmail ?? "lodger@vettedrent.com",
          hostAccountId: "acct_simulated_host",
          totalCents: weeklyStayCents,
          tenantId: user.id,
          hostId: user.id,
          listingId: "vr-weekly-room",
          seamDeviceId: "seam_device_mock",
        }),
      });
      const subBody: unknown = await subRes.json();
      const subRecord =
        subBody && typeof subBody === "object" ? (subBody as Record<string, unknown>) : {};

      if (!subRes.ok || subRecord.ok !== true) {
        const errText =
          typeof cycleRecord.error === "string"
            ? cycleRecord.error
            : typeof subRecord.error === "string"
              ? subRecord.error
              : "Could not activate weekly micro-billing";
        setActivationError(errText);
        return;
      }

      const vaultBalanceCents =
        typeof subRecord.vaultBalanceCents === "number" ? subRecord.vaultBalanceCents : 41004;
      setActivationMessage(
        `Weekly micro-billing activated! GMF Move-Out Vault balance: ${formatCents(vaultBalanceCents)}. Redirecting to your active QR Lodger Pass...`,
      );
      router.push("/dashboard");
    } catch {
      setActivationError("Network error while activating weekly micro-billing.");
    } finally {
      setActivatingPass(false);
    }
  }

  return (
    <main className="google-home" data-perspective="tenant">
      <div className="google-hero-backdrop" aria-hidden="true" />
      <header className="google-topbar">
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

      <section className="google-stage" aria-label="Bank connection">
        <div className="google-headline">
          <h1>Get approved in 60 seconds.</h1>
          <p>
            <strong>{formatCurrencyCents(dailyComparison.grossDailyRateCents)}/day gross</strong> ·{" "}
            <strong>{formatCurrencyCents(dailyComparison.netEffectiveDailyRateCents)}/day net</strong>{" "}
            · <strong>$0.00 Security Deposit</strong> ({formatCents(weeklyStayCents)}/wk)
          </p>
        </div>

        {/* ONE HORIZONTAL BAR FOR RENTER APPLICATION */}
        <div className="google-search-bar">
          <label className="google-search-cell">
            <span>Space</span>
            <select
              value={weeklyStayCents}
              onChange={(e) => setWeeklyStayCents(Number(e.target.value) || 24500)}
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
            <strong>{formatCurrencyCents(dailyComparison.grossDailyRateCents)}/day gross</strong>
            <span>
              ({formatCurrencyCents(dailyComparison.netEffectiveDailyRateCents)}/day net after +
              {formatCurrencyCents(dailyComparison.dailyGmfVaultCreditCents)}/day Vault credit)
            </span>
          </div>
          <div className="google-info-pill">
            <strong>Save {formatCurrencyCents(dailyComparison.totalSavingsVsAggregatorCents)}</strong>
            <span>
              ({dailyComparison.savingsPercentage}% Off vs.{" "}
              {formatCurrencyCents(dailyComparison.aggregatorNightlyCents)}/night)
            </span>
          </div>
          <div className="google-info-pill">
            <strong>$0.00 Deposit</strong>
            <span>No credit score impact</span>
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

        {showCalendar ? (
          <AvailabilityCalendar
            mode="tenant"
            tierId={
              weeklyStayCents === 74500
                ? "ExecutiveTownhome"
                : weeklyStayCents === 49000
                  ? "PrivateSuite"
                  : "RoomSanctuary"
            }
            stayDays={selectedStayDays}
            checkInIso={checkInIso}
            onSelectCheckIn={(iso) => updateCheckInDate(iso)}
          />
        ) : null}

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
