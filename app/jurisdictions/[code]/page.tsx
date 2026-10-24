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
            <span>Benchmark 90-day host payout ($245/wk)</span>
            <span className="chip">{formatCurrencyCents(sampleYield.hostTotalCents)}</span>
          </div>
          <p className="note">{summary.lodgerPitch}</p>
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
                24500,
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
