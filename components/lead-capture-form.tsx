"use client";

import { useState, type FormEvent } from "react";
import { JURISDICTION_RULES } from "@/lib/compliance/jurisdictions";
import type { LeadRole } from "@/app/api/marketing/lead/route";

export function LeadCaptureForm({
  defaultJurisdictionCode,
  defaultRole = "host",
  defaultUtmSource = "seo_jurisdiction",
  defaultUtmMedium = "organic",
  defaultUtmCampaign = "phase1_growth",
}: {
  defaultJurisdictionCode: string;
  defaultRole?: LeadRole;
  defaultUtmSource?: string;
  defaultUtmMedium?: string;
  defaultUtmCampaign?: string;
}) {
  const [role, setRole] = useState<LeadRole>(defaultRole);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jurisdictionCode, setJurisdictionCode] = useState(defaultJurisdictionCode);
  const [agencyName, setAgencyName] = useState("");
  const [utmSource, setUtmSource] = useState(defaultUtmSource);
  const [utmMedium, setUtmMedium] = useState(defaultUtmMedium);
  const [utmCampaign, setUtmCampaign] = useState(defaultUtmCampaign);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResultMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/marketing/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          fullName: fullName.trim() || undefined,
          email: email.trim(),
          phone: phone.trim() || undefined,
          jurisdictionCode,
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
      const geo = typeof record.geoCompliance === "string" ? record.geoCompliance : "";
      setResultMessage(`Lead ${leadId} captured. ${geo}`);
    } catch {
      setErrorMessage("Network error while submitting lead");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="panel stay-card">
      <div>
        <p className="pass-kicker">Two-Sided Marketplace Intake</p>
        <h2>Host, VettedCare / VettedME Lodger &amp; Enterprise Lead Funnel</h2>
        <p className="note">
          Logs UTM attribution and statutory compliance readiness, dispatches an optional E.164 SMS
          confirmation, and fires the outbound Resend/webhook hook.
        </p>
      </div>

      <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
        <div className="toggle" role="group" aria-label="Marketplace role">
          <button
            type="button"
            aria-pressed={role === "host"}
            onClick={() => setRole("host")}
          >
            Property Host
          </button>
          <button
            type="button"
            aria-pressed={role === "lodger"}
            onClick={() => setRole("lodger")}
          >
            VettedCare / VettedME Lodger
          </button>
          <button
            type="button"
            aria-pressed={role === "enterprise"}
            onClick={() => setRole("enterprise")}
          >
            Enterprise Agency
          </button>
        </div>

        <label className="field">
          <span>Full name</span>
          <input
            type="text"
            placeholder="Alex Morgan, RN"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Email (required)</span>
          <input
            type="email"
            required
            placeholder="alex@vettedcare.com"
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

        <label className="field">
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

        {role === "enterprise" ? (
          <label className="field">
            <span>Staffing agency / health system</span>
            <input
              type="text"
              placeholder="VettedCare Maryland Staffing"
              value={agencyName}
              onChange={(event) => setAgencyName(event.target.value)}
            />
          </label>
        ) : null}

        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <span>UTM Source</span>
            <input
              type="text"
              value={utmSource}
              onChange={(event) => setUtmSource(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>UTM Medium</span>
            <input
              type="text"
              value={utmMedium}
              onChange={(event) => setUtmMedium(event.target.value)}
            />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>UTM Campaign</span>
            <input
              type="text"
              value={utmCampaign}
              onChange={(event) => setUtmCampaign(event.target.value)}
            />
          </label>
        </div>

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "Logging intake..." : "Submit Marketplace Lead"}
        </button>
      </form>

      {resultMessage ? <p className="payload">{resultMessage}</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}
    </article>
  );
}
