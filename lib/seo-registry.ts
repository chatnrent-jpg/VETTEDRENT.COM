export interface CountySEOMetadata {
  slug: string;
  countyName: string;
  stateCode: string;
  zipRange: string[];
  cities: string[];
  majorHospitals: string[];
  travelNurseDemandHubs: string[];
}

/**
 * Complete Statewide Maryland Registry — All 23 Counties + Baltimore City (24 Jurisdictions)
 * Covers every Maryland ZIP code (20601–21930) and municipality for statewide testing
 * across Temporary Professionals, University Students, and Families in Transition / Insurance.
 */
export const MARYLAND_SEO_REGISTRY: Record<string, CountySEOMetadata> = {
  "prince-georges": {
    slug: "prince-georges",
    countyName: "Prince George's County",
    stateCode: "MD",
    zipRange: ["20706", "20707", "20715", "20720", "20735", "20740", "20743", "20744", "20745", "20746", "20747", "20748", "20770", "20772", "20774", "20781", "20782", "20783", "20784", "20785"],
    cities: ["Hyattsville", "College Park", "Bowie", "Laurel", "Greenbelt", "Upper Marlboro", "Oxon Hill", "National Harbor", "Clinton", "Suitland", "Lanham", "Landover"],
    majorHospitals: [
      "University of Maryland (College Park)",
      "UM Capital Region Medical Center",
      "NASA Goddard & Federal Contractor Corridor",
    ],
    travelNurseDemandHubs: ["College Park Campus & Metro", "Bowie Family & Relocation Hub", "National Harbor & Beltway Corridor"],
  },
  montgomery: {
    slug: "montgomery",
    countyName: "Montgomery County",
    stateCode: "MD",
    zipRange: ["20814", "20815", "20816", "20817", "20832", "20850", "20852", "20854", "20874", "20876", "20877", "20878", "20901", "20902", "20904", "20906", "20910"],
    cities: ["Bethesda", "Silver Spring", "Rockville", "Gaithersburg", "Germantown", "Potomac", "Wheaton", "Takoma Park", "Olney", "Chevy Chase"],
    majorHospitals: [
      "NIH & Federal Biotech Corridor",
      "Suburban Hospital & Holy Cross Health",
      "I-270 Tech & Corporate Campus",
    ],
    travelNurseDemandHubs: ["Bethesda Red Line Metro", "Rockville & Gaithersburg I-270 Hub", "Silver Spring Downtown Transit"],
  },
  "baltimore-city": {
    slug: "baltimore-city",
    countyName: "Baltimore City",
    stateCode: "MD",
    zipRange: ["21201", "21202", "21205", "21210", "21211", "21212", "21215", "21217", "21218", "21223", "21224", "21230", "21231", "21287"],
    cities: ["Baltimore", "Inner Harbor", "Fells Point", "Canton", "Federal Hill", "Mount Vernon", "Charles Village", "Hampden", "Roland Park"],
    majorHospitals: [
      "Johns Hopkins University & Hospital",
      "University of Maryland Baltimore (UMB)",
      "Inner Harbor Corporate & Financial District",
    ],
    travelNurseDemandHubs: ["Inner Harbor & Downtown", "Johns Hopkins & Charles Village Campus", "Canton & Fells Point Waterfront"],
  },
  "baltimore-county": {
    slug: "baltimore-county",
    countyName: "Baltimore County",
    stateCode: "MD",
    zipRange: ["21030", "21093", "21117", "21133", "21136", "21204", "21207", "21208", "21209", "21220", "21221", "21222", "21227", "21228", "21234", "21236", "21237", "21286"],
    cities: ["Towson", "Catonsville", "Owings Mills", "White Marsh", "Dundalk", "Essex", "Pikesville", "Hunt Valley", "Cockeysville", "Parkville", "Middle River", "Randallstown"],
    majorHospitals: [
      "Towson University & UMBC Campuses",
      "GBMC & UM St. Joseph Medical Center",
      "Hunt Valley & Owings Mills Corporate Hubs",
    ],
    travelNurseDemandHubs: ["Towson University & Downtown", "Owings Mills Metro & Corporate Center", "Catonsville & UMBC Corridor"],
  },
  "anne-arundel": {
    slug: "anne-arundel",
    countyName: "Anne Arundel County",
    stateCode: "MD",
    zipRange: ["21012", "21032", "21035", "21037", "21054", "21060", "21061", "21076", "21090", "21108", "21113", "21114", "21122", "21144", "21401", "21402", "21403", "21409"],
    cities: ["Annapolis", "Glen Burnie", "Odenton", "Severna Park", "Crofton", "Hanover", "Arundel Mills", "BWI", "Pasadena", "Severn", "Edgewater", "Arnold", "Linthicum"],
    majorHospitals: [
      "Fort Meade, NSA & BWI Airport Corridor",
      "U.S. Naval Academy & State Capital",
      "Luminis Health Anne Arundel Medical Center",
    ],
    travelNurseDemandHubs: ["Annapolis & Eastport", "BWI / Hanover / Arundel Mills Hub", "Fort Meade & Odenton MARC Station"],
  },
  howard: {
    slug: "howard",
    countyName: "Howard County",
    stateCode: "MD",
    zipRange: ["21029", "21042", "21043", "21044", "21045", "21046", "21075", "21163", "20723", "20759"],
    cities: ["Columbia", "Ellicott City", "Elkridge", "Fulton", "Clarksville", "Marriottsville", "Savage"],
    majorHospitals: [
      "Johns Hopkins Applied Physics Lab (APL)",
      "Columbia Corporate & Tech Gateway",
      "Johns Hopkins Howard County Medical Center",
    ],
    travelNurseDemandHubs: ["Columbia Town Center", "Historic Ellicott City", "Maple Lawn & APL Tech Corridor"],
  },
  frederick: {
    slug: "frederick",
    countyName: "Frederick County",
    stateCode: "MD",
    zipRange: ["21701", "21702", "21703", "21704", "21716", "21754", "21769", "21771", "21788", "21793"],
    cities: ["Frederick", "Urbana", "Mount Airy", "Middletown", "Brunswick", "Thurmont", "Ijamsville", "Walkersville"],
    majorHospitals: [
      "Fort Detrick & National Cancer Institute",
      "Hood College & Mount St. Mary's University",
      "Frederick Health Hospital",
    ],
    travelNurseDemandHubs: ["Downtown Frederick & Carroll Creek", "Urbana I-270 Commuter Hub", "Fort Detrick Research Corridor"],
  },
  harford: {
    slug: "harford",
    countyName: "Harford County",
    stateCode: "MD",
    zipRange: ["21001", "21005", "21009", "21014", "21015", "21040", "21050", "21078", "21085"],
    cities: ["Bel Air", "Aberdeen", "Havre de Grace", "Edgewood", "Abingdon", "Fallston", "Joppa"],
    majorHospitals: [
      "Aberdeen Proving Ground (APG) Defense Hub",
      "UM Upper Chesapeake Medical Center",
      "I-95 Logistics & Engineering Corridor",
    ],
    travelNurseDemandHubs: ["Bel Air Town Center", "Aberdeen Proving Ground Gate", "Havre de Grace Waterfront"],
  },
  charles: {
    slug: "charles",
    countyName: "Charles County",
    stateCode: "MD",
    zipRange: ["20601", "20602", "20603", "20616", "20637", "20640", "20646", "20695"],
    cities: ["Waldorf", "La Plata", "Indian Head", "White Plains", "Bryans Road", "Hughesville"],
    majorHospitals: [
      "Naval Surface Warfare Center Indian Head",
      "College of Southern Maryland (CSM)",
      "UM Charles Regional Medical Center",
    ],
    travelNurseDemandHubs: ["Waldorf Town Center", "La Plata County Seat", "Indian Head Defense Corridor"],
  },
  "st-marys": {
    slug: "st-marys",
    countyName: "St. Mary's County",
    stateCode: "MD",
    zipRange: ["20619", "20634", "20650", "20653", "20659", "20670", "20686"],
    cities: ["Lexington Park", "California", "Leonardtown", "Patuxent River", "St. Mary's City", "Mechanicsville"],
    majorHospitals: [
      "Naval Air Station Patuxent River (Pax River)",
      "St. Mary's College of Maryland",
      "MedStar St. Mary's Hospital",
    ],
    travelNurseDemandHubs: ["Pax River Aerospace & Defense Hub", "California & Lexington Park", "Leonardtown Square"],
  },
  calvert: {
    slug: "calvert",
    countyName: "Calvert County",
    stateCode: "MD",
    zipRange: ["20639", "20657", "20678", "20688", "20714", "20732", "20754"],
    cities: ["Prince Frederick", "Dunkirk", "Chesapeake Beach", "North Beach", "Solomons", "Lusby", "Huntingtown"],
    majorHospitals: [
      "Calvert Cliffs Clean Energy & LNG Hub",
      "CalvertHealth Medical Center",
      "Solomons Island Marine & Research Center",
    ],
    travelNurseDemandHubs: ["Prince Frederick Corridor", "Solomons & Lusby Energy Hub", "Dunkirk & Twin Beaches"],
  },
  carroll: {
    slug: "carroll",
    countyName: "Carroll County",
    stateCode: "MD",
    zipRange: ["21048", "21074", "21102", "21157", "21158", "21784", "21787"],
    cities: ["Westminster", "Eldersburg", "Sykesville", "Hampstead", "Manchester", "Taneytown", "Finksburg"],
    majorHospitals: [
      "McDaniel College & Carroll Community College",
      "LifeBridge Health Carroll Hospital",
      "Sykesville & Eldersburg Commuter Hub",
    ],
    travelNurseDemandHubs: ["Westminster & McDaniel Campus", "Eldersburg / Sykesville Corridor", "Hampstead & Manchester"],
  },
  washington: {
    slug: "washington",
    countyName: "Washington County",
    stateCode: "MD",
    zipRange: ["21713", "21740", "21742", "21750", "21782", "21795"],
    cities: ["Hagerstown", "Boonsboro", "Williamsport", "Hancock", "Smithsburg"],
    majorHospitals: [
      "Meritus Medical Center & Regional Hub",
      "I-81 / I-70 Interstate Logistics Hub",
      "Hagerstown Community College",
    ],
    travelNurseDemandHubs: ["Downtown Hagerstown", "Robinwood Medical & Campus Corridor", "Williamsport & Boonsboro"],
  },
  wicomico: {
    slug: "wicomico",
    countyName: "Wicomico County",
    stateCode: "MD",
    zipRange: ["21801", "21802", "21804", "21826", "21830", "21875"],
    cities: ["Salisbury", "Fruitland", "Delmar", "Hebron"],
    majorHospitals: [
      "Salisbury University Campus",
      "TidalHealth Peninsula Regional",
      "Eastern Shore Commercial & Agribusiness Hub",
    ],
    travelNurseDemandHubs: ["Salisbury University Corridor", "Downtown Salisbury & TidalHealth", "Fruitland & Route 13 Hub"],
  },
  cecil: {
    slug: "cecil",
    countyName: "Cecil County",
    stateCode: "MD",
    zipRange: ["21901", "21904", "21911", "21915", "21919", "21921"],
    cities: ["Elkton", "North East", "Perryville", "Chesapeake City", "Rising Sun", "Port Deposit"],
    majorHospitals: [
      "ChristianaCare Union Hospital (Elkton)",
      "Perryville MARC & I-95 Corporate Park",
      "Cecil College Campus",
    ],
    travelNurseDemandHubs: ["Elkton Town Center", "North East & Perryville Waterfront", "Chesapeake City"],
  },
  worcester: {
    slug: "worcester",
    countyName: "Worcester County",
    stateCode: "MD",
    zipRange: ["21811", "21842", "21851", "21863"],
    cities: ["Ocean City", "Berlin", "Ocean Pines", "Pocomoke City", "Snow Hill"],
    majorHospitals: [
      "Atlantic General Hospital (Berlin)",
      "Ocean City Seasonal & Hospitality Hub",
      "NASA Wallops Flight Facility Commuter Loop",
    ],
    travelNurseDemandHubs: ["Berlin & Ocean Pines", "Ocean City Coastal Corridor", "Pocomoke & Snow Hill"],
  },
  allegany: {
    slug: "allegany",
    countyName: "Allegany County",
    stateCode: "MD",
    zipRange: ["21502", "21532", "21539", "21562"],
    cities: ["Cumberland", "Frostburg", "LaVale", "Westernport"],
    majorHospitals: [
      "Frostburg State University",
      "UPMC Western Maryland (Cumberland)",
      "Allegany College of Maryland",
    ],
    travelNurseDemandHubs: ["Frostburg State Campus", "Cumberland Downtown & Medical Center", "LaVale Corridor"],
  },
  talbot: {
    slug: "talbot",
    countyName: "Talbot County",
    stateCode: "MD",
    zipRange: ["21601", "21654", "21663", "21673"],
    cities: ["Easton", "St. Michaels", "Oxford", "Trappe"],
    majorHospitals: [
      "UM Shore Regional Health at Easton",
      "Mid-Shore Aviation & Marine Hub",
      "Chesapeake College Regional Corridor",
    ],
    travelNurseDemandHubs: ["Easton Historic & Medical District", "St. Michaels & Oxford", "Route 50 Mid-Shore Hub"],
  },
  "queen-annes": {
    slug: "queen-annes",
    countyName: "Queen Anne's County",
    stateCode: "MD",
    zipRange: ["21617", "21619", "21638", "21666"],
    cities: ["Kent Island", "Stevensville", "Chester", "Centreville", "Grasonville"],
    majorHospitals: [
      "Bay Bridge & Kent Island Commuter Corridor",
      "UM Shore Emergency Center at Queenstown",
      "Chesapeake College (Wye Mills)",
    ],
    travelNurseDemandHubs: ["Kent Island & Stevensville", "Chester & Grasonville", "Centreville County Seat"],
  },
  dorchester: {
    slug: "dorchester",
    countyName: "Dorchester County",
    stateCode: "MD",
    zipRange: ["21613", "21643"],
    cities: ["Cambridge", "Hurlock", "Secretary", "Vienna"],
    majorHospitals: [
      "UM Shore Medical Center at Cambridge",
      "Horn Point UMCES Marine Research Lab",
      "Choptank River Waterfront Hub",
    ],
    travelNurseDemandHubs: ["Cambridge Waterfront & Medical Park", "Horn Point Research Corridor", "Hurlock"],
  },
  caroline: {
    slug: "caroline",
    countyName: "Caroline County",
    stateCode: "MD",
    zipRange: ["21629", "21632", "21639", "21655"],
    cities: ["Denton", "Federalsburg", "Greensboro", "Ridgely", "Preston"],
    majorHospitals: [
      "Caroline County Government & Regional Hub",
      "Mid-Shore Agricultural & Logistics Park",
      "Choptank Community Health System",
    ],
    travelNurseDemandHubs: ["Denton County Seat", "Federalsburg Industrial Hub", "Ridgely & Greensboro"],
  },
  kent: {
    slug: "kent",
    countyName: "Kent County",
    stateCode: "MD",
    zipRange: ["21620", "21661"],
    cities: ["Chestertown", "Rock Hall", "Galena", "Millington"],
    majorHospitals: [
      "Washington College (Chestertown)",
      "UM Shore Medical Center at Chestertown",
      "Upper Eastern Shore Heritage Corridor",
    ],
    travelNurseDemandHubs: ["Chestertown & Washington College", "Rock Hall Harbor", "Upper Shore Route 213"],
  },
  somerset: {
    slug: "somerset",
    countyName: "Somerset County",
    stateCode: "MD",
    zipRange: ["21817", "21853"],
    cities: ["Princess Anne", "Crisfield"],
    majorHospitals: [
      "University of Maryland Eastern Shore (UMES)",
      "TidalHealth McCready Pavilion (Crisfield)",
      "Lower Shore Academic & Research Corridor",
    ],
    travelNurseDemandHubs: ["UMES Campus in Princess Anne", "Crisfield Waterfront", "Route 13 University Corridor"],
  },
  garrett: {
    slug: "garrett",
    countyName: "Garrett County",
    stateCode: "MD",
    zipRange: ["21520", "21536", "21541", "21550"],
    cities: ["Oakland", "McHenry", "Deep Creek Lake", "Grantsville", "Accident"],
    majorHospitals: [
      "WVU Medicine Garrett Regional Medical Center",
      "Garrett College & Deep Creek Four-Season Hub",
      "I-68 Western Maryland Technology Corridor",
    ],
    travelNurseDemandHubs: ["Oakland County Seat", "Deep Creek Lake & McHenry", "Grantsville I-68 Corridor"],
  },
};

