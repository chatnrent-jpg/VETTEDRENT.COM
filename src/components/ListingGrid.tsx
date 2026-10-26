import React from 'react';

interface PropertyCardProps {
  title: string;
  tier: string;
  location: string;
  dailyRate: number;
  hospitalTag: string;
  imagePlaceholder: string;
  features: string[];
}

const SAMPLE_LISTINGS: PropertyCardProps[] = [
  {
    title: "The Hyattsville RoomSanctuary",
    tier: "RoomSanctuary",
    location: "Hyattsville, MD",
    dailyRate: 45,
    hospitalTag: "2 mins to UM Capital Region Medical Center",
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-emerald-950",
    features: ["Private Keyless Smart-Lock", "High-Speed Wi-Fi Included", "Utilities Bundled"]
  },
  {
    title: "The Bethesda Executive Suite",
    tier: "PrivateSuite",
    location: "Bethesda, MD",
    dailyRate: 75,
    hospitalTag: "4 mins to Suburban Hospital (Johns Hopkins)",
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-blue-950",
    features: ["Private En-Suite Bathroom", "Ergonomic Workspace", "Kitchenette Access"]
  },
  {
    title: "The Bowie Clinical Townhome",
    tier: "ExecutiveTownhome",
    location: "Bowie, MD",
    dailyRate: 106,
    hospitalTag: "Direct access to regional medical transit loops",
    imagePlaceholder: "bg-gradient-to-br from-slate-800 to-slate-900",
    features: ["Entire Multi-Bedroom Home", "Full Chef's Kitchen", "In-Unit Washer & Dryer"]
  }
];

export const ListingDiscoveryGrid: React.FC = () => {
  return (
    <section className="max-w-7xl mx-auto px-6 py-16 bg-slate-950">
      <div className="mb-10">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-50">
          Explore Verified Mid-Term Spaces
        </h2>
        <p className="text-slate-400 text-sm mt-2">
          Move-in ready accommodations underwritten for healthcare professionals and traveling contractors.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {SAMPLE_LISTINGS.map((property, idx) => (
          <div 
            key={idx} 
            className="group relative bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden hover:border-emerald-500/20 transition-all duration-300 flex flex-col h-full shadow-xl"
          >
            {/* Visual Asset Container */}
            <div className={`h-48 w-full ${property.imagePlaceholder} relative flex items-center justify-center p-4 transition-transform group-hover:scale-[1.01] duration-300`}>
              <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-500/10">
                {property.hospitalTag}
              </div>
              <span className="text-slate-500 text-xs font-mono uppercase tracking-widest">{property.tier} Visual Node</span>
            </div>

            {/* Property Core Data Details */}
            <div className="p-6 flex flex-col flex-grow">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition-colors duration-200">
                    {property.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{property.location}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xl font-black text-slate-50">${property.dailyRate}</div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">/ day</div>
                </div>
              </div>

              {/* Bullet Features Mapping */}
              <ul className="mt-6 space-y-2 flex-grow text-xs text-slate-400">
                {property.features.map((feat, fIdx) => (
                  <li key={fIdx} className="flex items-center gap-2">
                    <span className="w-1 h-1 bg-emerald-400 rounded-full" />
                    {feat}
                  </li>
                ))}
              </ul>

              {/* Seamless Action Vector */}
              <div className="mt-6 pt-4 border-t border-slate-950">
                <button className="w-full py-3 bg-slate-950 group-hover:bg-emerald-500 text-slate-300 group-hover:text-slate-950 font-bold text-xs rounded-lg transition-all duration-200 uppercase tracking-wider border border-slate-800 group-hover:border-transparent">
                  Instant 1-Click Book
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
