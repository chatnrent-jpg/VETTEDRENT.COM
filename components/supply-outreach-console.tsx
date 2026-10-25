"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { JURISDICTION_RULES } from "@/lib/compliance/jurisdictions";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import {
  SUPPLY_LISTING_SOURCES,
  formatLeaseType,
  getScoredCuratedSupply,
  type ScoredSupplyTarget,
  type SupplyLeaseType,
  type SupplyListingSource,
} from "@/lib/supply-scraper-agent";
import { PURPOSE_COHORT_IDS, type PurposeCohortId } from "@/lib/underwriting-contract";

type SupplyOutreachConsoleProps = {
  onOutreachDispatched?: () => void;
};

type DispatchFeedback = {
  targetId: string;
  ok: boolean;
  message: string;
  leadId: string | null;
  storage: string | null;
};

/**
 * Unidirectional State Flow:
 * 1. Initial seeded supply targets across all 6 jurisdictions and 4 universal Purpose-Verified Stay
 *    cohorts render synchronously from `getScoredCuratedSupply()`, then sync with `GET /api/growth/supply-outreach`.
 * 2. Selecting source/jurisdiction/cohort filters or a target/touch tab updates local preview state.
 * 3. Clicking `[ Dispatch Outreach & Log Host Lead → ]` or submitting a custom external listing
 *    posts to `POST /api/growth/supply-outreach`, records the dispatch outcome, and invokes
 *    `onOutreachDispatched()` so the parent `/marketing` command center refreshes `public.marketing_leads`
 *    and increments the 45-stay ($1M valuation) milestone tracker.
 */
