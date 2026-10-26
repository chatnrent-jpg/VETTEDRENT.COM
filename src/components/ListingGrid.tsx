"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

export interface PropertyCardProps {
  title: string;
  tier: string;
  location: string;
  dailyRate: number;
  weeklyRate: number;
  hospitalTag: string;
  imagePlaceholder: string;
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
    features: [
      "Entire Multi-Bedroom Home",
      "Full Chef's Kitchen",
      "In-Unit Washer & Dryer",
      "Instant Bank Link Setup",
    ],
  },
];

export const ListingDiscoveryGrid: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTierFilter, setActiveTierFilter] = useState<string>("ALL");

  useEffect(() => {
    function handleHeroSearch(event: Event) {
      const custom = event as CustomEvent<{
        query?: string;
        tier?: string;
      }>;
      if (typeof custom.detail?.query === "string") {
        setSearchQuery(custom.detail.query);
      }
      if (typeof custom.detail?.tier === "string") {
        setActiveTierFilter(custom.detail.tier);
      }
    }
    window.addEventListener("vettedrent:search-spaces", handleHeroSearch);
    return () => {
      window.removeEventListener("vettedrent:search-spaces", handleHeroSearch);
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

  return (
    <section
      id="searchable-spaces"
      className="max-w-7xl mx-auto px-6 py-10 bg-slate-950 relative z-10"
      aria-label="Searchable Verified Mid-Term Spaces"
    >
      <div className="vr-discovery-header mb-8">
        <div>
          <div className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-1">
            Live Searchable Marketplace · Maryland Clinical Corridors
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50">
            Explore Verified Mid-Term Spaces
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Move-in ready accommodations with <strong>$0 Security Deposit</strong>,{" "}
            <strong>No Credit Check</strong>, and <strong>Instant Bank Link Setup</strong>.
          </p>
        </div>

        {/* LIVE SEARCH & TIER FILTER BAR FOR SPACES */}
        <div className="vr-space-search-controls">
          <div className="vr-space-search-input-wrap">
            <span className="vr-space-search-icon" aria-hidden="true">
              🔍
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search spaces by city, hospital, or tier (Hyattsville, Bethesda, Bowie)..."
              aria-label="Search available spaces by city, hospital, or tier"
              className="vr-space-search-input"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="vr-space-search-clear"
                aria-label="Clear search"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="vr-space-tier-pills" role="group" aria-label="Filter by space tier">
            {[
              { id: "ALL", label: "All Spaces (3)" },
              { id: "RoomSanctuary", label: "RoomSanctuary · $45/day" },
              { id: "PrivateSuite", label: "PrivateSuite · $75/day" },
              { id: "ExecutiveTownhome", label: "ExecutiveTownhome · $106/day" },
            ].map((pill) => {
              const active = activeTierFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveTierFilter(pill.id)}
                  className={`vr-space-tier-pill${active ? " vr-space-tier-pill--active" : ""}`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filteredListings.length === 0 ? (
        <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/60 text-center">
          <p className="text-slate-200 font-semibold">
            No spaces matched &ldquo;{searchQuery}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveTierFilter("ALL");
            }}
            className="button mt-4"
          >
            Show All 3 Available Spaces
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {filteredListings.map((property, idx) => {
            const bookingHref = `/underwriting?tier=${encodeURIComponent(property.tier)}&weeklyCents=${property.weeklyRate * 100}&days=30&cohort=Contract-Assignment&jurisdiction=MD-PG`;
            return (
              <div
                key={idx}
                className="group relative bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden hover:border-emerald-500/20 transition-all duration-300 flex flex-col h-full shadow-xl"
              >
                {/* Visual Asset Container */}
                <div
                  className={`h-48 w-full ${property.imagePlaceholder} relative flex items-center justify-center p-4 transition-transform group-hover:scale-[1.01] duration-300`}
                >
                  <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-500/10">
                    {property.hospitalTag}
                  </div>
                  <span className="text-slate-200 text-xs font-mono uppercase tracking-widest px-3 py-1.5 rounded-full bg-slate-950/60 border border-slate-800">
                    {property.tier} · ${property.dailyRate}/day
                  </span>
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
      )}
    </section>
  );
};
