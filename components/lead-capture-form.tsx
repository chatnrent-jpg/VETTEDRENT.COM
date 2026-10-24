"use client";

import { useState, type FormEvent } from "react";
import { JURISDICTION_RULES } from "@/lib/compliance/jurisdictions";
import {
  PURPOSE_COHORTS,
  resolvePurposeCohort,
} from "@/lib/underwriting-contract";
import type { LeadCohort, LeadRole } from "@/app/api/marketing/lead/route";

export function LeadCaptureForm({
  defaultJurisdictionCode,
  defaultRole = "lodger",
  defaultCohort = "Contract-Assignment",
  defaultUtmSource = "seo_jurisdiction",
  defaultUtmMedium = "organic",
  defaultUtmCampaign = "purpose_verified_stay",
  onLeadCaptured,
}: {
  defaultJurisdictionCode: string;
  defaultRole?: LeadRole;
  defaultCohort?: LeadCohort;
  defaultUtmSource?: string;
  defaultUtmMedium?: string;
  defaultUtmCampaign?: string;
  onLeadCaptured?: () => void;
}) {
  const [role, setRole] = useState<LeadRole>(defaultRole);
  const [cohort, setCohort] = useState<LeadCohort>(defaultCohort);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jurisdictionCode, setJurisdictionCode] = useState(defaultJurisdictionCode);
  const [intendedStayDays, setIntendedStayDays] = useState(
    String(resolvePurposeCohort(defaultCohort).defaultStayDays),
  );
  const [agencyName, setAgencyName] = useState("");
  const utmSource = defaultUtmSource;
  const utmMedium = defaultUtmMedium;
  const utmCampaign = defaultUtmCampaign;
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeCohort = resolvePurposeCohort(cohort);

  function selectRole(nextRole: LeadRole) {
    setRole(nextRole);
    if (nextRole === "host") {
      setCohort("Host-Property");
      setIntendedStayDays("90");
    } else if (nextRole === "enterprise") {
      setCohort("Enterprise-Partner");
      setIntendedStayDays("90");
    } else if (cohort === "Host-Property" || cohort === "Enterprise-Partner") {
      setCohort("Contract-Assignment");
      setIntendedStayDays("90");
    }
  }

  function selectCohort(nextCohort: LeadCohort) {
    setCohort(nextCohort);
    const defaultDays = nextCohort === "Seasonal-Remote" ? 30 : 90;
    setIntendedStayDays(String(defaultDays));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResultMessage(null);
    setErrorMessage(null);
    try {
      const parsedDays = Number(intendedStayDays);
      const safeDays =
        Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= 365
          ? Math.round(parsedDays)
          : activeCohort.defaultStayDays;

      const response = await fetch("/api/marketing/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          cohort,
          fullName: fullName.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          jurisdictionCode,
          intendedStayDays: safeDays,
          agencyName: role === "enterprise" && agencyName.trim() ? agencyName.trim() : undefined,
          utmSource: utmSource.trim() || undefined,
          utmMedium: utmMedium.trim() || undefined,
          utmCampaign: utmCampaign.trim() || undefined,
        }),
      });
      const body: unknown = await response.json();
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      if (!response.ok || record.ok !== true) {
        const message =
          typeof record.error === "string" ? record.error : "Could not submit your request";
        setErrorMessage(message);
        return;
      }
      const leadId = typeof record.leadId === "string" ? record.leadId : "logged";
      const storage = typeof record.storage === "string" ? record.storage : "marketing_leads";
      const geo = typeof record.geoCompliance === "string" ? record.geoCompliance : "";
      const blockReason = typeof record.blockReason === "string" ? record.blockReason : null;
      setResultMessage(
        `Lead ${leadId} stored in ${storage} (${cohort}). ${geo}${blockReason ? ` Note: ${blockReason}` : ""} Be Great to Yourself!`,
      );
      onLeadCaptured?.();
    } catch {
      setErrorMessage("Network error while submitting lead");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="panel stay-card">
      <div>
        <p className="pass-kicker">Get Started with VettedRent</p>
        <h2>List a Property, Apply as a Renter, or Partner with Us</h2>
        <p className="note">
          Tell us who you are and where you need housing or property protection.
        </p>
      </div>

      <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
        <div className="toggle" role="group" aria-label="Marketplace role" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            aria-pressed={role === "host"}
            onClick={() => selectRole("host")}
          >
            Property Host
          </button>
          <button
            type="button"
            aria-pressed={role === "lodger"}
            onClick={() => selectRole("lodger")}
          >
            Purpose-Verified Lodger
          </button>
          <button
            type="button"
            aria-pressed={role === "enterprise"}
            onClick={() => selectRole("enterprise")}
          >
            University / Insurance / Staffing Partner
          </button>
        </div>

        <label className="field">
          <span>Purpose-Verified Stay cohort</span>
          <select
            value={cohort}
            onChange={(event) => selectCohort(event.target.value as LeadCohort)}
          >
            {PURPOSE_COHORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} — {item.audience}
              </option>
            ))}
            <option value="Host-Property">
              Host-Property — Property Owner / Rollover-Protected Weekly Room Host
            </option>
            <option value="Enterprise-Partner">
              Enterprise-Partner — University / ALE Insurance / Healthcare Staffing Partner
            </option>
          </select>
        </label>

        <p className="note">
          <strong>{cohort}:</strong>{" "}
          {cohort === "Host-Property"
            ? "Onboards a weekly room with 75.5% automated host payouts, 14.3% GMF escrow protection, and statutory ceiling guardrails."
            : cohort === "Enterprise-Partner"
              ? "Connects a university, ALE insurance carrier, or healthcare staffing agency to batch-place verified guests."
              : activeCohort.summary}
        </p>

        <label className="field">
          <span>Full name</span>
          <input
            type="text"
            placeholder="Alex Morgan"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Email (required)</span>
          <input
            type="email"
            required
            placeholder="alex@vettedrent.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Mobile phone (optional E.164 for SMS confirmation)</span>
          <input
            type="tel"
            placeholder="+12025550123"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>

        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>Target jurisdiction</span>
            <select
              value={jurisdictionCode}
              onChange={(event) => setJurisdictionCode(event.target.value)}
            >
              {JURISDICTION_RULES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.name} ({rule.code})
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>
              Intended stay (days{cohort === "Seasonal-Remote" ? ", 14d min" : ""})
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={intendedStayDays}
              onChange={(event) => setIntendedStayDays(event.target.value)}
            />
          </label>
        </div>

        {role === "enterprise" ? (
          <label className="field">
            <span>University / Insurance Carrier / Staffing Agency Name</span>
            <input
              type="text"
              placeholder="VettedCare Staffing / UMD Clinical Housing / State Farm ALE"
              value={agencyName}
              onChange={(event) => setAgencyName(event.target.value)}
            />
          </label>
        ) : null}

        <button className="button button-primary-lg" type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Get Started →"}
        </button>
      </form>

      {resultMessage ? <p className="payload">{resultMessage}</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </article>
  );
}
