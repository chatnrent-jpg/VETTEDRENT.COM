"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { ListingDiscoveryGrid } from "@/src/components/ListingGrid";
import { todayIsoUtc } from "@/lib/availability-calendar";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
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
  { id: "ALL", label: "Anyone" },
  { id: "Contract-Assignment", label: "Professional" },
  { id: "Academic-Enrollment", label: "Student" },
  { id: "Insurance-Relocation", label: "Family" },
  { id: "Seasonal-Remote", label: "Remote" },
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
  function selectTier(nextTierId: DailyRateTierId) {
    setSelectedTierId(nextTierId);
    setSelectedWeeklyCents(DAILY_RATE_PRESET_TIERS[nextTierId].weeklyRateCents);
  }

  function selectListing(selection: { tier: DailyRateTierId; weeklyRateCents: number }) {
    setSelectedTierId(selection.tier);
    setSelectedWeeklyCents(selection.weeklyRateCents);
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
          {!isLandlord ? (
            <>
              <h1 className="vr-unified-marketplace__title">Find a stay in Maryland</h1>
              <p className="vr-unified-marketplace__sub">
                Furnished rooms, suites, and homes. $0 deposit.
              </p>
            </>
          ) : (
            <>
              <h1 className="vr-unified-marketplace__title">List your property</h1>
              <p className="vr-unified-marketplace__sub">
                Welcome guests. We handle verification.
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
                <input
                  type="search"
                  inputMode="search"
                  aria-label="City or ZIP"
                  placeholder="City or ZIP"
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

          </div>
        ) : (
          <form
            className="google-search-bar vr-clean-booking-bar relative z-10"
            onSubmit={(e) => void handleQuickHostStart(e)}
            aria-label="List your property"
          >
            <label className="google-search-cell" style={{ flex: "1.4 1 12rem" }}>
              <span>Your email</span>
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
          simple
          searchQuery={searchQuery}
          activeTierFilter={activeTierFilter}
          activeCohortFilter={activeCohortFilter}
          selectedTierId={selectedTierId}
          checkInIso={checkInIso}
          stayDays={stayDays}
          jurisdictionCode={selectedJurisdictionCode}
          onSelectTier={(tier) => selectTier(tier)}
          onSelectListing={selectListing}
          onResetFilters={() => {
            setSearchQuery("");
            setActiveTierFilter("ALL");
            setActiveCohortFilter("ALL");
          }}
        />

        {!isLandlord ? (
          <AvailabilityCalendar
            mode="tenant"
            tierId={selectedTierId}
            weeklyRateCents={clampedWeeklyCents}
            onChangeWeeklyRateCents={(next) => setSelectedWeeklyCents(next)}
            stayDays={stayDays}
            onChangeStayDays={(nextDays) => handleStayDaysChange(nextDays)}
            checkInIso={checkInIso}
            onSelectCheckIn={(iso) => setCheckInIso(iso)}
            cohortId={selectedCohortId}
            jurisdictionCode={selectedJurisdictionCode}
            context="home"
            onChangeCohort={(nextCohort) => handleSelectAudienceFilter(nextCohort)}
          />
        ) : null}
      </section>

      {/* CLEAN FOOTER */}
      <footer
        className="google-footer relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <span>
          VettedRent · $0 deposit · Maryland
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
