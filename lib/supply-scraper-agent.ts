import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
  type JurisdictionRule,
} from "@/lib/compliance/jurisdictions";
import { evaluateGeoCompliance, INTENDED_STAY_DAYS } from "@/lib/geo-compliance";
import {
  CALCULATOR_HOST_BPS,
  CALCULATOR_PLATFORM_BPS,
  CALCULATOR_VAULT_BPS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import {
  PURPOSE_COHORT_IDS,
  PURPOSE_COHORTS,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export type SupplyListingSource =
  | "FurnishedFinder"
  | "ZillowMTR"
  | "Craigslist"
  | "UniversityHousingBoard"
  | "CorporateReloFeed";

export const SUPPLY_LISTING_SOURCES: readonly SupplyListingSource[] = [
  "FurnishedFinder",
  "ZillowMTR",
  "Craigslist",
  "UniversityHousingBoard",
  "CorporateReloFeed",
];

export type SupplyLeaseType =
  | "month_to_month_lease"
  | "fixed_term_residential_lease"
  | "informal_room_sublet"
  | "revocable_lodging_license";

export type SupplyOwnerContact = {
  fullName: string;
  email: string;
  phone: string | null;
  propertyCompany?: string | null;
};

export type ExternalMidTermListing = {
  id: string;
  source: SupplyListingSource;
  listingTitle: string;
  jurisdictionCode: string;
  weeklyRateCents: number;
  securityDepositCents: number;
  leaseType: SupplyLeaseType;
  ownerContact: SupplyOwnerContact;
  matchedCohorts: PurposeCohortId[];
  intendedStayDays?: number;
  hasIncomeVelocityVerification?: boolean;
  hasPayrollDisconnectBackstop?: boolean;
  listingUrl?: string;
};

export type ExposureVectorCode =
  | "Statutory Tenancy Rollover Risk"
  | "High Upfront Deposit Friction Blocking Verified Workers & Students"
  | "Unverified Income / No Payroll or Stipend Backstop"
  | "Unprotected Residential Lease Boilerplate"
  | "Restricted / High-Backlog Judicial Exposure";

export type ExposureVectorDetail = {
  vector: ExposureVectorCode;
  severity: "critical" | "high" | "elevated";
  weightPoints: number;
  remediation: string;
};

export type VettedRentWeeklySplit = {
  weeklyRateCents: number;
  intendedStayDays: number;
  estimatedWeeks: number;
  hostWeeklyCents: number;
  gmfVaultWeeklyCents: number;
  platformWeeklyCents: number;
  hostTotalCents: number;
  gmfVaultTotalCents: number;
  platformTotalCents: number;
  grossTotalCents: number;
  hostBps: number;
  gmfVaultBps: number;
  platformBps: number;
  vettedRentUpfrontDepositCents: 0;
  gmfMoveOutVaultTargetCents: 150000;
};

export type OutreachTouch = {
  touchNumber: 1 | 2 | 3;
  title:
    | "Touch 1: Statutory Exposure & Demand Audit"
    | "Touch 2: GMF Backstop & 3.00x Cash-Velocity Proof"
    | "Touch 3: Revocable Commercial License Activation Link";
  subject: string;
  smsPreview: string;
  body: string;
  ctaUrl: string;
};

export type ScoredSupplyTarget = {
  listing: ExternalMidTermListing;
  jurisdiction: JurisdictionRule;
  matchedCohorts: PurposeCohortId[];
  intendedStayDays: number;
  exposureScore: number;
  riskTier: "critical" | "high" | "moderate";
  rolloverProtectedUnderVettedRent: boolean;
  jurisdictionRolloverSummary: string;
  depositFrictionSummary: string;
  exposureVectors: ExposureVectorCode[];
  exposureVectorDetails: ExposureVectorDetail[];
  vettedRentSplit: VettedRentWeeklySplit;
  outreachSequence: [OutreachTouch, OutreachTouch, OutreachTouch];
};

/**
 * Curated regional mid-term supply targets across all 6 covered jurisdictions
 * (MD-PG, MD, FL, TX, CA, NY) spanning near-campus student suites,
 * corporate/industrial contractor hubs, seasonal remote sanctuaries,
 * and insurance/family relocation homes.
 */
export const CURATED_SUPPLY_LISTINGS: readonly ExternalMidTermListing[] = [
  {
    id: "uhb-md-pg-college-park-suite",
    source: "UniversityHousingBoard",
    listingTitle:
      "College Park / Bowie Graduate Fellow & Visiting Contractor Suite · Near UMD & Capital Beltway",
    jurisdictionCode: "MD-PG",
    weeklyRateCents: 25500,
    securityDepositCents: 155000,
    leaseType: "fixed_term_residential_lease",
    matchedCohorts: [
      "Academic-Enrollment",
      "Contract-Assignment",
      "Seasonal-Remote",
      "Insurance-Relocation",
    ],
    intendedStayDays: 90,
    hasIncomeVelocityVerification: false,
    hasPayrollDisconnectBackstop: false,
    listingUrl: "https://offcampus.umd.edu/housing/property/md-pg-college-park-bowie-suite",
    ownerContact: {
      fullName: "Devon Vance",
      email: "d.vance.hosts@chesapeake-stays.com",
      phone: "+13015550184",
      propertyCompany: "Chesapeake Corridor Rentals LLC",
    },
  },
  {
    id: "crf-md-baltimore-relocation-rowhouse",
    source: "CorporateReloFeed",
    listingTitle:
      "Baltimore Harbor & Johns Hopkins 3BR Furnished Family Relocation & University Research Rowhouse",
    jurisdictionCode: "MD",
    weeklyRateCents: 29000,
    securityDepositCents: 195000,
    leaseType: "month_to_month_lease",
    matchedCohorts: [
      "Insurance-Relocation",
      "Academic-Enrollment",
      "Contract-Assignment",
    ],
    intendedStayDays: 90,
    hasIncomeVelocityVerification: false,
    hasPayrollDisconnectBackstop: false,
    listingUrl: "https://corporaterelo.example.com/listings/md-baltimore-relocation-rowhouse",
    ownerContact: {
      fullName: "Claire Montgomery",
      email: "claire@harbormidterm.io",
      phone: "+14105550192",
      propertyCompany: "Harbor Mid-Term Holdings",
    },
  },
  {
    id: "ff-fl-tampa-bay-remote-sanctuary",
    source: "FurnishedFinder",
    listingTitle:
      "Tampa Bay / St. Pete Furnished Coastal Casita · 30–120d Remote Work Sanctuary & ALE Family Stay",
    jurisdictionCode: "FL",
    weeklyRateCents: 28500,
    securityDepositCents: 185000,
    leaseType: "month_to_month_lease",
    matchedCohorts: [
      "Seasonal-Remote",
      "Insurance-Relocation",
      "Contract-Assignment",
    ],
    intendedStayDays: 60,
    hasIncomeVelocityVerification: false,
    hasPayrollDisconnectBackstop: false,
    listingUrl: "https://www.furnishedfinder.com/property/fl-tampa-remote-sanctuary-casita",
    ownerContact: {
      fullName: "Mateo Delgado",
      email: "mateo@suncoastmtr.com",
      phone: "+18135550147",
      propertyCompany: "Suncoast Mid-Term Properties",
    },
  },
  {
    id: "zmtr-tx-austin-contractor-hub",
    source: "ZillowMTR",
    listingTitle:
      "Austin Semiconductor Corridor & UT Campus Furnished Townhome · Engineering & Student Stays",
    jurisdictionCode: "TX",
    weeklyRateCents: 26500,
    securityDepositCents: 160000,
    leaseType: "fixed_term_residential_lease",
    matchedCohorts: [
      "Contract-Assignment",
      "Academic-Enrollment",
      "Seasonal-Remote",
      "Insurance-Relocation",
    ],
    intendedStayDays: 90,
    hasIncomeVelocityVerification: false,
    hasPayrollDisconnectBackstop: false,
    listingUrl: "https://www.zillow.com/homedetails/tx-austin-contractor-campus-townhome",
    ownerContact: {
      fullName: "Avery Lockhart",
      email: "avery@lonestarfurnished.com",
      phone: "+15125550163",
      propertyCompany: "Lone Star Furnished Stays",
    },
  },
  {
    id: "cl-ca-san-diego-campus-remote",
    source: "Craigslist",
    listingTitle:
      "San Diego La Jolla / UCSD 90-Day Furnished Grad Student & Remote Work Suite — $2,250 Deposit",
    jurisdictionCode: "CA",
    weeklyRateCents: 34000,
    securityDepositCents: 225000,
    leaseType: "informal_room_sublet",
    matchedCohorts: [
      "Academic-Enrollment",
      "Seasonal-Remote",
      "Contract-Assignment",
    ],
    intendedStayDays: 90,
    hasIncomeVelocityVerification: false,
    hasPayrollDisconnectBackstop: false,
    listingUrl: "https://sandiego.craigslist.org/csd/sub/d/ucsd-grad-remote-suite",
    ownerContact: {
      fullName: "Elena Rostova",
      email: "elena@pacificcrestsuites.com",
      phone: "+16195550178",
      propertyCompany: "Pacific Crest Suites",
    },
  },
  {
    id: "uhb-ny-brooklyn-fellow-relo",
    source: "UniversityHousingBoard",
    listingTitle:
      "Brooklyn Park Slope / NYU-Poly 90-Day Visiting Scholar, Contractor & Family Relocation Brownstone",
    jurisdictionCode: "NY",
    weeklyRateCents: 38500,
    securityDepositCents: 280000,
    leaseType: "informal_room_sublet",
    matchedCohorts: [
      "Academic-Enrollment",
      "Contract-Assignment",
      "Insurance-Relocation",
      "Seasonal-Remote",
    ],
    intendedStayDays: 90,
    hasIncomeVelocityVerification: false,
    hasPayrollDisconnectBackstop: false,
    listingUrl: "https://housing.nyu.example.edu/offcampus/ny-brooklyn-fellow-relo-brownstone",
    ownerContact: {
      fullName: "Marcus Sterling",
      email: "m.sterling@boroughstone.nyc",
      phone: "+17185550139",
      propertyCompany: "BoroughStone Residential",
    },
  },
];

/**
 * Pure, deterministic exposure scorer and universal 4-cohort 3-part outreach generator.
 * Never mutates Supabase or the live vr-weekly-room listing.
 */
export function analyzeListingExposure(listing: ExternalMidTermListing): ScoredSupplyTarget {
  const jurisdiction =
    resolveJurisdiction(listing.jurisdictionCode) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE) ??
    JURISDICTION_RULES[0];

  const matchedCohorts = normalizeMatchedCohorts(listing.matchedCohorts);

  const safeWeeklyCents =
    Number.isSafeInteger(listing.weeklyRateCents) && listing.weeklyRateCents > 0
      ? listing.weeklyRateCents
      : DEFAULT_CALCULATOR_WEEKLY_CENTS;
  const safeDepositCents =
    Number.isSafeInteger(listing.securityDepositCents) && listing.securityDepositCents >= 0
      ? listing.securityDepositCents
      : 0;
  const safeStayDays =
    typeof listing.intendedStayDays === "number" &&
    Number.isSafeInteger(listing.intendedStayDays) &&
    listing.intendedStayDays >= 7 &&
    listing.intendedStayDays <= 365
      ? listing.intendedStayDays
      : INTENDED_STAY_DAYS;

  const compliance = evaluateGeoCompliance(
    {
      jurisdiction_code: jurisdiction.code,
      judicial_risk_tier: jurisdiction.judicialRiskTier,
      max_transient_days: jurisdiction.maxTransientDays,
      compliance_structure: jurisdiction.complianceStructure,
    },
    safeStayDays,
  );

  const hostWeeklyCents = Math.round((safeWeeklyCents * CALCULATOR_HOST_BPS) / 10000);
  const gmfVaultWeeklyCents = Math.round((safeWeeklyCents * CALCULATOR_VAULT_BPS) / 10000);
  const platformWeeklyCents = safeWeeklyCents - hostWeeklyCents - gmfVaultWeeklyCents;
  const estimatedWeeks = Math.max(1, Math.round(safeStayDays / 7));

  const vettedRentSplit: VettedRentWeeklySplit = {
    weeklyRateCents: safeWeeklyCents,
    intendedStayDays: safeStayDays,
    estimatedWeeks,
    hostWeeklyCents,
    gmfVaultWeeklyCents,
    platformWeeklyCents,
    hostTotalCents: hostWeeklyCents * estimatedWeeks,
    gmfVaultTotalCents: gmfVaultWeeklyCents * estimatedWeeks,
    platformTotalCents: platformWeeklyCents * estimatedWeeks,
    grossTotalCents: safeWeeklyCents * estimatedWeeks,
    hostBps: CALCULATOR_HOST_BPS,
    gmfVaultBps: CALCULATOR_VAULT_BPS,
    platformBps: CALCULATOR_PLATFORM_BPS,
    vettedRentUpfrontDepositCents: 0,
    gmfMoveOutVaultTargetCents: 150000,
  };

  const exposureVectorDetails: ExposureVectorDetail[] = [];

  // Vector 1: Statutory Tenancy Rollover Risk
  const exceedsCeiling = safeStayDays > jurisdiction.maxTransientDays;
  const usesStandardLease = listing.leaseType !== "revocable_lodging_license";
  if (
    exceedsCeiling ||
    usesStandardLease ||
    jurisdiction.complianceStructure === "residential_tenancy"
  ) {
    const rolloverWeight = exceedsCeiling
      ? 36
      : jurisdiction.judicialRiskTier === "restricted"
        ? 36
        : 26;
    exposureVectorDetails.push({
      vector: "Statutory Tenancy Rollover Risk",
      severity:
        exceedsCeiling || jurisdiction.judicialRiskTier === "restricted" ? "critical" : "high",
      weightPoints: rolloverWeight,
      remediation: exceedsCeiling
        ? `${jurisdiction.name} (${jurisdiction.code}) enforces a ${jurisdiction.maxTransientDays}-day transient ceiling. A ${safeStayDays}-day stay on ${listing.source} crosses into statutory residential tenancy; VettedRent enforces statutory ceiling guardrails before matching.`
        : `Listing uses ${formatLeaseType(listing.leaseType)} instead of a Purpose-Verified Revocable Commercial Lodging License tied to ${jurisdiction.code}'s ${jurisdiction.maxTransientDays}-day statutory ceiling.`,
    });
  }

  // Vector 2: High Upfront Deposit Friction Blocking Verified Workers & Students
  if (safeDepositCents >= 50000) {
    const depositWeight = safeDepositCents >= 200000 ? 24 : safeDepositCents >= 140000 ? 20 : 14;
    exposureVectorDetails.push({
      vector: "High Upfront Deposit Friction Blocking Verified Workers & Students",
      severity: safeDepositCents >= 180000 ? "high" : "elevated",
      weightPoints: depositWeight,
      remediation: `Demanding ${formatCurrencyCents(safeDepositCents)} upfront on ${listing.source} locks out 3.00x underwritten temporary contractors, university/vocational students, 14d+ seasonal/remote professionals, and ALE insurance-relocated families—while still leaving you exposed once holdover or damages exceed a static deposit. VettedRent replaces upfront deposit friction with $0.00 move-in + 14.3% (${formatCurrencyCents(gmfVaultWeeklyCents)}/wk) GMF escrow protection.`,
    });
  }

  // Vector 3: Unverified Income / No Payroll or Stipend Backstop
  if (!listing.hasIncomeVelocityVerification || !listing.hasPayrollDisconnectBackstop) {
    exposureVectorDetails.push({
      vector: "Unverified Income / No Payroll or Stipend Backstop",
      severity: "critical",
      weightPoints: 26,
      remediation: `Static PDF paystubs, registrar letters, or unverified claims on ${listing.source} do not alert you if payroll, university stipends, or ALE disbursements disconnect mid-stay. VettedRent enforces 3.00x 90-day Plaid cash-flow velocity and live disconnect webhooks that flip state to License_Revoked and route an instant GMF backstop transfer.`,
    });
  }

  // Vector 4: Unprotected Residential Lease Boilerplate
  if (
    listing.leaseType === "informal_room_sublet" ||
    listing.leaseType === "month_to_month_lease" ||
    listing.leaseType === "fixed_term_residential_lease"
  ) {
    const leaseWeight = listing.leaseType === "informal_room_sublet" ? 10 : 8;
    exposureVectorDetails.push({
      vector: "Unprotected Residential Lease Boilerplate",
      severity: listing.leaseType === "informal_room_sublet" ? "high" : "elevated",
      weightPoints: leaseWeight,
      remediation: `Standard ${formatLeaseType(listing.leaseType)} agreements grant statutory holdover possession rights without binding occupancy to an active ${matchedCohorts.join(", ")} credential.`,
    });
  }

  // Vector 5: Restricted / High-Backlog Judicial Exposure
  if (
    jurisdiction.judicialRiskTier === "restricted" ||
    jurisdiction.judicialRiskTier === "medium"
  ) {
    const judicialWeight = jurisdiction.judicialRiskTier === "restricted" ? 12 : 6;
    exposureVectorDetails.push({
      vector: "Restricted / High-Backlog Judicial Exposure",
      severity: jurisdiction.judicialRiskTier === "restricted" ? "critical" : "elevated",
      weightPoints: judicialWeight,
      remediation: `${jurisdiction.name} carries a ${jurisdiction.judicialRiskTier.toUpperCase()} judicial backlog profile (${jurisdiction.maxTransientDays}-day transient threshold). Unvetted tenancy defaults here risk multi-month docket delays.`,
    });
  }

  const rawScore = exposureVectorDetails.reduce((sum, item) => sum + item.weightPoints, 0);
  const exposureScore = Math.max(15, Math.min(100, rawScore));
  const riskTier: "critical" | "high" | "moderate" =
    exposureScore >= 80 ? "critical" : exposureScore >= 60 ? "high" : "moderate";

  const exposureVectors = exposureVectorDetails.map((item) => item.vector);

  const jurisdictionRolloverSummary = compliance.allowed
    ? `${jurisdiction.code} · ${safeStayDays}/${jurisdiction.maxTransientDays}d Ceiling (Rollover Protected via Revocable License)`
    : `${jurisdiction.code} · ${safeStayDays}/${jurisdiction.maxTransientDays}d Ceiling (${
        jurisdiction.judicialRiskTier === "restricted"
          ? "Restricted Statutory Regime"
          : `Exceeds ${jurisdiction.maxTransientDays}d Transient Ceiling`
      })`;

  const depositFrictionSummary = `${formatCurrencyCents(safeDepositCents)} ${listing.source} Cash Deposit → $0.00 VettedRent Move-In + ${formatCurrencyCents(vettedRentSplit.gmfVaultTotalCents)} GMF Escrow (${formatCurrencyCents(vettedRentSplit.gmfVaultWeeklyCents)}/wk)`;

  const normalizedListing: ExternalMidTermListing = {
    ...listing,
    matchedCohorts,
  };

  const outreachSequence = buildOutreachSequence({
    listing: normalizedListing,
    jurisdiction,
    matchedCohorts,
    exposureScore,
    exposureVectors,
    vettedRentSplit,
    complianceAllowed: compliance.allowed,
  });

  return {
    listing: normalizedListing,
    jurisdiction,
    matchedCohorts,
    intendedStayDays: safeStayDays,
    exposureScore,
    riskTier,
    rolloverProtectedUnderVettedRent: compliance.allowed,
    jurisdictionRolloverSummary,
    depositFrictionSummary,
    exposureVectors,
    exposureVectorDetails,
    vettedRentSplit,
    outreachSequence,
  };
}

export function getScoredCuratedSupply(): ScoredSupplyTarget[] {
  return CURATED_SUPPLY_LISTINGS.map((listing) => analyzeListingExposure(listing));
}

export function findCuratedSupplyListing(id: string): ExternalMidTermListing | null {
  const normalized = id.trim().toLowerCase();
  return (
    CURATED_SUPPLY_LISTINGS.find((item) => item.id.toLowerCase() === normalized) ?? null
  );
}

export function parseExternalListingPayload(
  value: unknown,
): ExternalMidTermListing | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Payload must be a JSON object" };
  }
  const body = value as Record<string, unknown>;

  if (typeof body.targetId === "string" && body.targetId.trim() !== "") {
    const matched = findCuratedSupplyListing(body.targetId);
    if (!matched) {
      return { error: `Unknown curated supply targetId: ${body.targetId}` };
    }
    return matched;
  }

  const rawListing =
    body.listing && typeof body.listing === "object" && !Array.isArray(body.listing)
      ? (body.listing as Record<string, unknown>)
      : body;

  const source = parseSource(rawListing.source);
  if (!source) {
    return {
      error:
        "source must be 'FurnishedFinder', 'ZillowMTR', 'Craigslist', 'UniversityHousingBoard', or 'CorporateReloFeed'",
    };
  }

  const listingTitle = cleanString(rawListing.listingTitle, 180);
  if (!listingTitle) {
    return { error: "listingTitle is required" };
  }

  const rawJurisdiction =
    typeof rawListing.jurisdictionCode === "string"
      ? rawListing.jurisdictionCode.trim().toUpperCase()
      : DEFAULT_JURISDICTION_CODE;
  const resolvedJurisdiction = resolveJurisdiction(rawJurisdiction);
  if (!resolvedJurisdiction) {
    return { error: `Unsupported jurisdictionCode: ${String(rawListing.jurisdictionCode)}` };
  }

  const weeklyRateCents = Number(rawListing.weeklyRateCents);
  if (
    !Number.isSafeInteger(weeklyRateCents) ||
    weeklyRateCents < 5000 ||
    weeklyRateCents > 500000
  ) {
    return { error: "weeklyRateCents must be an integer between 5000 and 500000" };
  }

  const securityDepositCents =
    rawListing.securityDepositCents === undefined || rawListing.securityDepositCents === null
      ? 150000
      : Number(rawListing.securityDepositCents);
  if (
    !Number.isSafeInteger(securityDepositCents) ||
    securityDepositCents < 0 ||
    securityDepositCents > 2000000
  ) {
    return { error: "securityDepositCents must be an integer between 0 and 2000000" };
  }

  const leaseType = parseLeaseType(rawListing.leaseType) ?? "month_to_month_lease";
  const matchedCohorts = normalizeMatchedCohorts(rawListing.matchedCohorts);
  const rawDays = Number(rawListing.intendedStayDays);
  const intendedStayDays =
    Number.isSafeInteger(rawDays) && rawDays >= 7 && rawDays <= 365
      ? rawDays
      : INTENDED_STAY_DAYS;

  const ownerContact = parseOwnerContact(rawListing.ownerContact, resolvedJurisdiction.code);
  if ("error" in ownerContact) {
    return ownerContact;
  }

  const id =
    cleanString(rawListing.id, 80) ??
    `custom-${source.toLowerCase()}-${resolvedJurisdiction.code.toLowerCase()}-${Date.now()}`;

  return {
    id,
    source,
    listingTitle,
    jurisdictionCode: resolvedJurisdiction.code,
    weeklyRateCents,
    securityDepositCents,
    leaseType,
    ownerContact,
    matchedCohorts,
    intendedStayDays,
    hasIncomeVelocityVerification: Boolean(rawListing.hasIncomeVelocityVerification),
    hasPayrollDisconnectBackstop: Boolean(rawListing.hasPayrollDisconnectBackstop),
    listingUrl: cleanString(rawListing.listingUrl, 240) ?? undefined,
  };
}

