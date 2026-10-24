import Link from "next/link";
import { defaultGeoStatusLabel } from "@/lib/geo-compliance";
import { getFeaturedStay } from "@/lib/host-listing";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FALLBACK_STAY = {
  name: "VettedRent Weekly Room",
  weeklyPriceCents: 24500,
  geoCompliance: defaultGeoStatusLabel(),
};

export default async function HomePage() {
  const stay = await loadFeaturedStay();
  const weeklyRate = formatCents(stay.weeklyPriceCents);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">Purpose-Driven Pleasure · Pleasure-Driven Purpose</p>
          <h1>VettedRent</h1>
          <p className="lede">
            The universal Purpose-Verified Stay platform. We turn temporary purpose into
            frictionless pleasure for guests, and temporary pleasure or sanctuary into verified,
            rollover-protected purpose for property hosts.
          </p>
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
              <p className="pass-kicker">Category Philosophy</p>
              <h2>Purpose-Driven Pleasure · Pleasure-Driven Purpose</h2>
            </div>
            <span className="chip">4 Verified Cohorts</span>
          </div>
          <div className="row">
            <span>Purpose-Driven Pleasure</span>
            <strong>Contract-Assignment &amp; Academic-Enrollment</strong>
          </div>
          <p className="note">
            Turns demanding temporary purpose—traveling healthcare assignments (VettedCare /
            VettedME), corporate contracts, university semesters, and clinical rotations—into
            frictionless pleasure with zero-credit-check 90-day deposit underwriting, $1,500 GMF
            escrow wealth-building, and instant smart-lock room arrival.
          </p>
          <div className="row">
            <span>Pleasure-Driven Purpose</span>
            <strong>Seasonal-Remote &amp; Insurance-Relocation</strong>
          </div>
          <p className="note">
            Turns temporary pleasure and sanctuary—extended snowbird / digital nomad stays (14-day
            minimum floor) and ALE insurance displacement housing—into verified, rollover-protected
            purpose with documented departure dates, 3.00x inflow coverage, and state transient
            ceiling guardrails.
          </p>
        </article>

        <article className="panel">
          <h2>Featured stay</h2>
          <div className="row">
            <span>{stay.name}</span>
            <span className="chip">{weeklyRate} / week</span>
          </div>
          <p className="note">{stay.geoCompliance}</p>
        </article>

        <article className="panel">
          <h2>For lodgers</h2>
          <p className="note">A weekly room, checked before billing starts, with a code for the door.</p>
          <div className="row">
            <span>Weekly billing</span>
            <strong>{weeklyRate}</strong>
          </div>
          <div className="row">
            <span>Bank check</span>
            <strong>90 days of deposits (3.00x coverage)</strong>
          </div>
          <p className="note">Connect a bank after signing in. The bank login stays with Plaid.</p>
          <div className="row">
            <span>Escrow vault goal</span>
            <strong>$1,500.00</strong>
          </div>
          <div className="row">
            <span>Access</span>
            <strong>Agreement QR and smart lock</strong>
          </div>
        </article>

        <article className="panel">
          <h2>For hosts</h2>
          <p className="note">Each stay is tied to the person at the door, and the weekly payment is watched.</p>
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
          <p className="note">Scan the agreement QR to see that status immediately.</p>
        </article>

        <p className="note">
          Connect a bank requires signing in first.{" "}
          <Link href="/underwriting">Connect a bank</Link> ·{" "}
          <Link href="/marketing">Explore the Marketing &amp; Growth Command Center</Link>
        </p>
      </section>
    </main>
  );
}

async function loadFeaturedStay(): Promise<{ name: string; weeklyPriceCents: number; geoCompliance: string }> {
  try {
    return await getFeaturedStay(getSupabaseServerClient());
  } catch {
    return FALLBACK_STAY;
  }
}

function formatCents(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const remainder = Math.abs(cents) % 100;
  return `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}
