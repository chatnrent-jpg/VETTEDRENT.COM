"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { resolveMarylandStatewideSearch } from "@/lib/seo-registry";
import type { PurposeCohortId } from "@/lib/underwriting-contract";

export type SortMode = "convenience" | "price-asc" | "price-desc";
export type ViewMode = "carousel" | "grid";

export interface PropertyCardProps {
  id: string;
  title: string;
  tier: "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome";
  location: string;
  zipCode: string;
  dailyRate: number;
  weeklyRate: number;
  commuteMinutes: number;
  convenienceBadge: string;
  proximityTag: string;
  idealForLabel: string;
  cohorts: PurposeCohortId[];
  imagePlaceholder: string;
  defaultImageUrl: string;
  galleryPhotos: { url: string; caption: string }[];
  features: string[];
}

export const SAMPLE_LISTINGS: PropertyCardProps[] = [
  {
    id: "md-statewide-room-sanctuary-1",
    title: "Maryland RoomSanctuary · Campus & Transit Edition",
    tier: "RoomSanctuary",
    location: "Statewide MD (Capital, Central & University Corridors)",
    zipCode: "All MD ZIPs",
    dailyRate: 45,
    weeklyRate: 315,
    commuteMinutes: 3,
    convenienceBadge: "Keyless Entry · Study Desk · All Utilities",
    proximityTag: "Available Across All 24 Maryland Counties & Cities",
    idealForLabel: "University Students, Interns & Solo Traveling Professionals",
    cohorts: ["Academic-Enrollment", "Contract-Assignment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Furnished Bedroom Sanctuary with Smart-Lock Entry",
      },
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Dedicated Study & High-Speed Fiber Workspace",
      },
    ],
    features: [
      "Ideal for Students, Interns & Traveling Pros",
      "Private Keyless Smart-Lock Bedroom",
      "All Utilities & High-Speed Fiber Wi-Fi",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-private-suite-1",
    title: "Maryland PrivateSuite · Professional & Fellow Edition",
    tier: "PrivateSuite",
    location: "Statewide MD (Metro, I-95, I-270 & Regional Hubs)",
    zipCode: "All MD ZIPs",
    dailyRate: 75,
    weeklyRate: 525,
    commuteMinutes: 4,
    convenienceBadge: "Private En-Suite Bath · Workspace · Kitchenette",
    proximityTag: "Available Across All 24 Maryland Counties & Cities",
    idealForLabel: "Temporary Professionals, Contractors & Visiting Fellows",
    cohorts: ["Contract-Assignment", "Academic-Enrollment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-blue-950",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Executive En-Suite Living & Ergonomic Desk Area",
      },
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "King Suite Bedroom & Private En-Suite Bath",
      },
    ],
    features: [
      "Built for Temporary Professionals & Fellows",
      "Private En-Suite Bath & Dual-Monitor Desk",
      "Kitchenette & Private Keyless Entrance",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-executive-townhome-1",
    title: "Maryland ExecutiveTownhome · Family & Relocation Edition",
    tier: "ExecutiveTownhome",
    location: "Statewide MD (Suburban, Coastal & Family Districts)",
    zipCode: "All MD ZIPs",
    dailyRate: 106,
    weeklyRate: 745,
    commuteMinutes: 5,
    convenienceBadge: "Entire Multi-BR Home · Driveway · In-Unit Laundry",
    proximityTag: "Available Across All 24 Maryland Counties & Cities",
    idealForLabel: "Families in Transition, ALE Insurance & Relocations",
    cohorts: ["Insurance-Relocation", "Contract-Assignment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Multi-Bedroom Primary Suite & Family Living Room",
      },
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Full Chef's Kitchen, Dining Area & In-Unit Laundry",
      },
    ],
    features: [
      "Designed for Families in Transition & ALE Insurance",
      "Entire Multi-Bedroom Home + Private Parking",
      "Full Chef's Kitchen & In-Unit Washer/Dryer",
      "Instant Bank Link Setup · Direct ALE Billing",
    ],
  },
  {
    id: "md-statewide-room-sanctuary-2",
    title: "Maryland RoomSanctuary · Flex Contractor & Grad Edition",
    tier: "RoomSanctuary",
    location: "Statewide MD (Baltimore, Frederick, Howard & Harford)",
    zipCode: "All MD ZIPs",
    dailyRate: 49,
    weeklyRate: 343,
    commuteMinutes: 3,
    convenienceBadge: "Free Parking · Blackout Shades · Fast Wi-Fi",
    proximityTag: "Near Universities, Employment & Medical Corridors",
    idealForLabel: "Contractors, University Rotators & Remote Workers",
    cohorts: ["Contract-Assignment", "Academic-Enrollment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Quiet Furnished Bedroom with Blackout Shades",
      },
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Modern Lounge & Dedicated Work Desk",
      },
    ],
    features: [
      "Flexible 7 to 90+ Day Professional & Student Stays",
      "Easy Access to Transit, Campuses & Employers",
      "All Utilities & High-Speed Wi-Fi Included",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-private-suite-2",
    title: "Maryland PrivateSuite · Remote & Corporate Mobility Suite",
    tier: "PrivateSuite",
    location: "Statewide MD (Anne Arundel, Montgomery & Southern MD)",
    zipCode: "All MD ZIPs",
    dailyRate: 79,
    weeklyRate: 553,
    commuteMinutes: 4,
    convenienceBadge: "Reserved Parking · Private Bath & Kitchenette",
    proximityTag: "Near Federal, Aerospace, Tech & Academic Hubs",
    idealForLabel: "Remote Professionals, Contractors & Visiting Faculty",
    cohorts: ["Seasonal-Remote", "Contract-Assignment", "Academic-Enrollment"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Private Suite with En-Suite Bath & Walk-In Closet",
      },
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "In-Suite Kitchenette & Dedicated Workspace",
      },
    ],
    features: [
      "Reserved Off-Street or Garage Parking Included",
      "Private Bath, Walk-In Closet & Kitchenette",
      "High-Speed Fiber for Remote Work & Calls",
      "Instant Bank Link Setup",
    ],
  },
  {
    id: "md-statewide-executive-townhome-2",
    title: "Maryland ExecutiveTownhome · Extended Family Sanctuary",
    tier: "ExecutiveTownhome",
    location: "Statewide MD (Eastern Shore, Western MD & Central Corridors)",
    zipCode: "All MD ZIPs",
    dailyRate: 115,
    weeklyRate: 805,
    commuteMinutes: 5,
    convenienceBadge: "Entire 3BR Townhome · Private Patio & Yard",
    proximityTag: "Near Local Schools, Shopping & Regional Highways",
    idealForLabel: "Families in Transition, Home Renovations & Relocations",
    cohorts: ["Insurance-Relocation", "Contract-Assignment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-blue-950",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Spacious Executive Townhome Living Room & Patio",
      },
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Primary King Suite & Dedicated Home Office",
      },
    ],
    features: [
      "3 Bedrooms · Turnkey for Families in Transition",
      "Private Driveway & Fenced Backyard Patio",
      "Full Kitchen + In-Unit Washer & Dryer",
      "$0 Security Deposit · No Credit Check",
    ],
  },
];

