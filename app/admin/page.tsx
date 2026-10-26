"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { LandlordYieldCalculator } from "@/components/landlord-yield-calculator";
import { SupplyOutreachConsole } from "@/components/supply-outreach-console";
import { ValuationCounter } from "@/components/ValuationCounter";
import { WeeklyLiquiditySpreadPanel } from "@/components/weekly-liquidity-spread-panel";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import { isAdminRole, resolveCallerRole } from "@/lib/host-access";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type AdminGate = "checking" | "signed-out" | "denied" | "authorized";

export default function AdminPortalPage() {
  const [gate, setGate] = useState<AdminGate>("checking");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    try {
      const supabase = getSupabaseBrowserClient();
      void verifyAdminSession().then((next) => {
        if (!cancelled) {
          setGate(next);
        }
      });
      const { data } = supabase.auth.onAuthStateChange(() => {
        void verifyAdminSession().then((next) => {
          if (!cancelled) {
            setGate(next);
          }
        });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      setGate("signed-out");
    }

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">Protected Internal Route · /admin</p>
          <h1>VettedRent Treasury &amp; Admin Console</h1>
        </div>
        <nav className="actions" aria-label="Admin navigation">
          <Link className="button button-secondary" href="/">
            ← Public Site
          </Link>
          <Link className="button button-secondary" href="/dashboard">
            Dashboard
          </Link>
        </nav>
      </header>

      {gate === "checking" ? (
        <article className="panel">
          <p className="note">Verifying administrator credentials...</p>
        </article>
      ) : null}

      {gate === "signed-out" ? <AdminSignInGate /> : null}

      {gate === "denied" ? (
        <article className="panel">
          <h2>Administrator Access Required</h2>
          <p className="note">
            Financial telemetry, valuation milestones, 21-day float calculations, and ledger
            breakdowns are restricted to authorized admin and host accounts.
          </p>
          <div className="actions">
            <Link className="button" href="/">
              Return to Search
            </Link>
          </div>
        </article>
      ) : null}

      {gate === "authorized" ? (
        <section className="stack" aria-label="Protected financial and treasury controls">
          <ValuationCounter variant="full" />
          <WeeklyLiquiditySpreadPanel />
          <LandlordYieldCalculator initialJurisdictionCode={DEFAULT_JURISDICTION_CODE} />
          <SupplyOutreachConsole />
        </section>
      ) : null}
    </main>
  );
}

async function verifyAdminSession(): Promise<AdminGate> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return "signed-out";
    }
    const role = await resolveCallerRole(supabase, data.user);
    return isAdminRole(role) ? "authorized" : "denied";
  } catch {
    return "signed-out";
  }
}

function AdminSignInGate() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${window.location.origin}/admin` },
      });
      if (otpError) {
        setError("Could not send administrator sign-in link.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not send administrator sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel stack">
      <div>
        <h2>Protected Admin Sign-In</h2>
        <p className="note">
          Sign in with an authorized administrator or host account to inspect treasury float,
          valuation milestones, and ledger splits.
        </p>
      </div>
      {sent ? (
        <p className="payload">
          Check your email ({email}) for your magic sign-in link to unlock the admin console.
        </p>
      ) : (
        <form className="stack" onSubmit={(e) => void handleSignIn(e)}>
          <label className="field">
            <span>Administrator Email</span>
            <input
              type="email"
              required
              placeholder="admin@vettedrent.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Sending Link..." : "Send Admin Sign-In Link →"}
          </button>
        </form>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
