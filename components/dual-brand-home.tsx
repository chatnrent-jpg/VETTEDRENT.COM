"use client";

import Link from "next/link";
import { useState } from "react";
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
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">
            {isLandlord
              ? "Landlord Mode · Unvetted renting is over."
              : "Professional Mode · Be great to yourself."}
          </p>
          <h1>VettedRent</h1>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/marketing">
            Marketing &amp; Growth
          </Link>
          <Link className="button" href="/dashboard">
            Sign in / Open dashboard
          </Link>
        </div>
      </header>

      <section className="stack">
        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Dual-Brand Perspective Switcher</p>
              <h2>
                {isLandlord
                  ? "Unvetted renting is over."
                  : "Be great to yourself."}
              </h2>
            </div>
            <span className="chip">
              {isLandlord ? "Landlord Shield Active" : "Professional Vault Active"}
            </span>
          </div>

          <div
            className="toggle"
            role="group"
            aria-label="Switch homepage perspective between Landlords and Traveling Professionals"
            style={{ flexWrap: "wrap" }}
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

          {isLandlord ? (
            <div className="stack">
              <p className="note">
                <strong>Unvetted renting is over.</strong> Replace hope-based tenant screening with
                institutional underwriting, Plaid wage assignment &amp; 3.00x deposit velocity,
                14.3% GMF Escrow backstops, Revocable Commercial / Lodging Licenses, and automated
                statutory transient compliance across MD-PG, MD, FL, TX, CA, and NY.
              </p>
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
          ) : (
            <div className="stack">
              <p className="note">
                <strong>Be great to yourself.</strong> Let your verified status unlock deposit-free
                weekly stays across all 4 Purpose-Verified Stay cohorts (Contract-Assignment,
                Academic-Enrollment, Seasonal-Remote 14d+, and Insurance-Relocation) starting at{" "}
                <strong>$35.00 / day</strong> ($29.99/day net after 14.3% GMF Vault credit) while
                every weekly payment builds your $1,500.00 GMF Move-Out Vault.
              </p>
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
          )}
        </article>

        <article className="panel stay-card">
          <p className="pass-kicker">
            VettedRent Category Manifesto · The Shift From Settling to Greatness
          </p>
          <h2>
            The unvetted rental market forces you to settle for risk. It’s time to be great to
            yourself.
          </h2>
          <p className="lede">
            Stop chasing late payments, parsing messy documents manually, and dreading eviction
            cycles. VettedRent introduces the first Guaranteed, Underwritten Mid-Term
            Marketplace—combining institutional-grade credentialing with an active escrow guarantee
            fund. Zero friction. Total income protection.
          </p>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            <Link
              className={isLandlord ? "button" : "button button-secondary"}
              href="/marketing#host-shield"
            >
              Guard My Property (Landlords)
            </Link>
            <Link
              className={!isLandlord ? "button" : "button button-secondary"}
              href="/underwriting"
            >
              Unlock Deposit-Free Housing (Professionals)
            </Link>
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Featured Stay · Daily Rate Breakdown</p>
              <h2>{stay.name}</h2>
            </div>
            <span className="chip">
              {formatCurrencyCents(featuredComparison.grossDailyRateCents)} / day ({weeklyRate} /
              week)
            </span>
          </div>
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
              +{formatCurrencyCents(featuredComparison.dailyGmfVaultCreditCents)} / day toward your
              $1,500.00 Move-Out Vault (&ldquo;Be Great to Yourself.&rdquo;)
            </strong>
          </div>
          <p className="note">{stay.geoCompliance}</p>
        </article>

        <DailyRateAggregatorCalculator />

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Why We Exist</p>
              <h2>The Shift From Settling to Greatness</h2>
            </div>
            <span className="chip">
              {isLandlord ? "Unvetted renting is over." : "Be Great to Yourself."}
            </span>
          </div>
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
        </article>

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

        <p className="note">
          Connect a bank requires signing in first.{" "}
          <Link href="/underwriting">Connect a bank</Link> ·{" "}
          <Link href="/marketing">Explore the Marketing &amp; Growth Command Center</Link>
        </p>
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

  function selectExternalPreset(presetId: string) {
    setExternalPresetId(presetId);
    const match = EXTERNAL_OFFER_PRESETS.find((item) => item.id === presetId);
    if (match) {
      setExternalNightlyDollars(String(Math.round(match.nightlyRateCents / 100)));
      setExternalDepositDollars(String(Math.round(match.upfrontDepositCents / 100)));
    }
  }

  return (
    <article className="panel stay-card" id="daily-rate-calculator">
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">
            Universal 4-Cohort Compare &amp; Contrast Engine · Be Great to Yourself.
          </p>
          <h2>14-to-90-Day Daily Rate &amp; External Offer Comparison Calculator</h2>
        </div>
        <span className="stay-badge" data-status="active">
          Save {comparison.savingsPercentage}% vs.{" "}
          {formatCurrencyCents(comparison.aggregatorNightlyCents)}/night
        </span>
      </div>

      <p className="note">
        Outside offerings vary depending on who is making the offer—from budget extended-stay
        motels and unvetted furnished sublets to Airbnb/VRBO listings, Cozycozy/OTA aparthotels, or
        corporate relocation suites. Pick a VettedRent tier, select or enter{" "}
        <strong>any competing nightly rate &amp; upfront deposit</strong>, and slide from 14 to 90
        days to compare and contrast total cash outlay vs. VettedRent&apos;s $0-deposit + 14.3% GMF
        Move-Out Vault model.
      </p>

      <div
        className="toggle"
        role="group"
        aria-label="Select VettedRent lodging tier"
        style={{ flexWrap: "wrap" }}
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

      <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <label className="field" style={{ flex: 1 }}>
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

        <label className="field" style={{ flex: 1 }}>
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

      <div>
        <p className="pass-kicker">Who Is Making the Competing Offer? (Select Preset or Enter Custom)</p>
        <div className="actions" style={{ flexWrap: "wrap", marginTop: "0.4rem" }}>
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

      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="field" style={{ flex: 1 }}>
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

        <label className="field" style={{ flex: 1 }}>
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

      <label className="field">
        <span>
          Intended Stay Duration: <strong>{comparison.stayDays} Days</strong> (Slide 14 to 90 days)
        </span>
        <input
          type="range"
          min={14}
          max={90}
          step={1}
          value={stayDays}
          onChange={(event) => setStayDays(Number(event.target.value) || 90)}
        />
      </label>

      <div className="actions" style={{ flexWrap: "wrap" }}>
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

      <div className="stack">
        <div className="row">
          <span>Gross VettedRent Daily Rate ({formatCurrencyCents(comparison.weeklyRateCents)}/wk)</span>
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
          <strong>{formatCurrencyCents(comparison.externalTotalCashOutlayCents)}</strong>
        </div>
        <div className="row">
          <span>VettedRent Gross Stay Total ({comparison.stayDays} days · $0.00 deposit)</span>
          <strong>{formatCurrencyCents(comparison.vettedRentGrossTotalCents)}</strong>
        </div>
        <div className="row">
          <span>
            Direct Rate Savings vs. {formatCurrencyCents(comparison.aggregatorNightlyCents)}/Night
            Offer ({comparison.stayDays} days)
          </span>
          <span className="stay-badge" data-status="active">
            Save {formatCurrencyCents(comparison.totalSavingsVsAggregatorCents)} (
            {comparison.savingsPercentage}% Off)
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
            {formatCurrencyCents(comparison.totalGmfVaultAccumulatedCents)} toward $1,500.00 Vault
          </strong>
        </div>
        <div className="row">
          <span>Upfront Security Deposit Required on VettedRent</span>
          <strong>$0.00 (Zero Deposit Friction · Be Great to Yourself.)</strong>
        </div>
      </div>

      <p className="note">
        <strong>
          Compare &amp; Contrast Horizon Snapshot ({activeTier.label} vs.{" "}
          {formatCurrencyCents(comparison.aggregatorNightlyCents)}/night offer):
        </strong>{" "}
        {formatCurrencyCents(sample14.totalSavingsVsAggregatorCents)} saved at 14d ·{" "}
        {formatCurrencyCents(sample30.totalSavingsVsAggregatorCents)} saved at 30d ·{" "}
        {formatCurrencyCents(sample90.totalSavingsVsAggregatorCents)} saved at 90d.
      </p>

      <div className="actions" style={{ flexWrap: "wrap" }}>
        <Link
          className="button"
          href={`/underwriting?weeklyCents=${comparison.weeklyRateCents}&days=${comparison.stayDays}&cohort=${encodeURIComponent(selectedCohortId)}&jurisdiction=${encodeURIComponent(selectedJurisdictionCode)}`}
        >
          Lock In {formatCurrencyCents(comparison.grossDailyRateCents)}/Day ($0 Security Deposit) →
        </Link>
        <Link className="button button-secondary" href="/marketing#host-shield">
          Host Shield Yield Model
        </Link>
      </div>
    </article>
  );
}

