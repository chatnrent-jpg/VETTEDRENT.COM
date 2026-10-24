"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { JurisdictionSelect } from "@/components/jurisdiction-select";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import {
  DEFAULT_JURISDICTION_CODE,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  EXTERNAL_OFFER_PRESETS,
  calculateDailyRateComparison,
} from "@/lib/daily-rate-comparison";
import { intendedStayLengthDays } from "@/lib/geo-compliance";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  PURPOSE_COHORTS,
  addUtcDays,
  defaultContractTerm,
  resolvePurposeCohort,
  type ContractTerm,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

/** Displayed weekly stay on the dashboard, in integer cents. */
const WEEKLY_STAY_CENTS = 24500;

export function PlaidLinkScreen() {
  const router = useRouter();
  const initial = defaultContractTerm();
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const [prefilledLeadEmail, setPrefilledLeadEmail] = useState<string | null>(null);
  const [prefilledStayDays, setPrefilledStayDays] = useState<number | null>(null);
  const [comparisonNightlyDollars, setComparisonNightlyDollars] = useState("195");
  const [activatingPass, setActivatingPass] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const cohortParam = params.get("cohort");
    const daysParam = params.get("days");
    const jurisdictionParam = params.get("jurisdiction");
    const emailParam = params.get("email");

    if (!cohortParam && !daysParam && !jurisdictionParam && !emailParam) {
      return;
    }

    const matchedCohort = resolvePurposeCohort(cohortParam);
    const parsedDays = daysParam ? Number(daysParam) : NaN;
    const stayDays =
      Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= 365
        ? Math.round(parsedDays)
        : matchedCohort.defaultStayDays;
    const targetEndDate = addUtcDays(new Date(), stayDays);

    setContract({
      credentialType: matchedCohort.id,
      credentialIdentifier: matchedCohort.defaultIdentifier,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    });
    setPrefilledStayDays(stayDays);

    if (jurisdictionParam) {
      const rule = resolveJurisdiction(jurisdictionParam);
      if (rule) {
        setJurisdictionCode(rule.code);
      }
    }

    if (emailParam && emailParam.trim() !== "") {
      setPrefilledLeadEmail(emailParam.trim());
    }
  }, []);

  const { phase, error, decision, ready, open, canSimulate, simulate } = usePlaidLinkFlow(
    WEEKLY_STAY_CENTS,
    contract,
    jurisdictionCode,
  );
  const checking = phase === "checking";
  const activeCohort = resolvePurposeCohort(contract.credentialType);
  const selectedStayDays = Math.max(
    14,
    prefilledStayDays ?? intendedStayLengthDays(contract.intendedStayEndDate),
  );
  const comparisonNightlyCents = Math.max(
    3500,
    Math.round((Number(comparisonNightlyDollars) || 195) * 100),
  );
  const dailyComparison = calculateDailyRateComparison(
    WEEKLY_STAY_CENTS,
    selectedStayDays,
    comparisonNightlyCents,
  );

  function selectCohort(cohortId: PurposeCohortId) {
    setContract(defaultContractTerm(new Date(), cohortId));
    setPrefilledStayDays(resolvePurposeCohort(cohortId).defaultStayDays);
  }

  async function handleActivateWeeklyBillingAndPass() {
    setActivatingPass(true);
    setActivationMessage(null);
    setActivationError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const user = session.data.session?.user;
      if (session.error || !token || !user) {
        setActivationError("Sign in on the dashboard first to activate weekly micro-billing.");
        return;
      }

      const cycleRes = await fetch("/api/billing/weekly-cycle", {
        method: "POST",
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${token}` },
      });
      const cycleBody: unknown = await cycleRes.json();
      const cycleRecord =
        cycleBody && typeof cycleBody === "object"
          ? (cycleBody as Record<string, unknown>)
          : {};

      if (cycleRes.ok && cycleRecord.ok === true) {
        const vaultBalanceCents =
          typeof cycleRecord.vaultBalanceCents === "number"
            ? cycleRecord.vaultBalanceCents
            : 41004;
        setActivationMessage(
          `Weekly micro-billing activated! GMF Move-Out Vault balance: ${formatCents(vaultBalanceCents)}. Redirecting to your active QR Lodger Pass...`,
        );
        router.push("/dashboard");
        return;
      }

      const subRes = await fetch("/api/billing/create-subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: user.email ?? prefilledLeadEmail ?? "lodger@vettedrent.com",
          hostAccountId: "acct_simulated_host",
          totalCents: WEEKLY_STAY_CENTS,
          tenantId: user.id,
          hostId: user.id,
          listingId: "vr-weekly-room",
          seamDeviceId: "seam_device_mock",
        }),
      });
      const subBody: unknown = await subRes.json();
      const subRecord =
        subBody && typeof subBody === "object" ? (subBody as Record<string, unknown>) : {};

      if (!subRes.ok || subRecord.ok !== true) {
        const errText =
          typeof cycleRecord.error === "string"
            ? cycleRecord.error
            : typeof subRecord.error === "string"
              ? subRecord.error
              : "Could not activate weekly micro-billing";
        setActivationError(errText);
        return;
      }

      const vaultBalanceCents =
        typeof subRecord.vaultBalanceCents === "number" ? subRecord.vaultBalanceCents : 41004;
      setActivationMessage(
        `Weekly micro-billing activated! GMF Move-Out Vault balance: ${formatCents(vaultBalanceCents)}. Redirecting to your active QR Lodger Pass...`,
      );
      router.push("/dashboard");
    } catch {
      setActivationError("Network error while activating weekly micro-billing.");
    } finally {
      setActivatingPass(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">
            Be Great to Yourself. · Pillar 1 Universal Purpose-Verified Stay Engine
          </p>
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
        {prefilledLeadEmail || prefilledStayDays ? (
          <article className="panel">
            <div className="stay-card-head">
              <strong>One-Click Pipeline Conversion Active</strong>
              <span className="chip">{activeCohort.id}</span>
            </div>
            <p className="note">
              Pre-configured from Inbound Acquisition Pipeline
              {prefilledLeadEmail ? ` for ${prefilledLeadEmail}` : ""} ·{" "}
              {prefilledStayDays ?? activeCohort.defaultStayDays}-day stay in {jurisdictionCode}.{" "}
              <strong>Be Great to Yourself.</strong>
            </p>
          </article>
        ) : null}

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

          <label className="field">
            <span>
              Compare &amp; Contrast Against Competing Offer ($/night — hotel, Airbnb, sublet, or
              OTA)
            </span>
            <input
              type="number"
              min={35}
              max={2500}
              step={1}
              value={comparisonNightlyDollars}
              onChange={(event) => setComparisonNightlyDollars(event.target.value)}
            />
          </label>

          <div className="actions" style={{ flexWrap: "wrap" }}>
            {EXTERNAL_OFFER_PRESETS.map((preset) => {
              const dollars = String(Math.round(preset.nightlyRateCents / 100));
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    comparisonNightlyDollars === dollars ? "button" : "button button-secondary"
                  }
                  onClick={() => setComparisonNightlyDollars(dollars)}
                >
                  {preset.providerLabel}
                </button>
              );
            })}
          </div>

          <div className="row">
            <span>Daily Rate Equivalent ({formatCents(WEEKLY_STAY_CENTS)}/wk)</span>
            <strong>
              {formatCurrencyCents(dailyComparison.grossDailyRateCents)}/day gross ·{" "}
              {formatCurrencyCents(dailyComparison.netEffectiveDailyRateCents)}/day net (after +
              {formatCurrencyCents(dailyComparison.dailyGmfVaultCreditCents)}/day GMF Vault credit)
            </strong>
          </div>

          <div className="row">
            <span>
              Total Savings vs. {formatCurrencyCents(dailyComparison.aggregatorNightlyCents)}/night
              Competing Offer ({dailyComparison.stayDays}d)
            </span>
            <span className="stay-badge" data-status="active">
              Save {formatCurrencyCents(dailyComparison.totalSavingsVsAggregatorCents)} (
              {dailyComparison.savingsPercentage}% Off) +{" "}
              {formatCurrencyCents(dailyComparison.totalGmfVaultAccumulatedCents)} Vault Credit
            </span>
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
          {decision ? (
            <Decision
              decision={decision}
              jurisdictionCode={jurisdictionCode}
              stayDays={prefilledStayDays ?? activeCohort.defaultStayDays}
              comparisonNightlyCents={comparisonNightlyCents}
              applicantEmail={prefilledLeadEmail}
              activatingPass={activatingPass}
              activationMessage={activationMessage}
              activationError={activationError}
              onActivate={() => void handleActivateWeeklyBillingAndPass()}
            />
          ) : null}
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
  jurisdictionCode,
  stayDays,
  comparisonNightlyCents,
  applicantEmail,
  activatingPass,
  activationMessage,
  activationError,
  onActivate,
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
  jurisdictionCode: string;
  stayDays: number;
  comparisonNightlyCents: number;
  applicantEmail: string | null;
  activatingPass: boolean;
  activationMessage: string | null;
  activationError: string | null;
  onActivate: () => void;
}) {
  const passportQuery = new URLSearchParams({
    cohort: decision.credentialType,
    jurisdiction: jurisdictionCode,
    days: String(stayDays),
    credentialId: decision.credentialIdentifier,
    ratio: String(decision.ratio),
    monthlyInflow: String(decision.monthlyInflowEstimated),
    contractEnd: decision.contractEndDate,
    stayEnd: decision.intendedStayEndDate,
    comparisonNightlyCents: String(comparisonNightlyCents),
    ...(applicantEmail ? { applicant: applicantEmail } : {}),
  });
  const passportHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

  const licenseQuery = new URLSearchParams({
    format: "pdf",
    cohort: decision.credentialType,
    jurisdiction: jurisdictionCode,
    days: String(stayDays),
    credentialId: decision.credentialIdentifier,
    ratio: String(decision.ratio),
    weeklyFeeCents: String(WEEKLY_STAY_CENTS),
    purposeEnd: decision.contractEndDate,
    stayEnd: decision.intendedStayEndDate,
    ...(applicantEmail ? { licensee: applicantEmail } : {}),
  });
  const licenseHref = `/api/agreements/license?${licenseQuery.toString()}`;

  const decisionComparison = calculateDailyRateComparison(
    WEEKLY_STAY_CENTS,
    stayDays,
    comparisonNightlyCents,
  );

  return (
    <div className="stack">
      <div className="row">
        <span>Result</span>
        <strong>{decision.approved ? "Approved" : "Not approved"}</strong>
      </div>
      <div className="row">
        <span>Approved Daily Rate Advantage</span>
        <strong>
          {formatCurrencyCents(decisionComparison.grossDailyRateCents)}/day gross ·{" "}
          {formatCurrencyCents(decisionComparison.netEffectiveDailyRateCents)}/day net (Save{" "}
          {formatCurrencyCents(decisionComparison.totalSavingsVsAggregatorCents)} [
          {decisionComparison.savingsPercentage}%] vs.{" "}
          {formatCurrencyCents(decisionComparison.aggregatorNightlyCents)}/night competing offer
          over {decisionComparison.stayDays}d)
        </strong>
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
        intended stay, and compliance with the cohort stay floor. Be Great to Yourself.
      </p>
      {decision.geoCompliance ? <p className="note">{decision.geoCompliance}</p> : null}
      {decision.rejection ? (
        <p className="error" role="alert">
          {decision.rejection}
        </p>
      ) : null}
      {decision.simulated ? <p className="note">Simulated 90-day deposits.</p> : null}

      {decision.approved ? (
        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Underwriting Approved · Be Great to Yourself.</p>
              <h2>Official VettedRent Trust Passport &amp; Lodger Pass Activation</h2>
            </div>
            <span className="stay-badge" data-status="active">
              3.00x Verified
            </span>
          </div>
          <p className="note">
            Your {decision.credentialType} credential ({decision.credentialIdentifier}) and{" "}
            {decision.ratio.toFixed(2)}x deposit velocity are verified. Download your official
            VettedRent Trust Passport PDF to share with any landlord, or activate weekly
            micro-billing now to issue your QR Lodger Pass and fund your $1,500.00 GMF Move-Out
            Vault.
          </p>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            <a
              className="button button-secondary"
              href={passportHref}
              download={`VettedRent-Trust-Passport-${decision.credentialType}.pdf`}
            >
              Download Official Trust Passport (PDF) ↓
            </a>
            <a
              className="button button-secondary"
              href={licenseHref}
              download={`VettedRent-Commercial-License-${decision.credentialType}-${jurisdictionCode}.pdf`}
            >
              Download Revocable Commercial License (PDF) ↓
            </a>
            <button
              type="button"
              className="button"
              disabled={activatingPass}
              onClick={onActivate}
            >
              {activatingPass
                ? "Activating Weekly Micro-Billing..."
                : "Activate Weekly Micro-Billing & Issue Lodger Pass →"}
            </button>
          </div>
          {activationMessage ? <p className="payload">{activationMessage}</p> : null}
          {activationError ? <p className="error">{activationError}</p> : null}
        </article>
      ) : null}
    </div>
  );
}

function formatCents(cents: number): string {
  return formatDollars(cents / 100);
}

function formatDollars(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
