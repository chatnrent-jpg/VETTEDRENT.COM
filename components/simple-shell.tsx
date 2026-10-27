import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The same header, backdrop and footer the landing page uses, so inner pages
 * (dashboard, underwriting) feel like part of one site. Pure layout: no data
 * fetching and no business logic lives here.
 */
export function SimpleShell({
  nav,
  perspective = "tenant",
  children,
}: {
  /** Right-hand header actions (links or buttons). */
  nav?: ReactNode;
  perspective?: "tenant" | "landlord";
  children: ReactNode;
}) {
  return (
    <main className="google-home google-home--unified" data-perspective={perspective}>
      <div
        className="google-hero-backdrop pointer-events-none"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />

      <header className="google-topbar relative z-10" style={{ position: "relative", zIndex: 10 }}>
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
          {nav}
          <ThemeToggle />
        </nav>
      </header>

      <section
        className="google-stage relative z-10"
        style={{ position: "relative", zIndex: 10, width: "100%" }}
      >
        {children}
      </section>

      <footer className="google-footer relative z-10" style={{ position: "relative", zIndex: 10 }}>
        <span>VettedRent · $0 deposit · Maryland</span>
        <div className="google-footer__links">
          <Link href="/">Find a Stay</Link>
          <Link href="/host/onboard">List Your Property</Link>
          <Link href="/dashboard">My Account</Link>
        </div>
      </footer>
    </main>
  );
}
