import {
  CALCULATOR_VAULT_BPS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import { INTENDED_STAY_DAYS } from "@/lib/geo-compliance";

/** Default reference rate ($144.00/night) when no custom external offer is entered. */
export const AGGREGATOR_NIGHTLY_BENCHMARK_CENTS = 14400;

export const MIN_COMPARISON_STAY_DAYS = 14;
export const MAX_COMPARISON_STAY_DAYS = 365;

export type DailyRateTierId = "RoomSanctuary" | "PrivateSuite" | "ExecutiveTownhome";

export type DailyRateTierPreset = {
  id: DailyRateTierId;
  label: string;
  weeklyRateCents: number;
  grossDailyRateCents: number;
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
    label: "Room Sanctuary ($245/wk · $35.00/day)",
    weeklyRateCents: 24500,
    grossDailyRateCents: 3500,
    dailyGmfVaultCreditCents: 501,
    netEffectiveDailyRateCents: 2999,
    defaultComparisonNightlyCents: 14400,
    defaultComparisonDepositCents: 150000,
    audienceSummary:
      "Temporary workers & contractors, university/vocational students, and solo 14d+ seasonal remote professionals.",
  },
  PrivateSuite: {
    id: "PrivateSuite",
    label: "Private Suite ($490/wk · $70.00/day)",
    weeklyRateCents: 49000,
    grossDailyRateCents: 7000,
    dailyGmfVaultCreditCents: 1001,
    netEffectiveDailyRateCents: 5999,
    defaultComparisonNightlyCents: 19500,
    defaultComparisonDepositCents: 150000,
    audienceSummary:
      "Visiting scholars, corporate/IT/engineering fellows, and extended remote builders seeking private bath & workspace.",
  },
  ExecutiveTownhome: {
    id: "ExecutiveTownhome",
    label: "Family / Executive Townhome ($745/wk · $106.43/day)",
    weeklyRateCents: 74500,
    grossDailyRateCents: 10643,
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

  const grossDailyRateCents = Math.round(safeWeeklyCents / 7);
  const dailyGmfVaultCreditCents = Math.round(
    (grossDailyRateCents * CALCULATOR_VAULT_BPS) / 10000,
  );
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

  const headlineSummary = `${formatCurrencyCents(grossDailyRateCents)} / day (${formatCurrencyCents(netEffectiveDailyRateCents)}/day net after 14.3% GMF Vault credit) · Save ${savingsPercentage}% vs. ${formatCurrencyCents(safeComparisonNightlyCents)}/night external offering`;

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
