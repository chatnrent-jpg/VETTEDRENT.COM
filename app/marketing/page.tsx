"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LandlordYieldCalculator } from "@/components/landlord-yield-calculator";
import { LeadCaptureForm } from "@/components/lead-capture-form";
import type { PipelineLeadItem } from "@/app/api/marketing/lead/route";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
} from "@/lib/compliance/jurisdictions";
import {
  calculateJurisdictionYield,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import {
  PURPOSE_COHORTS,
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

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
          `Enterprise ${campaignCohort} lead stored in ${String(leadRecord.storage ?? "marketing_leads")} (${String(leadRecord.leadId ?? "ok")}). Provide an ENTERPRISE_PORTAL_KEY bearer token above to also dispatch a live POST /api/enterprise/placement call.`,
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

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="pass-kicker">Purpose-Driven Pleasure · Pleasure-Driven Purpose</p>
          <h1>Marketing &amp; Growth Command Center</h1>
          <p className="lede">
            VettedRent turns temporary purpose (Contract-Assignment &amp; Academic-Enrollment) into
            frictionless pleasure, and temporary pleasure or sanctuary (Seasonal-Remote &amp;
            Insurance-Relocation) into verified, rollover-protected purpose.
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
        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">Category Philosophy · Universal Acquisition Narrative</p>
              <h2>Purpose-Driven Pleasure · Pleasure-Driven Purpose</h2>
            </div>
            <span className="chip">Commercial Engine</span>
          </div>
          <div className="row">
            <span>Purpose-Driven Pleasure</span>
            <strong>Contract-Assignment &amp; Academic-Enrollment</strong>
          </div>
          <p className="note">
            When a clinician, VettedCare / VettedME contractor, or university rotator arrives on an
            intensive assignment, VettedRent removes housing friction—replacing credit checks and
            security deposits with 90-day deposit underwriting, $1,500 GMF escrow wealth-building,
            and instant smart-lock room access.
          </p>
          <div className="row">
            <span>Pleasure-Driven Purpose</span>
            <strong>Seasonal-Remote &amp; Insurance-Relocation</strong>
          </div>
          <p className="note">
            When a remote worker, extended snowbird, or displaced ALE policyholder seeks sanctuary,
            VettedRent structures their stay into verified, rollover-protected purpose—enforcing the
            14-day minimum stay floor, documented departure/claim dates, 3.00x coverage, and state
            transient ceiling guardrails for hosts.
          </p>
        </article>

        <article className="panel stay-card">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">
                Live Supabase Feed · <code>public.{pipelineStorage}</code>
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
            Live leads captured from <code>public.marketing_leads</code> across all 4
            Purpose-Verified Stay cohorts, Property Hosts, and Enterprise Partners.
          </p>

          <div className="pipeline-table-wrap">
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th>Lead / Role</th>
                  <th>Jurisdiction Status</th>
                  <th>Stay</th>
                  <th>Timestamp (UTC)</th>
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
                  pipelineLeads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <span className="stay-badge" data-status={lead.allowed ? "active" : "warning"}>
                          {lead.cohort}
                        </span>
                      </td>
                      <td>
                        <strong>{lead.fullName ?? lead.emailPreview}</strong>
                        <br />
                        <span className="note">
                          {lead.role.toUpperCase()}
                          {lead.agencyName ? ` · ${lead.agencyName}` : ""}
                        </span>
                      </td>
                      <td>{lead.jurisdictionStatus}</td>
                      <td>
                        <strong>{lead.intendedStayDays}d</strong>
                      </td>
                      <td>{formatUtcTimestamp(lead.createdAt)}</td>
                    </tr>
                  ))
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
