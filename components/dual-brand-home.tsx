"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ListingDiscoveryGrid } from "@/src/components/ListingGrid";
import {
  addDaysIsoUtc,
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
  const [stayDays, setStayDays] = useState<number>(30);
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
          "Your property inquiry has been saved. Visit List Your Property to upload photos and URL.",
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
            Temporary Professionals · University Students · Families in Transition &amp; Insurance
          </div>
          {!isLandlord ? (
            <>
              <h1 className="vr-unified-marketplace__title">
                Explore Verified Mid-Term Spaces
              </h1>
              <p className="vr-unified-marketplace__sub">
                Move-in ready furnished stays with <strong>$0 Security Deposit</strong>,{" "}
                <strong>No Credit Check</strong>, and <strong>Instant Bank Link Setup</strong>.
              </p>
            </>
          ) : (
            <>
              <h1 className="vr-unified-marketplace__title">
                Host Verified Mid-Term Guests with Confidence
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
                <span className="vr-zip-search-badge">ZIP / LOCATION SEARCH</span>
                <input
                  type="search"
                  inputMode="search"
                  aria-label="Enter any 5-digit ZIP code, city, university, or employer"
                  placeholder="Enter any 5-digit ZIP code, city, university campus, or employer..."
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

              {/* 4 UNIVERSAL AUDIENCE PILLS (NO HARDCODED ZIP CHIPS) */}
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

            {/* BOOKING CONFIGURATION BAR: TIER + STAY PURPOSE + CHECK-IN + CHECK-OUT + BOOK CTA */}
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
                      {card.codeLabel} ({card.dailyPriceLabel})
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
                  }}
                >
                  <option value="Contract-Assignment">Temporary Professional / Contractor</option>
                  <option value="Academic-Enrollment">University Student / Intern</option>
                  <option value="Insurance-Relocation">Family in Transition / Insurance (ALE)</option>
                  <option value="Seasonal-Remote">Remote / Seasonal Stay (14d+)</option>
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
                Book {selectedCard.codeLabel} ({selectedCard.dailyPriceLabel}) →
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