function buildOutreachSequence(input: {
  listing: ExternalMidTermListing;
  jurisdiction: JurisdictionRule;
  matchedCohorts: PurposeCohortId[];
  exposureScore: number;
  exposureVectors: ExposureVectorCode[];
  vettedRentSplit: VettedRentWeeklySplit;
  complianceAllowed: boolean;
}): [OutreachTouch, OutreachTouch, OutreachTouch] {
  const {
    listing,
    jurisdiction,
    matchedCohorts,
    exposureScore,
    exposureVectors,
    vettedRentSplit,
    complianceAllowed,
  } = input;

  const hostName = listing.ownerContact.fullName || "Property Owner";
  const weeklyRateFormatted = formatCurrencyCents(vettedRentSplit.weeklyRateCents);
  const depositFormatted = formatCurrencyCents(listing.securityDepositCents);
  const hostWeeklyFormatted = formatCurrencyCents(vettedRentSplit.hostWeeklyCents);
  const gmfWeeklyFormatted = formatCurrencyCents(vettedRentSplit.gmfVaultWeeklyCents);
  const platformWeeklyFormatted = formatCurrencyCents(vettedRentSplit.platformWeeklyCents);
  const hostTotalFormatted = formatCurrencyCents(vettedRentSplit.hostTotalCents);
  const gmfTotalFormatted = formatCurrencyCents(vettedRentSplit.gmfVaultTotalCents);
  const jurisdictionUrl = `https://vettedrent.com/jurisdictions/${encodeURIComponent(jurisdiction.code)}`;
  const hostShieldUrl = `https://vettedrent.com/marketing#host-shield`;
  const matchedCohortLabels = matchedCohorts
    .map((cohortId) => formatCohortDemandDescription(cohortId))
    .join("; ");

  const ceilingGuidance = complianceAllowed
    ? `Your ${vettedRentSplit.intendedStayDays}-day stay window fits within ${jurisdiction.name}'s ${jurisdiction.maxTransientDays}-day statutory transient ceiling—when structured under a Purpose-Verified Revocable Commercial Lodging License instead of a ${formatLeaseType(listing.leaseType)}.`
    : `${jurisdiction.name} (${jurisdiction.code}) enforces a strict ${jurisdiction.maxTransientDays}-day statutory residential tenancy threshold (${jurisdiction.judicialRiskTier.toUpperCase()} judicial backlog). Accepting an unvetted ${vettedRentSplit.intendedStayDays}-day stay on ${listing.source} triggers statutory tenancy rollover risk; VettedRent automatically enforces statutory ceiling guardrails before matching.`;

  const touch1: OutreachTouch = {
    touchNumber: 1,
    title: "Touch 1: Statutory Exposure & Demand Audit",
    subject: `[${jurisdiction.code} Statutory & Demand Audit] Unvetted renting is over — ${listing.listingTitle} (${exposureScore}/100 Exposure)`,
    smsPreview: `VettedRent (${jurisdiction.code} Audit): Unvetted renting is over. Your ${listing.source} listing scored ${exposureScore}/100 exposure & locks out 3.00x verified workers, students, remote pros & ALE families. Audit: ${jurisdictionUrl} — Be Great to Yourself!`,
    body: [
      `Hi ${hostName},`,
      ``,
      `Unvetted renting is over.`,
      ``,
      `Our programmatic supply audit reviewed "${listing.listingTitle}" on ${listing.source} (${weeklyRateFormatted}/wk · ${depositFormatted} cash security deposit) in ${jurisdiction.name} (${jurisdiction.code}) and calculated an Exposure Risk Score of ${exposureScore}/100 across these vectors:`,
      ...exposureVectors.map((vector, idx) => `  ${idx + 1}. ${vector}`),
      ``,
      `How your current setup hurts both protection and occupancy:`,
      `  • Statutory Rollover Exposure: ${ceilingGuidance}`,
      `  • Demand Lockout Across All 4 Cohorts: Requiring a ${depositFormatted} upfront cash deposit and ${formatLeaseType(listing.leaseType)} locks out VettedRent's universal pool of 3.00x underwritten guests matched to your property (${matchedCohorts.join(", ")}): ${matchedCohortLabels}.`,
      ``,
      `Be Great to Yourself. Review your ${jurisdiction.code} statutory & demand audit: ${jurisdictionUrl}`,
    ].join("\n"),
    ctaUrl: jurisdictionUrl,
  };

  const touch2: OutreachTouch = {
    touchNumber: 2,
    title: "Touch 2: GMF Backstop & 3.00x Cash-Velocity Proof",
    subject: `Model your ${weeklyRateFormatted}/wk rate: 75.5% Host Payout + 14.3% GMF Escrow Backstop ($0 Deposit Friction)`,
    smsPreview: `VettedRent (${jurisdiction.code}): At ${weeklyRateFormatted}/wk you net ${hostWeeklyFormatted}/wk (75.5%) + ${gmfWeeklyFormatted}/wk (14.3%) GMF Backstop (License_Revoked protection) while 3.00x guests build their $1,500 Move-Out Vault. Be Great to Yourself!`,
    body: [
      `Hi ${hostName},`,
      ``,
      `Unvetted renting is over. Here is how your exact ${weeklyRateFormatted}/wk rate on "${listing.listingTitle}" (${vettedRentSplit.intendedStayDays} days / ~${vettedRentSplit.estimatedWeeks} weeks) performs on VettedRent across all 4 Purpose-Verified Stay cohorts (${matchedCohorts.join(", ")}):`,
      ``,
      `  • 75.5% Automated Host Payout: ${hostWeeklyFormatted}/wk (${hostTotalFormatted} projected stay payout)`,
      `  • 14.3% GMF Escrow Allocation: ${gmfWeeklyFormatted}/wk (${gmfTotalFormatted} stay escrow reserve + instant License_Revoked payroll/stipend disconnect backstop protection)`,
      `  • 10.2% Platform Fee: ${platformWeeklyFormatted}/wk (Plaid 3.00x 90-day cash-velocity underwriting, live payroll/stipend webhook monitoring, and Seam smart-lock access control)`,
      ``,
      `Why verified temporary workers, university/vocational students, 14d+ seasonal/remote professionals, and insurance-relocated families book faster on VettedRent:`,
      `  • $0.00 Upfront Security Deposit Friction at move-in`,
      `  • Every weekly payment simultaneously funds the guest's $1,500.00 GMF Move-Out Vault ("Be Great to Yourself."), aligning incentives for a spotless checkout.`,
      ``,
      `Inspect the live GMF yield model here: ${hostShieldUrl}`,
    ].join("\n"),
    ctaUrl: hostShieldUrl,
  };

  const touch3: OutreachTouch = {
    touchNumber: 3,
    title: "Touch 3: Revocable Commercial License Activation Link",
    subject: `Activate your ${jurisdiction.code} Revocable Commercial License & Host Shield (${hostTotalFormatted} Protected Payout)`,
    smsPreview: `VettedRent (${jurisdiction.code}): Activate your Revocable Commercial License for "${listing.listingTitle}" at ${hostShieldUrl} or ${jurisdictionUrl} — Unvetted renting is over. Be Great to Yourself!`,
    body: [
      `Hi ${hostName},`,
      ``,
      `Unvetted renting is over. It’s time to be great to yourself.`,
      ``,
      `Your ${jurisdiction.code} Host Shield profile for "${listing.listingTitle}" is ready. In one click, replace ${formatLeaseType(listing.leaseType)} rollover risk and ${depositFormatted} deposit friction with:`,
      `  • A state-aligned ${jurisdiction.code} Revocable Commercial Lodging License (${jurisdiction.maxTransientDays}-day statutory ceiling guardrail)`,
      `  • 75.5% automated weekly payouts (${hostWeeklyFormatted}/wk) + 14.3% GMF Escrow backstop (${gmfWeeklyFormatted}/wk)`,
      `  • Immediate matching across ${matchedCohorts.join(", ")} Purpose-Verified guests carrying an official VettedRent Trust Passport.`,
      ``,
      `Direct Onboarding Links:`,
      `  1. Configure Host Shield & Yield Calculator: ${hostShieldUrl}`,
      `  2. ${jurisdiction.name} (${jurisdiction.code}) Statutory Guardrail Page: ${jurisdictionUrl}`,
      ``,
      `Be Great to Yourself.`,
    ].join("\n"),
    ctaUrl: hostShieldUrl,
  };

  return [touch1, touch2, touch3];
}

