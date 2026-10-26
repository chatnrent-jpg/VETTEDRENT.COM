import {
  CALCULATOR_VAULT_BPS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  allocateIntegerSplitCents,
  calculateMonthlyHostNetCents,
  divideIntegerCentsHalfUp,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import { INTENDED_STAY_DAYS } from "@/lib/geo-compliance";

/** Default reference rate ($277.00/night Cozycozy/OTA benchmark) when no custom external offer is entered. */
export const AGGREGATOR_NIGHTLY_BENCHMARK_CENTS = 27700;

export const MIN_COMPARISON_STAY_DAYS = 7;
export const MAX_COMPARISON_STAY_DAYS = 365;

export type DailyRateTierId = "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome";

export type DailyRateTierPreset = {
  id: DailyRateTierId;
  label: string;
  shortLabel: string;
  bandLabel: string;
  weeklyRateCents: number;
  minWeeklyRateCents: number;
  maxWeeklyRateCents: number;
  grossDailyRateCents: number;
  minDailyRateCents: number;
  maxDailyRateCents: number;
  dailyGmfVaultCreditCents: number;
  netEffectiveDailyRateCents: number;
  defaultComparisonNightlyCents: number;
  defaultComparisonDepositCents: number;
  audienceSummary: string;
};

export type ExternalOfferPreset = {
  id: string;
  providerLabel: string;
  nightlyRateCents: number;
  upfrontDepositCents: number;
  description: string;
};

/**
 * Representative external market offerings so users can compare & contrast
 * against different providers—or enter any custom nightly rate & upfront deposit.
 */
export const EXTERNAL_OFFER_PRESETS: readonly ExternalOfferPreset[] = [
  {
    id: "extended-stay-motel",
    providerLabel: "Budget Extended-Stay / Motel ($119/night)",
    nightlyRateCents: 11900,
    upfrontDepositCents: 25000,
    description: "Basic extended-stay room with transient hotel taxes, no kitchen sanctuary, and zero equity return.",
  },
  {
    id: "hotel-ota-144",
    providerLabel: "Hotel / Extended-Stay Benchmark ($144/night)",
    nightlyRateCents: 14400,
    upfrontDepositCents: 0,
    description: "Standard mid-scale hotel or extended-stay nightly rate ($144/night) with 100% sunk cost.",
  },
  {
    id: "unvetted-mtr-sublet",
    providerLabel: "Unvetted Furnished Sublet / MTR ($145/night + $1,500 Deposit)",
    nightlyRateCents: 14500,
    upfrontDepositCents: 150000,
    description: "Traditional month-to-month lease with $1,500+ upfront cash lockup and statutory rollover exposure.",
  },
  {
    id: "airbnb-vrbo-midterm",
    providerLabel: "Airbnb / VRBO Mid-Term Listing ($195/night)",
    nightlyRateCents: 19500,
    upfrontDepositCents: 50000,
    description: "Short-term platform markup (14–20% guest service fees + cleaning fees) with zero Move-Out Vault credit.",
  },
  {
    id: "cozycozy-ota-hotel",
    providerLabel: "Cozycozy / OTA / Aparthotel ($277/night)",
    nightlyRateCents: 27700,
    upfrontDepositCents: 0,
    description: "Retail aggregator nightly rate ($277/night sample) with 100% sunk hospitality cost.",
  },
  {
    id: "corporate-exec-housing",
    providerLabel: "Corporate Relocation / ALE Hotel Suite ($340/night)",
    nightlyRateCents: 34000,
    upfrontDepositCents: 50000,
    description: "Agency/insurance retail suite billing that drains relocation or ALE policy limits rapidly.",
  },
];

export const DAILY_RATE_PRESET_TIERS: Record<DailyRateTierId, DailyRateTierPreset> = {
  RoomSanctuary: {
    id: "RoomSanctuary",
    label: "Room Sanctuary ($45–$90/day · $315–$630/wk)",
    shortLabel: "Room Sanctuary",
    bandLabel: "$45.00–$90.00/day ($315–$630/wk)",
    weeklyRateCents: 31500,
    minWeeklyRateCents: 31500,
    maxWeeklyRateCents: 63000,
    grossDailyRateCents: 4500,
    minDailyRateCents: 4500,
    maxDailyRateCents: 9000,
    dailyGmfVaultCreditCents: 644,
    netEffectiveDailyRateCents: 3856,
    defaultComparisonNightlyCents: 27700,
    defaultComparisonDepositCents: 150000,
    audienceSummary:
      "Temporary workers & contractors, university/vocational students, and solo 14d+ seasonal remote professionals.",
  },
  PrivateSuite: {
    id: "PrivateSuite",
    label: "Private Suite ($75–$120/day · $525–$840/wk)",
    shortLabel: "Private Suite",
    bandLabel: "$75.00–$120.00/day ($525–$840/wk)",
    weeklyRateCents: 52500,
    minWeeklyRateCents: 52500,
    maxWeeklyRateCents: 84000,
    grossDailyRateCents: 7500,
    minDailyRateCents: 7500,
    maxDailyRateCents: 12000,
    dailyGmfVaultCreditCents: 1073,
    netEffectiveDailyRateCents: 6427,
    defaultComparisonNightlyCents: 27700,
    defaultComparisonDepositCents: 150000,
    audienceSummary:
      "Visiting scholars, corporate/IT/engineering fellows, and extended remote builders seeking private bath & workspace.",
  },
  ExecutiveTownhome: {
    id: "ExecutiveTownhome",
    label: "Family / Executive Townhome ($106.43–$180/day · $745–$1,260/wk)",
    shortLabel: "Family / Executive Townhome",
    bandLabel: "$106.43–$180.00/day ($745–$1,260/wk)",
    weeklyRateCents: 74500,
    minWeeklyRateCents: 74500,
    maxWeeklyRateCents: 126000,
    grossDailyRateCents: 10643,
    minDailyRateCents: 10643,
    maxDailyRateCents: 18000,
    dailyGmfVaultCreditCents: 1522,
    netEffectiveDailyRateCents: 9121,
    defaultComparisonNightlyCents: 27700,
    defaultComparisonDepositCents: 200000,
    audienceSummary:
      "ALE insurance-relocated families, corporate mobility households, and multi-bedroom executive placements.",
  },
};

export const DAILY_RATE_TIER_LIST: readonly DailyRateTierPreset[] = [
  DAILY_RATE_PRESET_TIERS.RoomSanctuary,
  DAILY_RATE_PRESET_TIERS.PrivateSuite,
  DAILY_RATE_PRESET_TIERS.ExecutiveTownhome,
];

export interface SpaceTierCardOption {
  id: DailyRateTierId;
  title: string;
  codeLabel: string;
  dailyPriceLabel: string;
  weeklyPriceLabel: string;
  weeklyRateCents: number;
  badge: string;
  summary: string;
  features: readonly string[];
}

export const SPACE_TIER_CARDS: readonly SpaceTierCardOption[] = [
  {
    id: "RoomSanctuary",
    title: "Room Sanctuary",
    codeLabel: "RoomSanctuary",
    dailyPriceLabel: "$45/day",
    weeklyPriceLabel: "$315/week",
    weeklyRateCents: 31500,
    badge: "Best Value · Private Room",
    summary:
      "Move-in ready furnished bedroom with keyless smart-lock entry, fast Wi-Fi, and utilities included.",
    features: ["Private Keyless Room", "All Utilities & Wi-Fi", "$0 Security Deposit"],
  },
  {
    id: "PrivateSuite",
    title: "Private Suite",
    codeLabel: "PrivateSuite",
    dailyPriceLabel: "$75/day",
    weeklyPriceLabel: "$525/week",
    weeklyRateCents: 52500,
    badge: "Most Popular · En-Suite",
    summary:
      "Dedicated suite with private en-suite bathroom, ergonomic workspace, and kitchenette access.",
    features: ["Private En-Suite Bath", "Dedicated Workspace", "No Credit Check"],
  },
  {
    id: "ExecutiveTownhome",
    title: "Executive Townhome",
    codeLabel: "ExecutiveTownhome",
    dailyPriceLabel: "$106/day",
    weeklyPriceLabel: "$745/week",
    weeklyRateCents: 74500,
    badge: "Entire Home · Multi-Bedroom",
    summary:
      "Full multi-bedroom townhome with chef's kitchen, living area, in-unit laundry, and parking.",
    features: ["Entire Multi-Bedroom Home", "Full Kitchen & Laundry", "Instant Bank Link Setup"],
  },
] as const;

export type TierRateOption = {
  weeklyRateCents: number;
  grossDailyRateCents: number;
  dailyGmfVaultCreditCents: number;
  netEffectiveDailyRateCents: number;
  hostWeeklyNetCents: number;
  hostMonthlyNetCents: number;
  label: string;
  isFloor: boolean;
  isCeiling: boolean;
};

/**
 * Clamps any requested weekly rate in integer cents to the hard floor and ceiling
 * for the given tier:
 * - RoomSanctuary: $315/wk ($45/day) floor → $630/wk ($90/day) ceiling
 * - PrivateSuite: $525/wk ($75/day) floor → $840/wk ($120/day) ceiling
 * - ExecutiveTownhome: $745/wk ($106.43/day) floor → $1,260/wk ($180/day) ceiling
 */
export function clampTierWeeklyRateCents(
  tierId: DailyRateTierId,
  weeklyRateCents?: number | null,
): number {
  const preset = DAILY_RATE_PRESET_TIERS[tierId] ?? DAILY_RATE_PRESET_TIERS.RoomSanctuary;
  if (typeof weeklyRateCents !== "number" || !Number.isFinite(weeklyRateCents)) {
    return preset.weeklyRateCents;
  }
  const rounded = Math.round(weeklyRateCents);
  return Math.max(
    preset.minWeeklyRateCents,
    Math.min(preset.maxWeeklyRateCents, rounded),
  );
}

export function clampTierDailyRateCents(
  tierId: DailyRateTierId,
  dailyRateCents?: number | null,
): number {
  const preset = DAILY_RATE_PRESET_TIERS[tierId] ?? DAILY_RATE_PRESET_TIERS.RoomSanctuary;
  if (typeof dailyRateCents !== "number" || !Number.isFinite(dailyRateCents)) {
    return preset.grossDailyRateCents;
  }
  const rounded = Math.round(dailyRateCents);
  return Math.max(
    preset.minDailyRateCents,
    Math.min(preset.maxDailyRateCents, rounded),
  );
}

export function getTierRateOptions(tierId: DailyRateTierId): TierRateOption[] {
  const preset = DAILY_RATE_PRESET_TIERS[tierId] ?? DAILY_RATE_PRESET_TIERS.RoomSanctuary;
  const weeklySteps: number[] =
    tierId === "RoomSanctuary"
      ? [31500, 35000, 38500, 42000, 45500, 49000, 52500, 56000, 59500, 63000]
      : tierId === "PrivateSuite"
        ? [52500, 56000, 59500, 63000, 66500, 70000, 73500, 77000, 80500, 84000]
        : [74500, 80500, 87500, 94500, 105000, 115500, 126000];

  return weeklySteps.map((weeklyRateCents) => {
    const grossDailyRateCents = divideIntegerCentsHalfUp(weeklyRateCents, 7);
    const dailySplit = allocateIntegerSplitCents(grossDailyRateCents);
    const dailyGmfVaultCreditCents = dailySplit.gmfShareCents;
    const netEffectiveDailyRateCents = grossDailyRateCents - dailyGmfVaultCreditCents;
    const weeklySplit = allocateIntegerSplitCents(weeklyRateCents);
    const hostWeeklyNetCents = weeklySplit.hostShareCents;
    const hostMonthlyNetCents = calculateMonthlyHostNetCents(weeklyRateCents);
    const isFloor = weeklyRateCents === preset.minWeeklyRateCents;
    const isCeiling = weeklyRateCents === preset.maxWeeklyRateCents;
    const suffix = isFloor ? " (Floor)" : isCeiling ? " (Ceiling)" : "";
    return {
      weeklyRateCents,
      grossDailyRateCents,
      dailyGmfVaultCreditCents,
      netEffectiveDailyRateCents,
      hostWeeklyNetCents,
      hostMonthlyNetCents,
      label: `${formatCurrencyCents(grossDailyRateCents)}/day · ${formatCurrencyCents(weeklyRateCents)}/wk${suffix}`,
      isFloor,
      isCeiling,
    };
  });
}

export type DailyRateComparison = {
  weeklyRateCents: number;
  stayDays: number;
  grossDailyRateCents: number;
  dailyGmfVaultCreditCents: number;
  netEffectiveDailyRateCents: number;
  aggregatorNightlyCents: number;
  externalUpfrontDepositCents: number;
  aggregatorTotalCents: number;
  externalTotalCashOutlayCents: number;
  vettedRentGrossTotalCents: number;
  totalGmfVaultAccumulatedCents: number;
  vettedRentNetEffectiveTotalCents: number;
  totalSavingsVsAggregatorCents: number;
  totalCashFlowFreedIncludingDepositCents: number;
  savingsPercentage: number;
  vettedRentSecurityDepositCents: 0;
  gmfMoveOutVaultTargetCents: 150000;
  headlineSummary: string;
};

/**
 * Pure 14-to-90+ day daily rate breakdown ($/day) and flexible external offering
 * compare-and-contrast engine. Accepts any external nightly rate and optional
 * upfront deposit so users can compare VettedRent against whoever is making the offering.
 */
export function calculateDailyRateComparison(
  weeklyRateCents = DEFAULT_CALCULATOR_WEEKLY_CENTS,
  stayDays = INTENDED_STAY_DAYS,
  comparisonNightlyCents = AGGREGATOR_NIGHTLY_BENCHMARK_CENTS,
  externalUpfrontDepositCents = 0,
): DailyRateComparison {
  const safeWeeklyCents =
    typeof weeklyRateCents === "number" &&
    Number.isFinite(weeklyRateCents) &&
    weeklyRateCents > 0
      ? Math.round(weeklyRateCents)
      : DEFAULT_CALCULATOR_WEEKLY_CENTS;

  const clampedStayDays =
    typeof stayDays === "number" && Number.isFinite(stayDays)
      ? Math.max(
          MIN_COMPARISON_STAY_DAYS,
          Math.min(MAX_COMPARISON_STAY_DAYS, Math.round(stayDays)),
        )
      : INTENDED_STAY_DAYS;

  const safeComparisonNightlyCents =
    typeof comparisonNightlyCents === "number" &&
    Number.isFinite(comparisonNightlyCents) &&
    comparisonNightlyCents >= 3500 &&
    comparisonNightlyCents <= 250000
      ? Math.round(comparisonNightlyCents)
      : AGGREGATOR_NIGHTLY_BENCHMARK_CENTS;

  const safeExternalDepositCents =
    typeof externalUpfrontDepositCents === "number" &&
    Number.isFinite(externalUpfrontDepositCents) &&
    externalUpfrontDepositCents >= 0 &&
    externalUpfrontDepositCents <= 2000000
      ? Math.round(externalUpfrontDepositCents)
      : 0;

  const grossDailyRateCents = divideIntegerCentsHalfUp(safeWeeklyCents, 7);
  const dailySplit = allocateIntegerSplitCents(grossDailyRateCents);
  const dailyGmfVaultCreditCents = dailySplit.gmfShareCents;
  const netEffectiveDailyRateCents = grossDailyRateCents - dailyGmfVaultCreditCents;

  const aggregatorTotalCents = safeComparisonNightlyCents * clampedStayDays;
  const externalTotalCashOutlayCents = aggregatorTotalCents + safeExternalDepositCents;
  const vettedRentGrossTotalCents = grossDailyRateCents * clampedStayDays;
  const totalGmfVaultAccumulatedCents = dailyGmfVaultCreditCents * clampedStayDays;
  const vettedRentNetEffectiveTotalCents =
    vettedRentGrossTotalCents - totalGmfVaultAccumulatedCents;
  const totalSavingsVsAggregatorCents = Math.max(
    0,
    aggregatorTotalCents - vettedRentGrossTotalCents,
  );
  const totalCashFlowFreedIncludingDepositCents =
    totalSavingsVsAggregatorCents + safeExternalDepositCents;

  const savingsPercentage =
    safeComparisonNightlyCents > 0
      ? Math.max(
          0,
          Math.round(
            ((safeComparisonNightlyCents - grossDailyRateCents) / safeComparisonNightlyCents) *
              100,
          ),
        )
      : 0;

  const headlineSummary = `${formatCurrencyCents(safeWeeklyCents)}/wk · ${formatCurrencyCents(grossDailyRateCents)}/day (${formatCurrencyCents(netEffectiveDailyRateCents)}/day net after +${formatCurrencyCents(dailyGmfVaultCreditCents)}/day 14.3% GMF Vault credit) · ${savingsPercentage}% less than ${formatCurrencyCents(safeComparisonNightlyCents)}/night hotel & aggregator rates`;

  return {
    weeklyRateCents: safeWeeklyCents,
    stayDays: clampedStayDays,
    grossDailyRateCents,
    dailyGmfVaultCreditCents,
    netEffectiveDailyRateCents,
    aggregatorNightlyCents: safeComparisonNightlyCents,
    externalUpfrontDepositCents: safeExternalDepositCents,
    aggregatorTotalCents,
    externalTotalCashOutlayCents,
    vettedRentGrossTotalCents,
    totalGmfVaultAccumulatedCents,
    vettedRentNetEffectiveTotalCents,
    totalSavingsVsAggregatorCents,
    totalCashFlowFreedIncludingDepositCents,
    savingsPercentage,
    vettedRentSecurityDepositCents: 0,
    gmfMoveOutVaultTargetCents: 150000,
    headlineSummary,
  };
}
