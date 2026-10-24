"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FintechCard, FintechMetricTile } from "@/components/ui/FintechCard";
import { Progress } from "@/components/ui/progress";
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
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import {
  PURPOSE_COHORTS,
  SEASONAL_REMOTE_MIN_DAYS,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type BrandPerspective = "landlord" | "tenant";

/**
 * Smoothly animates integer cents on client state transitions while keeping
 * the initial SSR render exact for deterministic hydration and HTML verification.
 */
function useAnimatedCents(targetCents: number, durationMs = 260): number {
  const [displayCents, setDisplayCents] = useState<number>(targetCents);
  const previousRef = useRef<number>(targetCents);

  useEffect(() => {
    const startCents = previousRef.current;
    const delta = targetCents - startCents;
    if (delta === 0) {
      setDisplayCents(targetCents);
      return;
    }

    let frameId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      // Cubic ease-out for crisp fintech counter deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startCents + delta * eased);
      setDisplayCents(current);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        previousRef.current = targetCents;
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frameId);
      previousRef.current = targetCents;
    };
  }, [targetCents, durationMs]);

  return displayCents;
}

export function DualBrandHome({
  stay,
  weeklyRate,
}: {
  stay: { name: string; weeklyPriceCents: number; geoCompliance: string };
  weeklyRate: string;
}) {
  const [perspective, setPerspective] = useState<BrandPerspective>("landlord");
  const isLandlord = perspective === "landlord";

  const featuredComparison = calculateDailyRateComparison(stay.weeklyPriceCents, 90);

  return (
    <main className="shell fintech-shell">
      <div className="fintech-ambient-mesh" aria-hidden="true" />

      <header className="topbar fintech-navbar">
        <div className="fintech-brand">
          <div className="fintech-brand__badge-row">
            <span className="fintech-live-dot" aria-hidden="true" />
            <p className="pass-kicker fintech-kicker">
              {isLandlord
                ? "Landlord Mode · Unvetted renting is over."
                : "Professional Mode · Be great to yourself."}
            </p>
          </div>
          <div className="fintech-brand__title-row">
            <h1>VettedRent</h1>
            <span className="fintech-version-pill">UMI Fintech OS</span>
          </div>
        </div>

        <nav className="actions fintech-nav-actions" aria-label="Primary navigation">
          <Link className="button button-secondary" href="#daily-rate-calculator">
            $35/Day Calculator
          </Link>
          <Link className="button button-secondary" href="/marketing">
            Marketing &amp; Growth
          </Link>
          <Link className="button" href="/dashboard">
            Sign in / Open dashboard
          </Link>
        </nav>
      </header>

      <section className="stack fintech-stack">
        {/* ELITE EDITORIAL HERO & DUAL-BRAND PERSPECTIVE SWITCHER */}
        <FintechCard
          variant="hero"
          kicker="VettedRent Category Manifesto · The Shift From Settling to Greatness"
          title="The unvetted rental market forces you to settle for risk. It’s time to be great to yourself."
          subtitle="Stop chasing late payments, parsing messy documents manually, and dreading eviction cycles. VettedRent introduces the first Guaranteed, Underwritten Mid-Term Marketplace—combining institutional-grade credentialing with an active escrow guarantee fund. Zero friction. Total income protection."
          badge={isLandlord ? "Landlord Shield Active" : "Professional Vault Active"}
          badgeTone="gold"
        >
          <div className="fintech-perspective-bar">
            <div className="fintech-perspective-bar__meta">
              <span className="pass-kicker">Dual-Brand Perspective Switcher</span>
              <strong className="fintech-perspective-bar__ActiveMotto">
                {isLandlord ? "Unvetted renting is over." : "Be great to yourself."}
              </strong>
            </div>

            <div
              className="toggle fintech-toggle"
              role="group"
              aria-label="Switch homepage perspective between Landlords and Traveling Professionals"
            >
              <button
                type="button"
                aria-pressed={isLandlord}
                onClick={() => setPerspective("landlord")}
              >
                Landlord View: &ldquo;Unvetted renting is over&rdquo;
              </button>
              <button
                type="button"
                aria-pressed={!isLandlord}
                onClick={() => setPerspective("tenant")}
              >
                Tenant / Professional View: &ldquo;Be great to yourself&rdquo;
              </button>
            </div>
          </div>

          {/* GORGEOUS METRIC CALLOUT RIBBON ($35.00/day vs. $277/night) */}
          <div className="fintech-metric-grid" aria-label="Key platform benchmark metrics">
            <FintechMetricTile
              tone="gold"
              label="VettedRent Room Sanctuary"
              badge={`${weeklyRate}/wk`}
              value={`${formatCurrencyCents(featuredComparison.grossDailyRateCents)} / day`}
              subvalue={`${formatCurrencyCents(featuredComparison.netEffectiveDailyRateCents)}/day net after 14.3% GMF Vault credit`}
            />
            <FintechMetricTile
              tone="emerald"
              label="vs. $277/Night Sample OTA Rate"
              badge={`Save ${featuredComparison.savingsPercentage}%`}
              value={formatCurrencyCents(featuredComparison.totalSavingsVsAggregatorCents)}
              subvalue={`90-day rate savings vs. ${formatCurrencyCents(AGGREGATOR_NIGHTLY_BENCHMARK_CENTS)}/night aggregator`}
            />
            <FintechMetricTile
              tone="default"
              label="14.3% GMF Move-Out Vault"
              badge="Be Great to Yourself."
              value={`+${formatCurrencyCents(featuredComparison.dailyGmfVaultCreditCents)} / day`}
              subvalue="Forced-savings wealth rail toward $1,500.00 Move-Out Vault"
            />
            <FintechMetricTile
              tone="default"
              label="Institutional Underwriting"
              badge="$0.00 Deposit"
              value="3.00x Velocity"
              subvalue="90-day Plaid inflow + 75.5% Host Payout + $300 UMI Backstop"
            />
          </div>

          {/* SMOOTH PERSPECTIVE STATE PANEL */}
          <div
            className="fintech-perspective-callout"
            data-perspective={perspective}
          >
            {isLandlord ? (
              <div className="stack">
                <p className="note fintech-callout-lead">
                  <strong>Unvetted renting is over.</strong> Replace hope-based tenant screening
                  with institutional underwriting, Plaid wage assignment &amp; 3.00x deposit
                  velocity, 14.3% GMF Escrow backstops, Revocable Commercial / Lodging Licenses, and
                  automated statutory transient compliance across MD-PG, MD, FL, TX, CA, and NY.
                </p>
                <div className="fintech-spec-rows">
                  <div className="row">
                    <span>Underwriting rail</span>
                    <strong>Plaid 3.00x Income Velocity + Wage Assignment</strong>
                  </div>
                  <div className="row">
                    <span>Default backstop</span>
                    <strong>14.3% GMF Escrow Pool + Automated License_Revoked Trigger</strong>
                  </div>
                  <div className="row">
                    <span>Legal structure</span>
                    <strong>Revocable Lodging License (MD-PG, MD, FL, TX, CA, NY)</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="stack">
                <p className="note fintech-callout-lead">
                  <strong>Be great to yourself.</strong> Let your verified status unlock
                  deposit-free weekly stays across all 4 Purpose-Verified Stay cohorts
                  (Contract-Assignment, Academic-Enrollment, Seasonal-Remote 14d+, and
                  Insurance-Relocation) starting at <strong>$35.00 / day</strong> ($29.99/day net
                  after 14.3% GMF Vault credit) while every weekly payment builds your $1,500.00 GMF
                  Move-Out Vault.
                </p>
                <div className="fintech-spec-rows">
                  <div className="row">
                    <span>Daily rate compare &amp; contrast</span>
                    <strong>
                      $35.00/day ($29.99/day net) · Compare against any OTA, hotel, or sublet offer
                    </strong>
                  </div>
                  <div className="row">
                    <span>Security deposit required</span>
                    <strong>$0.00 (Credential + 3.00x Deposit Velocity)</strong>
                  </div>
                  <div className="row">
                    <span>Purpose-Verified cohorts</span>
                    <strong>Contract-Assignment · Academic · Seasonal-Remote 14d+ · ALE</strong>
                  </div>
                  <div className="row">
                    <span>Wealth-building rail</span>
                    <strong>14.3% Weekly Allocation → $1,500.00 GMF Move-Out Vault</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="actions fintech-hero-actions" style={{ flexWrap: "wrap" }}>
            <Link
              className={isLandlord ? "button fintech-cta-primary" : "button button-secondary"}
              href="/marketing#host-shield"
            >
              Guard My Property (Landlords)
            </Link>
            <Link
              className={!isLandlord ? "button fintech-cta-primary" : "button button-secondary"}
              href="/underwriting"
            >
              Unlock Deposit-Free Housing (Professionals)
            </Link>
          </div>
        </FintechCard>

        {/* FEATURED LIVE STAY BENCHMARK CARD */}
        <FintechCard
          variant="gold"
          kicker="Featured Stay · Live Daily Rate & Statutory Telemetry"
          title={stay.name}
          badge={`${formatCurrencyCents(featuredComparison.grossDailyRateCents)} / day (${weeklyRate} / week)`}
          badgeTone="gold"
        >
          <div className="fintech-spec-rows">
            <div className="row">
              <span>Daily Rate &amp; Market Contrast</span>
              <strong>
                {formatCurrencyCents(featuredComparison.grossDailyRateCents)} / day (
                {formatCurrencyCents(featuredComparison.netEffectiveDailyRateCents)}/day net after
                14.3% GMF Vault credit) · Save {featuredComparison.savingsPercentage}% vs.{" "}
                {formatCurrencyCents(AGGREGATOR_NIGHTLY_BENCHMARK_CENTS)}/night sample OTA rate (or
                enter any competing offer below)
              </strong>
            </div>
            <div className="row">
              <span>Daily GMF Move-Out Vault Credit (14.3%)</span>
              <strong>
                +{formatCurrencyCents(featuredComparison.dailyGmfVaultCreditCents)} / day toward
                your $1,500.00 Move-Out Vault (&ldquo;Be Great to Yourself.&rdquo;)
              </strong>
            </div>
          </div>
          <p className="note">{stay.geoCompliance}</p>
        </FintechCard>

        {/* UPGRADED 14-TO-90-DAY DAILY RATE & SAVINGS CALCULATOR */}
        <DailyRateAggregatorCalculator />

        {/* CRYSTAL-CLEAR VISUAL PILLARS FOR LANDLORDS & RENTERS */}
        <div className="fintech-pillars-grid">
          {isLandlord ? (
            <>
              <LandlordBlock />
              <ProfessionalBlock weeklyRate={weeklyRate} />
            </>
          ) : (
            <>
              <ProfessionalBlock weeklyRate={weeklyRate} />
              <LandlordBlock />
            </>
          )}
        </div>

        {/* EDITORIAL MANIFESTO DEEP-DIVE */}
        <FintechCard
          variant="obsidian"
          kicker="Why We Exist · Institutional Underwritten Mid-Term Infrastructure"
          title="The Shift From Settling to Greatness"
          badge={isLandlord ? "Unvetted renting is over." : "Be Great to Yourself."}
          badgeTone="gold"
        >
          <p className="note">
            The current mid-term rental market treats property owners like amateur gamblers. You are
            told to cross your fingers on unverified background checks, absorb the sting of sudden
            cancellations, and tolerate empty weeks between traveling professionals.
          </p>
          <p className="note">
            <strong>Accepting that chaos isn’t business management. It’s compromise.</strong>
          </p>
          <p className="note">
            We built VettedRent because the old marketplace model is broken. By replacing guesswork
            with deep fintech underwriting—including Plaid income verification and professional
            credential parsing—we completely eliminate the friction points of down payments and
            credit scores. Backed by our dedicated Guaranteed Mid-Term Fund (GMF), your revenue is
            secured from day one.
          </p>
          <p className="note">
            You’ve earned your assets through discipline and hard work. Stop settling for platforms
            that put the risk entirely on your shoulders. Be great to yourself, protect your
            timeline, and step into underwritten certainty.
          </p>
        </FintechCard>

        <footer className="fintech-footer-bar">
          <p className="note">
            Connect a bank requires signing in first.{" "}
            <Link href="/underwriting">Connect a bank</Link> ·{" "}
            <Link href="/marketing">Explore the Marketing &amp; Growth Command Center</Link>
          </p>
        </footer>
      </section>
    </main>
  );
}

function DailyRateAggregatorCalculator() {
  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>("RoomSanctuary");
  const [selectedCohortId, setSelectedCohortId] =
    useState<PurposeCohortId>("Contract-Assignment");
  const [selectedJurisdictionCode, setSelectedJurisdictionCode] = useState<string>(
    DEFAULT_JURISDICTION_CODE,
  );
  const [stayDays, setStayDays] = useState<number>(90);
  const [externalPresetId, setExternalPresetId] = useState<string>("cozycozy-ota-hotel");
  const [externalNightlyDollars, setExternalNightlyDollars] = useState<string>("277");
  const [externalDepositDollars, setExternalDepositDollars] = useState<string>("0");

  const activeTier = DAILY_RATE_PRESET_TIERS[selectedTierId];
  const activePreset =
    EXTERNAL_OFFER_PRESETS.find((item) => item.id === externalPresetId) ?? null;

  const parsedNightlyCents = Math.max(
    3500,
    Math.round((Number(externalNightlyDollars) || 277) * 100),
  );
  const parsedDepositCents = Math.max(
    0,
    Math.round((Number(externalDepositDollars) || 0) * 100),
  );

  const comparison = calculateDailyRateComparison(
    activeTier.weeklyRateCents,
    stayDays,
    parsedNightlyCents,
    parsedDepositCents,
  );

  const sample14 = calculateDailyRateComparison(
    activeTier.weeklyRateCents,
    14,
    parsedNightlyCents,
    parsedDepositCents,
  );
  const sample30 = calculateDailyRateComparison(
    activeTier.weeklyRateCents,
    30,
    parsedNightlyCents,
    parsedDepositCents,
  );
  const sample90 = calculateDailyRateComparison(
    activeTier.weeklyRateCents,
    90,
    parsedNightlyCents,
    parsedDepositCents,
  );

  // Smoothly animated currency counters for interactive slider/tier changes
  const animatedGrossDailyCents = useAnimatedCents(comparison.grossDailyRateCents);
  const animatedNetDailyCents = useAnimatedCents(comparison.netEffectiveDailyRateCents);
  const animatedDailyVaultCents = useAnimatedCents(comparison.dailyGmfVaultCreditCents);
  const animatedTotalSavingsCents = useAnimatedCents(comparison.totalSavingsVsAggregatorCents);
  const animatedTotalVaultCents = useAnimatedCents(comparison.totalGmfVaultAccumulatedCents);
  const animatedExternalOutlayCents = useAnimatedCents(comparison.externalTotalCashOutlayCents);
  const animatedVettedGrossTotalCents = useAnimatedCents(comparison.vettedRentGrossTotalCents);

  const vaultGoalProgressPercent = Math.min(
    100,
    Math.round(
      (comparison.totalGmfVaultAccumulatedCents / comparison.gmfMoveOutVaultTargetCents) * 100,
    ),
  );

  const sliderFillPercent = Math.round(((comparison.stayDays - 14) / (90 - 14)) * 100);

  function selectExternalPreset(presetId: string) {
    setExternalPresetId(presetId);
    const match = EXTERNAL_OFFER_PRESETS.find((item) => item.id === presetId);
    if (match) {
      setExternalNightlyDollars(String(Math.round(match.nightlyRateCents / 100)));
      setExternalDepositDollars(String(Math.round(match.upfrontDepositCents / 100)));
    }
  }

  const underwritingHref = `/underwriting?weeklyCents=${comparison.weeklyRateCents}&days=${comparison.stayDays}&cohort=${encodeURIComponent(selectedCohortId)}&jurisdiction=${encodeURIComponent(selectedJurisdictionCode)}`;

  return (
    <FintechCard
      id="daily-rate-calculator"
      variant="emerald"
      kicker="Universal 4-Cohort Compare & Contrast Engine · Be Great to Yourself."
      title="14-to-90-Day Daily Rate & External Offer Comparison Calculator"
      badge={`Save ${comparison.savingsPercentage}% vs. ${formatCurrencyCents(comparison.aggregatorNightlyCents)}/night`}
      badgeTone="active"
    >
      <p className="note">
        Outside offerings vary depending on who is making the offer—from budget extended-stay
        motels and unvetted furnished sublets to Airbnb/VRBO listings, Cozycozy/OTA aparthotels, or
        corporate relocation suites. Pick a VettedRent tier, select or enter{" "}
        <strong>any competing nightly rate &amp; upfront deposit</strong>, and slide from 14 to 90
        days to compare and contrast total cash outlay vs. VettedRent&apos;s $0-deposit + 14.3% GMF
        Move-Out Vault model.
      </p>

      {/* STEP 1: TIER SELECTOR */}
      <div className="fintech-calc-section">
        <div className="fintech-calc-section__head">
          <span className="pass-kicker">1. Select VettedRent Lodging Tier</span>
          <span className="fintech-inline-tag">75.5% Host · 14.3% Vault · 10.2% Platform</span>
        </div>
        <div
          className="toggle fintech-tier-selector"
          role="group"
          aria-label="Select VettedRent lodging tier"
        >
          {DAILY_RATE_TIER_LIST.map((tier) => (
            <button
              key={tier.id}
              type="button"
              aria-pressed={selectedTierId === tier.id}
              onClick={() => setSelectedTierId(tier.id)}
            >
              {tier.label}
            </button>
          ))}
        </div>
        <p className="note">
          <strong>Best for:</strong> {activeTier.audienceSummary}
        </p>
      </div>

      {/* LIVE WEALTH WIDGET DISPLAY: GROSS DAILY vs. 14.3% GMF VAULT vs. NET EFFECTIVE DAILY */}
      <div className="fintech-wealth-split" aria-label="Daily rate and GMF Move-Out Vault split">
        <div className="fintech-wealth-split__card fintech-wealth-split__card--gross">
          <span className="pass-kicker">Gross VettedRent Daily Rate</span>
          <strong className="fintech-counter-value">
            {formatCurrencyCents(animatedGrossDailyCents)} <small>/ day</small>
          </strong>
          <span className="fintech-wealth-split__meta">
            Billed weekly at {formatCurrencyCents(comparison.weeklyRateCents)}/wk · $0.00 deposit
          </span>
        </div>

        <div className="fintech-wealth-split__operator" aria-hidden="true">
          −
        </div>

        <div className="fintech-wealth-split__card fintech-wealth-split__card--vault">
          <div className="fintech-wealth-split__badge-row">
            <span className="pass-kicker">14.3% GMF Move-Out Vault</span>
            <span className="fintech-vault-pill">Be Great to Yourself.</span>
          </div>
          <strong className="fintech-counter-value fintech-counter-value--gold">
            +{formatCurrencyCents(animatedDailyVaultCents)} <small>/ day</small>
          </strong>
          <span className="fintech-wealth-split__meta">
            +{formatCurrencyCents(animatedTotalVaultCents)} accumulated over {comparison.stayDays}d
            toward $1,500.00 Vault
          </span>
        </div>

        <div className="fintech-wealth-split__operator" aria-hidden="true">
          =
        </div>

        <div className="fintech-wealth-split__card fintech-wealth-split__card--net">
          <span className="pass-kicker">Net Effective Daily Rate</span>
          <strong className="fintech-counter-value fintech-counter-value--emerald">
            {formatCurrencyCents(animatedNetDailyCents)} <small>/ day net</small>
          </strong>
          <span className="fintech-wealth-split__meta">
            True daily shelter cost after your 14.3% GMF Vault accumulation
          </span>
        </div>
      </div>

      {/* GMF MOVE-OUT VAULT ACCUMULATION BAR */}
      <div className="fintech-vault-box">
        <div className="fintech-vault-box__head">
          <div>
            <span className="pass-kicker">
              Wealth-Building Rail · &ldquo;Be Great to Yourself.&rdquo;
            </span>
            <h3 className="fintech-vault-box__title">
              14.3% GMF Move-Out Vault Accumulation ({comparison.stayDays}-Day Stay)
            </h3>
          </div>
          <strong className="fintech-vault-box__amount">
            {formatCurrencyCents(animatedTotalVaultCents)} / $1,500.00 ({vaultGoalProgressPercent}%)
          </strong>
        </div>
        <Progress
          value={vaultGoalProgressPercent}
          aria-label={`GMF Move-Out Vault accumulation: ${formatCurrencyCents(comparison.totalGmfVaultAccumulatedCents)} of $1,500.00`}
        />
        <p className="note">
          Unlike hotels or OTA rentals where 100% of your nightly spend is a sunk cost,{" "}
          <strong>14.3%</strong> of every weekly VettedRent payment (+
          {formatCurrencyCents(comparison.dailyGmfVaultCreditCents)}/day) stacks in your personal
          GMF Move-Out Vault.
        </p>
      </div>

      {/* STEP 2: COHORT & JURISDICTION DEEP-LINK SELECTORS */}
      <div className="fintech-grid-2">
        <label className="field">
          <span>Purpose-Verified Stay Cohort (Deep-Links to Underwriting)</span>
          <select
            value={selectedCohortId}
            onChange={(event) => {
              const nextCohort = event.target.value as PurposeCohortId;
              setSelectedCohortId(nextCohort);
              if (nextCohort === "Seasonal-Remote" && stayDays < SEASONAL_REMOTE_MIN_DAYS) {
                setStayDays(30);
              }
            }}
          >
            {PURPOSE_COHORTS.map((cohort) => (
              <option key={cohort.id} value={cohort.id}>
                {cohort.title} — {cohort.audience}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Target Jurisdiction</span>
          <select
            value={selectedJurisdictionCode}
            onChange={(event) => setSelectedJurisdictionCode(event.target.value)}
          >
            {JURISDICTION_RULES.map((rule) => (
              <option key={rule.code} value={rule.code}>
                {rule.name} ({rule.code}) — {rule.maxTransientDays}d max
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* STEP 3: COMPETING OFFER PRESETS & INPUTS */}
      <div className="fintech-calc-section">
        <p className="pass-kicker">
          Who Is Making the Competing Offer? (Select Preset or Enter Custom)
        </p>
        <div className="actions fintech-preset-pills" style={{ flexWrap: "wrap", marginTop: "0.4rem" }}>
          {EXTERNAL_OFFER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={
                externalPresetId === preset.id ? "button" : "button button-secondary"
              }
              onClick={() => selectExternalPreset(preset.id)}
            >
              {preset.providerLabel}
            </button>
          ))}
        </div>
        {activePreset ? <p className="note">{activePreset.description}</p> : null}
      </div>

      <div className="fintech-grid-2">
        <label className="field">
          <span>Competing Offer Nightly Rate ($ / night)</span>
          <input
            type="number"
            min={35}
            max={2500}
            step={1}
            value={externalNightlyDollars}
            onChange={(event) => {
              setExternalPresetId("custom");
              setExternalNightlyDollars(event.target.value);
            }}
          />
        </label>

        <label className="field">
          <span>Competing Offer Upfront Security Deposit ($ upfront)</span>
          <input
            type="number"
            min={0}
            max={20000}
            step={50}
            value={externalDepositDollars}
            onChange={(event) => {
              setExternalPresetId("custom");
              setExternalDepositDollars(event.target.value);
            }}
          />
        </label>
      </div>

      {/* STEP 4: LIVE INTERACTIVE SLIDER (14 TO 90 DAYS) */}
      <div className="fintech-slider-panel">
        <div className="fintech-slider-panel__head">
          <span>
            Intended Stay Duration: <strong>{comparison.stayDays} Days</strong> (Slide 14 to 90
            days)
          </span>
          <div className="actions fintech-duration-pills" style={{ marginTop: 0 }}>
            {[14, 30, 60, 90].map((presetDays) => (
              <button
                key={presetDays}
                type="button"
                className={stayDays === presetDays ? "button" : "button button-secondary"}
                onClick={() => setStayDays(presetDays)}
              >
                {presetDays} Days
              </button>
            ))}
          </div>
        </div>

        <input
          className="fintech-range-slider"
          type="range"
          min={14}
          max={90}
          step={1}
          value={stayDays}
          style={{ ["--slider-fill" as string]: `${sliderFillPercent}%` }}
          onChange={(event) => setStayDays(Number(event.target.value) || 90)}
        />

        <div className="fintech-slider-ticks" aria-hidden="true">
          <span>14d Floor</span>
          <span>30d Monthly</span>
          <span>60d Mid-Term</span>
          <span>90d Assignment</span>
        </div>
      </div>

      {/* TELEMETRY LEDGER ROWS */}
      <div className="fintech-ledger">
        <div className="row">
          <span>
            Gross VettedRent Daily Rate ({formatCurrencyCents(comparison.weeklyRateCents)}/wk)
          </span>
          <strong>{formatCurrencyCents(comparison.grossDailyRateCents)} / day</strong>
        </div>
        <div className="row">
          <span>Daily 14.3% GMF Move-Out Vault Credit</span>
          <strong>
            +{formatCurrencyCents(comparison.dailyGmfVaultCreditCents)} / day stacked in your Vault
          </strong>
        </div>
        <div className="row">
          <span>Net Effective Daily Rate (After GMF Vault Credit)</span>
          <span className="chip">
            {formatCurrencyCents(comparison.netEffectiveDailyRateCents)} / day net
          </span>
        </div>
        <div className="row">
          <span>
            Competing Offer Rate ({comparison.stayDays} nights @{" "}
            {formatCurrencyCents(comparison.aggregatorNightlyCents)}/night
            {comparison.externalUpfrontDepositCents > 0
              ? ` + ${formatCurrencyCents(comparison.externalUpfrontDepositCents)} deposit`
              : ""}
            )
          </span>
          <strong>{formatCurrencyCents(animatedExternalOutlayCents)}</strong>
        </div>
        <div className="row">
          <span>VettedRent Gross Stay Total ({comparison.stayDays} days · $0.00 deposit)</span>
          <strong>{formatCurrencyCents(animatedVettedGrossTotalCents)}</strong>
        </div>
        <div className="row">
          <span>
            Direct Rate Savings vs. {formatCurrencyCents(comparison.aggregatorNightlyCents)}/Night
            Offer ({comparison.stayDays} days)
          </span>
          <span className="stay-badge" data-status="active">
            Save {formatCurrencyCents(animatedTotalSavingsCents)} ({comparison.savingsPercentage}%
            Off)
          </span>
        </div>
        {comparison.externalUpfrontDepositCents > 0 ? (
          <div className="row">
            <span>Total Cash Flow Freed (Rate Savings + Avoided Upfront Deposit)</span>
            <strong>
              {formatCurrencyCents(comparison.totalCashFlowFreedIncludingDepositCents)} kept liquid
            </strong>
          </div>
        ) : null}
        <div className="row">
          <span>Cumulative 14.3% GMF Move-Out Vault Credit ({comparison.stayDays} days)</span>
          <strong>
            {formatCurrencyCents(animatedTotalVaultCents)} toward $1,500.00 Vault
          </strong>
        </div>
        <div className="row">
          <span>Upfront Security Deposit Required on VettedRent</span>
          <strong>$0.00 (Zero Deposit Friction · Be Great to Yourself.)</strong>
        </div>
      </div>

      {/* HORIZON SNAPSHOT */}
      <div className="fintech-horizon-strip">
        <p className="note" style={{ margin: 0 }}>
          <strong>
            Compare &amp; Contrast Horizon Snapshot ({activeTier.label} vs.{" "}
            {formatCurrencyCents(comparison.aggregatorNightlyCents)}/night offer):
          </strong>{" "}
          {formatCurrencyCents(sample14.totalSavingsVsAggregatorCents)} saved at 14d ·{" "}
          {formatCurrencyCents(sample30.totalSavingsVsAggregatorCents)} saved at 30d ·{" "}
          {formatCurrencyCents(sample90.totalSavingsVsAggregatorCents)} saved at 90d.
        </p>
      </div>

      {/* PROMINENT DEEP-LINKING CTA INTO /UNDERWRITING */}
      <div className="actions fintech-calc-cta-row" style={{ flexWrap: "wrap" }}>
        <Link className="button fintech-cta-primary fintech-cta-xl" href={underwritingHref}>
          Lock In {formatCurrencyCents(comparison.grossDailyRateCents)}/Day ($0 Security Deposit) →
        </Link>
        <Link className="button button-secondary" href="/marketing#host-shield">
          Host Shield Yield Model
        </Link>
      </div>
    </FintechCard>
  );
}

function LandlordBlock() {
  return (
    <FintechCard
      variant="gold"
      kicker="Block A · Landlord Protection · Unvetted Renting Is Over"
      title="For Landlords: Command Your Cash Flow"
      badge="75.5% Host Payout"
      badgeTone="gold"
    >
      <p className="note">
        Being &ldquo;good&rdquo; to yourself is buying property insurance and hoping you never have
        to use it. Being great to yourself means utilizing an underwriting platform that ensures you
        never have to worry about a default in the first place.
      </p>

      <div className="fintech-pillar-list">
        <div className="fintech-pillar-item">
          <span className="fintech-pillar-item__index">01</span>
          <div>
            <strong>Institutional Underwriting:</strong>
            <p className="note">
              Professional credentials and Plaid 3.00x income velocity verification replace
              unreliable, surface-level credit checks.
            </p>
          </div>
        </div>

        <div className="fintech-pillar-item">
          <span className="fintech-pillar-item__index">02</span>
          <div>
            <strong>Guaranteed Revenue Escrow:</strong>
            <p className="note">
              Structural protection from the 14.3% GMF Escrow means your mid-term revenue (75.5%
              automated weekly host payouts) is fully secured against eviction and rollover risks.
            </p>
          </div>
        </div>

        <div className="fintech-pillar-item">
          <span className="fintech-pillar-item__index">03</span>
          <div>
            <strong>Automated Compliance:</strong>
            <p className="note">
              Zero administrative bloat—our Revocable Lodging License engine handles state statutory
              ceilings (MD-PG, MD, FL, TX, CA, NY), automated document parsing, and weekly
              micro-deductions seamlessly.
            </p>
          </div>
        </div>
      </div>

      <div className="fintech-spec-rows">
        <div className="row">
          <span>Identity</span>
          <strong>Verified ID and face on the stay</strong>
        </div>
        <div className="row">
          <span>Collection</span>
          <strong>Weekly billing and bounce warnings</strong>
        </div>
        <div className="row">
          <span>Stay status</span>
          <strong>Active, Warning, or Terminated</strong>
        </div>
      </div>

      <div className="actions">
        <Link className="button fintech-cta-primary" href="/marketing#host-shield">
          Guard My Property (Landlords)
        </Link>
      </div>
    </FintechCard>
  );
}

function ProfessionalBlock({ weeklyRate }: { weeklyRate: string }) {
  return (
    <FintechCard
      variant="emerald"
      kicker="Block B · Professional Mobility · Be Great to Yourself"
      title="For Traveling Professionals: Leverage Your Credentials"
      badge="$1,500.00 Move-Out Vault"
      badgeTone="active"
    >
      <p className="note">
        Being &ldquo;good&rdquo; to yourself is overpaying for a rigid, extended-stay hotel room
        just to avoid a predatory down payment. Being great to yourself means letting your
        professional status unlock premium, deposit-free housing.
      </p>

      <div className="fintech-pillar-list">
        <div className="fintech-pillar-item">
          <span className="fintech-pillar-item__index">01</span>
          <div>
            <strong>Zero Security Deposits:</strong>
            <p className="note">
              Your verified status and timeline across all 4 Purpose-Verified cohorts
              (Contract-Assignment, Academic-Enrollment, Seasonal-Remote 14d+, and
              Insurance-Relocation) act as your collateral—while 14.3% of each weekly payment builds
              your Move-Out Vault toward a $1,500.00 reserve.
            </p>
          </div>
        </div>

        <div className="fintech-pillar-item">
          <span className="fintech-pillar-item__index">02</span>
          <div>
            <strong>Frictionless Onboarding:</strong>
            <p className="note">
              Skip the redundant, invasive screening processes of traditional real estate tech.
            </p>
          </div>
        </div>

        <div className="fintech-pillar-item">
          <span className="fintech-pillar-item__index">03</span>
          <div>
            <strong>Curated Work &amp; Sanctuary Spaces:</strong>
            <p className="note">
              Access a premium inventory of spaces tailored exclusively for focused professionals,
              clinical rotators, remote builders, and relocating families.
            </p>
          </div>
        </div>
      </div>

      <div className="fintech-spec-rows">
        <div className="row">
          <span>Weekly billing</span>
          <strong>{weeklyRate} ($35.00/day · $29.99/day net)</strong>
        </div>
        <div className="row">
          <span>Bank check</span>
          <strong>90 days of deposits (3.00x coverage)</strong>
        </div>
        <div className="row">
          <span>GMF Move-Out Vault goal (14.3% share)</span>
          <strong>$1,500.00</strong>
        </div>
        <div className="row">
          <span>Access</span>
          <strong>Agreement QR and smart lock</strong>
        </div>
      </div>

      <div className="actions">
        <Link className="button fintech-cta-primary" href="/underwriting">
          Unlock Deposit-Free Housing (Professionals)
        </Link>
      </div>
    </FintechCard>
  );
}