export function formatLeaseType(leaseType: SupplyLeaseType): string {
  switch (leaseType) {
    case "month_to_month_lease":
      return "Month-to-Month Residential Lease";
    case "fixed_term_residential_lease":
      return "Fixed-Term Residential Lease";
    case "informal_room_sublet":
      return "Informal Room Sublet";
    case "revocable_lodging_license":
      return "Revocable Commercial Lodging License";
  }
}

export function formatCohortDemandDescription(cohortId: PurposeCohortId): string {
  switch (cohortId) {
    case "Contract-Assignment":
      return "temporary workers & corporate/healthcare/industrial contractors (Contract-Assignment)";
    case "Academic-Enrollment":
      return "university, graduate & vocational students/rotators (Academic-Enrollment)";
    case "Seasonal-Remote":
      return "14d+ seasonal & remote professionals with verified departure itineraries (Seasonal-Remote)";
    case "Insurance-Relocation":
      return "ALE insurance-displaced & corporate-relocating families (Insurance-Relocation)";
  }
}

export function normalizeMatchedCohorts(value: unknown): PurposeCohortId[] {
  if (!Array.isArray(value)) {
    return [...PURPOSE_COHORT_IDS];
  }
  const matched: PurposeCohortId[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase();
    const cohort = PURPOSE_COHORTS.find((rule) => rule.id.toLowerCase() === normalized);
    if (cohort && !matched.includes(cohort.id)) {
      matched.push(cohort.id);
    }
  }
  return matched.length > 0 ? matched : [...PURPOSE_COHORT_IDS];
}