function LandlordBlock() {
  return (
    <article className="panel stay-card">
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">Block A · Landlord Protection · Unvetted Renting Is Over</p>
          <h2>For Landlords: Command Your Cash Flow</h2>
        </div>
        <span className="chip">75.5% Host Payout</span>
      </div>
      <p className="note">
        Being &ldquo;good&rdquo; to yourself is buying property insurance and hoping you never have
        to use it. Being great to yourself means utilizing an underwriting platform that ensures you
        never have to worry about a default in the first place.
      </p>
      <div className="stack">
        <p className="note">
          <strong>Institutional Underwriting:</strong> Professional credentials and Plaid 3.00x
          income velocity verification replace unreliable, surface-level credit checks.
        </p>
        <p className="note">
          <strong>Guaranteed Revenue Escrow:</strong> Structural protection from the 14.3% GMF
          Escrow means your mid-term revenue (75.5% automated weekly host payouts) is fully secured
          against eviction and rollover risks.
        </p>
        <p className="note">
          <strong>Automated Compliance:</strong> Zero administrative bloat—our Revocable Lodging
          License engine handles state statutory ceilings (MD-PG, MD, FL, TX, CA, NY), automated
          document parsing, and weekly micro-deductions seamlessly.
        </p>
      </div>
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
      <div className="actions">
        <Link className="button" href="/marketing#host-shield">
          Guard My Property (Landlords)
        </Link>
      </div>
    </article>
  );
}

