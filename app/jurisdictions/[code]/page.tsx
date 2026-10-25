import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandlordYieldCalculator } from "@/components/landlord-yield-calculator";
import { LeadCaptureForm } from "@/components/lead-capture-form";
import {
  JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_TIER_LIST,
  EXTERNAL_OFFER_PRESETS,
  calculateDailyRateComparison,
} from "@/lib/daily-rate-comparison";
import {
  calculateJurisdictionYield,
  formatCurrencyCents,
  jurisdictionMarketSummary,
} from "@/lib/marketing-calculator";
import { PURPOSE_COHORTS } from "@/lib/underwriting-contract";

export function generateStaticParams(): Array<{ code: string }> {
  return JURISDICTION_RULES.map((rule) => ({ code: rule.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const rule = resolveJurisdiction(code);
  if (!rule) {
    return {
      title: "Jurisdiction Not Found · VettedRent",
    };
  }
  const summary = jurisdictionMarketSummary(rule);
  return {
    title: `${summary.headline} · VettedRent`,
    description: `${summary.subheadline}. ${summary.hostPitch}`,
  };
}

export default async function JurisdictionLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const rule = resolveJurisdiction(code);
  if (!rule) {
    notFound();
  }

  const summary = jurisdictionMarketSummary(rule);
  const sampleYield = calculateJurisdictionYield(rule.code);
  const daily90 = calculateDailyRateComparison(31500, 90);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">Programmatic SEO Jurisdiction Guide · {rule.code}</p>
          <h1>{summary.headline}</h1>
          <p className="lede">{summary.subheadline}</p>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/marketing">
            Marketing Hub
          </Link>
          <Link className="button button-secondary" href="/underwriting">
            Verify Cohort
          </Link>
          <Link className="button" href="/dashboard">
            Open Dashboard
          </Link>
        </div>
      </header>

      <section className="stack">
        <article className="panel stay-card">
          <div className="stay-card-head">
            <h2>{rule.name} Statutory Profile</h2>
            <span
              className="stay-badge"
              data-status={
                sampleYield.allowed
                  ? "active"
                  : rule.judicialRiskTier === "restricted"
                    ? "terminated"
                    : "warning"
              }
            >
              {rule.judicialRiskTier.toUpperCase()} RISK
            </span>
          </div>
          <p className="note">{summary.hostPitch}</p>
          <div className="row">
            <span>Jurisdiction code</span>
            <strong>{rule.code}</strong>
          </div>
          <div className="row">
            <span>Statutory transient ceiling</span>
            <strong>{rule.maxTransientDays} days</strong>
          </div>
          <div className="row">
            <span>Mandatory agreement structure</span>
            <strong>
              {rule.complianceStructure === "revocable_lodging_license"
                ? "Revocable Lodging License"
                : "Residential Tenancy"}
            </strong>
          </div>
          <div className="row">
            <span>Guaranteed landlord payout ($315/wk Room Tier)</span>
            <span className="chip">
              {formatCurrencyCents(sampleYield.hostWeeklyCents)}/wk (
              {formatCurrencyCents(sampleYield.hostMonthlyCents)}/mo net ·{" "}
              {formatCurrencyCents(sampleYield.hostTotalCents)} / 90d)
            </span>
          </div>
          <div className="row">
            <span>7–90 Day Daily Rate Advantage ($315/wk · $45.00/day Room Tier)</span>
            <strong>
              $315/wk · {formatCurrencyCents(daily90.grossDailyRateCents)}/day (
              {formatCurrencyCents(daily90.netEffectiveDailyRateCents)}/day net after +
              {formatCurrencyCents(daily90.dailyGmfVaultCreditCents)}/day 14.3% GMF Vault credit) ·{" "}
              {daily90.savingsPercentage}% less than{" "}
              {formatCurrencyCents(daily90.aggregatorNightlyCents)}/night hotel &amp; aggregator
              rates
            </strong>
          </div>
          <p className="note">{summary.lodgerPitch}</p>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">
                14–90 Day Daily Rate Compare &amp; Contrast · Be Great to Yourself.
              </p>
              <h2>
                {formatCurrencyCents(daily90.grossDailyRateCents)}/Day VettedRent vs. Competing
                Market Offerings in {rule.name}
              </h2>
            </div>
            <span className="stay-badge" data-status="active">
              $0 Deposit + 14.3% Vault Credit
            </span>
          </div>
          <p className="note">
            Competing nightly rates in {rule.name} depend on who is making the offering—from budget
            extended-stay motels and unvetted furnished sublets to Airbnb/VRBO listings,
            Cozycozy/OTA aparthotels, and corporate relocation suites. Temporary workers &amp;
            contractors, university/vocational students, 14d+ seasonal remote professionals, and
            insurance-relocated families lock in{" "}
            <strong>{formatCurrencyCents(daily90.grossDailyRateCents)}/day</strong> (
            {formatCurrencyCents(daily90.netEffectiveDailyRateCents)}/day net) while stacking 14.3%
            (+{formatCurrencyCents(daily90.dailyGmfVaultCreditCents)}/day) into their $1,500.00 GMF
            Move-Out Vault.
          </p>
          <div className="stack">
            {EXTERNAL_OFFER_PRESETS.map((preset) => {
              const cmp30 = calculateDailyRateComparison(
                31500,
                30,
                preset.nightlyRateCents,
                preset.upfrontDepositCents,
              );
              const cmp90 = calculateDailyRateComparison(
                31500,
                90,
                preset.nightlyRateCents,
                preset.upfrontDepositCents,
              );
              return (
                <div key={preset.id} className="row">
                  <span>{preset.providerLabel}</span>
                  <strong>
                    Save { cmp30.savingsPercentage }% · 30d saves{" "}
                    {formatCurrencyCents(cmp30.totalSavingsVsAggregatorCents)} · 90d saves{" "}
                    {formatCurrencyCents(cmp90.totalSavingsVsAggregatorCents)}
                    {preset.upfrontDepositCents > 0
                      ? ` (+ ${formatCurrencyCents(preset.upfrontDepositCents)} deposit avoided)`
                      : ""}
                  </strong>
                </div>
              );
            })}
            {DAILY_RATE_TIER_LIST.map((tier) => (
              <div key={tier.id} className="row">
                <span>VettedRent Tier: {tier.label}</span>
                <strong>
                  {formatCurrencyCents(tier.netEffectiveDailyRateCents)}/day net (after +
                  {formatCurrencyCents(tier.dailyGmfVaultCreditCents)}/day Vault credit)
                </strong>
              </div>
            ))}
          </div>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            <Link
              className="button"
              href={`/underwriting?jurisdiction=${encodeURIComponent(rule.code)}&days=90`}
            >
              Lock In $45.00/Day ($38.56/Day Net) in {rule.code} →
            </Link>
            <Link className="button button-secondary" href="/#daily-rate-calculator">
              Compare Custom Nightly Offer →
            </Link>
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Universal Purpose-Verified Stay Matrix</p>
              <h2>4 Temporary Stay Cohorts in {rule.name}</h2>
            </div>
            <span className="chip">3.0x Velocity Underwriting</span>
          </div>
          <p className="note">
            Every stay in {rule.name} is underwritten against one of the 4 Purpose-Verified Stay
            cohorts and checked against the {rule.maxTransientDays}-day statutory ceiling.
          </p>
          <div className="stack">
            {PURPOSE_COHORTS.map((cohort) => {
              const cohortYield = calculateJurisdictionYield(
                rule.code,
                31500,
                cohort.defaultStayDays,
              );
              return (
                <div key={cohort.id} className="panel">
                  <div className="stay-card-head">
                    <strong>{cohort.title}</strong>
                    <span
                      className="stay-badge"
                      data-status={
                        cohortYield.allowed
                          ? "active"
                          : rule.judicialRiskTier === "restricted"
                            ? "terminated"
                            : "warning"
                      }
                    >
                      {cohortYield.allowed
                        ? `Matched (${cohort.defaultStayDays} / ${rule.maxTransientDays}d)`
                        : `Blocked (${cohort.defaultStayDays} / ${rule.maxTransientDays}d)`}
                    </span>
                  </div>
                  <p className="note">
                    <strong>{cohort.audience}</strong> — {cohort.summary}
                  </p>
                  <div className="row">
                    <span>Required credential</span>
                    <strong>
                      {cohort.identifierLabel} ({cohort.defaultIdentifier})
                    </strong>
                  </div>
                  <div className="row">
                    <span>Stay floor / benchmark term</span>
                    <strong>
                      {cohort.minStayDays}d min · {cohort.defaultStayDays}d benchmark
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <LandlordYieldCalculator initialJurisdictionCode={rule.code} />

        <LeadCaptureForm
          defaultJurisdictionCode={rule.code}
          defaultUtmSource="seo_jurisdiction"
          defaultUtmMedium="organic"
          defaultUtmCampaign={`jurisdiction_${rule.code.toLowerCase()}`}
        />

        <article className="panel">
          <h2>Compare All Covered Jurisdictions</h2>
          <p className="note">
            Switch between statutory rulesets for Purpose-Verified weekly stays:
          </p>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            {JURISDICTION_RULES.map((item) => (
              <Link
                key={item.code}
                className={
                  item.code === rule.code ? "button" : "button button-secondary"
                }
                href={`/jurisdictions/${item.code}`}
              >
                {item.code} ({item.maxTransientDays}d)
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
