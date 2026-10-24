"use client";

import Link from "next/link";
import { useState } from "react";
import { JurisdictionSelect } from "@/components/jurisdiction-select";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import {
  PURPOSE_COHORTS,
  defaultContractTerm,
  resolvePurposeCohort,
  type ContractTerm,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

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
  const activeCohort = resolvePurposeCohort(contract.credentialType);

  function selectCohort(cohortId: PurposeCohortId) {
    setContract(defaultContractTerm(new Date(), cohortId));
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">Pillar 1 · Universal Purpose-Verified Stay Engine</p>
          <h1>Connect a bank &amp; verify stay purpose</h1>
          <p className="lede">
            A weekly stay checks 90 days of deposits (3.00x coverage), a verified temporary stay
            purpose that lasts through the intended stay, and the listing location&apos;s statutory
            transient ceiling.
          </p>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/marketing">
            Marketing Hub
          </Link>
          <Link className="button button-secondary" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>

      <section className="stack" aria-label="Bank connection">
        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">4 Temporary Stay Cohorts</p>
              <h2>Purpose-Verified Stay Cohort &amp; Credential</h2>
            </div>
            <span className="chip">{activeCohort.id}</span>
          </div>

          <div
            className="toggle"
            role="group"
            aria-label="Purpose-Verified Stay Cohort"
            style={{ flexWrap: "wrap" }}
          >
            {PURPOSE_COHORTS.map((cohort) => (
              <button
                key={cohort.id}
                type="button"
                aria-pressed={activeCohort.id === cohort.id}
                onClick={() => selectCohort(cohort.id)}
              >
                {cohort.title}
              </button>
            ))}
          </div>

          <p className="note">
            <strong>{activeCohort.audience}</strong> — {activeCohort.summary}
          </p>

          <label className="field">
            <span>Purpose-Verified Stay cohort</span>
            <select
              value={contract.credentialType}
              onChange={(event) => selectCohort(event.target.value as PurposeCohortId)}
            >
              {PURPOSE_COHORTS.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.title} — {cohort.audience}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{activeCohort.identifierLabel}</span>
            <input
              value={contract.credentialIdentifier}
              onChange={(event) =>
                setContract({ ...contract, credentialIdentifier: event.target.value })
              }
            />
          </label>

          <label className="field">
            <span>{activeCohort.endDateLabel}</span>
            <input
              type="date"
              value={contract.contractEndDate}
              onChange={(event) =>
                setContract({ ...contract, contractEndDate: event.target.value })
              }
            />
          </label>

          <label className="field">
            <span>
              Intended stay end date
              {activeCohort.id === "Seasonal-Remote" ? " (14-day minimum stay floor)" : ""}
            </span>
            <input
              type="date"
              value={contract.intendedStayEndDate}
              onChange={(event) =>
                setContract({ ...contract, intendedStayEndDate: event.target.value })
              }
            />
          </label>

          <div className="row">
            <span>Cohort coverage rule</span>
            <strong>{activeCohort.inflowRuleLabel}</strong>
          </div>

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
    credentialIdentifier: string;
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
        <span>Purpose cohort</span>
        <strong>{decision.credentialType}</strong>
      </div>
      <div className="row">
        <span>Verified credential ID</span>
        <strong>{decision.credentialIdentifier}</strong>
      </div>
      <div className="row">
        <span>Coverage</span>
        <strong>{decision.ratio.toFixed(2)}x</strong>
      </div>
      <div className="row">
        <span>Purpose / contract end</span>
        <strong>{decision.contractEndDate}</strong>
      </div>
      <div className="row">
        <span>Intended stay end</span>
        <strong>{decision.intendedStayEndDate}</strong>
      </div>
      <p className="note">
        Estimated monthly deposits {formatDollars(decision.monthlyInflowEstimated)}. Approval
        requires 3.00x coverage of the four-week stay, a verified purpose that lasts through the
        intended stay, and compliance with the cohort stay floor.
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
