"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LandlordYieldCalculator } from "@/components/landlord-yield-calculator";
import { LeadCaptureForm } from "@/components/lead-capture-form";
import { SupplyOutreachConsole } from "@/components/supply-outreach-console";
import { Progress } from "@/components/ui/progress";
import { ValuationCounter } from "@/components/ValuationCounter";
import type { LeadCohort, PipelineLeadItem } from "@/app/api/marketing/lead/route";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
} from "@/lib/compliance/jurisdictions";
import {
  CALCULATOR_PLATFORM_BPS,
  CALCULATOR_VAULT_BPS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  calculateJurisdictionYield,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import {
  PURPOSE_COHORTS,
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

const MILESTONE_TARGET_STAYS = 45;
const WEEKS_PER_YEAR = 52;

const ALL_PIPELINE_COHORTS: readonly LeadCohort[] = [
  "Contract-Assignment",
  "Academic-Enrollment",
  "Seasonal-Remote",
  "Insurance-Relocation",
  "Host-Property",
  "Enterprise-Partner",
];

export default function MarketingCommandCenterPage() {
  const [campaignCohort, setCampaignCohort] = useState<PurposeCohortId>("Contract-Assignment");
  const [agencyName, setAgencyName] = useState("VettedCare Maryland Staffing");
  const [agencyBillingEmail, setAgencyBillingEmail] = useState("billing@vettedcare.com");
  const [workerFullName, setWorkerFullName] = useState("Jordan Taylor, RN");
  const [workerEmail, setWorkerEmail] = useState("jordan.rn@vettedcare.com");
  const [weeklyStipendCents, setWeeklyStipendCents] = useState("24500");
  const [listingId, setListingId] = useState("vr-weekly-room");
  const [portalKey, setPortalKey] = useState("");
  const [campaignRunning, setCampaignRunning] = useState(false);
  const [campaignResult, setCampaignResult] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  const [pipelineLeads, setPipelineLeads] = useState<PipelineLeadItem[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [pipelineStorage, setPipelineStorage] = useState("marketing_leads");

  const loadPipeline = useCallback(async () => {
    setPipelineLoading(true);
    try {
      const response = await fetch("/api/marketing/lead", { cache: "no-store" });
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const record = body as { leads?: unknown; storage?: unknown };
        if (Array.isArray(record.leads)) {
          setPipelineLeads(record.leads as PipelineLeadItem[]);
        }
        if (typeof record.storage === "string") {
          setPipelineStorage(record.storage);
        }
      }
    } catch {
      // Keep last known rows on transient network error
    } finally {
      setPipelineLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  const selectedCohortRule = resolvePurposeCohort(campaignCohort);

  function selectEnterprisePreset(cohortId: PurposeCohortId) {
    setCampaignCohort(cohortId);
    if (cohortId === "Contract-Assignment") {
      setAgencyName("VettedCare Maryland Staffing");
      setAgencyBillingEmail("billing@vettedcare.com");
      setWorkerFullName("Jordan Taylor, RN");
      setWorkerEmail("jordan.rn@vettedcare.com");
    } else if (cohortId === "Academic-Enrollment") {
      setAgencyName("UMD Clinical Rotation & Graduate Housing");
      setAgencyBillingEmail("rotations@umd.edu");
      setWorkerFullName("Maya Lin, PharmD Candidate");
      setWorkerEmail("maya.lin@umd.edu");
    } else if (cohortId === "Seasonal-Remote") {
      setAgencyName("RemotePass Corporate Mobility");
      setAgencyBillingEmail("mobility@remotepass.io");
      setWorkerFullName("Devon Brooks (Remote Staff Engineer)");
      setWorkerEmail("devon@remotepass.io");
    } else if (cohortId === "Insurance-Relocation") {
      setAgencyName("Mid-Atlantic ALE Claims Desk");
      setAgencyBillingEmail("ale-claims@carrier-relocation.com");
      setWorkerFullName("Marcus Vance (Policyholder #ALE-4410)");
      setWorkerEmail("marcus.vance@carrier-relocation.com");
    }
  }

  async function handleEnterpriseCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCampaignRunning(true);
    setCampaignResult(null);
    setCampaignError(null);

    try {
      const leadResponse = await fetch("/api/marketing/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "enterprise",
          cohort: campaignCohort,
          fullName: workerFullName.trim(),
          email: agencyBillingEmail.trim(),
          jurisdictionCode: DEFAULT_JURISDICTION_CODE,
          agencyName: agencyName.trim(),
          weeklyRateCents: Number(weeklyStipendCents) || 24500,
          intendedStayDays: selectedCohortRule.defaultStayDays,
          utmSource: "marketing_command_center",
          utmMedium: "enterprise_outreach",
          utmCampaign: `enterprise_${campaignCohort.toLowerCase()}`,
          notes: `Cohort: ${campaignCohort} | Candidate: ${workerEmail.trim()} on listing ${listingId.trim()}`,
        }),
      });
      const leadBody: unknown = await leadResponse.json();
      const leadRecord =
        leadBody && typeof leadBody === "object"
          ? (leadBody as Record<string, unknown>)
          : {};

      void loadPipeline();

      if (!portalKey.trim()) {
        setCampaignResult(
          `Enterprise ${campaignCohort} lead stored in ${String(leadRecord.storage ?? "marketing_leads")} (${String(leadRecord.leadId ?? "ok")}). Provide an ENTERPRISE_PORTAL_KEY bearer token above to also dispatch a live POST /api/enterprise/placement call. Be Great to Yourself!`,
        );
        return;
      }

      const start = new Date();
      const end = new Date(
        start.getTime() + selectedCohortRule.defaultStayDays * 24 * 60 * 60 * 1000,
      );
      const startIso = start.toISOString().slice(0, 10);
      const endIso = end.toISOString().slice(0, 10);

      const placementResponse = await fetch("/api/enterprise/placement", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${portalKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agencyName: agencyName.trim(),
          agencyBillingEmail: agencyBillingEmail.trim(),
          workers: [
            {
              workerEmail: workerEmail.trim(),
              workerFullName: workerFullName.trim(),
              contractStartDate: startIso,
              contractEndDate: endIso,
              weeklyStipendCents: Number(weeklyStipendCents) || 24500,
              listingId: listingId.trim(),
            },
          ],
        }),
      });
      const placementBody: unknown = await placementResponse.json();
      const placementRecord =
        placementBody && typeof placementBody === "object"
          ? (placementBody as Record<string, unknown>)
          : {};

      if (!placementResponse.ok || placementRecord.ok !== true) {
        setCampaignError(
          `Lead captured (${String(leadRecord.leadId ?? "ok")}), but /api/enterprise/placement returned ${placementResponse.status}: ${String(placementRecord.error ?? "rejected")}`,
        );
        return;
      }

      setCampaignResult(
        `Enterprise placement opened! Invoice Group: ${String(placementRecord.invoiceGroupId ?? "created")} · Agreement: ${String(placementRecord.agreementId ?? "active")}`,
      );
    } catch {
      setCampaignError("Network error while running enterprise placement campaign");
    } finally {
      setCampaignRunning(false);
    }
  }

  const totalLeads = pipelineLeads.length;
  const milestonePercent = Math.min(
    100,
    Math.round((totalLeads / MILESTONE_TARGET_STAYS) * 100),
  );

  const annualPerStayGmvCents = DEFAULT_CALCULATOR_WEEKLY_CENTS * WEEKS_PER_YEAR;
  const annualPerStayVaultCents =
    Math.round((DEFAULT_CALCULATOR_WEEKLY_CENTS * CALCULATOR_VAULT_BPS) / 10000) * WEEKS_PER_YEAR;
  const annualPerStayPlatformCents =
    Math.round((DEFAULT_CALCULATOR_WEEKLY_CENTS * CALCULATOR_PLATFORM_BPS) / 10000) * WEEKS_PER_YEAR;

  const pipelineAnnualGmvCents = totalLeads * annualPerStayGmvCents;
  const pipelineAnnualVaultCents = totalLeads * annualPerStayVaultCents;
  const pipelineAnnualPlatformCents = totalLeads * annualPerStayPlatformCents;

  const targetAnnualGmvCents = MILESTONE_TARGET_STAYS * annualPerStayGmvCents;
  const targetAnnualVaultCents = MILESTONE_TARGET_STAYS * annualPerStayVaultCents;
  const targetAnnualPlatformCents = MILESTONE_TARGET_STAYS * annualPerStayPlatformCents;

  const cohortCounts = ALL_PIPELINE_COHORTS.map((cohort) => ({
    cohort,
    count: pipelineLeads.filter((lead) => lead.cohort === cohort).length,
  }));

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">
            Be Great to Yourself. · Universal Purpose-Verified Stay Platform
          </p>
          <h1>Marketing &amp; Growth Command Center</h1>
          <p className="lede">
            Be Great to Yourself. Acquire Property Hosts, 4-Cohort Purpose-Verified Lodgers, and
            University / Insurance / Staffing Enterprise Partners with one-click underwriting and
            host shield conversion.
          </p>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/">
            Home
          </Link>
          <Link className="button button-secondary" href="/underwriting">
            Underwriting
          </Link>
          <Link className="button" href="/dashboard">
            Open Dashboard
          </Link>
        </div>
      </header>

      <section className="stack">
        <ValuationCounter variant="full" />

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">
                VettedRent Category Manifesto · The Shift From Settling to Greatness
              </p>
              <h2>
                The unvetted rental market forces you to settle for risk. It’s time to be great to
                yourself.
              </h2>
            </div>
            <span className="chip">Be Great to Yourself.</span>
          </div>
          <p className="note">
            Stop chasing late payments, parsing messy documents manually, and dreading eviction
            cycles. VettedRent introduces the first Guaranteed, Underwritten Mid-Term
            Marketplace—combining institutional-grade credentialing with an active escrow guarantee
            fund. Zero friction. Total income protection.
          </p>
          <div className="row">
            <span>Block A — For Landlords</span>
            <strong>Command Your Cash Flow (75.5% Payout + 14.3% GMF Escrow)</strong>
          </div>
          <p className="note">
            Being &ldquo;good&rdquo; to yourself is buying property insurance and hoping you never
            have to use it. Being great to yourself means utilizing an underwriting platform that
            ensures you never have to worry about a default in the first place—combining
            Institutional Underwriting (Plaid 3.00x velocity), Guaranteed Revenue Escrow (14.3%
            GMF), and Automated Compliance across MD-PG, MD, FL, TX, CA, and NY.
          </p>
          <div className="row">
            <span>Block B — For Traveling Professionals</span>
            <strong>Leverage Your Credentials ($0 Deposit + $1,500 Move-Out Vault)</strong>
          </div>
          <p className="note">
            Being &ldquo;good&rdquo; to yourself is overpaying for a rigid, extended-stay hotel room
            just to avoid a predatory down payment. Being great to yourself means letting your
            professional status unlock premium, deposit-free housing with Zero Security Deposits,
            Frictionless Onboarding, and Curated Work &amp; Sanctuary Spaces.
          </p>
          <div className="actions" style={{ flexWrap: "wrap" }}>
            <Link className="button" href="#host-shield">
              Guard My Property (Landlords)
            </Link>
            <Link className="button button-secondary" href="#supply-scraper-console">
              Launch Supply Outreach Console
            </Link>
            <Link className="button button-secondary" href="/underwriting">
              Unlock Deposit-Free Housing (Professionals)
            </Link>
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Commercial North Star · Be Great to Yourself.</p>
              <h2>$1M Valuation &amp; 45-Stay Milestone Tracker</h2>
            </div>
            <span className="chip">
              {totalLeads} / {MILESTONE_TARGET_STAYS} Stays ({milestonePercent}%)
            </span>
          </div>

          <div className="vault-progress">
            <Progress
              value={milestonePercent}
              aria-label={`$1M Valuation Milestone: ${totalLeads} of ${MILESTONE_TARGET_STAYS} stays`}
            />
            <p className="vault-label">
              Pipeline Progress: <strong>{totalLeads}</strong> captured leads toward{" "}
              <strong>{MILESTONE_TARGET_STAYS} active stays</strong> ($1M Valuation Milestone at
              $245.00/wk benchmark).
            </p>
          </div>

          <div className="stack">
            <div className="row">
              <span>Projected Annualized GMV (Current Pipeline → 45-Stay Target)</span>
              <strong>
                {formatCurrencyCents(pipelineAnnualGmvCents)} →{" "}
                {formatCurrencyCents(targetAnnualGmvCents)} / yr
              </strong>
            </div>
            <div className="row">
              <span>14.3% GMF Escrow Volume (Current Pipeline → 45-Stay Target)</span>
              <strong>
                {formatCurrencyCents(pipelineAnnualVaultCents)} →{" "}
                {formatCurrencyCents(targetAnnualVaultCents)} / yr
              </strong>
            </div>
            <div className="row">
              <span>10.2% Net Platform Revenue (Current Pipeline → 45-Stay Target)</span>
              <span className="chip">
                {formatCurrencyCents(pipelineAnnualPlatformCents)} →{" "}
                {formatCurrencyCents(targetAnnualPlatformCents)} / yr
              </span>
            </div>
          </div>

          <div>
            <p className="pass-kicker">Live Pipeline Breakdown by Cohort</p>
            <div className="actions" style={{ flexWrap: "wrap", marginTop: "0.5rem" }}>
              {cohortCounts.map((item) => (
                <span
                  key={item.cohort}
                  className="stay-badge"
                  data-status={item.count > 0 ? "active" : "warning"}
                >
                  {item.cohort}: {item.count}
                </span>
              ))}
            </div>
          </div>
        </article>

        <SupplyOutreachConsole onOutreachDispatched={() => void loadPipeline()} />

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">
                One-Click Conversion Console · <code>public.{pipelineStorage}</code>
              </p>
              <h2>Inbound Acquisition Pipeline</h2>
            </div>
            <button
              type="button"
              className="button button-secondary"
              disabled={pipelineLoading}
              onClick={() => void loadPipeline()}
            >
              {pipelineLoading ? "Refreshing..." : `Refresh (${pipelineLeads.length})`}
            </button>
          </div>
          <p className="note">
            Convert any captured lead in one click: launch pre-filled 3.0x underwriting for lodger
            and enterprise leads, or configure the statutory host shield for property hosts.
          </p>

          <div className="pipeline-table-wrap">
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Lead / Role</th>
                  <th>Jurisdiction Status</th>
                  <th>Stay</th>
                  <th>One-Click Conversion Action</th>
                </tr>
              </thead>
              <tbody>
                {pipelineLeads.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      {pipelineLoading
                        ? "Loading live leads from public.marketing_leads..."
                        : "No leads recorded yet. Submit a lead below to populate the pipeline."}
                    </td>
                  </tr>
                ) : (
                  pipelineLeads.map((lead) => {
                    const isHostLead =
                      lead.role === "host" || lead.cohort === "Host-Property";
                    const underwritingCohort =
                      lead.cohort === "Host-Property" || lead.cohort === "Enterprise-Partner"
                        ? "Contract-Assignment"
                        : lead.cohort;
                    const underwritingHref = `/underwriting?cohort=${encodeURIComponent(underwritingCohort)}&days=${lead.intendedStayDays}&jurisdiction=${encodeURIComponent(lead.jurisdictionCode)}&email=${encodeURIComponent(lead.email)}`;
                    const hostShieldHref = `/jurisdictions/${encodeURIComponent(lead.jurisdictionCode)}`;

                    return (
                      <tr key={lead.id}>
                        <td>
                          <span
                            className="stay-badge"
                            data-status={lead.allowed ? "active" : "warning"}
                          >
                            {lead.cohort}
                          </span>
                        </td>
                        <td>
                          <strong>{lead.fullName ?? lead.emailPreview}</strong>
                          <br />
                          <span className="note">
                            {lead.role.toUpperCase()}
                            {lead.agencyName ? ` · ${lead.agencyName}` : ""} ·{" "}
                            {formatUtcTimestamp(lead.createdAt)}
                          </span>
                        </td>
                        <td>{lead.jurisdictionStatus}</td>
                        <td>
                          <strong>{lead.intendedStayDays}d</strong>
                        </td>
                        <td>
                          {isHostLead ? (
                            <Link className="button button-secondary" href={hostShieldHref}>
                              Configure Host Shield →
                            </Link>
                          ) : (
                            <Link className="button" href={underwritingHref}>
                              Launch 3.0x Underwriting →
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">4 Temporary Stay Verticals</p>
              <h2>Universal Purpose-Verified Stay Cohorts</h2>
            </div>
            <span className="chip">Pillar 1 Underwriting Live</span>
          </div>
          <p className="note">
            Every guest stay is underwritten against a verified temporary purpose, 3.00x 90-day
            deposit coverage, and state-specific transient rollover guardrails.
          </p>
          <div className="stack">
            {PURPOSE_COHORTS.map((cohort) => (
              <div key={cohort.id} className="panel">
                <div className="stay-card-head">
                  <strong>{cohort.title}</strong>
                  <span className="stay-badge" data-status="active">
                    {cohort.minStayDays}d min · {cohort.defaultStayDays}d default
                  </span>
                </div>
                <p className="note">
                  <strong>{cohort.audience}</strong> — {cohort.summary}
                </p>
                <div className="row">
                  <span>Verified credential</span>
                  <strong>
                    {cohort.identifierLabel} ({cohort.defaultIdentifier})
                  </strong>
                </div>
                <div className="row">
                  <span>Underwriting coverage rule</span>
                  <strong>{cohort.inflowRuleLabel}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Programmatic SEO Matrix</p>
              <h2>Jurisdiction Landing Pages (6 Covered Markets)</h2>
            </div>
            <span className="chip">Read-Only SEO Pages</span>
          </div>
          <p className="note">
            Every jurisdiction route is statically generated from{" "}
            <code>lib/compliance/jurisdictions.ts</code> with its own statutory transient ceiling,
            judicial backlog tier, 4-cohort compatibility table, and read-only GMF yield calculator.
          </p>

          <div className="stack">
            {JURISDICTION_RULES.map((rule) => {
              const preview = calculateJurisdictionYield(rule.code);
              return (
                <div key={rule.code} className="panel">
                  <div className="stay-card-head">
                    <strong>
                      {rule.name} ({rule.code})
                    </strong>
                    <span
                      className="stay-badge"
                      data-status={
                        preview.allowed
                          ? "active"
                          : rule.judicialRiskTier === "restricted"
                            ? "terminated"
                            : "warning"
                      }
                    >
                      {rule.maxTransientDays}d max · {rule.judicialRiskTier}
                    </span>
                  </div>
                  <div className="row">
                    <span>90-day host payout @ $245/wk</span>
                    <strong>{formatCurrencyCents(preview.hostTotalCents)}</strong>
                  </div>
                  <div className="row">
                    <span>90-day GMF escrow @ 14.3%</span>
                    <strong>{formatCurrencyCents(preview.vaultTotalCents)}</strong>
                  </div>
                  <div className="actions">
                    <Link className="button button-secondary" href={`/jurisdictions/${rule.code}`}>
                      Open /jurisdictions/{rule.code}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <LandlordYieldCalculator initialJurisdictionCode={DEFAULT_JURISDICTION_CODE} />

        <LeadCaptureForm
          defaultJurisdictionCode={DEFAULT_JURISDICTION_CODE}
          defaultUtmSource="marketing_command_center"
          defaultUtmMedium="direct"
          defaultUtmCampaign="purpose_verified_stay_launch"
          onLeadCaptured={() => void loadPipeline()}
        />

        <article className="panel stay-card">
          <div>
            <p className="pass-kicker">
              B2B Partner Acquisition · Staffing, Universities &amp; ALE Insurance
            </p>
            <h2>Enterprise Placement Campaign Launcher</h2>
            <p className="note">
              Select a partner cohort preset, capture an enterprise partner lead in{" "}
              <code>public.marketing_leads</code>, and optionally dispatch a batch placement to{" "}
              <code>POST /api/enterprise/placement</code> when an{" "}
              <code>ENTERPRISE_PORTAL_KEY</code> token is supplied.
            </p>
          </div>

          <div
            className="toggle"
            role="group"
            aria-label="Enterprise partner cohort preset"
            style={{ flexWrap: "wrap" }}
          >
            {PURPOSE_COHORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={campaignCohort === item.id}
                onClick={() => selectEnterprisePreset(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>

          <form className="stack" onSubmit={(event) => void handleEnterpriseCampaign(event)}>
            <label className="field">
              <span>Partner organization (Staffing / University / ALE Carrier / Corporate)</span>
              <input
                type="text"
                required
                value={agencyName}
                onChange={(event) => setAgencyName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Partner billing email</span>
              <input
                type="email"
                required
                value={agencyBillingEmail}
                onChange={(event) => setAgencyBillingEmail(event.target.value)}
              />
            </label>

            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                <span>Placed lodger full name</span>
                <input
                  type="text"
                  required
                  value={workerFullName}
                  onChange={(event) => setWorkerFullName(event.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Placed lodger email</span>
                <input
                  type="email"
                  required
                  value={workerEmail}
                  onChange={(event) => setWorkerEmail(event.target.value)}
                />
              </label>
            </div>

            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                <span>Weekly stipend / rate (cents)</span>
                <input
                  type="number"
                  min={5000}
                  step={500}
                  required
                  value={weeklyStipendCents}
                  onChange={(event) => setWeeklyStipendCents(event.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Target listing ID</span>
                <input
                  type="text"
                  required
                  value={listingId}
                  onChange={(event) => setListingId(event.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span>Enterprise portal bearer key (optional — leave blank for dry-run lead log)</span>
              <input
                type="password"
                placeholder="ENTERPRISE_PORTAL_KEY"
                value={portalKey}
                onChange={(event) => setPortalKey(event.target.value)}
              />
            </label>

            <button className="button" type="submit" disabled={campaignRunning}>
              {campaignRunning
                ? "Running Enterprise Campaign..."
                : `Trigger ${campaignCohort} Partner Campaign`}
            </button>
          </form>

          {campaignResult ? <p className="payload">{campaignResult}</p> : null}
          {campaignError ? <p className="error">{campaignError}</p> : null}
        </article>
      </section>
    </main>
  );
}

function formatUtcTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return iso;
  }
  return new Date(parsed).toISOString().replace("T", " ").slice(0, 19);
}
