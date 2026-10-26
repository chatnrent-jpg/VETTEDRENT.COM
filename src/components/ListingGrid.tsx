"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

export type SortMode = "convenience" | "price-asc" | "price-desc";
export type ViewMode = "carousel" | "grid";

export interface PropertyCardProps {
  id: string;
  title: string;
  tier: "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome";
  location: string;
  dailyRate: number;
  weeklyRate: number;
  commuteMinutes: number;
  convenienceBadge: string;
  hospitalTag: string;
  imagePlaceholder: string;
  defaultImageUrl: string;
  galleryPhotos: { url: string; caption: string }[];
  features: string[];
}

export const SAMPLE_LISTINGS: PropertyCardProps[] = [
  {
    id: "hyattsville-sanctuary",
    title: "The Hyattsville RoomSanctuary",
    tier: "RoomSanctuary",
    location: "Hyattsville, MD",
    dailyRate: 45,
    weeklyRate: 315,
    commuteMinutes: 2,
    convenienceBadge: "Free Parking · 24/7 Keyless Check-In",
    hospitalTag: "2 mins to UM Capital Region Medical Center",
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
      "Private Keyless Smart-Lock",
      "High-Speed Wi-Fi Included",
      "Utilities & Parking Bundled",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "baltimore-hopkins-sanctuary",
    title: "The Inner Harbor Hopkins Sanctuary",
    tier: "RoomSanctuary",
    location: "Baltimore, MD",
    dailyRate: 49,
    weeklyRate: 343,
    commuteMinutes: 3,
    convenienceBadge: "Hospital Shuttle Stop · Fast Wi-Fi",
    hospitalTag: "3 mins to Johns Hopkins Hospital",
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Quiet Blackout-Curtain Bedroom for Night-Shift Clinicians",
      },
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Modern Shared Lounge & Dedicated Study Desk",
      },
    ],
    features: [
      "Blackout Shades for Shift Workers",
      "3-Min Hospital Shuttle Access",
      "All Utilities & Fiber Wi-Fi",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "bethesda-executive-suite",
    title: "The Bethesda Executive Suite",
    tier: "PrivateSuite",
    location: "Bethesda, MD",
    dailyRate: 75,
    weeklyRate: 525,
    commuteMinutes: 4,
    convenienceBadge: "Private En-Suite · Metro Walkable",
    hospitalTag: "4 mins to Suburban Hospital (Johns Hopkins)",
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
      "Private En-Suite Bathroom",
      "Ergonomic Dual-Monitor Workspace",
      "Kitchenette & Private Entrance",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "silver-spring-clinical-suite",
    title: "The Silver Spring Clinical Suite",
    tier: "PrivateSuite",
    location: "Silver Spring, MD",
    dailyRate: 79,
    weeklyRate: 553,
    commuteMinutes: 3,
    convenienceBadge: "Garage Parking · Private Bath",
    hospitalTag: "3 mins to Holy Cross Hospital",
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Private Suite with En-Suite Bath & Walk-In Closet",
      },
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "In-Suite Kitchenette & Dining Nook",
      },
    ],
    features: [
      "Reserved Covered Garage Spot",
      "Private Bath & Walk-In Closet",
      "In-Suite Kitchenette & Laundry",
      "Instant Bank Link Setup",
    ],
  },
  {
    id: "bowie-clinical-townhome",
    title: "The Bowie Clinical Townhome",
    tier: "ExecutiveTownhome",
    location: "Bowie, MD",
    dailyRate: 106,
    weeklyRate: 745,
    commuteMinutes: 6,
    convenienceBadge: "Entire 3BR Home · 2-Car Driveway",
    hospitalTag: "6 mins to Bowie Health Center & Transit Loop",
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      {
        url: "/vettedrent-hero-renter.jpg",
        caption: "Multi-Bedroom Primary Suite & Lounge",
      },
      {
        url: "/vettedrent-hero-landlord.jpg",
        caption: "Full Chef's Kitchen, Living Area & In-Unit Laundry",
      },
    ],
    features: [
      "Entire Multi-Bedroom Home",
      "Full Chef's Kitchen & Dining",
      "In-Unit Washer & Dryer",
      "Instant Bank Link Setup",
    ],
  },
  {
    id: "annapolis-medical-townhome",
    title: "The Annapolis Medical Townhome",
    tier: "ExecutiveTownhome",
    location: "Annapolis, MD",
    dailyRate: 115,
    weeklyRate: 805,
    commuteMinutes: 5,
    convenienceBadge: "Entire Townhome · Private Patio",
    hospitalTag: "5 mins to Luminis Health Anne Arundel Medical",
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
      "3 Bedrooms · Ideal for Clinical Teams",
      "Private Driveway & Fenced Patio",
      "Full Kitchen + In-Unit Laundry",
      "$0 Security Deposit · No Credit Check",
    ],
  },
];