function ProfessionalBlock({ weeklyRate }: { weeklyRate: string }) {
  return (
    <article className="panel stay-card">
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">Block B · Professional Mobility · Be Great to Yourself</p>
          <h2>For Traveling Professionals: Leverage Your Credentials</h2>
        </div>
        <span className="chip">$1,500.00 Move-Out Vault</span>
      </div>
      <p className="note">
        Being &ldquo;good&rdquo; to yourself is overpaying for a rigid, extended-stay hotel room
        just to avoid a predatory down payment. Being great to yourself means letting your
        professional status unlock premium, deposit-free housing.
      </p>
      <div className="stack">
        <p className="note">
          <strong>Zero Security Deposits:</strong> Your verified status and timeline across all 4
          Purpose-Verified cohorts (Contract-Assignment, Academic-Enrollment, Seasonal-Remote 14d+,
          and Insurance-Relocation) act as your collateral—while 14.3% of each weekly payment builds
          your Move-Out Vault toward a $1,500.00 reserve.
        </p>
        <p className="note">
          <strong>Frictionless Onboarding:</strong> Skip the redundant, invasive screening processes
          of traditional real estate tech.
        </p>
        <p className="note">
          <strong>Curated Work &amp; Sanctuary Spaces:</strong> Access a premium inventory of spaces
          tailored exclusively for focused professionals, clinical rotators, remote builders, and
          relocating families.
        </p>
      </div>
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
      <div className="actions">
        <Link className="button" href="/underwriting">
          Unlock Deposit-Free Housing (Professionals)
        </Link>
      </div>
    </article>
  );
}
