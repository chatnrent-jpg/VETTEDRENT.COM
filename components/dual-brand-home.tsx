"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { ValuationCounter } from "@/components/ValuationCounter";
import {
  STAY_DURATION_OPTIONS,
  addDaysIsoUtc,
  formatReadableDate,
  todayIsoUtc,
} from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
} from "@/lib/compliance/jurisdictions";
import {
  AGGREGATOR_NIGHTLY_BENCHMARK_CENTS,
  DAILY_RATE_PRESET_TIERS,
  DAILY_RATE_TIER_LIST,
  EXTERNAL_OFFER_PRESETS,
  calculateDailyRateComparison,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import {
  calculateJurisdictionYield,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import {
  SEASONAL_REMOTE_MIN_DAYS,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type BrandPerspective = "landlord" | "tenant";

export function DualBrandHome({
  stay,
  weeklyRate,
}: {
  stay: { name: string; weeklyPriceCents: number; geoCompliance: string };
  weeklyRate: string;
}) {
  const [perspective, setPerspective] = useState<BrandPerspective>("tenant");
  const isLandlord = perspective === "landlord";

  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>("RoomSanctuary");
  const [selectedCohortId, setSelectedCohortId] =
    useState<PurposeCohortId>("Contract-Assignment");
  const [selectedJurisdictionCode, setSelectedJurisdictionCode] = useState<string>(
    DEFAULT_JURISDICTION_CODE,
  );
  const [stayDays, setStayDays] = useState<number>(90);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  const [externalNightlyDollars, setExternalNightlyDollars] = useState<string>("277");

  const [hostEmail, setHostEmail] = useState("");
  const [hostSubmitting, setHostSubmitting] = useState(false);
  const [hostNotice, setHostNotice] = useState<string | null>(null);

  const activeTier = DAILY_RATE_PRESET_TIERS[selectedTierId];
  const parsedNightlyCents = Math.max(
    3500,
    Math.round((Number(externalNightlyDollars) || 277) * 100),
  );

  const comparison = calculateDailyRateComparison(
    activeTier.weeklyRateCents,
    stayDays,
    parsedNightlyCents,
    0,
  );

  const hostYield = calculateJurisdictionYield(
    selectedJurisdictionCode,
    activeTier.weeklyRateCents,
    stayDays,
  );

  const featuredWeeklyCents = Math.max(stay.weeklyPriceCents, 31500);
  const featuredComparison = calculateDailyRateComparison(
    featuredWeeklyCents,
    90,
    AGGREGATOR_NIGHTLY_BENCHMARK_CENTS,
  );

  const checkOutIso = addDaysIsoUtc(checkInIso, comparison.stayDays);

  async function handleQuickHostStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hostEmail.trim()) {
      return;
    }
    setHostSubmitting(true);
    setHostNotice(null);
    try {
      const res = await fetch("/api/marketing/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "host",
          cohort: "Host-Property",
          email: hostEmail.trim(),
          jurisdictionCode: selectedJurisdictionCode,
          weeklyRateCents: activeTier.weeklyRateCents,
          intendedStayDays: stayDays,
        }),
      });
      if (res.ok) {
        setHostNotice(
          "Saved! Open the Availability Calendar below to set your open dates, or click Sign In above.",
        );
        setShowCalendar(true);
      } else {
        setHostNotice("Could not save right now. Please try again.");
      }
    } catch {
      setHostNotice("Network error. Please try again.");
    } finally {
      setHostSubmitting(false);
    }
  }

  const underwritingHref = `/underwriting?weeklyCents=${comparison.weeklyRateCents}&days=${comparison.stayDays}&checkIn=${encodeURIComponent(checkInIso)}&cohort=${encodeURIComponent(selectedCohortId)}&jurisdiction=${encodeURIComponent(selectedJurisdictionCode)}`;

  return (
    <main className="google-home" data-perspective={perspective}>
      <div className="google-hero-backdrop" aria-hidden="true" />
      {/* MINIMAL TOP BAR */}
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
          <button
            type="button"
            className="text-button"
            onClick={() => setPerspective("tenant")}
          >
            Renters
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setPerspective("landlord")}
          >
            Landlords
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowCalendar((prev) => !prev)}
          >
            {showCalendar ? "Hide Calendar" : "Availability Calendar"}
          </button>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      {/* CENTERED GOOGLE-STYLE STAGE */}
      <section className="google-stage" id="daily-rate-calculator">
        {/* 1-CLICK AUDIENCE SWITCH */}
        <div
          className="audience-pill-switch"
          role="group"
          aria-label="Switch between Renter and Landlord"
        >
          <button
            type="button"
            aria-pressed={!isLandlord}
            onClick={() => setPerspective("tenant")}
          >
            I Need a Place to Stay
          </button>
          <button
            type="button"
            aria-pressed={isLandlord}
            onClick={() => setPerspective("landlord")}
          >
            I Have a Property to List
          </button>
        </div>

        {/* HEADLINE */}
        {!isLandlord ? (
          <div className="google-headline">
            <h1>
              {formatCurrencyCents(comparison.grossDailyRateCents)} / day. $0 deposit.
            </h1>
            <p>
              <strong>{formatCurrencyCents(comparison.weeklyRateCents)}/wk</strong> ·{" "}
              <strong>{formatCurrencyCents(comparison.grossDailyRateCents)}/day</strong> (
              <strong>{formatCurrencyCents(comparison.netEffectiveDailyRateCents)}/day net</strong>{" "}
              after +{formatCurrencyCents(comparison.dailyGmfVaultCreditCents)}/day 14.3% GMF Vault
              credit) — <strong>{comparison.savingsPercentage}% less</strong> than{" "}
              <strong>{formatCurrencyCents(comparison.aggregatorNightlyCents)}/night</strong> hotel
              &amp; aggregator rates.
            </p>
          </div>
        ) : (
          <div className="google-headline">
            <h1>Unvetted renting is over.</h1>
            <p>
              Get <strong>{formatCurrencyCents(hostYield.hostWeeklyCents)}/wk</strong> (
              <strong>{formatCurrencyCents(hostYield.hostMonthlyCents)}/mo net</strong>) guaranteed
              payout from 3x bank-verified guests with zero eviction holdovers.
            </p>
          </div>
        )}

        {/* THE SINGLE HORIZONTAL SEARCH / ACTION BAR */}
        {!isLandlord ? (
          <div className="google-search-bar" role="region" aria-label="Find your stay">
            <label className="google-search-cell">
              <span>Space</span>
              <select
                value={selectedTierId}
                onChange={(e) => setSelectedTierId(e.target.value as DailyRateTierId)}
              >
                {DAILY_RATE_TIER_LIST.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="google-search-cell">
              <span>Stay Length (7 to 90 Days)</span>
              <select
                value={stayDays}
                onChange={(e) => {
                  const nextDays = Number(e.target.value) || 90;
                  if (
                    selectedCohortId === "Seasonal-Remote" &&
                    nextDays < SEASONAL_REMOTE_MIN_DAYS
                  ) {
                    setStayDays(SEASONAL_REMOTE_MIN_DAYS);
                  } else {
                    setStayDays(nextDays);
                  }
                }}
              >
                {STAY_DURATION_OPTIONS.map((opt) => (
                  <option
                    key={opt.days}
                    value={opt.days}
                    disabled={
                      selectedCohortId === "Seasonal-Remote" &&
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
                    setCheckInIso(e.target.value);
                  }
                }}
              />
            </label>

            <label className="google-search-cell">
              <span>Reason</span>
              <select
                value={selectedCohortId}
                onChange={(e) => {
                  const next = e.target.value as PurposeCohortId;
                  setSelectedCohortId(next);
                  if (next === "Seasonal-Remote" && stayDays < SEASONAL_REMOTE_MIN_DAYS) {
                    setStayDays(SEASONAL_REMOTE_MIN_DAYS);
                  }
                }}
              >
                <option value="Contract-Assignment">Work Assignment (7d+)</option>
                <option value="Academic-Enrollment">Student / Intern (7d+)</option>
                <option value="Seasonal-Remote">Remote / Seasonal (14d+)</option>
                <option value="Insurance-Relocation">Insurance / Relocation (7d+)</option>
              </select>
            </label>

            <label className="google-search-cell">
              <span>Location</span>
              <select
                value={selectedJurisdictionCode}
                onChange={(e) => setSelectedJurisdictionCode(e.target.value)}
              >
                {JURISDICTION_RULES.map((rule) => (
                  <option key={rule.code} value={rule.code}>
                    {rule.name} ({rule.code})
                  </option>
                ))}
              </select>
            </label>

            <Link className="button google-search-cta" href={underwritingHref}>
              Lock In {formatCurrencyCents(comparison.grossDailyRateCents)}/Day ($0 Security
              Deposit) →
            </Link>
          </div>
        ) : (
          <form
            className="google-search-bar"
            onSubmit={(e) => void handleQuickHostStart(e)}
            aria-label="List your property"
          >
            <label className="google-search-cell">
              <span>Property Type</span>
              <select
                value={selectedTierId}
                onChange={(e) => setSelectedTierId(e.target.value as DailyRateTierId)}
              >
                {DAILY_RATE_TIER_LIST.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="google-search-cell">
              <span>Location</span>
              <select
                value={selectedJurisdictionCode}
                onChange={(e) => setSelectedJurisdictionCode(e.target.value)}
              >
                {JURISDICTION_RULES.map((rule) => (
                  <option key={rule.code} value={rule.code}>
                    {rule.name} ({rule.code})
                  </option>
                ))}
              </select>
            </label>

            <label className="google-search-cell" style={{ flex: "1.4 1 12rem" }}>
              <span>Your Email</span>
              <input
                type="email"
                required
                placeholder="you@domain.com"
                value={hostEmail}
                onChange={(e) => setHostEmail(e.target.value)}
              />
            </label>

            <button
              type="button"
              className="button button-secondary google-search-cta"
              onClick={() => setShowCalendar((prev) => !prev)}
            >
              {showCalendar ? "Hide Calendar" : "Set Available Days"}
            </button>

            <button
              type="submit"
              className="button google-search-cta"
              disabled={hostSubmitting}
            >
              {hostSubmitting ? "Saving..." : "List My Property →"}
            </button>
          </form>
        )}

        {hostNotice ? <p className="payload">{hostNotice}</p> : null}

        {/* 3 SIMPLE PILLS + 1-CLICK AVAILABILITY CALENDAR TOGGLE */}
        {!isLandlord ? (
          <div className="google-pill-row" aria-label="Key benefits">
            <div className="google-info-pill">
              <strong>
                {formatCurrencyCents(comparison.weeklyRateCents)}/wk ·{" "}
                {formatCurrencyCents(comparison.grossDailyRateCents)}/day
              </strong>
              <span>
                ({formatCurrencyCents(comparison.netEffectiveDailyRateCents)}/day net after +
                {formatCurrencyCents(comparison.dailyGmfVaultCreditCents)}/day 14.3% GMF Vault
                credit)
              </span>
            </div>
            <div className="google-info-pill">
              <strong>$0.00 Deposit</strong>
              <span>No credit check · 60-second bank check</span>
            </div>
            <div className="google-info-pill">
              <strong>Save {formatCurrencyCents(comparison.totalSavingsVsAggregatorCents)}</strong>
              <span>
                ({comparison.savingsPercentage}% less than{" "}
                {formatCurrencyCents(comparison.aggregatorNightlyCents)}/night over{" "}
                {comparison.stayDays} days)
              </span>
            </div>
            <button
              type="button"
              className="google-info-pill google-calendar-trigger"
              onClick={() => setShowCalendar((prev) => !prev)}
            >
              <strong>{showCalendar ? "Hide Calendar ▲" : "View Available Dates ▼"}</strong>
              <span>
                {formatReadableDate(checkInIso)} → {formatReadableDate(checkOutIso)}
              </span>
            </button>
          </div>
        ) : (
          <div className="google-pill-row" aria-label="Landlord benefits">
            <div className="google-info-pill">
              <strong>
                {formatCurrencyCents(hostYield.hostWeeklyCents)}/wk (
                {formatCurrencyCents(hostYield.hostMonthlyCents)}/mo net)
              </strong>
              <span>
                Guaranteed payout · {formatCurrencyCents(hostYield.hostTotalCents)} over{" "}
                {hostYield.estimatedWeeks} weeks
              </span>
            </div>
            <div className="google-info-pill">
              <strong>3.00x Verified Guests</strong>
              <span>90-day bank deposits + work/school ID</span>
            </div>
            <div className="google-info-pill">
              <strong>$0 Eviction Holdovers</strong>
              <span>Revocable License + {formatCurrencyCents(hostYield.vaultTotalCents)} reserve</span>
            </div>
            <button
              type="button"
              className="google-info-pill google-calendar-trigger"
              onClick={() => setShowCalendar((prev) => !prev)}
            >
              <strong>
                {showCalendar ? "Hide Availability Calendar ▲" : "Setup Available Days ▼"}
              </strong>
              <span>Click dates to open or block</span>
            </button>
          </div>
        )}

        {/* INTERACTIVE AVAILABILITY CALENDAR (TENANT CHECK-IN OR LANDLORD SETUP) */}
        {showCalendar ? (
          <AvailabilityCalendar
            mode={isLandlord ? "landlord" : "tenant"}
            tierId={selectedTierId}
            stayDays={comparison.stayDays}
            checkInIso={checkInIso}
            onSelectCheckIn={(iso) => setCheckInIso(iso)}
            hostEmail={hostEmail}
          />
        ) : null}

        <ValuationCounter variant="compact" />

        {/* SUBTLE EXPANDABLE COMPARE LINK */}
        <details className="google-compare-drawer">
          <summary>
            Compare {formatCurrencyCents(featuredComparison.weeklyRateCents)}/wk ·{" "}
            {formatCurrencyCents(featuredComparison.grossDailyRateCents)}/day (
            {formatCurrencyCents(featuredComparison.netEffectiveDailyRateCents)}/day net) against
            $277/night hotel &amp; aggregator rates ({weeklyRate}/wk listing)
          </summary>
          <div className="google-compare-drawer__body">
            <div className="actions" style={{ justifyContent: "center", marginTop: 0 }}>
              {EXTERNAL_OFFER_PRESETS.map((preset) => {
                const dollars = String(Math.round(preset.nightlyRateCents / 100));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={
                      externalNightlyDollars === dollars ? "button" : "button button-secondary"
                    }
                    onClick={() => setExternalNightlyDollars(dollars)}
                  >
                    {preset.providerLabel}
                  </button>
                );
              })}
            </div>
            <p className="note" style={{ marginTop: "0.5rem" }}>
              {stay.name}: {formatCurrencyCents(featuredComparison.weeklyRateCents)}/wk ·{" "}
              {formatCurrencyCents(featuredComparison.grossDailyRateCents)}/day (
              {formatCurrencyCents(featuredComparison.netEffectiveDailyRateCents)}/day net after +
              {formatCurrencyCents(featuredComparison.dailyGmfVaultCreditCents)}/day 14.3% GMF Vault
              credit) · {featuredComparison.savingsPercentage}% less than{" "}
              {formatCurrencyCents(AGGREGATOR_NIGHTLY_BENCHMARK_CENTS)}/night hotel &amp;
              aggregator rates · Landlord guaranteed payout: $237.83/wk ($1,030.58/mo net). The
              unvetted rental market forces you to settle for risk. It’s time to be great to
              yourself.
            </p>
          </div>
        </details>
      </section>

      {/* MINIMAL BOTTOM FOOTER */}
      <footer className="google-footer">
        <span>VettedRent · MD-PG, MD, FL, TX, CA &amp; NY</span>
        <div className="google-footer__links">
          <Link href="/underwriting">Renter Approval</Link>
          <Link href="/dashboard">Host &amp; Renter Sign In</Link>
          <Link href="/marketing">Partner Tools</Link>
        </div>
      </footer>
    </main>
  );
}
