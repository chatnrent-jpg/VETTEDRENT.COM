import Link from "next/link";

export interface ProductLedHeroProps {
  portalType?: "tenant" | "landlord";
}

export function ProductLedHero({ portalType = "tenant" }: ProductLedHeroProps) {
  const isLandlord = portalType === "landlord";

  return (
    <div className="relative z-10">
      <header className="google-topbar relative z-10">
        <Link href="/" className="google-logo">
          <img
            src="/vettedrent-logo-mark.jpg"
            alt="VettedRent.Com Crest"
            className="google-logo-badge"
            width={42}
            height={42}
          />
          <div className="google-logo-lockup">
            <strong>
              VettedRent<em className="google-logo-domain">.Com</em>
            </strong>
            <span>Be Great to Yourself.</span>
          </div>
        </Link>

        <nav className="google-nav" aria-label="Main navigation">
          <Link className="text-button" href="/">
            Home
          </Link>
          <Link className="text-button" href="/underwriting">
            60s Verification
          </Link>
          <Link className="text-button" href="/jurisdictions/MD-PG">
            MD-PG Guide
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      <section className="google-stage relative z-10" style={{ paddingBottom: "2rem" }}>
        <div
          className="vettilo-fintech-badge"
          aria-label="VettedRent.com · Powered by Vettilo™ UMI Engine"
        >
          <span className="vettilo-fintech-badge__top">
            <span className="fintech-live-dot" aria-hidden="true" />
            VettedRent.com · Powered by Vettilo™
          </span>
          <span className="vettilo-fintech-badge__sub">
            Vettilo (vettilo.com) proprietary Underwritten Mid-Term Infrastructure (UMI) engine
            powering payroll webhooks, the 14.3% GMF Escrow Vault &amp; revocable commercial
            license tokens
          </span>
        </div>

        {!isLandlord ? (
          <div className="google-headline">
            <h1>$45.00 / day. $0 deposit.</h1>
            <p>
              <strong>$315.00/wk</strong> · <strong>$45.00/day</strong> (
              <strong>$38.56/day net</strong> after +$6.44/day 14.3% GMF Vault credit) —{" "}
              <strong>84% less</strong> than <strong>$277.00/night</strong> hotel &amp; aggregator
              rates. Be Great to Yourself.
            </p>
          </div>
        ) : (
          <div className="google-headline">
            <h1>Unvetted renting is over.</h1>
            <p>
              Get <strong>$237.83/wk – $475.65/wk</strong> (
              <strong>$1,030.58/mo – $2,061.15/mo net</strong>) guaranteed payout from 3.0x
              bank-verified clinical &amp; contractor guests with zero eviction holdovers.
            </p>
          </div>
        )}

        <div className="actions" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            className="button"
            href="/underwriting?tier=RoomSanctuary&weeklyCents=31500&days=90&cohort=Contract-Assignment&jurisdiction=MD-PG"
          >
            Lock In $45.00/Day ($0 Security Deposit) →
          </Link>
          <Link className="button button-secondary" href="/">
            Open Interactive Availability Calendar →
          </Link>
        </div>
      </section>
    </div>
  );
}