const SIMPLE_TIER_LABELS: Record<PropertyCardProps["tier"], string> = {
  RoomSanctuary: "Room",
  PrivateSuite: "Suite",
  ExecutiveTownhome: "Townhome",
};

export interface ListingDiscoveryGridProps {
  searchQuery?: string;
  activeTierFilter?: string;
  activeCohortFilter?: PurposeCohortId | "ALL";
  selectedTierId?: string;
  checkInIso?: string;
  stayDays?: number;
  jurisdictionCode?: string;
  simple?: boolean;
  onSelectTier?: (tier: "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome") => void;
  onResetFilters?: () => void;
}

export const ListingDiscoveryGrid: React.FC<ListingDiscoveryGridProps> = ({
  searchQuery = "",
  activeTierFilter = "ALL",
  activeCohortFilter = "ALL",
  selectedTierId = "RoomSanctuary",
  checkInIso = "",
  stayDays = 30,
  jurisdictionCode = "MD-PG",
  simple = false,
  onSelectTier,
  onResetFilters,
}) => {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("convenience");
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");
  const [familyReadyOnly, setFamilyReadyOnly] = useState<boolean>(false);
  const [cardPhotoIndex, setCardPhotoIndex] = useState<Record<string, number>>({});
  const [hostPhotosByTier, setHostPhotosByTier] = useState<Record<string, string>>({});
  const [lightboxProperty, setLightboxProperty] = useState<PropertyCardProps | null>(null);
  const [lightboxPhotoIdx, setLightboxPhotoIdx] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchHostPhotos() {
      try {
        const res = await fetch("/api/host/availability", { cache: "no-store" });
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (!cancelled && body && typeof body === "object") {
          const schedules = (body as { schedules?: Record<string, { photoUrl?: string }> })
            .schedules;
          if (schedules) {
            const nextPhotos: Record<string, string> = {};
            for (const [tierKey, sched] of Object.entries(schedules)) {
              if (sched && typeof sched.photoUrl === "string" && sched.photoUrl.trim() !== "") {
                nextPhotos[tierKey] = sched.photoUrl;
              }
            }
            setHostPhotosByTier(nextPhotos);
          }
        }
      } catch {
        // Keep default photos on transient error
      }
    }
    void fetchHostPhotos();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedQuery = searchQuery.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const resolvedMdPlace = resolveMarylandStatewideSearch(trimmedQuery);

  // Filter by tier, audience cohort, family toggle, and statewide search
  const baseListings = SAMPLE_LISTINGS.filter((property) => {
    if (activeTierFilter !== "ALL" && property.tier !== activeTierFilter) {
      return false;
    }
    if (
      activeCohortFilter !== "ALL" &&
      !property.cohorts.includes(activeCohortFilter)
    ) {
      return false;
    }
    if (familyReadyOnly && property.tier !== "ExecutiveTownhome") {
      return false;
    }
    if (!normalizedQuery || resolvedMdPlace) {
      return true;
    }
    const haystack = [
      property.title,
      property.tier,
      property.location,
      property.zipCode,
      property.proximityTag,
      property.convenienceBadge,
      property.idealForLabel,
      `$${property.dailyRate}`,
      ...property.features,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  }).sort((a, b) => {
    if (sortMode === "price-asc") {
      return a.dailyRate - b.dailyRate;
    }
    if (sortMode === "price-desc") {
      return b.dailyRate - a.dailyRate;
    }
    return a.commuteMinutes - b.commuteMinutes || a.dailyRate - b.dailyRate;
  });

  function scrollCarousel(direction: "left" | "right") {
    const node = carouselRef.current;
    if (!node) return;
    const cardWidth = 370;
    node.scrollBy({
      left: direction === "left" ? -cardWidth : cardWidth,
      behavior: "smooth",
    });
  }

  function cycleCardPhoto(property: PropertyCardProps, delta: number) {
    const total = property.galleryPhotos.length;
    if (total <= 1) return;
    setCardPhotoIndex((prev) => {
      const current = prev[property.id] ?? 0;
      const next = (current + delta + total) % total;
      return { ...prev, [property.id]: next };
    });
  }

  if (baseListings.length === 0) {
    return (
      <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/60 text-center w-full">
        <p className="text-slate-200 font-semibold">
          No spaces matched &ldquo;{searchQuery}&rdquo;. Search any Maryland ZIP code
          (20601–21930), county, city, university, or employer.
        </p>
        <button
          type="button"
          onClick={() => {
            setFamilyReadyOnly(false);
            onResetFilters?.();
          }}
          className="button mt-4"
        >
          Show All Statewide Maryland Spaces
        </button>
      </div>
    );
  }

  const effectiveCohort: PurposeCohortId =
    activeCohortFilter === "ALL" ? "Contract-Assignment" : activeCohortFilter;

  const displayListings = simple
    ? baseListings.filter((property, index, all) =>
        all.findIndex((item) => item.tier === property.tier) === index,
      )
    : baseListings;

  if (simple) {
    return (
      <div className="vr-simple-spaces" role="list" aria-label="Available spaces">
        {displayListings.map((property) => {
          const isSelected = selectedTierId === property.tier;
          const photoUrl = hostPhotosByTier[property.tier] || property.defaultImageUrl;
          return (
            <button
              key={property.id}
              type="button"
              role="listitem"
              className={`vr-simple-space${isSelected ? " vr-simple-space--selected" : ""}`}
              onClick={() => onSelectTier?.(property.tier)}
            >
              <img src={photoUrl} alt="" className="vr-simple-space__photo" />
              <div className="vr-simple-space__meta">
                <strong>{SIMPLE_TIER_LABELS[property.tier]}</strong>
                <span>${property.dailyRate} / day</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="vr-swipe-marketplace w-full">
      {/* CENTERED SWIPE & SORT DOCK RIGHT IN THE MIDDLE */}
      <div className="vr-swipe-toolbar">
        {/* ROW 1: CENTERED PRICE & CONVENIENCE SORT PILLS */}
        <div
          className="vr-swipe-sort-pills"
          role="group"
          aria-label="Sort spaces by price or convenience"
        >
          <button
            type="button"
            aria-pressed={sortMode === "convenience"}
            onClick={() => setSortMode("convenience")}
            className={`vr-swipe-pill${sortMode === "convenience" ? " vr-swipe-pill--active" : ""}`}
          >
            ★ Best Convenience (Work, Campus &amp; Transit)
          </button>
          <button
            type="button"
            aria-pressed={sortMode === "price-asc"}
            onClick={() => setSortMode("price-asc")}
            className={`vr-swipe-pill${sortMode === "price-asc" ? " vr-swipe-pill--active" : ""}`}
          >
            $ Lowest Price ($45/day first)
          </button>
          <button
            type="button"
            aria-pressed={familyReadyOnly}
            onClick={() => setFamilyReadyOnly((prev) => !prev)}
            className={`vr-swipe-pill${familyReadyOnly ? " vr-swipe-pill--active" : ""}`}
          >
            ✦ Multi-Bedroom Family &amp; Relocation Homes
          </button>
        </div>

        {/* ROW 2: PROMINENT CENTERED SWIPE CONTROLS RIGHT IN THE MIDDLE */}
        <div className="vr-swipe-center-dock">
          {viewMode === "carousel" ? (
            <button
              type="button"
              onClick={() => scrollCarousel("left")}
              className="vr-swipe-arrow-btn vr-swipe-arrow-btn--gold-outline"
              aria-label="Swipe left to previous spaces"
            >
              ← Swipe Left
            </button>
          ) : null}

          <span className="vr-swipe-toolbar__count">
            <strong>
              {baseListings.length} Verified Spaces
              {resolvedMdPlace
                ? ` in ${resolvedMdPlace.cityOrArea} (ZIP ${resolvedMdPlace.zipCode})`
                : " Statewide Across All 24 Maryland Jurisdictions"}
            </strong>{" "}
            · Swipe by Price &amp; Convenience
          </span>

          {viewMode === "carousel" ? (
            <button
              type="button"
              onClick={() => scrollCarousel("right")}
              className="vr-swipe-arrow-btn vr-swipe-arrow-btn--gold"
              aria-label="Swipe right to more spaces"
            >
              Swipe Right →
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === "carousel" ? "grid" : "carousel"))}
            className="vr-swipe-arrow-btn vr-swipe-arrow-btn--gold-outline"
          >
            {viewMode === "carousel" ? "⊞ View All Grid" : "↔ Swipe Carousel"}
          </button>
        </div>
      </div>

      {/* CENTERED HORIZONTAL SNAP-SWIPE CAROUSEL OR EXPANDED GRID */}
      <div
        ref={carouselRef}
        className={
          viewMode === "carousel"
            ? "vr-swipe-carousel"
            : "grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-left"
        }
        role="region"
        aria-label="Swipeable property cards"
      >
        {baseListings.map((property) => {
          const isSelected = selectedTierId === property.tier;
          const activePhotoIdx = cardPhotoIndex[property.id] ?? 0;
          const activePhotoUrl =
            activePhotoIdx === 0 && hostPhotosByTier[property.tier]
              ? hostPhotosByTier[property.tier]
              : (property.galleryPhotos[activePhotoIdx]?.url ?? property.defaultImageUrl);

          const displayedLocation = resolvedMdPlace
            ? resolvedMdPlace.cityOrArea
            : property.location;
          const displayedZip = resolvedMdPlace
            ? `ZIP ${resolvedMdPlace.zipCode}`
            : property.zipCode;
          const displayedProximity = resolvedMdPlace
            ? `Near ${resolvedMdPlace.hubSummary}`
            : property.proximityTag;

          const bookingParams = new URLSearchParams({
            tier: property.tier,
            weeklyCents: String(property.weeklyRate * 100),
            days: String(stayDays),
            ...(checkInIso ? { checkIn: checkInIso } : {}),
            cohort: effectiveCohort,
            jurisdiction: jurisdictionCode,
          });
          const bookingHref = `/underwriting?${bookingParams.toString()}`;

          return (
            <div
              key={property.id}
              onClick={() => onSelectTier?.(property.tier)}
              className={`vr-swipe-card group relative bg-slate-900/60 border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col h-full shadow-xl cursor-pointer ${
                isSelected
                  ? "border-emerald-400"
                  : "border-slate-800 hover:border-emerald-500/30"
              }`}
            >
              {/* Visual Asset Container with In-Card Photo Swiping */}
              <div
                className={`h-48 w-full ${property.imagePlaceholder} relative flex items-center justify-center p-4 transition-transform group-hover:scale-[1.01] duration-300 overflow-hidden`}
              >
                <img
                  src={activePhotoUrl}
                  alt={property.title}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(180deg, rgba(2,6,23,0.62) 0%, rgba(2,6,23,0.18) 50%, rgba(2,6,23,0.82) 100%)",
                  }}
                />

                {/* Top Convenience Tag */}
                <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-500/10 relative z-10">
                  ★ {displayedProximity}
                </div>

                {/* In-Card Photo Swipe Controls */}
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleCardPhoto(property, -1);
                  }}
                  className="vr-card-photo-arrow vr-card-photo-arrow--left"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleCardPhoto(property, 1);
                  }}
                  className="vr-card-photo-arrow vr-card-photo-arrow--right"
                >
                  ›
                </button>

                {/* Bottom Convenience & Gallery Bar */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "0.65rem",
                    left: "0.75rem",
                    right: "0.75rem",
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.4rem",
                  }}
                >
                  <span className="text-slate-200 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800">
                    {displayedZip} · {property.convenienceBadge}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxProperty(property);
                      setLightboxPhotoIdx(activePhotoIdx);
                    }}
                    className="text-slate-100 text-xs font-semibold px-3 py-1 rounded-full bg-slate-950/80 border border-slate-800 hover:border-emerald-500/30"
                  >
                    Photos {activePhotoIdx + 1}/{property.galleryPhotos.length}
                  </button>
                </div>
              </div>

              {/* Property Core Data Details */}
              <div className="p-6 flex flex-col flex-grow">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition-colors duration-200">
                      {property.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {displayedLocation} · <strong>{property.idealForLabel}</strong>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xl font-black text-slate-50">${property.dailyRate}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                      / day (${property.weeklyRate}/wk)
                    </div>
                  </div>
                </div>

                {/* Bullet Features Mapping */}
                <ul className="mt-6 space-y-2 flex-grow text-xs text-slate-300">
                  {property.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      {feat}
                    </li>
                  ))}
                </ul>

                {/* Seamless Action Vector */}
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <Link
                    href={bookingHref}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all duration-200 uppercase tracking-wider flex items-center justify-center shadow-lg"
                  >
                    Instant 1-Click Book (${property.dailyRate}/day) →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* TENANT PHOTO GALLERY LIGHTBOX MODAL */}
      {lightboxProperty ? (
        <div
          className="alert-scrim"
          role="dialog"
          aria-modal="true"
          aria-label={`${lightboxProperty.title} Photo Gallery`}
          onClick={() => setLightboxProperty(null)}
        >
          <div
            className="panel stack"
            style={{ width: "min(48rem, 96vw)", padding: "1.25rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stay-card-head">
              <div>
                <p className="pass-kicker">
                  {lightboxProperty.location} · {lightboxProperty.idealForLabel}
                </p>
                <h3>
                  {lightboxProperty.title} (${lightboxProperty.dailyRate}/day)
                </h3>
              </div>
              <button
                type="button"
                className="vr-cal-btn"
                onClick={() => setLightboxProperty(null)}
              >
                ✕ Close
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-800">
              <img
                src={
                  lightboxPhotoIdx === 0 && hostPhotosByTier[lightboxProperty.tier]
                    ? hostPhotosByTier[lightboxProperty.tier]
                    : (lightboxProperty.galleryPhotos[lightboxPhotoIdx]?.url ??
                      lightboxProperty.defaultImageUrl)
                }
                alt={lightboxProperty.title}
                style={{
                  width: "100%",
                  maxHeight: "24rem",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </div>

            <div className="row" style={{ flexWrap: "wrap" }}>
              <span className="text-xs text-slate-300">
                {lightboxProperty.galleryPhotos[lightboxPhotoIdx]?.caption}
              </span>
              <div className="actions" style={{ marginTop: 0 }}>
                {lightboxProperty.galleryPhotos.map((photo, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={
                      lightboxPhotoIdx === idx ? "button" : "button button-secondary"
                    }
                    onClick={() => setLightboxPhotoIdx(idx)}
                  >
                    Photo {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
