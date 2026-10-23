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
          <h1>VettedRent</h1>
          <p className="lede">Weekly stays for hosts and lodgers.</p>
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
            <strong>90 days of deposits</strong>
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
          <Link href="/underwriting">Connect a bank</Link>
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
