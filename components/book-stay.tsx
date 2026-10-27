"use client";

import Link from "next/link";
import { useState } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { SAMPLE_LISTINGS, type PropertyCardProps } from "@/src/components/ListingGrid";
import { todayIsoUtc } from "@/lib/availability-calendar";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import {
  SEASONAL_REMOTE_MIN_DAYS,
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type BookStayInitial = {
  tier?: string;
  listing?: string;
  weeklyCents?: string;
  days?: string;
  checkIn?: string;
  cohort?: string;
  jurisdiction?: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const JURISDICTION_RE = /^[A-Z]{2}(-[A-Z0-9]{1,8})?$/;

function parseTier(value?: string): DailyRateTierId {
  return value && value in DAILY_RATE_PRESET_TIERS
    ? (value as DailyRateTierId)
    : "RoomSanctuary";
}

function parseStayDays(value: string | undefined, minDays: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const days = Number.isFinite(parsed) ? parsed : 7;
  return Math.max(minDays, Math.min(90, days));
}

function parseCheckIn(value?: string): string {
  const today = todayIsoUtc();
  return value && ISO_DATE_RE.test(value) && value >= today ? value : today;
}

export function BookStay({
  initial,
  liveListing = null,
  catalogIsLive = false,
}: {
  initial: BookStayInitial;
  /** The published listing named in the URL, resolved on the server. */
  liveListing?: PropertyCardProps | null;
  /** True once any real listing is published; sample stays stop being bookable. */
  catalogIsLive?: boolean;
}) {
  const sampleListing = catalogIsLive
    ? undefined
    : SAMPLE_LISTINGS.find((property) => property.id === initial.listing);
  const listing = liveListing ?? sampleListing;
  // A listing named in the URL that is no longer available must not turn into a generic booking.
  const listingUnavailable = Boolean(initial.listing) && !listing;
  const tierId = listing ? listing.tier : parseTier(initial.tier);
  const jurisdictionCode =
    initial.jurisdiction && JURISDICTION_RE.test(initial.jurisdiction)
      ? initial.jurisdiction
      : DEFAULT_JURISDICTION_CODE;

  const [cohortId, setCohortId] = useState<PurposeCohortId>(
    () => resolvePurposeCohort(initial.cohort).id,
  );
  const [weeklyCents, setWeeklyCents] = useState<number>(() =>
    liveListing
      ? liveListing.weeklyRate * 100
      : clampTierWeeklyRateCents(tierId, Number(initial.weeklyCents)),
  );
  const [stayDays, setStayDays] = useState<number>(() =>
    parseStayDays(
      initial.days,
      resolvePurposeCohort(initial.cohort).id === "Seasonal-Remote"
        ? SEASONAL_REMOTE_MIN_DAYS
        : 7,
    ),
  );
  const [checkInIso, setCheckInIso] = useState<string>(() => parseCheckIn(initial.checkIn));
  const [booked, setBooked] = useState(false);

  function handleStayDaysChange(nextDays: number) {
    const minDays = cohortId === "Seasonal-Remote" ? SEASONAL_REMOTE_MIN_DAYS : 7;
    setStayDays(Math.max(minDays, Math.min(90, nextDays || 7)));
  }

  function handleCohortChange(nextCohort: PurposeCohortId) {
    setCohortId(nextCohort);
    if (nextCohort === "Seasonal-Remote" && stayDays < SEASONAL_REMOTE_MIN_DAYS) {
      setStayDays(SEASONAL_REMOTE_MIN_DAYS);
    }
  }

  return (
    <main className="google-home google-home--unified" data-perspective="tenant">
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
          <Link className="text-button" href="/host/onboard">
            List Your Property
          </Link>
          <Link className="button" href="/dashboard">
            Sign In
          </Link>
        </nav>
      </header>

      <section className="vr-unified-marketplace relative z-10" aria-label="Book your stay">
        {!booked ? (
          <div className="vr-unified-marketplace__head">
            <h1 className="vr-unified-marketplace__title">Complete your stay</h1>
            <p className="vr-unified-marketplace__sub">
              Pick your dates, sign, and get your Stay Passport. $0 deposit.
            </p>
          </div>
        ) : null}

        <div className="vr-book-stay">
          {!booked ? (
            <Link href="/" className="vr-book-stay__back">
              ← Change stay
            </Link>
          ) : null}
          {listing && !booked ? (
            <div className="vr-book-stay__card">
              <img
                src={listing.defaultImageUrl}
                alt=""
                className="vr-book-stay__photo"
                width={96}
                height={64}
              />
              <div className="vr-book-stay__text">
                <strong>{listing.title}</strong>
                <span>{listing.location}</span>
              </div>
              <span className="vr-book-stay__price">
                ${listing.dailyRate}
                <small> / day</small>
              </span>
            </div>
          ) : null}
        </div>

        {listingUnavailable ? (
          <div className="vr-book-stay__card" role="alert">
            <div className="vr-book-stay__text">
              <strong>This stay is no longer available</strong>
              <span>It may have been taken down. Pick another stay to continue.</span>
            </div>
            <Link href="/" className="button">
              Browse stays
            </Link>
          </div>
        ) : (
        <AvailabilityCalendar
          mode="tenant"
          listingId={liveListing?.id}
          tierId={tierId}
          weeklyRateCents={weeklyCents}
          onChangeWeeklyRateCents={setWeeklyCents}
          stayDays={stayDays}
          onChangeStayDays={handleStayDaysChange}
          checkInIso={checkInIso}
          onSelectCheckIn={setCheckInIso}
          cohortId={cohortId}
          jurisdictionCode={jurisdictionCode}
          context="home"
          onChangeCohort={handleCohortChange}
          onBookingConfirmed={() => {
            setBooked(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
        )}
      </section>

      <footer
        className="google-footer relative z-10"
        style={{ position: "relative", zIndex: 10 }}
      >
        <span>VettedRent · $0 deposit · Maryland</span>
        <div className="google-footer__links">
          <Link href="/">Find a Stay</Link>
          <Link href="/host/onboard">List Your Property</Link>
          <Link href="/dashboard">Sign In</Link>
        </div>
      </footer>
    </main>
  );
}
