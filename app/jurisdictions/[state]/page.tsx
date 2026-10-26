import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadCaptureForm } from "@/components/lead-capture-form";
import {
  JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import { SPACE_TIER_CARDS } from "@/lib/daily-rate-comparison";
import { PURPOSE_COHORTS } from "@/lib/underwriting-contract";

export function generateStaticParams(): Array<{ state: string }> {
  return JURISDICTION_RULES.map((rule) => ({ state: rule.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const rule = resolveJurisdiction(state);
  if (!rule) {
    return {
      title: "Destination Not Found · VettedRent",
    };
  }
  return {
    title: `Furnished Stays in ${rule.name} · VettedRent`,
    description: `Book furnished rooms, suites, and townhomes in ${rule.name} with $0 Security Deposit, No Credit Check, and Instant Bank Link Setup.`,
  };
}

export default async function JurisdictionLandingPage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const rule = resolveJurisdiction(state);
  if (!rule) {
    notFound();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">Destination Guide · {rule.code}</p>
          <h1>Move-in Ready Stays in {rule.name}</h1>
          <p className="lede">
            Book furnished accommodations in {rule.name} with{" "}
            <strong>$0 Security Deposit</strong>, <strong>No Credit Check</strong>, and{" "}
            <strong>Instant Bank Link Setup</strong>.
          </p>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/">
            Explore Stays
          </Link>
          <Link
            className="button"
            href={`/underwriting?jurisdiction=${encodeURIComponent(rule.code)}&days=30`}
          >
            Book in {rule.code} →
          </Link>
        </div>
      </header>

      <section className="stack">
        <article className="panel stay-card">
          <div className="stay-card-head">
            <h2>Available Space Tiers in {rule.name}</h2>
            <span className="stay-badge" data-status="active">
              $0 Security Deposit
            </span>
          </div>
          <p className="note">
            Choose from three verified furnished spaces in {rule.name} with{" "}
            <strong>$0 Security Deposit</strong>, <strong>No Credit Check</strong>, and{" "}
            <strong>Instant Bank Link Setup</strong>.
          </p>
          <div className="stack">
            {SPACE_TIER_CARDS.map((card) => (
              <div key={card.id} className="row">
                <div>
                  <strong>
                    {card.title} ({card.codeLabel})
                  </strong>
                  <p className="note">{card.summary}</p>
                </div>
                <Link
                  className="button button-secondary"
                  href={`/underwriting?tier=${encodeURIComponent(card.id)}&weeklyCents=${card.weeklyRateCents}&jurisdiction=${encodeURIComponent(rule.code)}&days=30`}
                >
                  {card.dailyPriceLabel} →
                </Link>
              </div>
            ))}
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Who We Host</p>
              <h2>Verified Mid-Term Travelers in {rule.name}</h2>
            </div>
            <span className="chip">Up to {rule.maxTransientDays} Nights</span>
          </div>
          <div className="stack">
            {PURPOSE_COHORTS.map((cohort) => (
              <div key={cohort.id} className="panel">
                <div className="stay-card-head">
                  <strong>{cohort.title}</strong>
                  <span className="stay-badge" data-status="active">
                    {cohort.minStayDays}d+ stays
                  </span>
                </div>
                <p className="note">
                  <strong>{cohort.audience}</strong> — {cohort.summary}
                </p>
              </div>
            ))}
          </div>
        </article>

        <LeadCaptureForm
          defaultJurisdictionCode={rule.code}
          defaultUtmSource="seo_jurisdiction"
          defaultUtmMedium="organic"
          defaultUtmCampaign={`jurisdiction_${rule.code.toLowerCase()}`}
        />

        <article className="panel">
          <h2>Explore Other Destinations</h2>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            {JURISDICTION_RULES.map((item) => (
              <Link
                key={item.code}
                className={
                  item.code === rule.code ? "button" : "button button-secondary"
                }
                href={`/jurisdictions/${item.code}`}
              >
                {item.name} ({item.code})
              </Link>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
