"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import {
  addDaysIsoUtc,
  formatReadableDate,
  todayIsoUtc,
} from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  SPACE_TIER_CARDS,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
  type SpaceTierCardOption,
} from "@/lib/daily-rate-comparison";
import type { PurposeCohortId } from "@/lib/underwriting-contract";

export type BrandPerspective = "landlord" | "tenant";
export { SPACE_TIER_CARDS, type SpaceTierCardOption };

function diffDaysUtc(startIso: string, endIso: string): number {
  const startMs = Date.parse(`${startIso}T00:00:00Z`);
  const endMs = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 30;
  }
  const diff = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
  return Math.max(7, Math.min(365, diff));
}

export function DualBrandHome({
  stay,
}: {
  stay: { name: string; weeklyPriceCents: number; geoCompliance: string };
  weeklyRate?: string;
}) {
  const [perspective, setPerspective] = useState<BrandPerspective>("tenant");
  const isLandlord = perspective === "landlord";

  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>("RoomSanctuary");
  const [selectedWeeklyCents, setSelectedWeeklyCents] = useState<number>(31500);
  const [selectedCohortId] = useState<PurposeCohortId>("Contract-Assignment");
  const [selectedJurisdictionCode, setSelectedJurisdictionCode] = useState<string>(
    DEFAULT_JURISDICTION_CODE,
  );
  const [stayDays, setStayDays] = useState<number>(30);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());
  const [showCalendar, setShowCalendar] = useState<boolean>(false);

  const [hostEmail, setHostEmail] = useState("");
  const [hostSubmitting, setHostSubmitting] = useState(false);
  const [hostNotice, setHostNotice] = useState<string | null>(null);

  const clampedWeeklyCents = clampTierWeeklyRateCents(
    selectedTierId,
    selectedWeeklyCents,
  );
  const checkOutIso = addDaysIsoUtc(checkInIso, stayDays);
  const selectedCard =
    SPACE_TIER_CARDS.find((card) => card.id === selectedTierId) ?? SPACE_TIER_CARDS[0];

  function selectTier(nextTierId: DailyRateTierId) {
    setSelectedTierId(nextTierId);
    setSelectedWeeklyCents(DAILY_RATE_PRESET_TIERS[nextTierId].weeklyRateCents);
  }

  function handleCheckInChange(nextCheckInIso: string) {
    if (!nextCheckInIso) {
      return;
    }
    setCheckInIso(nextCheckInIso);
  }

  function handleCheckOutChange(nextCheckOutIso: string) {
    if (!nextCheckOutIso) {
      return;
    }
    const nextStayDays = diffDaysUtc(checkInIso, nextCheckOutIso);
    setStayDays(nextStayDays);
  }

  async function handleQuickHostStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hostEmail.trim()) {
      return;
    }
    setHostSubmitting(true);
    setHostNotice(null);
    try {
      const res = await fetch("/api/marketing/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "host",
          cohort: "Host-Property",
          email: hostEmail.trim(),
          jurisdictionCode: selectedJurisdictionCode,
          weeklyRateCents: clampedWeeklyCents,
          intendedStayDays: stayDays,
        }),
      });
      if (res.ok) {
        setHostNotice(
          "Your property inquiry has been saved. Use the calendar below to set your open dates.",
        );
        setShowCalendar(true);
      } else {
        setHostNotice("Could not save right now. Please try again.");
      }
    } catch {
      setHostNotice("Network error. Please try again.");
    } finally {
      setHostSubmitting(false);
    }
  }

  const underwritingHref = `/underwriting?tier=${encodeURIComponent(selectedTierId)}&weeklyCents=${clampedWeeklyCents}&days=${stayDays}&checkIn=${encodeURIComponent(checkInIso)}&cohort=${encodeURIComponent(selectedCohortId)}&jurisdiction=${encodeURIComponent(selectedJurisdictionCode)}`;

  return (
    <main className="google-home" data-perspective={perspective}>
      <div
        className="google-hero-backdrop pointer-events-none"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
      />

      {/* CLEAN PUBLIC HEADER */}
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
          <button
            type="button"
            className="text-button"
            onClick={() => setPerspective("tenant")}
          >
            Book a Stay
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setPerspective("landlord")}
          >
            List Your Property
          </button>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      {/* CENTERED AIRBNB / HOTWIRE STYLE HERO & BOOKING STAGE */}
      <section
        className="google-stage relative z-10"
        style={{ position: "relative", zIndex: 10 }}
        aria-label="Search and book furnished stays"
      >
        {/* CONSUMER VALUE HEADLINE */}
        {!isLandlord ? (
          <div className="google-headline">
            <h1>Move-in ready stays from {selectedCard.dailyPriceLabel}.</h1>
            <p>
              Book verified furnished spaces with <strong>$0 Security Deposit</strong>,{" "}
              <strong>No Credit Check</strong>, and <strong>Instant Bank Link Setup</strong>.
            </p>
          </div>
        ) : (
          <div className="google-headline">
            <h1>Host verified mid-term guests with confidence.</h1>
            <p>
              Welcome pre-verified traveling professionals with{" "}
              <strong>$0 Security Deposit</strong> friction, <strong>No Credit Check</strong>{" "}
              delays, and <strong>Instant Bank Link Setup</strong>.
            </p>
          </div>
        )}

        {/* CONSUMER VALUE TRUST BAR */}
        <div className="vr-value-badges" aria-label="Consumer benefits">
          <div className="vr-value-badge">
            <span className="vr-value-badge__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>$0 Security Deposit</strong>
              <span>Keep your cash at move-in</span>
            </div>
          </div>
          <div className="vr-value-badge">
            <span className="vr-value-badge__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>No Credit Check</strong>
              <span>Zero impact on your credit score</span>
            </div>
          </div>
          <div className="vr-value-badge">
            <span className="vr-value-badge__icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Instant Bank Link Setup</strong>
              <span>60-second verification via Plaid</span>
            </div>
          </div>
        </div>

        {/* MINIMALIST DESTINATION + CHECK-IN / CHECK-OUT SEARCH BAR */}
        {!isLandlord ? (
          <div
            className="google-search-bar vr-clean-booking-bar relative z-10"
            style={{ position: "relative", zIndex: 10 }}
            role="search"
            aria-label="Search stays by destination and dates"
          >
            <label className="google-search-cell vr-search-cell--destination">
              <span>Where are you traveling?</span>
              <select
                aria-label="Where are you traveling?"
                value={selectedJurisdictionCode}
                onChange={(e) => setSelectedJurisdictionCode(e.target.value)}
              >
                {JURISDICTION_RULES.map((rule) => (
                  <option key={rule.code} value={rule.code}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="google-search-cell">
              <span>Check-In</span>
              <input
                type="date"
                aria-label="Check-In date"
                value={checkInIso}
                onChange={(e) => handleCheckInChange(e.target.value)}
              />
            </label>

            <label className="google-search-cell">
              <span>Check-Out</span>
              <input
                type="date"
                aria-label="Check-Out date"
                min={addDaysIsoUtc(checkInIso, 7)}
                value={checkOutIso}
                onChange={(e) => handleCheckOutChange(e.target.value)}
              />
            </label>

            <Link className="button google-search-cta" href={underwritingHref}>
              Book {selectedCard.title} ({selectedCard.dailyPriceLabel}) →
            </Link>
          </div>
        ) : (
          <form
            className="google-search-bar vr-clean-booking-bar relative z-10"
            style={{ position: "relative", zIndex: 10 }}
            onSubmit={(e) => void handleQuickHostStart(e)}
            aria-label="List your property"
          >
            <label className="google-search-cell">
              <span>Where is your property?</span>
              <select
                value={selectedJurisdictionCode}
                onChange={(e) => setSelectedJurisdictionCode(e.target.value)}
              >
                {JURISDICTION_RULES.map((rule) => (
                  <option key={rule.code} value={rule.code}>
                    {rule.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="google-search-cell">
              <span>Space Tier</span>
              <select
                value={selectedTierId}
                onChange={(e) => selectTier(e.target.value as DailyRateTierId)}
              >
                {SPACE_TIER_CARDS.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.title} ({tier.dailyPriceLabel})
                  </option>
                ))}
              </select>
            </label>

            <label className="google-search-cell" style={{ flex: "1.4 1 12rem" }}>
              <span>Your Email</span>
              <input
                type="email"
                required
                placeholder="you@domain.com"
                value={hostEmail}
                onChange={(e) => setHostEmail(e.target.value)}
              />
            </label>

            <button
              type="submit"
              className="button google-search-cta"
              disabled={hostSubmitting}
            >
              {hostSubmitting ? "Saving..." : "List My Property →"}
            </button>
          </form>
        )}

        {hostNotice ? <p className="payload">{hostNotice}</p> : null}

        {/* SINGLE PREMIUM TIER SELECTOR: 3 VISUAL CARDS */}
        <div
          className="vr-tier-selector-section"
          role="region"
          aria-label="Choose your space tier"
        >
          <div className="vr-tier-selector-header">
            <h2>Select Your Space</h2>
            <span>
              {formatReadableDate(checkInIso)} → {formatReadableDate(checkOutIso)} ({stayDays}{" "}
              nights) · Featured: {stay.name}
            </span>
          </div>

          <div className="vr-tier-cards-grid" role="radiogroup" aria-label="Space tiers">
            {SPACE_TIER_CARDS.map((card) => {
              const isSelected = selectedTierId === card.id;
              const cardHref = `/underwriting?tier=${encodeURIComponent(card.id)}&weeklyCents=${card.weeklyRateCents}&days=${stayDays}&checkIn=${encodeURIComponent(checkInIso)}&cohort=${encodeURIComponent(selectedCohortId)}&jurisdiction=${encodeURIComponent(selectedJurisdictionCode)}`;

              return (
                <div
                  key={card.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  className={`vr-tier-card${isSelected ? " vr-tier-card--selected" : ""}`}
                  onClick={() => selectTier(card.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectTier(card.id);
                    }
                  }}
                >
                  <div className="vr-tier-card__top">
                    <span className="vr-tier-card__badge">{card.badge}</span>
                    <span className="vr-tier-card__code">{card.codeLabel}</span>
                  </div>

                  <div className="vr-tier-card__title-row">
                    <h3>{card.title}</h3>
                    <div className="vr-tier-card__price">
                      <strong>{card.dailyPriceLabel}</strong>
                      <span>{card.weeklyPriceLabel}</span>
                    </div>
                  </div>

                  <p className="vr-tier-card__summary">{card.summary}</p>

                  <ul className="vr-tier-card__features">
                    {card.features.map((feat) => (
                      <li key={feat}>
                        <span aria-hidden="true">•</span> <strong>{feat}</strong>
                      </li>
                    ))}
                  </ul>

                  <div className="vr-tier-card__footer">
                    <span className="vr-tier-card__select-indicator">
                      {isSelected ? "✓ Selected" : "Click to Select"}
                    </span>
                    <Link
                      className={isSelected ? "button" : "button button-secondary"}
                      href={cardHref}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Book {card.dailyPriceLabel} →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* OPTIONAL INTERACTIVE CALENDAR TOGGLE */}
        <div className="google-pill-row">
          <button
            type="button"
            className="google-info-pill google-calendar-trigger"
            onClick={() => setShowCalendar((prev) => !prev)}
          >
            <strong>{showCalendar ? "Hide Date Calendar ▲" : "Browse Open Dates on Calendar ▼"}</strong>
            <span>
              {formatReadableDate(checkInIso)} → {formatReadableDate(checkOutIso)}
            </span>
          </button>
        </div>

        {showCalendar ? (
          <AvailabilityCalendar
            mode={isLandlord ? "landlord" : "tenant"}
            tierId={selectedTierId}
            weeklyRateCents={clampedWeeklyCents}
            onChangeWeeklyRateCents={(next) => setSelectedWeeklyCents(next)}
            stayDays={stayDays}
            checkInIso={checkInIso}
            onSelectCheckIn={(iso) => {
              setCheckInIso(iso);
              setShowCalendar(true);
            }}
            hostEmail={hostEmail}
            cohortId={selectedCohortId}
            jurisdictionCode={selectedJurisdictionCode}
            context="home"
          />
        ) : null}
      </section>

      {/* CLEAN PUBLIC FOOTER */}
      <footer
        className="google-footer relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <span>
          VettedRent · <strong>$0 Security Deposit</strong> · <strong>No Credit Check</strong> ·{" "}
          <strong>Instant Bank Link Setup</strong>
        </span>
        <div className="google-footer__links">
          <Link href="/underwriting">Book a Stay</Link>
          <Link href="/dashboard">Sign In</Link>
        </div>
      </footer>
    </main>
  );
}
