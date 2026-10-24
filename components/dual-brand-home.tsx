"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
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
  const [externalNightlyDollars, setExternalNightlyDollars] = useState<string>("144");

  const [hostEmail, setHostEmail] = useState("");
  const [hostSubmitting, setHostSubmitting] = useState(false);
  const [hostNotice, setHostNotice] = useState<string | null>(null);

  const activeTier = DAILY_RATE_PRESET_TIERS[selectedTierId];
  const parsedNightlyCents = Math.max(
    3500,
    Math.round((Number(externalNightlyDollars) || 144) * 100),
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

  const featuredComparison = calculateDailyRateComparison(
    stay.weeklyPriceCents,
    90,
    AGGREGATOR_NIGHTLY_BENCHMARK_CENTS,
  );

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
        setHostNotice("Saved! Check your email or click Sign In above to open your Host Dashboard.");
        setHostEmail("");
      } else {
        setHostNotice("Could not save right now. Please try again.");
      }
    } catch {
      setHostNotice("Network error. Please try again.");
    } finally {
      setHostSubmitting(false);
    }
  }

  const underwritingHref = `/underwriting?weeklyCents=${comparison.weeklyRateCents}&days=${comparison.stayDays}&cohort=${encodeURIComponent(selectedCohortId)}&jurisdiction=${encodeURIComponent(selectedJurisdictionCode)}`;

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
              Furnished weekly stays for workers, students &amp; families —{" "}
              <strong>{comparison.savingsPercentage}% less</strong> than a{" "}
              <strong>{formatCurrencyCents(comparison.aggregatorNightlyCents)}/night</strong> hotel.
            </p>
          </div>
        ) : (
          <div className="google-headline">
            <h1>Unvetted renting is over.</h1>
            <p>
              Get <strong>{formatCurrencyCents(hostYield.hostWeeklyCents)}/week</strong> guaranteed
              rent from 3x bank-verified guests with zero eviction holdovers.
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
              <span>Stay Length</span>
              <select
                value={stayDays}
                onChange={(e) => setStayDays(Number(e.target.value) || 90)}
              >
                <option value={14}>14 Days (2 Weeks)</option>
                <option value={30}>30 Days (1 Month)</option>
                <option value={60}>60 Days (2 Months)</option>
                <option value={90}>90 Days (3 Months)</option>
              </select>
            </label>

            <label className="google-search-cell">
              <span>Reason</span>
              <select
                value={selectedCohortId}
                onChange={(e) => {
                  const next = e.target.value as PurposeCohortId;
                  setSelectedCohortId(next);
                  if (next === "Seasonal-Remote" && stayDays < SEASONAL_REMOTE_MIN_DAYS) {
                    setStayDays(30);
                  }
                }}
              >
                <option value="Contract-Assignment">Work Assignment</option>
                <option value="Academic-Enrollment">Student / Intern</option>
                <option value="Seasonal-Remote">Remote / Seasonal</option>
                <option value="Insurance-Relocation">Insurance / Relocation</option>
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
              type="submit"
              className="button google-search-cta"
              disabled={hostSubmitting}
            >
              {hostSubmitting ? "Saving..." : "List My Property →"}
            </button>
          </form>
        )}

        {hostNotice ? <p className="payload">{hostNotice}</p> : null}

        {/* 3 SIMPLE PILLS BELOW THE BAR */}
        {!isLandlord ? (
          <div className="google-pill-row" aria-label="Key benefits">
            <div className="google-info-pill">
              <strong>{formatCurrencyCents(comparison.grossDailyRateCents)} / day</strong>
              <span>
                ({formatCurrencyCents(comparison.netEffectiveDailyRateCents)}/day net with Move-Out
                Savings)
              </span>
            </div>
            <div className="google-info-pill">
              <strong>$0.00 Deposit</strong>
              <span>No credit check · 60-second bank check</span>
            </div>
            <div className="google-info-pill">
              <strong>Save {formatCurrencyCents(comparison.totalSavingsVsAggregatorCents)}</strong>
              <span>
                vs. {formatCurrencyCents(comparison.aggregatorNightlyCents)}/night over{" "}
                {comparison.stayDays} days
              </span>
            </div>
          </div>
        ) : (
          <div className="google-pill-row" aria-label="Landlord benefits">
            <div className="google-info-pill">
              <strong>{formatCurrencyCents(hostYield.hostWeeklyCents)} / week</strong>
              <span>
                ({formatCurrencyCents(hostYield.hostTotalCents)} over {hostYield.estimatedWeeks}{" "}
                weeks)
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
          </div>
        )}

        {/* SUBTLE EXPANDABLE COMPARE LINK (HIDDEN BY DEFAULT SO SCREEN IS CLEAN) */}
        <details className="google-compare-drawer">
          <summary>
            Compare {formatCurrencyCents(featuredComparison.grossDailyRateCents)} / day ({weeklyRate}{" "}
            / week) against hotels, Airbnb, or sublets
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
              {stay.name}: {formatCurrencyCents(featuredComparison.grossDailyRateCents)} / day (
              {formatCurrencyCents(featuredComparison.netEffectiveDailyRateCents)}/day net after
              14.3% GMF Vault credit) · Save {featuredComparison.savingsPercentage}% vs.{" "}
              {formatCurrencyCents(AGGREGATOR_NIGHTLY_BENCHMARK_CENTS)}/night sample OTA rate.
              The unvetted rental market forces you to settle for risk. It’s time to be great to
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