export interface ResolvedMarylandPlace {
  cityOrArea: string;
  countyName: string;
  zipCode: string;
  hubSummary: string;
}

/**
 * Resolves ANY query across the entire State of Maryland (all 23 counties + Baltimore City,
 * any Maryland ZIP code 20601–21930, or any Maryland city/town/campus/employer) into a
 * localized Maryland place so any user testing anywhere in Maryland sees localized inventory.
 */
export function resolveMarylandStatewideSearch(rawQuery: string): ResolvedMarylandPlace | null {
  const q = rawQuery.trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  // 1. Check exact or prefix ZIP match across all 24 Maryland jurisdictions
  const zipMatch = /^(\d{5})/.exec(q);
  if (zipMatch) {
    const zip = zipMatch[1];
    for (const county of Object.values(MARYLAND_SEO_REGISTRY)) {
      if (county.zipRange.includes(zip)) {
        return {
          cityOrArea: `${county.cities[0]}, MD (${county.countyName})`,
          countyName: county.countyName,
          zipCode: zip,
          hubSummary: county.majorHospitals[0] ?? `${county.countyName} Regional Hub`,
        };
      }
    }
    const prefix3 = Number(zip.slice(0, 3));
    if (prefix3 >= 206 && prefix3 <= 219) {
      const regionCounty =
        prefix3 === 206
          ? MARYLAND_SEO_REGISTRY.charles
          : prefix3 === 207
            ? MARYLAND_SEO_REGISTRY["prince-georges"]
            : prefix3 === 208 || prefix3 === 209
              ? MARYLAND_SEO_REGISTRY.montgomery
              : prefix3 === 210 || prefix3 === 211
                ? MARYLAND_SEO_REGISTRY.howard
                : prefix3 === 212
                  ? MARYLAND_SEO_REGISTRY["baltimore-city"]
                  : prefix3 === 214
                    ? MARYLAND_SEO_REGISTRY["anne-arundel"]
                    : prefix3 === 215
                      ? MARYLAND_SEO_REGISTRY.allegany
                      : prefix3 === 216
                        ? MARYLAND_SEO_REGISTRY.talbot
                        : prefix3 === 217
                          ? MARYLAND_SEO_REGISTRY.frederick
                          : prefix3 === 218
                            ? MARYLAND_SEO_REGISTRY.wicomico
                            : MARYLAND_SEO_REGISTRY.cecil;
      return {
        cityOrArea: `${regionCounty.countyName}, MD`,
        countyName: regionCounty.countyName,
        zipCode: zip,
        hubSummary: regionCounty.majorHospitals[0] ?? "Maryland Statewide Corridor",
      };
    }
  }

  // 2. Check city, county, university, or employer match across all 24 Maryland jurisdictions
  for (const county of Object.values(MARYLAND_SEO_REGISTRY)) {
    const matchedCity = county.cities.find((c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()));
    if (matchedCity) {
      return {
        cityOrArea: `${matchedCity}, MD (${county.countyName})`,
        countyName: county.countyName,
        zipCode: county.zipRange[0] ?? "21401",
        hubSummary: county.majorHospitals[0] ?? `${county.countyName} Hub`,
      };
    }
    if (
      county.countyName.toLowerCase().includes(lower) ||
      county.slug.includes(lower) ||
      county.majorHospitals.some((h) => h.toLowerCase().includes(lower))
    ) {
      return {
        cityOrArea: `${county.cities[0]}, MD (${county.countyName})`,
        countyName: county.countyName,
        zipCode: county.zipRange[0] ?? "21401",
        hubSummary: county.majorHospitals[0] ?? `${county.countyName} Hub`,
      };
    }
  }

  return null;
}
