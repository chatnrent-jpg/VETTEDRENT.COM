"use client";

import { useState } from "react";
import { calculateMarylandInvoice } from "@/lib/maryland-tax";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import { formatReadableDate } from "@/lib/availability-calendar";
import type { DailyRateTierId } from "@/lib/daily-rate-comparison";
import type { PurposeCohortId } from "@/lib/underwriting-contract";

const OCCUPANCY_PILLS: readonly {
  id: PurposeCohortId;
  profile: string;
  label: string;
}[] = [
  { id: "Contract-Assignment", profile: "professional", label: "Professional" },
  { id: "Academic-Enrollment", profile: "student", label: "Student / Intern" },
  { id: "Insurance-Relocation", profile: "family", label: "Family (ALE)" },
  { id: "Seasonal-Remote", profile: "seasonal", label: "Remote Stay" },
];

export function PremiumCheckoutCard({
  tierId,
  dailyRateCents,
  stayDays,
  checkInIso,
  checkOutIso,
  jurisdictionCode,
  cohortId,
  guestFullName,
  guestEmail,
  onChangeFullName,
  onChangeEmail,
  onChangeCohort,
  onSubmit,
  submitBusy,
  errorMessage,
}: {
  tierId: DailyRateTierId;
  dailyRateCents: number;
  stayDays: number;
  checkInIso: string;
  checkOutIso: string;
  jurisdictionCode?: string;
  cohortId: PurposeCohortId;
  guestFullName: string;
  guestEmail: string;
  onChangeFullName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangeCohort?: (cohortId: PurposeCohortId) => void;
  onSubmit: () => void;
  submitBusy?: boolean;
  errorMessage?: string | null;
}) {
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const isCorporateTrack = stayDays >= 30;
  const invoice = calculateMarylandInvoice({
    stayDurationDays: stayDays,
    dailyRateCents,
    jurisdictionCode,
    whoIsStaying: cohortId,
  });
  const taxLabel = isCorporateTrack
    ? "Exempt"
    : formatCurrencyCents(invoice.taxCents);
  const submitLabel = submitBusy
    ? "Executing Signed License..."
    : isCorporateTrack
      ? "Continue to 60s Bank Verification"
      : "Sign & Book Stay Instantly";

  return (
    <div className="vettedrent-premium-checkout" aria-label="Secure your stay">
      <div className="checkout-actions-panel">
        <header className="panel-header">
          <span className="badge-status">Instant Verification Enabled</span>
          <h2>Secure Your Stay</h2>
          <p className="subtitle">
            Complete your signature to activate your Stay Passport and cryptographic entry token.
          </p>
        </header>

        <div className="input-group">
          <span className="premium-label">Occupancy Classification</span>
          <div className="pill-selector-row" role="group" aria-label="Occupancy classification">
            {OCCUPANCY_PILLS.map((pill) => {
              const isActive = cohortId === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  className={`pill-option${isActive ? " active" : ""}`}
                  data-profile={pill.profile}
                  aria-pressed={isActive}
                  onClick={() => onChangeCohort?.(pill.id)}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-grid">
          <label className="input-group" htmlFor="legalFullName">
            <span className="premium-label">Legal Full Name</span>
            <input
              id="legalFullName"
              type="text"
              className="premium-input"
              placeholder="As displayed on passport or license"
              autoComplete="name"
              required
              value={guestFullName}
              onChange={(event) => onChangeFullName(event.target.value)}
            />
          </label>

          <label className="input-group" htmlFor="emailAddress">
            <span className="premium-label">Verified Email Address</span>
            <input
              id="emailAddress"
              type="email"
              className="premium-input"
              placeholder="name@domain.com"
              autoComplete="email"
              required
              value={guestEmail}
              onChange={(event) => onChangeEmail(event.target.value)}
            />
          </label>
        </div>

        <div className="input-group signature-container">
          <span className="premium-label">Digital License Affirmation</span>
          <div className="signature-pad-wrapper">
            <input
              id="digitalSignature"
              type="text"
              className="signature-input-field"
              placeholder="Type your full legal name to execute document"
              value={guestFullName}
              onChange={(event) => onChangeFullName(event.target.value)}
            />
            <div className="signature-line-decorator" />
          </div>
          <p className="legal-micro-disclosure">
            By typing your name above, you execute a contractually bounded, revocable occupancy
            license tailored dynamically to your stay duration (
            <span id="disclosedTrack">
              {isCorporateTrack ? "Corporate Shielded License" : "Transient Occupancy License"}
            </span>
            ).{" "}
            <button
              type="button"
              className="premium-link"
              id="viewTermsLink"
              onClick={() => setDisclosureOpen((open) => !open)}
            >
              Review License Disclosure
            </button>
          </p>
          {disclosureOpen ? (
            <p className="legal-micro-disclosure" id="legal-terms">
              This is a revocable commercial occupancy license, not a residential tenancy. Stays
              under 30 days use Track A. Stays of 30–90 days use Track B with GMF host protection.
              Your typed name is your electronic signature.
            </p>
          ) : null}
        </div>
      </div>

      <div className="checkout-summary-panel">
        <div className="summary-card-glass">
          <div className="tier-preview-header">
            <div>
              <h3 id="summaryTierTitle">{tierId}</h3>
              <p className="location-tag">Statewide Maryland · Keyless Access Secured</p>
            </div>
            <div className="price-pill">
              <span id="summaryDailyRate">{formatCurrencyCents(dailyRateCents)}</span>/day
            </div>
          </div>

          <div className="stay-span-badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
            </svg>
            <span id="summaryDatesDisplay">
              {formatReadableDate(checkInIso)} → {formatReadableDate(checkOutIso)}
            </span>
            <span className="duration-days-count" id="summaryDurationCount">
              ({stayDays} Days)
            </span>
          </div>

          <div className="premium-ledger">
            <div className="ledger-row">
              <span>Accommodation Subtotal</span>
              <span id="ledgerSubtotal">{formatCurrencyCents(invoice.subtotalCents)}</span>
            </div>
            <div className="ledger-row">
              <span>State &amp; County Local Taxes</span>
              <span id="ledgerTaxes">{taxLabel}</span>
            </div>
            <div className="ledger-row benefit-row">
              <span>Security Deposit Shield</span>
              <span className="highlight-free">$0.00</span>
            </div>
            <div className="ledger-row benefit-row">
              <span>Credit Verification Waiver</span>
              <span className="highlight-free">Waived</span>
            </div>

            <div className="ledger-divider" />

            <div className="ledger-row total-row">
              <span>Total Investment</span>
              <span id="ledgerTotal">{formatCurrencyCents(invoice.finalTotalCents)}</span>
            </div>
          </div>

          <button
            className="premium-submit-btn"
            id="primarySubmitButton"
            type="button"
            disabled={submitBusy}
            onClick={onSubmit}
          >
            <span className="btn-text">{submitLabel}</span>
            <svg className="btn-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {errorMessage ? (
            <p className="premium-checkout-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <p className="escrow-shield-notice">
            🔒 Backed by the VettedRent $250,000 Guaranteed Mid-Term Fund Escrow Pool.
          </p>
        </div>
      </div>
    </div>
  );
}
