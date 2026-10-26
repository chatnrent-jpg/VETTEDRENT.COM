"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AvailabilityCalendar,
  type InstantBookingConfirmation,
} from "@/components/availability-calendar";
import { usePlaidLinkFlow } from "@/hooks/usePlaidLinkFlow";
import {
  STAY_DURATION_OPTIONS,
  addDaysIsoUtc,
  formatReadableDate,
  todayIsoUtc,
} from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  SPACE_TIER_CARDS,
  calculateDailyRateComparison,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { intendedStayLengthDays } from "@/lib/geo-compliance";
import {
  divideIntegerCentsHalfUp,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  PURPOSE_COHORTS,
  SEASONAL_REMOTE_MIN_DAYS,
  defaultContractTerm,
  resolvePurposeCohort,
  type ContractTerm,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

const DEFAULT_WEEKLY_STAY_CENTS = 31500;

export function PlaidLinkScreen() {
  const router = useRouter();
  const initial = defaultContractTerm();
  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>("RoomSanctuary");
  const [weeklyStayCents, setWeeklyStayCents] = useState<number>(DEFAULT_WEEKLY_STAY_CENTS);
  const [contract, setContract] = useState<ContractTerm>(initial);
  const [jurisdictionCode, setJurisdictionCode] = useState(DEFAULT_JURISDICTION_CODE);
  const [guestFullName, setGuestFullName] = useState<string>("");
  const [prefilledLeadEmail, setPrefilledLeadEmail] = useState<string>("");
  const [licenseSigned, setLicenseSigned] = useState<boolean>(false);
  const [prefilledStayDays, setPrefilledStayDays] = useState<number | null>(null);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [showCalendar, setShowCalendar] = useState<boolean>(true);
  const [activatingPass, setActivatingPass] = useState(false);
  const [activationMessage, setActivationMessage] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] =
    useState<InstantBookingConfirmation | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const weeklyCentsParam = params.get("weeklyCents");
    const tierParam = params.get("tier");
    const cohortParam = params.get("cohort");
    const daysParam = params.get("days");
    const checkInParam = params.get("checkIn");
    const jurisdictionParam = params.get("jurisdiction");
    const fullNameParam = params.get("fullName");
    const emailParam = params.get("email");

    if (
      !weeklyCentsParam &&
      !tierParam &&
      !cohortParam &&
      !daysParam &&
      !checkInParam &&
      !jurisdictionParam &&
      !fullNameParam &&
      !emailParam
    ) {
      return;
    }

    const parsedWeekly = weeklyCentsParam ? Number(weeklyCentsParam) : NaN;
    let resolvedTier: DailyRateTierId = "RoomSanctuary";
    if (
      tierParam === "RoomSanctuary" ||
      tierParam === "PrivateSuite" ||
      tierParam === "ExecutiveTownhome"
    ) {
      resolvedTier = tierParam;
    } else if (Number.isFinite(parsedWeekly)) {
      if (parsedWeekly >= 74500) {
        resolvedTier = "ExecutiveTownhome";
      } else if (parsedWeekly === 52500 || parsedWeekly === 49000) {
        resolvedTier = "PrivateSuite";
      }
    }

    setSelectedTierId(resolvedTier);
    setWeeklyStayCents(
      clampTierWeeklyRateCents(
        resolvedTier,
        Number.isFinite(parsedWeekly) ? parsedWeekly : undefined,
      ),
    );

    const startIso =
      checkInParam && /^\d{4}-\d{2}-\d{2}$/.test(checkInParam)
        ? checkInParam
        : todayIsoUtc();
    setCheckInIso(startIso);

    const matchedCohort = resolvePurposeCohort(cohortParam);
    const parsedDays = daysParam ? Number(daysParam) : NaN;
    const stayDays =
      Number.isFinite(parsedDays) && parsedDays >= 7 && parsedDays <= 365
        ? Math.max(matchedCohort.minStayDays, Math.round(parsedDays))
        : matchedCohort.defaultStayDays;
    const targetEndDate = addDaysIsoUtc(startIso, stayDays);

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

    if (fullNameParam && fullNameParam.trim() !== "") {
      setGuestFullName(fullNameParam.trim());
    }

    if (emailParam && emailParam.trim() !== "") {
      setPrefilledLeadEmail(emailParam.trim());
    }
  }, []);

  const clampedWeeklyStayCents = clampTierWeeklyRateCents(
    selectedTierId,
    weeklyStayCents,
  );

  const { phase, error, decision, ready, open, canSimulate, simulate } = usePlaidLinkFlow(
    clampedWeeklyStayCents,
    contract,
    jurisdictionCode,
  );
  const checking = phase === "checking";
  const activeCohort = resolvePurposeCohort(contract.credentialType);
  const selectedStayDays = Math.max(
    activeCohort.minStayDays,
    prefilledStayDays ?? intendedStayLengthDays(contract.intendedStayEndDate),
  );
  const checkOutIso = addDaysIsoUtc(checkInIso, selectedStayDays);
  const selectedCard =
    SPACE_TIER_CARDS.find((card) => card.id === selectedTierId) ?? SPACE_TIER_CARDS[0];

  function selectTier(nextTierId: DailyRateTierId) {
    setSelectedTierId(nextTierId);
    setWeeklyStayCents(DAILY_RATE_PRESET_TIERS[nextTierId].weeklyRateCents);
  }

  function selectCohort(cohortId: PurposeCohortId) {
    const nextCohort = resolvePurposeCohort(cohortId);
    const nextDays = Math.max(nextCohort.minStayDays, selectedStayDays);
    const targetEndDate = addDaysIsoUtc(checkInIso, nextDays);
    setContract({
      credentialType: nextCohort.id,
      credentialIdentifier: nextCohort.defaultIdentifier,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    });
    setPrefilledStayDays(nextDays);
  }

  function updateStayDurationDays(days: number) {
    const clamped = Math.max(activeCohort.minStayDays, Math.min(365, Math.round(days)));
    const targetEndDate = addDaysIsoUtc(checkInIso, clamped);
    setPrefilledStayDays(clamped);
    setContract((prev) => ({
      ...prev,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    }));
  }

  function updateCheckInDate(nextCheckInIso: string) {
    setCheckInIso(nextCheckInIso);
    const targetEndDate = addDaysIsoUtc(nextCheckInIso, selectedStayDays);
    setContract((prev) => ({
      ...prev,
      contractEndDate: targetEndDate,
      intendedStayEndDate: targetEndDate,
    }));
  }

  async function handleActivateWeeklyBillingAndPass() {
    const trimmedName = guestFullName.trim();
    const trimmedEmail = prefilledLeadEmail.trim();

    if (trimmedName.length < 2) {
      setActivationError(
        "Please enter your Legal Full Name so your Revocable Commercial License and Stay Passport are issued in your name.",
      );
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setActivationError(
        "Please enter your Verified Email Address to bind your identity to the Revocable Commercial License.",
      );
      return;
    }
    if (!licenseSigned) {
      setActivationError(
        "Please check the Electronic Signature box to sign and accept the Revocable Commercial License to Occupy.",
      );
      return;
    }

    setActivatingPass(true);
    setActivationMessage(null);
    setActivationError(null);

    try {
      let signedInEmail: string | null = null;
      let signedInUserId: string | null = null;
      let token: string | null = null;

      try {
        const supabase = getSupabaseBrowserClient();
        const session = await supabase.auth.getSession();
        token = session.data.session?.access_token ?? null;
        signedInEmail = session.data.session?.user?.email ?? null;
        signedInUserId = session.data.session?.user?.id ?? null;
      } catch {
        // Proceed with automated conversion engine even if not signed in yet
      }

      const finalEmail = signedInEmail ?? trimmedEmail;
      const effectiveApplicant = `${trimmedName} (${finalEmail})`;

      const convRes = await fetch("/api/conversion/activate-stay", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant: effectiveApplicant,
          cohort: contract.credentialType,
          jurisdiction: jurisdictionCode,
          tier: selectedTierId,
          weeklyRateCents: clampedWeeklyStayCents,
          stayDays: selectedStayDays,
          checkInDate: checkInIso,
          credentialIdentifier: contract.credentialIdentifier,
          coverageRatio: decision?.ratio ?? 3.0,
        }),
      });
      const convBody: unknown = await convRes.json();
      const convRecord =
        convBody && typeof convBody === "object"
          ? (convBody as Record<string, unknown>)
          : {};

      if (!convRes.ok || convRecord.ok !== true) {
        const errText =
          typeof convRecord.error === "string"
            ? convRecord.error
            : "Could not activate stay via conversion engine";
        setActivationError(errText);
        return;
      }

      if (token && signedInUserId) {
        try {
          const cycleRes = await fetch("/api/billing/weekly-cycle", {
            method: "POST",
            credentials: "same-origin",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cycleRes.ok) {
            await fetch("/api/billing/create-subscription", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerEmail: finalEmail,
                hostAccountId: "acct_simulated_host",
                totalCents: weeklyStayCents,
                tenantId: signedInUserId,
                hostId: signedInUserId,
                listingId: "vr-weekly-room",
                seamDeviceId: "seam_device_mock",
              }),
            });
          }
        } catch {
          // Conversion engine already recorded the license & ledger
        }
      }

      const activeStaysCount =
        typeof convRecord.activeStaysCount === "number"
          ? convRecord.activeStaysCount
          : 5;
      const targetStaysCount =
        typeof convRecord.targetStaysCount === "number"
          ? convRecord.targetStaysCount
          : 45;
      const progressPercentage =
        typeof convRecord.progressPercentage === "number"
          ? convRecord.progressPercentage
          : Math.round((activeStaysCount / targetStaysCount) * 100);
      const licObj =
        convRecord.license && typeof convRecord.license === "object"
          ? (convRecord.license as Record<string, unknown>)
          : {};
      const tokenPreview =
        typeof licObj.license_token === "string"
          ? licObj.license_token
          : "vrtl_active";
      const agreementId =
        typeof licObj.agreement_id === "string"
          ? licObj.agreement_id
          : "00000000-0000-4000-8000-000000000001";
      const licenseId =
        typeof licObj.license_id === "string"
          ? licObj.license_id
          : `VR-LIC-${activeCohort.id.slice(0, 3).toUpperCase()}-${jurisdictionCode}`;
      const validUntil =
        typeof licObj.valid_until === "string"
          ? licObj.valid_until
          : addDaysIsoUtc(checkInIso, selectedStayDays);

      const passportQuery = new URLSearchParams({
        cohort: activeCohort.id,
        jurisdiction: jurisdictionCode,
        days: String(selectedStayDays),
        weeklyCents: String(clampedWeeklyStayCents),
        credentialId: contract.credentialIdentifier,
        ratio: String(decision?.ratio ?? 3.25),
        contractEnd: validUntil,
        stayEnd: validUntil,
        fullName: trimmedName,
        email: finalEmail,
        applicant: effectiveApplicant,
      });
      const passportPdfHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

      const licenseQuery = new URLSearchParams({
        format: "pdf",
        agreementId,
        cohort: activeCohort.id,
        jurisdiction: jurisdictionCode,
        days: String(selectedStayDays),
        credentialId: contract.credentialIdentifier,
        ratio: String(decision?.ratio ?? 3.25),
        weeklyFeeCents: String(clampedWeeklyStayCents),
        purposeEnd: validUntil,
        stayEnd: validUntil,
        fullName: trimmedName,
        email: finalEmail,
        licensee: effectiveApplicant,
      });
      const commercialLicensePdfHref = `/api/agreements/license?${licenseQuery.toString()}`;

      setConfirmedBooking({
        licenseId,
        licenseToken: tokenPreview,
        agreementId,
        applicantFullName: trimmedName,
        applicantEmail: finalEmail,
        applicant: effectiveApplicant,
        cohort: activeCohort.id,
        credentialIdentifier: contract.credentialIdentifier,
        jurisdiction: jurisdictionCode,
        tier: selectedTierId,
        weeklyRateCents: clampedWeeklyStayCents,
        dailyRateCents: divideIntegerCentsHalfUp(clampedWeeklyStayCents, 7),
        stayDays: selectedStayDays,
        checkInDate: checkInIso,
        validUntil,
        activeStaysCount,
        targetStaysCount,
        progressPercentage,
        reservedDatesCount: selectedStayDays,
        passportPdfHref,
        commercialLicensePdfHref,
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("vettedrent:stay-activated", {
            detail: {
              milestone: convRecord.milestone,
              license: convRecord.license,
            },
          }),
        );
      }

      setActivationMessage(
        `Signed & Executed (${selectedStayDays} days: ${checkInIso} → ${validUntil}) for ${trimmedName} (${finalEmail}). Digital entry pass ready.`,
      );
      if (decision?.approved) {
        router.push("/dashboard");
      }
    } catch {
      setActivationError("Network error while activating stay.");
    } finally {
      setActivatingPass(false);
    }
  }

  return (
    <main className="google-home" data-perspective="tenant">
      <div
        className="google-hero-backdrop pointer-events-none"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />
      <header
        className="google-topbar relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <Link href="/" className="google-logo">
          <img
            src="/vettedrent-logo-mark.jpg"
            alt="VettedRent Crest"
            className="google-logo-badge"
            width={42}
            height={42}
          />
          <div className="google-logo-lockup">
            <strong>
              VettedRent<em className="google-logo-domain">.Com</em>
            </strong>
            <span>Be Great to Yourself.</span>
          </div>
        </Link>
        <nav className="google-nav" aria-label="Main navigation">
          <Link className="text-button" href="/">
            ← Explore Stays
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      <section
        className="google-stage relative z-10"
        style={{ position: "relative", zIndex: 10 }}
        aria-label="Instant booking and bank verification"
      >
        <div className="google-headline">
          <h1>Sign &amp; Complete Your 7-to-90-Day Reservation</h1>
          <p>
            <strong>{selectedCard.title}</strong> ({selectedCard.dailyPriceLabel} ·{" "}
            {selectedCard.weeklyPriceLabel}) · <strong>$0 Security Deposit</strong> ·{" "}
            <strong>No Credit Check</strong> · <strong>Instant Bank Link Setup</strong>
          </p>
        </div>

        {/* GUEST IDENTITY SIGN-UP & ELECTRONIC SIGNATURE PANEL */}
        <div
          className="panel stack relative z-10"
          style={{ width: "100%", maxWidth: "62rem", textAlign: "left" }}
          role="region"
          aria-label="Guest Identity Sign-Up and Electronic Signature"
        >
          <div>
            <p className="pass-kicker">
              Mandatory Guest Identity &amp; Electronic Signature Binding
            </p>
            <h2>Enter Your Legal Full Name &amp; Sign Your Revocable Commercial License</h2>
            <p className="note">
              Your Legal Full Name and Verified Email are printed directly on your{" "}
              <strong>Revocable Commercial License to Occupy</strong> and{" "}
              <strong>Stay Passport PDF</strong> and cryptographically bound to your smart-lock
              entry token.
            </p>
          </div>

          <div className="simple-grid-2">
            <label className="field">
              <span>Your Legal Full Name (Printed on Document) *</span>
              <input
                type="text"
                required
                placeholder="Jordan Taylor"
                value={guestFullName}
                onChange={(e) => setGuestFullName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Your Verified Email Address *</span>
              <input
                type="email"
                required
                placeholder="jordan.taylor@domain.com"
                value={prefilledLeadEmail}
                onChange={(e) => setPrefilledLeadEmail(e.target.value)}
              />
            </label>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.6rem",
              fontSize: "0.86rem",
              color: "#f8fafc",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={licenseSigned}
              onChange={(e) => setLicenseSigned(e.target.checked)}
              style={{ marginTop: "0.22rem", accentColor: "#10b981" }}
            />
            <span>
              <strong>Electronic Signature (/s/ {guestFullName.trim() || "Your Name"}):</strong> I,{" "}
              <strong>{guestFullName.trim() || "[Enter Your Legal Full Name Above]"}</strong>,
              electronically sign and agree to the{" "}
              <strong>Revocable Commercial License to Occupy</strong> ({selectedStayDays}-day
              non-tenancy stay agreement) and authorize 1:1 weekly billing and digital smart-lock
              keyway issuance.
            </span>
          </label>
        </div>

        {/* MINIMALIST DESTINATION + STAY LENGTH + CHECK-IN + INSTANT ACTION BAR */}
        <div
          className="google-search-bar vr-clean-booking-bar relative z-10"
          style={{ position: "relative", zIndex: 10 }}
        >
          <label className="google-search-cell vr-search-cell--destination">
            <span>Where are you traveling?</span>
            <select
              value={jurisdictionCode}
              onChange={(e) => setJurisdictionCode(e.target.value)}
            >
              {JURISDICTION_RULES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.name}
                </option>
              ))}
            </select>
          </label>

          <label className="google-search-cell">
            <span>Stay Length (7 to 90 Days)</span>
            <select
              aria-label="Stay Length (7 to 90 Days)"
              value={selectedStayDays}
              onChange={(e) => updateStayDurationDays(Number(e.target.value) || 7)}
            >
              {STAY_DURATION_OPTIONS.map((opt) => (
                <option
                  key={opt.days}
                  value={opt.days}
                  disabled={
                    activeCohort.id === "Seasonal-Remote" &&
                    opt.days < SEASONAL_REMOTE_MIN_DAYS
                  }
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="google-search-cell">
            <span>Check-In (→ {formatReadableDate(checkOutIso)})</span>
            <input
              type="date"
              value={checkInIso}
              onChange={(e) => {
                if (e.target.value) {
                  updateCheckInDate(e.target.value);
                }
              }}
            />
          </label>

          {canSimulate ? (
            <button
              type="button"
              className="button google-search-cta"
              disabled={phase === "loading" || checking}
              onClick={() => simulate(contract)}
            >
              {checking ? "Verifying..." : "Instant Bank Link Setup →"}
            </button>
          ) : (
            <button
              type="button"
              className="button google-search-cta"
              disabled={!ready || checking}
              onClick={() => open()}
            >
              Instant Bank Link Setup →
            </button>
          )}

          <button
            type="button"
            className="button button-secondary google-search-cta"
            disabled={activatingPass}
            onClick={() => void handleActivateWeeklyBillingAndPass()}
          >
            {activatingPass
              ? "Executing..."
              : `Sign & Issue ${selectedStayDays}-Day Pass`}
          </button>
        </div>

        {activationError ? (
          <p className="error" role="alert">
            {activationError}
          </p>
        ) : null}

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        {decision ? (
          <Decision
            decision={decision}
            weeklyStayCents={clampedWeeklyStayCents}
            jurisdictionCode={jurisdictionCode}
            stayDays={prefilledStayDays ?? activeCohort.defaultStayDays}
            applicantFullName={guestFullName.trim() || null}
            applicantEmail={prefilledLeadEmail.trim() || null}
            activatingPass={activatingPass}
            activationMessage={activationMessage}
            activationError={activationError}
            onActivate={() => void handleActivateWeeklyBillingAndPass()}
          />
        ) : null}

        {confirmedBooking ? (
          <div
            className="vr-booking-confirmation relative z-10"
            style={{ position: "relative", zIndex: 10, width: "100%" }}
            role="region"
            aria-label="Instant Booking Confirmation"
          >
            <div className="stay-card-head" style={{ flexWrap: "wrap" }}>
              <div>
                <p className="pass-kicker">
                  Signed &amp; Executed · Licensee:{" "}
                  {confirmedBooking.applicantFullName || confirmedBooking.applicant}
                </p>
                <h2>
                  BOOKED: {formatReadableDate(confirmedBooking.checkInDate)} →{" "}
                  {formatReadableDate(confirmedBooking.validUntil)} (
                  {confirmedBooking.stayDays} Days)
                </h2>
              </div>
              <span className="stay-badge" data-status="active">
                Signed: /s/ {confirmedBooking.applicantFullName || "Verified Guest"}
              </span>
            </div>

            <div className="vr-booking-confirmation__grid">
              <div>
                <span>Licensee Legal Full Name</span>
                <strong>
                  {confirmedBooking.applicantFullName || confirmedBooking.applicant}
                </strong>
              </div>
              <div>
                <span>Verified Email</span>
                <strong>{confirmedBooking.applicantEmail || confirmedBooking.applicant}</strong>
              </div>
              <div>
                <span>Space Tier &amp; Rate</span>
                <strong>
                  {confirmedBooking.tier} ·{" "}
                  {formatCurrencyCents(confirmedBooking.dailyRateCents)}/day (
                  {formatCurrencyCents(confirmedBooking.weeklyRateCents)}/wk)
                </strong>
              </div>
              <div>
                <span>Electronic Signature &amp; Token</span>
                <code>
                  /s/ {confirmedBooking.applicantFullName} · {confirmedBooking.licenseToken}
                </code>
              </div>
            </div>

            <div className="actions" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
              <a
                className="button"
                href={confirmedBooking.passportPdfHref}
                download={`VettedRent-Trust-Passport-${(confirmedBooking.applicantFullName || "Guest").replace(/\s+/g, "-")}.pdf`}
              >
                Download Signed Stay Passport (PDF) ↓
              </a>
              <a
                className="button button-secondary"
                href={confirmedBooking.commercialLicensePdfHref}
                download={`VettedRent-Commercial-License-${(confirmedBooking.applicantFullName || "Guest").replace(/\s+/g, "-")}.pdf`}
              >
                Download Signed Commercial License (PDF) ↓
              </a>
              <Link className="button button-secondary" href="/dashboard">
                Open Digital Key Dashboard →
              </Link>
            </div>
          </div>
        ) : null}

        {showCalendar ? (
          <AvailabilityCalendar
            mode="tenant"
            tierId={selectedTierId}
            weeklyRateCents={clampedWeeklyStayCents}
            onChangeWeeklyRateCents={(next) => setWeeklyStayCents(next)}
            stayDays={selectedStayDays}
            onChangeStayDays={(nextDays) => updateStayDurationDays(nextDays)}
            checkInIso={checkInIso}
            onSelectCheckIn={(iso) => updateCheckInDate(iso)}
            cohortId={activeCohort.id}
            jurisdictionCode={jurisdictionCode}
            applicantFullName={guestFullName}
            applicantEmail={prefilledLeadEmail}
            credentialIdentifier={contract.credentialIdentifier}
            context="underwriting"
            onBookingConfirmed={(conf) => setConfirmedBooking(conf)}
          />
        ) : null}

        <details className="google-compare-drawer">
          <summary>Travel Purpose &amp; Verification Details (Optional)</summary>
          <div className="google-compare-drawer__body">
            <div className="simple-grid-2">
              <label className="field">
                <span>Travel Purpose</span>
                <select
                  value={activeCohort.id}
                  onChange={(e) => selectCohort(e.target.value as PurposeCohortId)}
                >
                  {PURPOSE_COHORTS.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.title}
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
            </div>
          </div>
        </details>
      </section>

      <footer
        className="google-footer relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <span>
          VettedRent · <strong>$0 Security Deposit</strong> · <strong>No Credit Check</strong> ·{" "}
          <strong>Instant Bank Link Setup</strong>
        </span>
        <div className="google-footer__links">
          <Link href="/">Explore Stays</Link>
          <Link href="/dashboard">Sign In</Link>
        </div>
      </footer>
    </main>
  );
}

function Decision({
  decision,
  weeklyStayCents,
  jurisdictionCode,
  stayDays,
  applicantFullName,
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
  weeklyStayCents: number;
  jurisdictionCode: string;
  stayDays: number;
  applicantFullName: string | null;
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
    weeklyCents: String(weeklyStayCents),
    credentialId: decision.credentialIdentifier,
    ratio: String(decision.ratio),
    monthlyInflow: String(decision.monthlyInflowEstimated),
    contractEnd: decision.contractEndDate,
    stayEnd: decision.intendedStayEndDate,
    ...(applicantFullName ? { fullName: applicantFullName } : {}),
    ...(applicantEmail ? { email: applicantEmail, applicant: applicantEmail } : {}),
  });
  const passportHref = `/api/underwriting/trust-passport?${passportQuery.toString()}`;

  const licenseQuery = new URLSearchParams({
    format: "pdf",
    cohort: decision.credentialType,
    jurisdiction: jurisdictionCode,
    days: String(stayDays),
    credentialId: decision.credentialIdentifier,
    ratio: String(decision.ratio),
    weeklyFeeCents: String(weeklyStayCents),
    purposeEnd: decision.contractEndDate,
    stayEnd: decision.intendedStayEndDate,
    ...(applicantFullName ? { fullName: applicantFullName } : {}),
    ...(applicantEmail ? { email: applicantEmail, licensee: applicantEmail } : {}),
  });
  const licenseHref = `/api/agreements/license?${licenseQuery.toString()}`;

  const decisionComparison = calculateDailyRateComparison(weeklyStayCents, stayDays);

  return (
    <div className="panel stack" style={{ width: "100%", textAlign: "left" }}>
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">Instant Bank Link Setup Complete</p>
          <h2>{decision.approved ? "Approved for $0 Security Deposit Stay" : "Verification Needed"}</h2>
        </div>
        <span
          className="stay-badge"
          data-status={decision.approved ? "active" : "terminated"}
        >
          {decision.approved ? "Verified" : "Action Required"}
        </span>
      </div>

      <p className="note">
        Licensee: <strong>{applicantFullName || "Enter Legal Full Name Above"}</strong> · Rate:{" "}
        <strong>{formatCurrencyCents(decisionComparison.grossDailyRateCents)}/day</strong> ·{" "}
        <strong>$0 Security Deposit</strong> · <strong>No Credit Check</strong>
      </p>

      {decision.rejection ? (
        <p className="error" role="alert">
          {decision.rejection}
        </p>
      ) : null}

      {decision.approved ? (
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="button"
            disabled={activatingPass}
            onClick={onActivate}
          >
            {activatingPass
              ? "Activating..."
              : `Execute Signed Stay as ${applicantFullName || "Guest"} →`}
          </button>

          <a
            className="button button-secondary"
            href={passportHref}
            download={`VettedRent-Trust-Passport-${(applicantFullName || decision.credentialType).replace(/\s+/g, "-")}.pdf`}
          >
            Signed Stay Passport (PDF) ↓
          </a>
          <a
            className="button button-secondary"
            href={licenseHref}
            download={`VettedRent-Commercial-License-${(applicantFullName || decision.credentialType).replace(/\s+/g, "-")}-${jurisdictionCode}.pdf`}
          >
            Signed Stay Agreement (PDF) ↓
          </a>
        </div>
      ) : null}

      {activationMessage ? <p className="payload">{activationMessage}</p> : null}
      {activationError ? <p className="error">{activationError}</p> : null}
    </div>
  );
}
