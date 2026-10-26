export interface CountySEOMetadata {
  slug: string;
  countyName: string;
  stateCode: string;
  majorHospitals: string[];
  travelNurseDemandHubs: string[];
}

export const MARYLAND_SEO_REGISTRY: Record<string, CountySEOMetadata> = {
  'prince-georges': {
    slug: 'prince-georges',
    countyName: "Prince George's County",
    stateCode: 'MD',
    majorHospitals: [
      "UM Capital Region Medical Center",
      "MedStar Southern Maryland Hospital Center",
      "Doctors Community Hospital"
    ],
    travelNurseDemandHubs: ["Hyattsville Corridor", "Bowie Medical Center Hub", "Clinton Health Center"]
  },
  'montgomery': {
    slug: 'montgomery',
    countyName: 'Montgomery County',
    stateCode: 'MD',
    majorHospitals: [
      "Suburban Hospital (Johns Hopkins Medicine)",
      "Holy Cross Hospital (Silver Spring)",
      "Shady Grove Medical Center"
    ],
    travelNurseDemandHubs: ["Bethesda Medical Corridor", "Rockville Tech Center", "Silver Spring Metro District"]
  },
  'baltimore-city': {
    slug: 'baltimore-city',
    countyName: 'Baltimore City',
    stateCode: 'MD',
    majorHospitals: [
      "Johns Hopkins Hospital",
      "University of Maryland Medical Center",
      "MedStar Union Memorial Hospital"
    ],
    travelNurseDemandHubs: ["Downtown Medical Corridor", "Johns Hopkins Dome District", "Midtown Clinical Loop"]
  }
};
