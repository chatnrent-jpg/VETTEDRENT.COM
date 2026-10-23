"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LandlordYieldCalculator } from "@/components/landlord-yield-calculator";
import { LeadCaptureForm } from "@/components/lead-capture-form";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
} from "@/lib/compliance/jurisdictions";
import {
  calculateJurisdictionYield,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";

export default function MarketingCommandCenterPage() {
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
          fullName: workerFullName.trim(),
          email: agencyBillingEmail.trim(),
          jurisdictionCode: DEFAULT_JURISDICTION_CODE,
          agencyName: agencyName.trim(),
          weeklyRateCents: Number(weeklyStipendCents) || 24500,
          intendedStayDays: 90,
          utmSource: "marketing_command_center",
          utmMedium: "enterprise_outreach",
          utmCampaign: "vettedcare_placement_batch",
          notes: `Worker candidate: ${workerEmail.trim()} on listing ${listingId.trim()}`,
        }),
      });
      const leadBody: unknown = await leadResponse.json();
      const leadRecord =
        leadBody && typeof leadBody === "object"
          ? (leadBody as Record<string, unknown>)
          : {};

      if (!portalKey.trim()) {
        setCampaignResult(
          `Enterprise campaign lead logged (${String(leadRecord.leadId ?? "ok")}). Provide an ENTERPRISE_PORTAL_KEY bearer token above to also dispatch a live POST /api/enterprise/placement call.`,
        );
        return;
      }

      const start = new Date();
      const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
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
          <p className="pass-kicker">Phase 1 · VettedRent Marketing &amp; Growth Engine</p>
          <h1>Marketing &amp; Growth Command Center</h1>
          <p className="lede">
            Acquire Property Hosts and VettedCare / VettedME Contract Lodgers across all covered
            jurisdictions.
          </p>
        </div>
        <div className="actions">
          <Link className="button button-secondary" href="/">
            Home
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
              <p className="pass-kicker">Programmatic SEO Matrix</p>
              <h2>Jurisdiction Landing Pages (6 Covered Markets)</h2>
            </div>
            <span className="chip">Read-Only SEO Pages</span>
          </div>
          <p className="note">
            Every jurisdiction route is statically generated from{" "}
            <code>lib/compliance/jurisdictions.ts</code> with its own statutory transient ceiling,
            judicial backlog tier, and read-only GMF yield calculator.
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
          defaultUtmCampaign="phase1_growth_launch"
        />

        <article className="panel stay-card">
          <div>
            <p className="pass-kicker">B2B Staffing Acquisition · VettedCare &amp; VettedME</p>
            <h2>Enterprise Placement Campaign Launcher</h2>
            <p className="note">
              Captures an enterprise staffing campaign lead and optionally dispatches a batch worker
              placement to <code>POST /api/enterprise/placement</code> when an{" "}
              <code>ENTERPRISE_PORTAL_KEY</code> token is supplied.
            </p>
          </div>

          <form className="stack" onSubmit={(event) => void handleEnterpriseCampaign(event)}>
            <label className="field">
              <span>Agency / health system name</span>
              <input
                type="text"
                required
                value={agencyName}
                onChange={(event) => setAgencyName(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Agency billing email</span>
              <input
                type="email"
                required
                value={agencyBillingEmail}
                onChange={(event) => setAgencyBillingEmail(event.target.value)}
              />
            </label>

            <div className="row">
              <label className="field" style={{ flex: 1 }}>
                <span>Clinician / worker name</span>
                <input
                  type="text"
                  required
                  value={workerFullName}
                  onChange={(event) => setWorkerFullName(event.target.value)}
                />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Clinician / worker email</span>
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
                <span>Weekly stipend (cents)</span>
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
                : "Trigger Enterprise Placement Campaign"}
            </button>
          </form>

          {campaignResult ? <p className="payload">{campaignResult}</p> : null}
          {campaignError ? <p className="error">{campaignError}</p> : null}
        </article>
      </section>
    </main>
  );
}
