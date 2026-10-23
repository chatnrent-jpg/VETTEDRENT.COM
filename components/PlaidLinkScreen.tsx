"use client";

import Link from "next/link";
import { useState } from "react";
import { JurisdictionSelect } from "@/components/jurisdiction-select";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import { defaultContractTerm, type ContractTerm } from "@/lib/underwriting-contract";

/** Displayed weekly stay on the dashboard, in integer cents. */
const WEEKLY_STAY_CENTS = 24500;

export function PlaidLinkScreen() {
  const initial = defaultContractTerm();
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const { phase, error, decision, ready, open, canSimulate, simulate } = usePlaidLinkFlow(
    WEEKLY_STAY_CENTS,
    contract,
    jurisdictionCode,
  );
  const checking = phase === "checking";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Connect a bank</h1>
          <p className="lede">
            A weekly stay checks 90 days of deposits, an active contract that lasts through the
            intended stay, and the listing location's transient ceiling.
          </p>
        </div>
      </header>

      <section className="stack" aria-label="Bank connection">
        <article className="panel">
          <h2>Contract and credential</h2>
          <p className="note">
            A 13-week assignment defaults to 90 days. Credential {initial.credentialIdentifier} or{" "}
            {initial.credentialType}. The contract end date must be on or after the intended stay
            end date.
          </p>
          <label className="field">
            <span>Credential</span>
            <select
              value={contract.credentialType}
              onChange={(event) => setContract({ ...contract, credentialType: event.target.value })}
            >
              <option value="Contract-Assignment">Contract-Assignment</option>
              <option value="RN-MD-Compact">RN-MD-Compact</option>
            </select>
          </label>
          <label className="field">
            <span>Credential identifier</span>
            <input
              value={contract.credentialIdentifier}
              onChange={(event) => setContract({ ...contract, credentialIdentifier: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Contract end date</span>
            <input
              type="date"
              value={contract.contractEndDate}
              onChange={(event) => setContract({ ...contract, contractEndDate: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Intended stay end date</span>
            <input
              type="date"
              value={contract.intendedStayEndDate}
              onChange={(event) => setContract({ ...contract, intendedStayEndDate: event.target.value })}
            />
          </label>
          <JurisdictionSelect value={jurisdictionCode} onChange={setJurisdictionCode} />
        </article>
        <article className="panel">
          <h2>Deposit history</h2>
          {canSimulate ? (
            <p className="note">
              Plaid keys are not configured. This runs a simulated 90-day deposit check for the
              signed-in account against the weekly rate of {formatCents(WEEKLY_STAY_CENTS)}.
            </p>
          ) : (
            <p className="note">
              Plaid opens a secure bank login. VettedRent receives the deposit history it needs
              for the weekly rate of {formatCents(WEEKLY_STAY_CENTS)}. The bank login stays with
              Plaid.
            </p>
          )}
          {phase === "loading" ? <p className="note">Preparing the bank connection.</p> : null}
          {checking ? <p className="note">Reading 90 days of deposits and the contract term.</p> : null}
          {decision ? <Decision decision={decision} /> : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="actions">
            {canSimulate ? (
              <button
                type="button"
                className="button"
                disabled={phase === "loading" || checking}
                onClick={() => simulate(contract)}
              >
                Simulate 90-day bank check
              </button>
            ) : (
              <button type="button" className="button" disabled={!ready || checking} onClick={() => open()}>
                Connect bank
              </button>
            )}
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
  decision: {
    approved: boolean;
    ratio: number;
    monthlyInflowEstimated: number;
    simulated: boolean;
    rejection: string | null;
    credentialType: string;
    contractEndDate: string;
    intendedStayEndDate: string;
    geoCompliance: string;
  };
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
      <div className="row">
        <span>Contract end</span>
        <strong>{decision.contractEndDate}</strong>
      </div>
      <div className="row">
        <span>Intended stay end</span>
        <strong>{decision.intendedStayEndDate}</strong>
      </div>
      <p className="note">
        Estimated monthly deposits {formatDollars(decision.monthlyInflowEstimated)}. Approval
        requires 3.00x coverage of the four-week stay and a contract that lasts through the
        intended stay. Credential {decision.credentialType}.
      </p>
      {decision.geoCompliance ? <p className="note">{decision.geoCompliance}</p> : null}
      {decision.rejection ? (
        <p className="error" role="alert">
          {decision.rejection}
        </p>
      ) : null}
      {decision.simulated ? <p className="note">Simulated 90-day deposits.</p> : null}
    </div>
  );
}

function formatCents(cents: number): string {
  return formatDollars(cents / 100);
}

function formatDollars(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