export interface ListingDiscoveryGridProps {
  searchQuery?: string;
  activeTierFilter?: string;
  selectedTierId?: string;
  checkInIso?: string;
  stayDays?: number;
  jurisdictionCode?: string;
  onSelectTier?: (tier: "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome") => void;
  onResetFilters?: () => void;
}

export const ListingDiscoveryGrid: React.FC<ListingDiscoveryGridProps> = ({
  searchQuery = "",
  activeTierFilter = "ALL",
  selectedTierId = "RoomSanctuary",
  checkInIso = "",
  stayDays = 30,
  jurisdictionCode = "MD-PG",
  onSelectTier,
  onResetFilters,
}) => {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("convenience");
  const [viewMode, setViewMode] = useState<ViewMode>("carousel");
  const [under5MinOnly, setUnder5MinOnly] = useState<boolean>(false);
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

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredListings = SAMPLE_LISTINGS.filter((property) => {
    if (activeTierFilter !== "ALL" && property.tier !== activeTierFilter) {
      return false;
    }
    if (under5MinOnly && property.commuteMinutes > 4) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      property.title,
      property.tier,
      property.location,
      property.hospitalTag,
      property.convenienceBadge,
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

  if (filteredListings.length === 0) {
    return (
      <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/60 text-center w-full">
        <p className="text-slate-200 font-semibold">
          No spaces matched your current filter.
        </p>
        <button
          type="button"
          onClick={() => {
            setUnder5MinOnly(false);
            onResetFilters?.();
          }}
          className="button mt-4"
        >
          Show All {SAMPLE_LISTINGS.length} Verified Spaces
        </button>
      </div>
    );
  }

  return (
    <div className="vr-swipe-marketplace w-full">
      {/* SWIPE & SORT TOOLBAR: PRICE vs. CONVENIENCE */}
      <div className="vr-swipe-toolbar">
        <div className="vr-swipe-toolbar__left">
          <span className="vr-swipe-toolbar__count">
            <strong>{filteredListings.length} Verified Spaces</strong> · Swipe by Price &amp;
            Hospital Convenience
          </span>
          <div className="vr-swipe-sort-pills" role="group" aria-label="Sort spaces by price or convenience">
            <button
              type="button"
              aria-pressed={sortMode === "convenience"}
              onClick={() => setSortMode("convenience")}
              className={`vr-swipe-pill${sortMode === "convenience" ? " vr-swipe-pill--active" : ""}`}
            >
              ⚡ Closest to Hospital (2–6 mins)
            </button>
            <button
              type="button"
              aria-pressed={sortMode === "price-asc"}
              onClick={() => setSortMode("price-asc")}
              className={`vr-swipe-pill${sortMode === "price-asc" ? " vr-swipe-pill--active" : ""}`}
            >
              💲 Lowest Price ($45/day first)
            </button>
            <button
              type="button"
              aria-pressed={under5MinOnly}
              onClick={() => setUnder5MinOnly((prev) => !prev)}
              className={`vr-swipe-pill${under5MinOnly ? " vr-swipe-pill--active" : ""}`}
            >
              🏥 Under 5 Mins Only
            </button>
          </div>
        </div>

        <div className="vr-swipe-toolbar__right">
          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === "carousel" ? "grid" : "carousel"))}
            className="vr-cal-btn"
          >
            {viewMode === "carousel" ? "⊞ View All Grid" : "↔ Swipe Carousel"}
          </button>
          {viewMode === "carousel" ? (
            <div className="vr-swipe-nav-btns">
              <button
                type="button"
                onClick={() => scrollCarousel("left")}
                className="vr-swipe-arrow-btn"
                aria-label="Swipe left to previous spaces"
              >
                ← Swipe
              </button>
              <button
                type="button"
                onClick={() => scrollCarousel("right")}
                className="vr-swipe-arrow-btn vr-swipe-arrow-btn--gold"
                aria-label="Swipe right to more spaces"
              >
                Swipe →
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* HORIZONTAL SNAP-SWIPE CAROUSEL OR EXPANDED GRID */}
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
        {filteredListings.map((property) => {
          const isSelected = selectedTierId === property.tier;
          const activePhotoIdx = cardPhotoIndex[property.id] ?? 0;
          const activePhotoUrl =
            activePhotoIdx === 0 && hostPhotosByTier[property.tier]
              ? hostPhotosByTier[property.tier]
              : (property.galleryPhotos[activePhotoIdx]?.url ?? property.defaultImageUrl);

          const bookingParams = new URLSearchParams({
            tier: property.tier,
            weeklyCents: String(property.weeklyRate * 100),
            days: String(stayDays),
            ...(checkInIso ? { checkIn: checkInIso } : {}),
            cohort: "Contract-Assignment",
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
                  ⚡ {property.hospitalTag}
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
                    {property.convenienceBadge}
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
                    📷 {activePhotoIdx + 1}/{property.galleryPhotos.length}
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
                      {property.location} · <strong>{property.commuteMinutes} min commute</strong>
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
                  {lightboxProperty.location} · {lightboxProperty.hospitalTag}
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
