"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { ListingDiscoveryGrid } from "@/src/components/ListingGrid";
import {
  STAY_DURATION_OPTIONS,
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
import {
  SEASONAL_REMOTE_MIN_DAYS,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type BrandPerspective = "landlord" | "tenant";
export { SPACE_TIER_CARDS, type SpaceTierCardOption };

const AUDIENCE_PURPOSE_FILTERS: readonly {
  id: PurposeCohortId | "ALL";
  label: string;
}[] = [
  { id: "ALL", label: "All Verified Stays" },
  {
    id: "Contract-Assignment",
    label: "Temporary Professionals & Contractors",
  },
  {
    id: "Academic-Enrollment",
    label: "University Students & Interns",
  },
  {
    id: "Insurance-Relocation",
    label: "Families in Transition & Insurance (ALE)",
  },
  {
    id: "Seasonal-Remote",
    label: "Remote & Seasonal Stays",
  },
];

export function DualBrandHome({
  stay,
}: {
  stay: { name: string; weeklyPriceCents: number; geoCompliance: string };
  weeklyRate?: string;
}) {
  const [perspective, setPerspective] = useState<BrandPerspective>("tenant");
  const isLandlord = perspective === "landlord";

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTierFilter, setActiveTierFilter] = useState<string>("ALL");
  const [activeCohortFilter, setActiveCohortFilter] = useState<PurposeCohortId | "ALL">("ALL");
  const [selectedTierId, setSelectedTierId] = useState<DailyRateTierId>("RoomSanctuary");
  const [selectedWeeklyCents, setSelectedWeeklyCents] = useState<number>(31500);
  const [selectedCohortId, setSelectedCohortId] =
    useState<PurposeCohortId>("Contract-Assignment");
  const [selectedJurisdictionCode, setSelectedJurisdictionCode] = useState<string>(
    DEFAULT_JURISDICTION_CODE,
  );
  const [stayDays, setStayDays] = useState<number>(7);
  const [checkInIso, setCheckInIso] = useState<string>(() => todayIsoUtc());

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

  function handleSelectAudienceFilter(nextCohort: PurposeCohortId | "ALL") {
    setActiveCohortFilter(nextCohort);
    if (nextCohort !== "ALL") {
      setSelectedCohortId(nextCohort);
      if (nextCohort === "Insurance-Relocation") {
        selectTier("ExecutiveTownhome");
      } else if (nextCohort === "Academic-Enrollment") {
        selectTier("RoomSanctuary");
      } else if (nextCohort === "Seasonal-Remote" && stayDays < SEASONAL_REMOTE_MIN_DAYS) {
        setStayDays(SEASONAL_REMOTE_MIN_DAYS);
      }
    }
  }

  function handleCheckInChange(nextCheckInIso: string) {
    if (!nextCheckInIso) {
      return;
    }
    setCheckInIso(nextCheckInIso);
  }

  function handleStayDaysChange(nextDaysRaw: number) {
    const minDays =
      selectedCohortId === "Seasonal-Remote" ? SEASONAL_REMOTE_MIN_DAYS : 7;
    setStayDays(Math.max(minDays, Math.min(90, nextDaysRaw || 7)));
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
          "Your property inquiry has been saved. Use the 7-to-90-Day Calendar below to set your open or booked dates.",
        );
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
    <main className="google-home google-home--unified" data-perspective={perspective}>
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
          <Link className="text-button" href="/host/onboard">
            List Your Property
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      {/* SINGLE UNIFIED MARKETPLACE & SEARCH CONTAINER */}
      <section
        id="searchable-spaces"
        className="vr-unified-marketplace relative z-10"
        aria-label="Live Searchable Marketplace"
      >
        {/* UNIFIED MARKETPLACE HEADER FOR ALL 4 AUDIENCES */}
        <div className="vr-unified-marketplace__head">
          <div className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
            Statewide Maryland Marketplace (All 23 Counties &amp; Baltimore City) · Weekly to 90-Day Stays
          </div>
          {!isLandlord ? (
            <>
              <h1 className="vr-unified-marketplace__title">
                Explore Verified 7-to-90-Day Stays
              </h1>
              <p className="vr-unified-marketplace__sub">
                Move-in ready furnished stays for professionals, students, and families in
                transition with <strong>$0 Security Deposit</strong>,{" "}
                <strong>No Credit Check</strong>, and <strong>Instant Bank Link Setup</strong>.
              </p>
            </>
          ) : (
            <>
              <h1 className="vr-unified-marketplace__title">
                Host Verified 7-to-90-Day Guests with Confidence
              </h1>
              <p className="vr-unified-marketplace__sub">
                Welcome pre-verified professionals, students, and relocating families with{" "}
                <strong>$0 Security Deposit</strong> friction, <strong>No Credit Check</strong>{" "}
                delays, and <strong>Instant Bank Link Setup</strong>.
              </p>
            </>
          )}
        </div>

        {/* OPEN DYNAMIC ZIP CODE & AUDIENCE SEARCH CONSOLE */}
        {!isLandlord ? (
          <div
            className="vr-search-console relative z-10"
            role="search"
            aria-label="Search spaces by any ZIP code, city, university, employer, or stay purpose"
          >
            {/* OPEN DYNAMIC ZIP CODE / CITY / CAMPUS / EMPLOYER SEARCH INPUT */}
            <div className="vr-zip-search-row">
              <div className="vr-zip-search-box">
                <span className="vr-zip-search-badge">STATEWIDE MD ZIP / CITY SEARCH</span>
                <input
                  type="search"
                  inputMode="search"
                  aria-label="Search any Maryland ZIP code (20601–21930), county, city, university, or employer"
                  placeholder="Search any Maryland ZIP code (20601–21930), county, city, university, or employer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="vr-zip-search-input"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="vr-zip-search-clear"
                  >
                    Clear ✕
                  </button>
                ) : null}
              </div>

              {/* 4 UNIVERSAL AUDIENCE PILLS */}
              <div
                className="vr-zip-quick-chips"
                role="group"
                aria-label="Filter by stay purpose and audience"
              >
                {AUDIENCE_PURPOSE_FILTERS.map((item) => {
                  const isActive = activeCohortFilter === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleSelectAudienceFilter(item.id)}
                      className={`vr-zip-chip${isActive ? " vr-zip-chip--active" : ""}`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* WEEKLY-TO-90-DAY BOOKING BAR: TIER + WHO IS STAYING + STAY LENGTH (7–90 DAYS) + CHECK-IN + BOOK CTA */}
            <div className="google-search-bar vr-clean-booking-bar">
              <label className="google-search-cell">
                <span>Space Tier</span>
                <select
                  aria-label="Space Tier"
                  value={selectedTierId}
                  onChange={(e) => {
                    const nextTier = e.target.value as DailyRateTierId;
                    selectTier(nextTier);
                  }}
                >
                  {SPACE_TIER_CARDS.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.codeLabel} ({card.dailyPriceLabel} · {card.weeklyPriceLabel})
                    </option>
                  ))}
                </select>
              </label>

              <label className="google-search-cell">
                <span>Who Is Staying?</span>
                <select
                  aria-label="Who Is Staying?"
                  value={selectedCohortId}
                  onChange={(e) => {
                    const nextCohort = e.target.value as PurposeCohortId;
                    setSelectedCohortId(nextCohort);
                    setActiveCohortFilter(nextCohort);
                    if (
                      nextCohort === "Seasonal-Remote" &&
                      stayDays < SEASONAL_REMOTE_MIN_DAYS
                    ) {
                      setStayDays(SEASONAL_REMOTE_MIN_DAYS);
                    }
                  }}
                >
                  <option value="Contract-Assignment">Temporary Professional / Contractor</option>
                  <option value="Academic-Enrollment">University Student / Intern</option>
                  <option value="Insurance-Relocation">Family in Transition / Insurance (ALE)</option>
                  <option value="Seasonal-Remote">Remote / Seasonal Stay (14d+)</option>
                </select>
              </label>

              <label className="google-search-cell">
                <span>Stay Length (7 to 90 Days)</span>
                <select
                  aria-label="Stay Length (7 to 90 Days)"
                  value={stayDays}
                  onChange={(e) => handleStayDaysChange(Number(e.target.value))}
                >
                  {STAY_DURATION_OPTIONS.map((opt) => (
                    <option
                      key={opt.days}
                      value={opt.days}
                      disabled={
                        selectedCohortId === "Seasonal-Remote" &&
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
                  aria-label="Check-In date"
                  value={checkInIso}
                  onChange={(e) => handleCheckInChange(e.target.value)}
                />
              </label>

              <Link className="button google-search-cta" href={underwritingHref}>
                Book {stayDays}-Day Stay ({selectedCard.dailyPriceLabel}) →
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="google-search-bar vr-clean-booking-bar relative z-10"
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

        {/* SWIPEABLE MARKETPLACE FOR PROFESSIONALS, STUDENTS & FAMILIES IN TRANSITION */}
        <ListingDiscoveryGrid
          searchQuery={searchQuery}
          activeTierFilter={activeTierFilter}
          activeCohortFilter={activeCohortFilter}
          selectedTierId={selectedTierId}
          checkInIso={checkInIso}
          stayDays={stayDays}
          jurisdictionCode={selectedJurisdictionCode}
          onSelectTier={(tier) => selectTier(tier)}
          onResetFilters={() => {
            setSearchQuery("");
            setActiveTierFilter("ALL");
            setActiveCohortFilter("ALL");
          }}
        />

        {/* INTERACTIVE 7-TO-90-DAY BOOKING CALENDAR (CLICK ANY DAY TO AUTO-BOOK 7 TO 90 DAYS) */}
        <AvailabilityCalendar
          mode={isLandlord ? "landlord" : "tenant"}
          tierId={selectedTierId}
          weeklyRateCents={clampedWeeklyCents}
          onChangeWeeklyRateCents={(next) => setSelectedWeeklyCents(next)}
          stayDays={stayDays}
          onChangeStayDays={(nextDays) => handleStayDaysChange(nextDays)}
          checkInIso={checkInIso}
          onSelectCheckIn={(iso) => setCheckInIso(iso)}
          hostEmail={hostEmail}
          cohortId={selectedCohortId}
          jurisdictionCode={selectedJurisdictionCode}
          context="home"
        />
      </section>

      {/* CLEAN FOOTER */}
      <footer
        className="google-footer relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <span>
          VettedRent ({stay.name}) · <strong>$0 Security Deposit</strong> ·{" "}
          <strong>No Credit Check</strong> · <strong>Instant Bank Link Setup</strong>
        </span>
        <div className="google-footer__links">
          <Link href="/underwriting">Book a Stay</Link>
          <Link href="/host/onboard">List Your Property</Link>
          <Link href="/dashboard">Sign In</Link>
        </div>
      </footer>
    </main>
  );
}
