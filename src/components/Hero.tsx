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
            alt="VettedRent Crest"
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
            Explore Stays
          </Link>
          <Link className="text-button" href="/underwriting">
            Book Now
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      <section className="google-stage relative z-10" style={{ paddingBottom: "2rem" }}>
        {!isLandlord ? (
          <div className="google-headline">
            <h1>Move-in ready stays from $45/day.</h1>
            <p>
              Book furnished rooms, suites, and townhomes with{" "}
              <strong>$0 Security Deposit</strong>, <strong>No Credit Check</strong>, and{" "}
              <strong>Instant Bank Link Setup</strong>.
            </p>
          </div>
        ) : (
          <div className="google-headline">
            <h1>Host verified mid-term guests with confidence.</h1>
            <p>
              Welcome pre-verified traveling professionals with{" "}
              <strong>$0 Security Deposit</strong> friction, <strong>No Credit Check</strong>{" "}
              delays, and <strong>Instant Bank Link Setup</strong>.
            </p>
          </div>
        )}

        <div className="google-pill-row" aria-label="Space tiers">
          <div className="google-info-pill">
            <strong>RoomSanctuary · $45/day</strong>
            <span>Private Furnished Room</span>
          </div>
          <div className="google-info-pill">
            <strong>PrivateSuite · $75/day</strong>
            <span>En-Suite Bath &amp; Workspace</span>
          </div>
          <div className="google-info-pill">
            <strong>ExecutiveTownhome · $106/day</strong>
            <span>Entire Multi-Bedroom Home</span>
          </div>
        </div>

        <div className="actions" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            className="button"
            href="/underwriting?tier=RoomSanctuary&weeklyCents=31500&days=30&cohort=Contract-Assignment&jurisdiction=MD-PG"
          >
            Book Now — $0 Security Deposit →
          </Link>
          <Link className="button button-secondary" href="/">
            Search Destinations &amp; Dates →
          </Link>
        </div>
      </section>
    </div>
  );
}
