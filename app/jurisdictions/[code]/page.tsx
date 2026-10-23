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
            Switch between statutory rulesets for VettedCare and VettedME contract stays:
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
