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
          <p className="pass-kicker">VettedRent Category Manifesto · The Shift From Settling to Greatness</p>
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
            <Link className="button" href="/marketing#host-shield">
              Guard My Property (Landlords)
            </Link>
            <Link className="button button-secondary" href="/underwriting">
              Unlock Deposit-Free Housing (Professionals)
            </Link>
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Why We Exist</p>
              <h2>The Shift From Settling to Greatness</h2>
            </div>
            <span className="chip">Be Great to Yourself.</span>
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

        <article className="panel">
          <h2>Featured stay</h2>
          <div className="row">
            <span>{stay.name}</span>
            <span className="chip">{weeklyRate} / week</span>
          </div>
          <p className="note">{stay.geoCompliance}</p>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Block A · Landlord Protection</p>
              <h2>For Landlords: Command Your Cash Flow</h2>
            </div>
            <span className="chip">75.5% Host Payout</span>
          </div>
          <p className="note">
            Being &ldquo;good&rdquo; to yourself is buying property insurance and hoping you never
            have to use it. Being great to yourself means utilizing an underwriting platform that
            ensures you never have to worry about a default in the first place.
          </p>
          <div className="stack">
            <p className="note">
              <strong>Institutional Underwriting:</strong> Professional credentials and Plaid 3.00x
              income velocity verification replace unreliable, surface-level credit checks.
            </p>
            <p className="note">
              <strong>Guaranteed Revenue Escrow:</strong> Structural protection from the 14.3% GMF
              Escrow means your mid-term revenue (75.5% automated weekly host payouts) is fully
              secured against eviction and rollover risks.
            </p>
            <p className="note">
              <strong>Automated Compliance:</strong> Zero administrative bloat—our Revocable Lodging
              License engine handles state statutory ceilings (MD-PG, MD, FL, TX, CA, NY),
              automated document parsing, and weekly micro-deductions seamlessly.
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

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Block B · Professional Mobility</p>
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
              <strong>Zero Security Deposits:</strong> Your verified status and timeline across all
              4 Purpose-Verified cohorts (Contract-Assignment, Academic-Enrollment, Seasonal-Remote
              14d+, and Insurance-Relocation) act as your collateral—while 14.3% of each weekly
              payment builds your Move-Out Vault toward a $1,500.00 reserve.
            </p>
            <p className="note">
              <strong>Frictionless Onboarding:</strong> Skip the redundant, invasive screening
              processes of traditional real estate tech.
            </p>
            <p className="note">
              <strong>Curated Work &amp; Sanctuary Spaces:</strong> Access a premium inventory of
              spaces tailored exclusively for focused professionals, clinical rotators, remote
              builders, and relocating families.
            </p>
          </div>
          <div className="row">
            <span>Weekly billing</span>
            <strong>{weeklyRate}</strong>
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
