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
  // ---- Additional sample stays so every category has several to swipe through ----
  {
    id: "md-statewide-room-sanctuary-3",
    title: "Maryland RoomSanctuary · Quiet Corridor Room",
    tier: "RoomSanctuary",
    location: "Statewide MD (Montgomery, Prince George's & Howard)",
    zipCode: "All MD ZIPs",
    dailyRate: 55,
    weeklyRate: 385,
    commuteMinutes: 4,
    convenienceBadge: "Private Entrance · Desk · Streaming-Ready Wi-Fi",
    proximityTag: "Near Metro, Federal Employers & Campuses",
    idealForLabel: "Federal Contractors, Grad Students & Interns",
    cohorts: ["Contract-Assignment", "Academic-Enrollment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      { url: "/vettedrent-hero-landlord.jpg", caption: "Quiet Furnished Room with Private Entrance" },
      { url: "/vettedrent-hero-renter.jpg", caption: "Work Desk & Natural Light" },
    ],
    features: [
      "Private Entrance & Keyless Smart Lock",
      "All Utilities & Fast Wi-Fi Included",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-room-sanctuary-4",
    title: "Maryland RoomSanctuary · Premium Corner Room",
    tier: "RoomSanctuary",
    location: "Statewide MD (Annapolis, Columbia & Towson)",
    zipCode: "All MD ZIPs",
    dailyRate: 62,
    weeklyRate: 434,
    commuteMinutes: 3,
    convenienceBadge: "Corner Room · Mini-Fridge · Ensuite Sink",
    proximityTag: "Near Hospitals, Campuses & Business Parks",
    idealForLabel: "Travel Nurses, Residents & Visiting Professionals",
    cohorts: ["Contract-Assignment", "Seasonal-Remote", "Academic-Enrollment"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      { url: "/vettedrent-hero-renter.jpg", caption: "Corner Room with Extra Windows" },
      { url: "/vettedrent-hero-landlord.jpg", caption: "Work Nook & Mini-Fridge" },
    ],
    features: [
      "Larger Corner Room with Extra Light",
      "Mini-Fridge & Ensuite Sink",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-private-suite-3",
    title: "Maryland PrivateSuite · Garden-Level Suite",
    tier: "PrivateSuite",
    location: "Statewide MD (Baltimore County, Harford & Cecil)",
    zipCode: "All MD ZIPs",
    dailyRate: 85,
    weeklyRate: 595,
    commuteMinutes: 4,
    convenienceBadge: "Private Entrance · En-Suite Bath · Kitchenette",
    proximityTag: "Near I-95, Aberdeen & Regional Employers",
    idealForLabel: "Defense & Aerospace Contractors, Visiting Faculty",
    cohorts: ["Contract-Assignment", "Seasonal-Remote", "Academic-Enrollment"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-blue-950",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      { url: "/vettedrent-hero-landlord.jpg", caption: "Garden-Level Suite Living Area" },
      { url: "/vettedrent-hero-renter.jpg", caption: "Bedroom & Private En-Suite Bath" },
    ],
    features: [
      "Separate Private Entrance",
      "En-Suite Bath & Kitchenette",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-private-suite-4",
    title: "Maryland PrivateSuite · Executive Loft Suite",
    tier: "PrivateSuite",
    location: "Statewide MD (Bethesda, Rockville & Silver Spring)",
    zipCode: "All MD ZIPs",
    dailyRate: 95,
    weeklyRate: 665,
    commuteMinutes: 3,
    convenienceBadge: "Loft Layout · Dual Monitors · Reserved Parking",
    proximityTag: "Near Metro, NIH & Federal Hubs",
    idealForLabel: "Executives, Researchers & Corporate Mobility",
    cohorts: ["Contract-Assignment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      { url: "/vettedrent-hero-renter.jpg", caption: "Executive Loft Suite" },
      { url: "/vettedrent-hero-landlord.jpg", caption: "Dual-Monitor Workspace" },
    ],
    features: [
      "Loft Layout with Dedicated Workspace",
      "Reserved Parking & Private Bath",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-executive-townhome-3",
    title: "Maryland ExecutiveTownhome · 3BR Family Home",
    tier: "ExecutiveTownhome",
    location: "Statewide MD (Frederick, Carroll & Washington Counties)",
    zipCode: "All MD ZIPs",
    dailyRate: 129,
    weeklyRate: 903,
    commuteMinutes: 5,
    convenienceBadge: "3BR Townhome · Garage · Fenced Yard",
    proximityTag: "Near Schools, Parks & Regional Highways",
    idealForLabel: "Families in Transition, ALE Insurance & Relocations",
    cohorts: ["Insurance-Relocation", "Contract-Assignment", "Seasonal-Remote"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    defaultImageUrl: "/vettedrent-hero-landlord.jpg",
    galleryPhotos: [
      { url: "/vettedrent-hero-landlord.jpg", caption: "Open Living Room & Dining" },
      { url: "/vettedrent-hero-renter.jpg", caption: "Primary Bedroom & Second Bedrooms" },
    ],
    features: [
      "3 Bedrooms with Garage Parking",
      "Full Kitchen, Laundry & Fenced Yard",
      "$0 Security Deposit · No Credit Check",
    ],
  },
  {
    id: "md-statewide-executive-townhome-4",
    title: "Maryland ExecutiveTownhome · 4BR Executive Residence",
    tier: "ExecutiveTownhome",
    location: "Statewide MD (Howard, Anne Arundel & Montgomery)",
    zipCode: "All MD ZIPs",
    dailyRate: 145,
    weeklyRate: 1015,
    commuteMinutes: 4,
    convenienceBadge: "4BR Residence · Home Office · Two-Car Garage",
    proximityTag: "Near Top Schools, Shopping & Commuter Rail",
    idealForLabel: "Relocating Executives & Larger Families",
    cohorts: ["Insurance-Relocation", "Contract-Assignment"],
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-blue-950",
    defaultImageUrl: "/vettedrent-hero-renter.jpg",
    galleryPhotos: [
      { url: "/vettedrent-hero-renter.jpg", caption: "Executive Residence Living Space" },
      { url: "/vettedrent-hero-landlord.jpg", caption: "Home Office & Primary Suite" },
    ],
    features: [
      "4 Bedrooms with Dedicated Home Office",
      "Two-Car Garage & Chef's Kitchen",
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
  /** Fired when a tenant picks a specific property from the gallery ("Select this stay"). */
  onSelectListing?: (selection: {
    tier: PropertyCardProps["tier"];
    weeklyRateCents: number;
    listingId: string;
  }) => void;
  onResetFilters?: () => void;
}

const TIER_ORDER: readonly PropertyCardProps["tier"][] = [
  "RoomSanctuary",
  "PrivateSuite",
  "ExecutiveTownhome",
];

type SimpleGalleryState = { tier: PropertyCardProps["tier"]; index: number; photo: number };

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
  onSelectListing,
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
  const [simpleGallery, setSimpleGallery] = useState<SimpleGalleryState | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

  // ---- Simple (home) mode: one card per category, lowest price first, swipe gallery ----
  const tierGroups = TIER_ORDER.map((tier) => ({
    tier,
    listings: baseListings
      .filter((property) => property.tier === tier)
      .slice()
      .sort((a, b) => a.dailyRate - b.dailyRate || a.id.localeCompare(b.id)),
  })).filter((group) => group.listings.length > 0);

  const galleryGroup = simpleGallery
    ? (tierGroups.find((group) => group.tier === simpleGallery.tier) ?? null)
    : null;
  const galleryCount = galleryGroup?.listings.length ?? 0;
  const galleryOpen = simpleGallery !== null;

  function stepGalleryProperty(delta: number) {
    setSimpleGallery((prev) => {
      if (!prev || galleryCount === 0) return prev;
      return { ...prev, index: (prev.index + delta + galleryCount) % galleryCount, photo: 0 };
    });
  }

  function leadPhotoUrl(property: PropertyCardProps, photoIdx: number): string {
    const isTierLead = SAMPLE_LISTINGS.find((p) => p.tier === property.tier) === property;
    if (photoIdx === 0 && isTierLead && hostPhotosByTier[property.tier]) {
      return hostPhotosByTier[property.tier];
    }
    return property.galleryPhotos[photoIdx]?.url ?? property.defaultImageUrl;
  }

  function openSimpleGallery(tier: PropertyCardProps["tier"]) {
    onSelectTier?.(tier);
    setSimpleGallery({ tier, index: 0, photo: 0 });
  }

  function selectGalleryProperty(property: PropertyCardProps) {
    if (onSelectListing) {
      onSelectListing({
        tier: property.tier,
        weeklyRateCents: property.weeklyRate * 100,
        listingId: property.id,
      });
    } else {
      onSelectTier?.(property.tier);
    }
    setSimpleGallery(null);
  }

  useEffect(() => {
    if (!galleryOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSimpleGallery(null);
      } else if (event.key === "ArrowLeft") {
        stepGalleryProperty(-1);
      } else if (event.key === "ArrowRight") {
        stepGalleryProperty(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryOpen, galleryCount]);

  useEffect(() => {
    // Close the gallery if the active filters remove its whole category.
    if (galleryOpen && galleryCount === 0) {
      setSimpleGallery(null);
    }
  }, [galleryOpen, galleryCount]);

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

  if (simple) {
    const gallerySafeIndex = galleryGroup ? Math.min(simpleGallery?.index ?? 0, galleryCount - 1) : 0;
    const galleryProperty = galleryGroup?.listings[gallerySafeIndex] ?? null;
    const galleryPhotoIdx =
      galleryProperty && simpleGallery
        ? Math.min(simpleGallery.photo, galleryProperty.galleryPhotos.length - 1)
        : 0;

    return (
      <>
        <div className="vr-simple-spaces" role="list" aria-label="Available spaces">
          {tierGroups.map((group) => {
            const lowest = group.listings[0];
            const isSelected = selectedTierId === group.tier;
            const label = SIMPLE_TIER_LABELS[group.tier];
            return (
              <button
                key={group.tier}
                type="button"
                role="listitem"
                aria-haspopup="dialog"
                aria-label={`${label}, from $${lowest.dailyRate} per day. ${group.listings.length} stays. View photos.`}
                className={`vr-simple-space${isSelected ? " vr-simple-space--selected" : ""}`}
                onClick={() => openSimpleGallery(group.tier)}
              >
                <span className="vr-simple-space__count">
                  {group.listings.length} {group.listings.length === 1 ? "stay" : "stays"}
                </span>
                <img src={leadPhotoUrl(lowest, 0)} alt="" className="vr-simple-space__photo" />
                <div className="vr-simple-space__meta">
                  <strong>{label}</strong>
                  <span>
                    <small>from</small> ${lowest.dailyRate} / day
                  </span>
                </div>
                <span className="vr-simple-space__hint">View photos &amp; swipe ›</span>
              </button>
            );
          })}
        </div>

        {galleryGroup && galleryProperty ? (
          <div
            className="vr-gallery-scrim"
            role="dialog"
            aria-modal="true"
            aria-label={`${SIMPLE_TIER_LABELS[galleryGroup.tier]} stays`}
            onClick={() => setSimpleGallery(null)}
          >
            <div className="vr-gallery" onClick={(event) => event.stopPropagation()}>
              <div className="vr-gallery__top">
                <div>
                  <p className="vr-gallery__kicker">
                    {SIMPLE_TIER_LABELS[galleryGroup.tier]} · Stay {gallerySafeIndex + 1} of{" "}
                    {galleryCount}
                  </p>
                  <h3 className="vr-gallery__title">{galleryProperty.title}</h3>
                </div>
                <button
                  type="button"
                  className="vr-gallery__close"
                  aria-label="Close gallery"
                  onClick={() => setSimpleGallery(null)}
                >
                  ✕
                </button>
              </div>

              <div
                className="vr-gallery__stage"
                onPointerDown={(event) => {
                  touchStartRef.current = { x: event.clientX, y: event.clientY };
                }}
                onPointerUp={(event) => {
                  const start = touchStartRef.current;
                  touchStartRef.current = null;
                  if (!start) return;
                  const dx = event.clientX - start.x;
                  const dy = event.clientY - start.y;
                  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    stepGalleryProperty(dx < 0 ? 1 : -1);
                  }
                }}
                onPointerCancel={() => {
                  touchStartRef.current = null;
                }}
              >
                <img
                  key={`${galleryProperty.id}-${galleryPhotoIdx}`}
                  src={leadPhotoUrl(galleryProperty, galleryPhotoIdx)}
                  alt={galleryProperty.galleryPhotos[galleryPhotoIdx]?.caption ?? galleryProperty.title}
                  className="vr-gallery__photo"
                  draggable={false}
                />
                {galleryCount > 1 ? (
                  <>
                    <button
                      type="button"
                      className="vr-gallery__nav vr-gallery__nav--prev"
                      aria-label="Previous stay"
                      onClick={() => stepGalleryProperty(-1)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="vr-gallery__nav vr-gallery__nav--next"
                      aria-label="Next stay"
                      onClick={() => stepGalleryProperty(1)}
                    >
                      ›
                    </button>
                  </>
                ) : null}
                {gallerySafeIndex === 0 && galleryCount > 1 ? (
                  <span className="vr-gallery__badge">Lowest price</span>
                ) : null}
                <span className="vr-gallery__caption">
                  {galleryProperty.galleryPhotos[galleryPhotoIdx]?.caption}
                </span>
              </div>

              <div className="vr-gallery__thumbs" role="group" aria-label="Photos of this stay">
                {galleryProperty.galleryPhotos.map((photo, photoIdx) => (
                  <button
                    key={`${galleryProperty.id}-thumb-${photoIdx}`}
                    type="button"
                    aria-label={`Photo ${photoIdx + 1}: ${photo.caption}`}
                    aria-pressed={photoIdx === galleryPhotoIdx}
                    className={`vr-gallery__thumb${photoIdx === galleryPhotoIdx ? " vr-gallery__thumb--active" : ""}`}
                    onClick={() =>
                      setSimpleGallery((prev) => (prev ? { ...prev, photo: photoIdx } : prev))
                    }
                  >
                    <img src={leadPhotoUrl(galleryProperty, photoIdx)} alt="" draggable={false} />
                  </button>
                ))}
              </div>

              <div className="vr-gallery__info">
                <div className="vr-gallery__price">
                  <strong>${galleryProperty.dailyRate}</strong>
                  <span>/ day · ${galleryProperty.weeklyRate}/wk</span>
                </div>
                <p className="vr-gallery__where">
                  {galleryProperty.location} · {galleryProperty.idealForLabel}
                </p>
                <ul className="vr-gallery__features">
                  {galleryProperty.features.map((feature) => (
                    <li key={feature}>
                      <span aria-hidden="true">✓</span> {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="vr-gallery__footer">
                {galleryCount > 1 ? (
                  <div className="vr-gallery__dots" role="group" aria-label="Stays in this category">
                    {galleryGroup.listings.map((listing, listingIdx) => (
                      <button
                        key={listing.id}
                        type="button"
                        aria-label={`Stay ${listingIdx + 1}, $${listing.dailyRate} per day`}
                        aria-current={listingIdx === gallerySafeIndex}
                        className={`vr-gallery__dot${listingIdx === gallerySafeIndex ? " vr-gallery__dot--active" : ""}`}
                        onClick={() =>
                          setSimpleGallery((prev) =>
                            prev ? { ...prev, index: listingIdx, photo: 0 } : prev,
                          )
                        }
                      />
                    ))}
                    <span className="vr-gallery__swipe-hint">Swipe or use ← → for more stays</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="vr-gallery__select"
                  onClick={() => selectGalleryProperty(galleryProperty)}
                >
                  Book this stay · ${galleryProperty.dailyRate}/day →
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
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
