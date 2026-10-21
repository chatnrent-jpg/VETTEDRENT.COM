"use client";

import Link from "next/link";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";

/** Displayed weekly stay on the dashboard, in integer cents. */
const WEEKLY_STAY_CENTS = 24500;

export function PlaidLinkScreen() {
  const { phase, error, decision, ready, open } = usePlaidLinkFlow(WEEKLY_STAY_CENTS);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Connect a bank</h1>
          <p className="lede">
            A weekly stay checks 90 days of deposits before billing starts.
          </p>
        </div>
      </header>

      <section className="stack" aria-label="Bank connection">
        <article className="panel">
          <h2>Deposit history</h2>
          <p className="note">
            Plaid opens a secure bank login. VettedRent receives the deposit history it needs
            for the weekly rate of {formatCents(WEEKLY_STAY_CENTS)}. The bank login stays with
            Plaid.
          </p>
          {phase === "loading" ? <p className="note">Preparing the bank connection.</p> : null}
          {phase === "checking" ? <p className="note">Reading 90 days of deposits.</p> : null}
          {decision ? <Decision decision={decision} /> : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="actions">
            <button type="button" className="button" disabled={!ready || phase === "checking"} onClick={() => open()}>
              Connect bank
            </button>
            <Link className="text-link" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}

function Decision({
  decision,
}: {
  decision: { approved: boolean; ratio: number; monthlyInflowEstimated: number };
}) {
  return (
    <div className="stack">
      <div className="row">
        <span>Result</span>
        <strong>{decision.approved ? "Approved" : "Not approved"}</strong>
      </div>
      <div className="row">
        <span>Coverage</span>
        <strong>{decision.ratio.toFixed(2)}x</strong>
      </div>
      <p className="note">
        Estimated monthly deposits {formatDollars(decision.monthlyInflowEstimated)}. Approval
        requires 3x the four-week stay.
      </p>
    </div>
  );
}

function formatCents(cents: number): string {
  return formatDollars(cents / 100);
}

function formatDollars(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
