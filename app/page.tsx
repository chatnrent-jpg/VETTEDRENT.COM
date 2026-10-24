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
          <p className="pass-kicker">
            Be Great to Yourself. · Universal Purpose-Verified Stay Platform
          </p>
          <h1>VettedRent</h1>
          <p className="lede">
            Be Great to Yourself. Weekly Purpose-Verified Stays with 90-day deposit underwriting,
            a 14.3% GMF Move-Out Vault for lodgers, and statutory rollover protection for hosts.
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
              <p className="pass-kicker">Brand Manifesto · Universal Purpose-Verified Stay Platform</p>
              <h2>Be Great to Yourself.</h2>
            </div>
            <span className="chip">4 Verified Cohorts</span>
          </div>
          <div className="row">
            <span>For Lodgers — Be Great to Your Future Self</span>
            <strong>Weekly Micro-Billing + 14.3% GMF Move-Out Vault</strong>
          </div>
          <p className="note">
            Every weekly stay payment automatically sets aside 14.3% into your Guaranteed
            Maintenance Fund (GMF) Move-Out Vault toward a $1,500.00 independence reserve across all
            4 Purpose-Verified Stay cohorts (Contract-Assignment, Academic-Enrollment,
            Seasonal-Remote, and Insurance-Relocation).
          </p>
          <div className="row">
            <span>For Hosts — Be Great to Yourself</span>
            <strong>3.0x Underwriting + Statutory Rollover Peace of Mind</strong>
          </div>
          <p className="note">
            Protect your property and your peace of mind. Every guest is verified for 3.00x 90-day
            deposit coverage, a documented temporary stay purpose, and strict state transient
            ceiling guardrails—so you earn 75.5% weekly payouts with zero statutory tenancy
            rollover anxiety.
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
          <p className="note">
            A weekly room, checked before billing starts, with a code for the door. Be Great to
            Yourself.
          </p>
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
            <span>GMF Move-Out Vault goal (14.3% share)</span>
            <strong>$1,500.00</strong>
          </div>
          <div className="row">
            <span>Access</span>
            <strong>Agreement QR and smart lock</strong>
          </div>
        </article>

        <article className="panel">
          <h2>For hosts</h2>
          <p className="note">
            Each stay is tied to the person at the door, and the weekly payment is watched.
          </p>
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