function parseSource(value: unknown): SupplyListingSource | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "furnishedfinder" || normalized === "furnished_finder") {
    return "FurnishedFinder";
  }
  if (normalized === "zillowmtr" || normalized === "zillow_mtr" || normalized === "zillow") {
    return "ZillowMTR";
  }
  if (normalized === "craigslist") {
    return "Craigslist";
  }
  if (
    normalized === "universityhousingboard" ||
    normalized === "university_housing_board" ||
    normalized === "university"
  ) {
    return "UniversityHousingBoard";
  }
  if (
    normalized === "corporaterelofeed" ||
    normalized === "corporate_relo_feed" ||
    normalized === "corporaterelo"
  ) {
    return "CorporateReloFeed";
  }
  return null;
}

function parseLeaseType(value: unknown): SupplyLeaseType | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "month_to_month_lease" ||
    normalized === "fixed_term_residential_lease" ||
    normalized === "informal_room_sublet" ||
    normalized === "revocable_lodging_license"
  ) {
    return normalized;
  }
  return null;
}

function parseOwnerContact(
  value: unknown,
  jurisdictionCode: string,
): SupplyOwnerContact | { error: string } {
  if (typeof value === "string" && value.trim() !== "") {
    const trimmed = value.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    return {
      fullName: `${jurisdictionCode} Supply Host`,
      email: isEmail
        ? trimmed.toLowerCase()
        : `host.${jurisdictionCode.toLowerCase()}@vettedrent.com`,
      phone: null,
      propertyCompany: null,
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "ownerContact must include at least a valid email address" };
  }

  const record = value as Record<string, unknown>;
  const rawEmail = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return { error: "ownerContact.email must be a valid email address" };
  }

  const fullName = cleanString(record.fullName, 120) ?? `${jurisdictionCode} Property Host`;
  const rawPhone = typeof record.phone === "string" ? record.phone.trim() : "";
  const phone = /^\+[1-9]\d{7,14}$/.test(rawPhone) ? rawPhone : null;
  const propertyCompany = cleanString(record.propertyCompany, 120);

  return {
    fullName,
    email: rawEmail,
    phone,
    propertyCompany,
  };
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.slice(0, maxLength);
}
