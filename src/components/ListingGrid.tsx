"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

export interface PropertyCardProps {
  title: string;
  tier: "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome";
  location: string;
  dailyRate: number;
  weeklyRate: number;
  hospitalTag: string;
  imagePlaceholder: string;
  defaultImageUrl: string;
  galleryPhotos: { url: string; caption: string }[];
  features: string[];
}

export const SAMPLE_LISTINGS: PropertyCardProps[] = [
  {
    title: "The Hyattsville RoomSanctuary",
    tier: "RoomSanctuary",
    location: "Hyattsville, MD",
    dailyRate: 45,
    weeklyRate: 315,
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
      "Utilities Bundled",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    title: "The Bethesda Executive Suite",
    tier: "PrivateSuite",
    location: "Bethesda, MD",
    dailyRate: 75,
    weeklyRate: 525,
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
      "Ergonomic Workspace",
      "Kitchenette Access",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    title: "The Bowie Clinical Townhome",
    tier: "ExecutiveTownhome",
    location: "Bowie, MD",
    dailyRate: 106,
    weeklyRate: 745,
    hospitalTag: "Direct access to regional medical transit loops",
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
      "Full Chef's Kitchen",
      "In-Unit Washer & Dryer",
      "Instant Bank Link Setup",
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
    if (!normalizedQuery) {
      return true;
    }
    const haystack = [
      property.title,
      property.tier,
      property.location,
      property.hospitalTag,
      `$${property.dailyRate}`,
      ...property.features,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  if (filteredListings.length === 0) {
    return (
      <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/60 text-center w-full">
        <p className="text-slate-200 font-semibold">
          No spaces matched &ldquo;{searchQuery}&rdquo;.
        </p>
        {onResetFilters ? (
          <button type="button" onClick={onResetFilters} className="button mt-4">
            Show All 3 Available Spaces
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-left">
        {filteredListings.map((property, idx) => {
          const isSelected = selectedTierId === property.tier;
          const coverPhotoUrl = hostPhotosByTier[property.tier] || property.defaultImageUrl;
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
              key={idx}
              onClick={() => onSelectTier?.(property.tier)}
              className={`group relative bg-slate-900/60 border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col h-full shadow-xl cursor-pointer ${
                isSelected
                  ? "border-emerald-400 ring-1 ring-emerald-400/40"
                  : "border-slate-800 hover:border-emerald-500/30"
              }`}
            >
              {/* Visual Asset Container with Real Property Photo */}
              <div
                className={`h-48 w-full ${property.imagePlaceholder} relative flex items-center justify-center p-4 transition-transform group-hover:scale-[1.01] duration-300 overflow-hidden`}
              >
                <img
                  src={coverPhotoUrl}
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
                      "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.18) 50%, rgba(2,6,23,0.78) 100%)",
                  }}
                />
                <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-500/10 relative z-10">
                  {property.hospitalTag}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxProperty(property);
                    setLightboxPhotoIdx(0);
                  }}
                  style={{
                    position: "absolute",
                    bottom: "0.75rem",
                    right: "0.75rem",
                    zIndex: 10,
                  }}
                  className="text-slate-100 text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-800 hover:border-emerald-500/30"
                >
                  📷 View Photos ({property.galleryPhotos.length})
                </button>
              </div>

              {/* Property Core Data Details */}
              <div className="p-6 flex flex-col flex-grow">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition-colors duration-200">
                      {property.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{property.location}</p>
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
    </>
  );
};