export function SupplyOutreachConsole({ onOutreachDispatched }: SupplyOutreachConsoleProps) {
  const [targets, setTargets] = useState<ScoredSupplyTarget[]>(() => getScoredCuratedSupply());
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("ALL");
  const [cohortFilter, setCohortFilter] = useState<string>("ALL");
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    () => getScoredCuratedSupply()[0]?.listing.id ?? "uhb-md-pg-college-park-suite",
  );
  const [selectedTouch, setSelectedTouch] = useState<1 | 2 | 3>(1);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchedIds, setDispatchedIds] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<DispatchFeedback | null>(null);

  // Custom listing scorer & outreach form state
  const [customSource, setCustomSource] = useState<SupplyListingSource>("UniversityHousingBoard");
  const [customTitle, setCustomTitle] = useState(
    "College Park / Capital Beltway 90-Day Furnished University, Contractor & Relocation Suite",
  );
  const [customJurisdiction, setCustomJurisdiction] = useState("MD-PG");
  const [customWeeklyCents, setCustomWeeklyCents] = useState("31500");
  const [customDepositCents, setCustomDepositCents] = useState("165000");
  const [customLeaseType, setCustomLeaseType] =
    useState<SupplyLeaseType>("month_to_month_lease");
  const [customCohorts, setCustomCohorts] = useState<PurposeCohortId[]>([
    ...PURPOSE_COHORT_IDS,
  ]);
  const [customOwnerName, setCustomOwnerName] = useState("Jordan Sterling");
  const [customOwnerEmail, setCustomOwnerEmail] = useState(
    "j.sterling.host@capitalbeltwaystays.com",
  );
  const [customOwnerPhone, setCustomOwnerPhone] = useState("+13015550199");
  const [customSubmitting, setCustomSubmitting] = useState(false);

  const refreshTargets = useCallback(async () => {
    try {
      const response = await fetch("/api/growth/supply-outreach", { cache: "no-store" });
      const body: unknown = await response.json();
      if (body && typeof body === "object") {
        const record = body as { targets?: unknown };
        if (Array.isArray(record.targets) && record.targets.length > 0) {
          setTargets(record.targets as ScoredSupplyTarget[]);
        }
      }
    } catch {
      // Keep deterministic in-memory curated supply targets on transient network failure
    }
  }, []);

  useEffect(() => {
    void refreshTargets();
  }, [refreshTargets]);

  const visibleTargets = targets.filter((item) => {
    if (sourceFilter !== "ALL" && item.listing.source !== sourceFilter) {
      return false;
    }
    if (jurisdictionFilter !== "ALL" && item.jurisdiction.code !== jurisdictionFilter) {
      return false;
    }
    if (
      cohortFilter !== "ALL" &&
      !item.matchedCohorts.includes(cohortFilter as PurposeCohortId)
    ) {
      return false;
    }
    return true;
  });

  const activeTarget =
    visibleTargets.find((item) => item.listing.id === selectedTargetId) ??
    targets.find((item) => item.listing.id === selectedTargetId) ??
    visibleTargets[0] ??
    targets[0];

  const activeTouchPayload =
    activeTarget?.outreachSequence.find((item) => item.touchNumber === selectedTouch) ??
    activeTarget?.outreachSequence[0];

  function toggleCustomCohort(cohortId: PurposeCohortId) {
    setCustomCohorts((prev) => {
      if (prev.includes(cohortId)) {
        return prev.length > 1 ? prev.filter((id) => id !== cohortId) : prev;
      }
      return [...prev, cohortId];
    });
  }

  async function handleDispatchOutreach(target: ScoredSupplyTarget, touchNumber: 1 | 2 | 3 = 1) {
    setDispatchingId(target.listing.id);
    setSelectedTargetId(target.listing.id);
    setFeedback(null);

    try {
      const response = await fetch("/api/growth/supply-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: target.listing.id,
          touchNumber,
          logLead: true,
        }),
      });
      const body: unknown = await response.json();
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

      if (!response.ok || record.ok !== true) {
        setFeedback({
          targetId: target.listing.id,
          ok: false,
          message:
            typeof record.error === "string"
              ? record.error
              : `Outreach dispatch failed (${response.status})`,
          leadId: null,
          storage: null,
        });
        return;
      }

      setDispatchedIds((prev) => ({ ...prev, [target.listing.id]: true }));
      setFeedback({
        targetId: target.listing.id,
        ok: true,
        message:
          typeof record.confirmationMessage === "string"
            ? record.confirmationMessage
            : "Outreach dispatched and Host-Property lead logged.",
        leadId: typeof record.leadId === "string" ? record.leadId : null,
        storage: typeof record.storage === "string" ? record.storage : "marketing_leads",
      });

      if (onOutreachDispatched) {
        onOutreachDispatched();
      }
    } catch {
      setFeedback({
        targetId: target.listing.id,
        ok: false,
        message: "Network error while dispatching supply outreach.",
        leadId: null,
        storage: null,
      });
    } finally {
      setDispatchingId(null);
    }
  }

  async function handleScoreAndDispatchCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCustomSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/growth/supply-outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logLead: true,
          touchNumber: 1,
          listing: {
            source: customSource,
            listingTitle: customTitle.trim(),
            jurisdictionCode: customJurisdiction,
            weeklyRateCents: Number(customWeeklyCents) || 31500,
            securityDepositCents: Number(customDepositCents) || 150000,
            leaseType: customLeaseType,
            matchedCohorts: customCohorts,
            intendedStayDays: 90,
            ownerContact: {
              fullName: customOwnerName.trim(),
              email: customOwnerEmail.trim(),
              phone: customOwnerPhone.trim() || null,
            },
          },
        }),
      });

      const body: unknown = await response.json();
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

      if (!response.ok || record.ok !== true || !record.target) {
        setFeedback({
          targetId: "custom",
          ok: false,
          message:
            typeof record.error === "string"
              ? record.error
              : `Could not score custom listing (${response.status})`,
          leadId: null,
          storage: null,
        });
        return;
      }

      const newTarget = record.target as ScoredSupplyTarget;
      setTargets((prev) => [
        newTarget,
        ...prev.filter((item) => item.listing.id !== newTarget.listing.id),
      ]);
      setSelectedTargetId(newTarget.listing.id);
      setDispatchedIds((prev) => ({ ...prev, [newTarget.listing.id]: true }));
      setFeedback({
        targetId: newTarget.listing.id,
        ok: true,
        message:
          typeof record.confirmationMessage === "string"
            ? record.confirmationMessage
            : "Custom listing scored, Touch 1 dispatched, and Host-Property lead logged.",
        leadId: typeof record.leadId === "string" ? record.leadId : null,
        storage: typeof record.storage === "string" ? record.storage : "marketing_leads",
      });

      if (onOutreachDispatched) {
        onOutreachDispatched();
      }
    } catch {
      setFeedback({
        targetId: "custom",
        ok: false,
        message: "Network error while scoring custom supply listing.",
        leadId: null,
        storage: null,
      });
    } finally {
      setCustomSubmitting(false);
    }
  }

  return (
    <article className="panel stay-card" id="supply-scraper-console">
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">
            Phase 3 Growth Engine · &ldquo;Unvetted renting is over.&rdquo; · Be Great to Yourself.
          </p>
          <h2>Programmatic Supply Scraper &amp; Universal Cohort Outreach Console</h2>
        </div>
        <span className="chip">{targets.length} Scored Mid-Term Targets</span>
      </div>

      <p className="note">
        Programmatically audits external mid-term listings across{" "}
        <strong>FurnishedFinder</strong>, <strong>ZillowMTR</strong>,{" "}
        <strong>Craigslist</strong>, <strong>UniversityHousingBoard</strong>, and{" "}
        <strong>CorporateReloFeed</strong> covering all 4 universal Purpose-Verified Stay cohorts
        (temporary workers &amp; contractors, university/vocational students, 14d+ seasonal/remote
        professionals, and insurance/relocating families). Scores statutory rollover risk and
        upfront deposit friction, previews the 3-part{" "}
        <em>&ldquo;Unvetted renting is over.&rdquo;</em> outreach sequence, and logs property
        owners into <code>public.marketing_leads</code> to increment our 45-stay ($1M valuation)
        pipeline.
      </p>

      <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div className="actions" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className={sourceFilter === "ALL" ? "button" : "button button-secondary"}
            onClick={() => setSourceFilter("ALL")}
          >
            All Sources ({targets.length})
          </button>
          {SUPPLY_LISTING_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              className={sourceFilter === source ? "button" : "button button-secondary"}
              onClick={() => setSourceFilter(source)}
            >
              {source} ({targets.filter((item) => item.listing.source === source).length})
            </button>
          ))}
        </div>

        <label className="field" style={{ minWidth: "200px", margin: 0 }}>
          <span>Filter by Universal Cohort</span>
          <select
            value={cohortFilter}
            onChange={(event) => setCohortFilter(event.target.value)}
          >
            <option value="ALL">All 4 Universal Cohorts</option>
            {PURPOSE_COHORT_IDS.map((cohortId) => (
              <option key={cohortId} value={cohortId}>
                {cohortId}
              </option>
            ))}
          </select>
        </label>

        <label className="field" style={{ minWidth: "200px", margin: 0 }}>
          <span>Filter by Jurisdiction</span>
          <select
            value={jurisdictionFilter}
            onChange={(event) => setJurisdictionFilter(event.target.value)}
          >
            <option value="ALL">All 6 Jurisdictions (MD-PG, MD, FL, TX, CA, NY)</option>
            {JURISDICTION_RULES.map((rule) => (
              <option key={rule.code} value={rule.code}>
                {rule.code} — {rule.name} ({rule.maxTransientDays}d max)
              </option>
            ))}
          </select>
        </label>
      </div>

      {feedback ? (
        <p className={feedback.ok ? "payload" : "error"}>
          {feedback.message}
          {feedback.leadId ? ` (leadId: ${feedback.leadId})` : ""}
        </p>
      ) : null}

      <div className="stack">
        {visibleTargets.map((target) => {
          const isSelected = activeTarget?.listing.id === target.listing.id;
          const isDispatching = dispatchingId === target.listing.id;
          const isDispatched = Boolean(dispatchedIds[target.listing.id]);
          const badgeStatus =
            target.riskTier === "critical"
              ? "terminated"
              : target.riskTier === "high"
                ? "warning"
                : "active";

          return (
            <div key={target.listing.id} className="panel stack">
              <div className="stay-card-head">
                <div>
                  <p className="pass-kicker">
                    <span className="chip">{target.listing.source}</span> ·{" "}
                    <strong>{target.jurisdiction.code}</strong> ({target.jurisdiction.name}) ·{" "}
                    {formatLeaseType(target.listing.leaseType)}
                  </p>
                  <h3>{target.listing.listingTitle}</h3>
                </div>
                <span className="stay-badge" data-status={badgeStatus}>
                  Exposure Score: {target.exposureScore}/100 ({target.riskTier.toUpperCase()})
                </span>
              </div>

              <div>
                <p className="pass-kicker">Matched Universal Purpose-Verified Stay Cohorts</p>
                <div className="actions" style={{ flexWrap: "wrap", marginTop: "0.4rem" }}>
                  {target.matchedCohorts.map((cohortId) => (
                    <span key={cohortId} className="stay-badge" data-status="active">
                      {cohortId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="row">
                <span>Property Owner / Contact</span>
                <strong>
                  {target.listing.ownerContact.fullName} ({target.listing.ownerContact.email})
                  {target.listing.ownerContact.propertyCompany
                    ? ` · ${target.listing.ownerContact.propertyCompany}`
                    : ""}
                </strong>
              </div>

              <div className="row">
                <span>Jurisdiction Rollover Ceiling</span>
                <strong>{target.jurisdictionRolloverSummary}</strong>
              </div>

              <div className="row">
                <span>Deposit Friction vs. $0.00 VettedRent GMF Coverage</span>
                <strong>{target.depositFrictionSummary}</strong>
              </div>

              <div className="row">
                <span>
                  VettedRent Weekly Split (
                  {formatCurrencyCents(target.vettedRentSplit.weeklyRateCents)}/wk)
                </span>
                <strong>
                  75.5% Host: {formatCurrencyCents(target.vettedRentSplit.hostWeeklyCents)}/wk ·
                  14.3% GMF Escrow: {formatCurrencyCents(target.vettedRentSplit.gmfVaultWeeklyCents)}
                  /wk · 10.2% Platform:{" "}
                  {formatCurrencyCents(target.vettedRentSplit.platformWeeklyCents)}/wk
                </strong>
              </div>

              <div>
                <p className="pass-kicker">Flagged Exposure Vectors</p>
                <div className="actions" style={{ flexWrap: "wrap", marginTop: "0.4rem" }}>
                  {target.exposureVectors.map((vector) => (
                    <span key={vector} className="stay-badge" data-status="warning">
                      {vector}
                    </span>
                  ))}
                </div>
              </div>

              <div className="actions" style={{ flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="button"
                  disabled={isDispatching}
                  onClick={() => void handleDispatchOutreach(target, selectedTouch)}
                >
                  {isDispatching
                    ? "Dispatching Outreach & Logging Host Lead..."
                    : isDispatched
                      ? "Re-Dispatch Outreach & Log Host Lead →"
                      : "Dispatch Outreach & Log Host Lead →"}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setSelectedTargetId(target.listing.id)}
                >
                  {isSelected
                    ? "Previewing 3-Part Sequence Below"
                    : "Preview 3-Part Outreach Sequence"}
                </button>
                <Link
                  className="button button-secondary"
                  href={`/jurisdictions/${encodeURIComponent(target.jurisdiction.code)}`}
                >
                  Open /jurisdictions/{target.jurisdiction.code}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {activeTarget && activeTouchPayload ? (
        <div className="panel stack">
          <div className="stay-card-head">
            <div>
              <p className="pass-kicker">
                3-Part &ldquo;Unvetted renting is over.&rdquo; Sequence Preview ·{" "}
                {activeTarget.listing.source} ({activeTarget.jurisdiction.code})
              </p>
              <h3>{activeTarget.listing.listingTitle}</h3>
            </div>
            <span className="chip">Exposure {activeTarget.exposureScore}/100</span>
          </div>

          <div
            className="toggle"
            role="group"
            aria-label="Select outreach sequence touch"
            style={{ flexWrap: "wrap" }}
          >
            {activeTarget.outreachSequence.map((touch) => (
              <button
                key={touch.touchNumber}
                type="button"
                aria-pressed={selectedTouch === touch.touchNumber}
                onClick={() => setSelectedTouch(touch.touchNumber)}
              >
                {touch.title}
              </button>
            ))}
          </div>

          <div className="row">
            <span>Email Subject</span>
            <strong>{activeTouchPayload.subject}</strong>
          </div>

          <div className="row">
            <span>SMS Dispatched Copy</span>
            <span>{activeTouchPayload.smsPreview}</span>
          </div>

          <pre className="payload" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {activeTouchPayload.body}
          </pre>

          <div className="actions" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="button"
              disabled={dispatchingId === activeTarget.listing.id}
              onClick={() => void handleDispatchOutreach(activeTarget, selectedTouch)}
            >
              {dispatchingId === activeTarget.listing.id
                ? "Dispatching..."
                : `Dispatch Touch ${selectedTouch} & Log Host Lead →`}
            </button>
          </div>
        </div>
      ) : null}

      <form className="panel stack" onSubmit={(event) => void handleScoreAndDispatchCustom(event)}>
        <div className="stay-card-head">
          <div>
            <p className="pass-kicker">Live Supply Ingest &amp; Universal Exposure Audit</p>
            <h3>Score Custom External Mid-Term Listing &amp; Dispatch Touch 1</h3>
          </div>
          <span className="chip">POST /api/growth/supply-outreach</span>
        </div>

        <div className="row" style={{ flexWrap: "wrap" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>External Marketplace Source</span>
            <select
              value={customSource}
              onChange={(event) => setCustomSource(event.target.value as SupplyListingSource)}
            >
              {SUPPLY_LISTING_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: 1 }}>
            <span>Jurisdiction Code</span>
            <select
              value={customJurisdiction}
              onChange={(event) => setCustomJurisdiction(event.target.value)}
            >
              {JURISDICTION_RULES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.code} — {rule.name} ({rule.maxTransientDays}d ceiling)
                </option>
              ))}
            </select>
          </label>

          <label className="field" style={{ flex: 1 }}>
            <span>Current Lease Boilerplate</span>
            <select
              value={customLeaseType}
              onChange={(event) => setCustomLeaseType(event.target.value as SupplyLeaseType)}
            >
              <option value="month_to_month_lease">Month-to-Month Residential Lease</option>
              <option value="fixed_term_residential_lease">Fixed-Term Residential Lease</option>
              <option value="informal_room_sublet">Informal Room Sublet</option>
              <option value="revocable_lodging_license">Revocable Lodging License</option>
            </select>
          </label>
        </div>

        <div>
          <p className="pass-kicker">Matched Universal Purpose-Verified Stay Cohorts</p>
          <div className="actions" style={{ flexWrap: "wrap", marginTop: "0.4rem" }}>
            {PURPOSE_COHORT_IDS.map((cohortId) => {
              const active = customCohorts.includes(cohortId);
              return (
                <button
                  key={cohortId}
                  type="button"
                  className={active ? "button" : "button button-secondary"}
                  onClick={() => toggleCustomCohort(cohortId)}
                >
                  {active ? `✓ ${cohortId}` : cohortId}
                </button>
              );
            })}
          </div>
        </div>

        <label className="field">
          <span>External Listing Title</span>
          <input
            type="text"
            required
            value={customTitle}
            onChange={(event) => setCustomTitle(event.target.value)}
          />
        </label>

        <div className="row" style={{ flexWrap: "wrap" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Weekly Rate (cents)</span>
            <input
              type="number"
              min={5000}
              step={500}
              required
              value={customWeeklyCents}
              onChange={(event) => setCustomWeeklyCents(event.target.value)}
            />
          </label>

          <label className="field" style={{ flex: 1 }}>
            <span>Upfront Security Deposit (cents)</span>
            <input
              type="number"
              min={0}
              step={5000}
              required
              value={customDepositCents}
              onChange={(event) => setCustomDepositCents(event.target.value)}
            />
          </label>
        </div>

        <div className="row" style={{ flexWrap: "wrap" }}>
          <label className="field" style={{ flex: 1 }}>
            <span>Owner Full Name</span>
            <input
              type="text"
              required
              value={customOwnerName}
              onChange={(event) => setCustomOwnerName(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Owner Email</span>
            <input
              type="email"
              required
              value={customOwnerEmail}
              onChange={(event) => setCustomOwnerEmail(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Owner Phone (E.164 optional)</span>
            <input
              type="text"
              value={customOwnerPhone}
              onChange={(event) => setCustomOwnerPhone(event.target.value)}
            />
          </label>
        </div>

        <button className="button" type="submit" disabled={customSubmitting}>
          {customSubmitting
            ? "Scoring Exposure & Dispatching Touch 1..."
            : "Score Listing, Dispatch Outreach & Log Host Lead →"}
        </button>
      </form>
    </article>
  );
}
