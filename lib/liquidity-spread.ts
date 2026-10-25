import {
  DAILY_RATE_PRESET_TIERS,
  DAILY_RATE_TIER_LIST,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import {
  CALCULATOR_HOST_BPS,
  CALCULATOR_PLATFORM_BPS,
  CALCULATOR_VAULT_BPS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";
import { PURPOSE_COHORTS, type PurposeCohortId } from "@/lib/underwriting-contract";

/** 52 weeks / 12 months = 4.333333... weeks per calendar month. */
export const WEEKS_PER_YEAR = 52;
export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_MONTH_CALENDAR = 52 / 12;
/** 4.333 multiplier used in System Spec 3.B ($745/wk * 4.333 = $3,228.08/mo). */
export const SPEC_3B_WEEKS_PER_MONTH_FACTOR = 4.333;

/** Average 21-day timing float window (3 weekly billing cycles held before monthly disbursement). */
export const AVERAGE_TIMING_FLOAT_DAYS = 21;
export const BIWEEKLY_TIMING_FLOAT_DAYS = 10.5;

/** 45-stay ($1M valuation) commercial milestone benchmark. */
export const BENCHMARK_45_STAYS = 45;

/** Initial seed balance in public.gmf_float_balance ($15,000.00). */
export const DEFAULT_GMF_FLOAT_SEED_CENTS = 1500000;

export type PayoutSchedule = "monthly" | "bi-weekly";

export type TierLiquidityBenchmark = {
  tierId: DailyRateTierId;
  label: string;
  weeklyRateCents: number;
  grossDailyRateCents: number;
  /** Flat monthly landlord payout benchmark in cents (e.g., $3,000.00/mo on $745/wk Townhome). */
  flatMonthlyLandlordBenchmarkCents: number;
};

export const TIER_LIQUIDITY_BENCHMARKS: Record<DailyRateTierId, TierLiquidityBenchmark> = {
  RoomSanctuary: {
    tierId: "RoomSanctuary",
    label: DAILY_RATE_PRESET_TIERS.RoomSanctuary.label,
    weeklyRateCents: 31500,
    grossDailyRateCents: 4500,
    flatMonthlyLandlordBenchmarkCents: 126000, // $1,260.00/mo (4-week flat mental model)
  },
  PrivateSuite: {
    tierId: "PrivateSuite",
    label: DAILY_RATE_PRESET_TIERS.PrivateSuite.label,
    weeklyRateCents: 52500,
    grossDailyRateCents: 7500,
    flatMonthlyLandlordBenchmarkCents: 210000, // $2,100.00/mo (4-week flat mental model)
  },
  ExecutiveTownhome: {
    tierId: "ExecutiveTownhome",
    label: DAILY_RATE_PRESET_TIERS.ExecutiveTownhome.label,
    weeklyRateCents: 74500,
    grossDailyRateCents: 10643,
    flatMonthlyLandlordBenchmarkCents: 300000, // $3,000.00/mo flat landlord benchmark in Spec 3.B
  },
};

export type CohortLiquidityShare = {
  cohortId: PurposeCohortId;
  title: string;
  audience: string;
  allocatedStays: number;
  weeklyGrossInflowCents: number;
  monthlyGrossInflowCents: number;
  monthlyGmfVaultContributionCents: number;
  monthlyPlatformFeeCents: number;
  average21DayFloatContributionCents: number;
};

export type WeeklyLiquiditySpreadResult = {
  tierId: DailyRateTierId;
  tierLabel: string;
  weeklyRateCents: number;
  grossDailyRateCents: number;
  activeStays: number;
  payoutSchedule: PayoutSchedule;
  weeksPerMonthCalendar: number;
  averageFloatHoldDays: number;

  /** Per-stay weekly micro-deduction split (75.5% / 14.3% / 10.2%). */
  perStayWeeklyGrossCents: number;
  perStayWeeklyHostCents: number;
  perStayWeeklyGmfVaultCents: number;
  perStayWeeklyPlatformFeeCents: number;

  /** Per-stay monthly calendar inflows (4.3333 wks/mo) vs flat monthly landlord payout. */
  perStayMonthlyGrossCollectionCents: number;
  perStayFlatMonthlyLandlordPayoutCents: number;
  perStayMonthlyCompoundDeltaCents: number;
  perStayScheduledHostMonthlyDisbursementCents: number;
  perStayMonthlyGmfVaultContributionCents: number;
  perStayMonthlyPlatformFeeCents: number;
  perStayAverage21DayTimingFloatCents: number;
  perStayScheduleAdjustedFloatCents: number;

  /** Portfolio totals scaled across `activeStays` (1 to 45+ stays). */
  portfolioWeeklyGrossInflowCents: number;
  portfolioWeeklyHostAccrualCents: number;
  portfolioWeeklyGmfVaultInflowCents: number;
  portfolioWeeklyPlatformFeeCents: number;

  portfolioMonthlyGrossCollectionCents: number;
  portfolioFlatMonthlyLandlordBenchmarkCents: number;
  portfolioMonthlyCompoundDeltaCents: number;
  portfolioScheduledHostMonthlyDisbursementCents: number;
  portfolioMonthlyGmfVaultContributionCents: number;
  portfolioMonthlyPlatformFeeCents: number;

  portfolioAnnualGrossCollectionCents: number;
  portfolioAnnualCompoundDeltaCents: number;
  portfolioAnnualGmfVaultContributionCents: number;
  portfolioAnnualPlatformFeeCents: number;

  /** Average 21-day timing float balance that feeds public.gmf_float_balance. */
  average21DayTimingFloatCents: number;
  scheduleAdjustedTimingFloatCents: number;
  projectedGmfFloatPoolBalanceCents: number;

  /** Executive Townhome ($745/wk) Spec 3.B spotlight delta (+$228.08/mo per stay). */
  townhomeSpec3BSpotlight: {
    weeklyCollectionCents: 74500;
    monthlyGrossCollectionCents: 322808;
    flatMonthlyLandlordPayoutCents: 300000;
    monthlyCompoundDeltaPerStayCents: 22808;
    portfolioMonthlyCompoundDeltaCents: number;
    portfolioAnnualCompoundDeltaCents: number;
  };

  /** Distribution across all 4 universal Purpose-Verified Stay cohorts. */
  cohortBreakdown: CohortLiquidityShare[];
  summaryHeadline: string;
};

export function resolveTierByWeeklyCents(weeklyRateCents: number): TierLiquidityBenchmark {
  if (weeklyRateCents === 74500) {
    return TIER_LIQUIDITY_BENCHMARKS.ExecutiveTownhome;
  }
  if (weeklyRateCents === 52500 || weeklyRateCents === 49000) {
    return TIER_LIQUIDITY_BENCHMARKS.PrivateSuite;
  }
  if (weeklyRateCents === 31500 || weeklyRateCents === 24500) {
    return TIER_LIQUIDITY_BENCHMARKS.RoomSanctuary;
  }
  const closest = DAILY_RATE_TIER_LIST.reduce((best, current) =>
    Math.abs(current.weeklyRateCents - weeklyRateCents) <
    Math.abs(best.weeklyRateCents - weeklyRateCents)
      ? current
      : best,
  );
  return TIER_LIQUIDITY_BENCHMARKS[closest.id];
}

/**
 * System Spec 3.B — Weekly Liquidity Spread Schema Engine.
 *
 * Computes weekly micro-deduction inflows across the 4.3333 weeks/month calendar,
 * bi-weekly/monthly landlord payout schedules (including the $745/wk = $3,228.08/mo
 * collection vs. $3,000.00/mo flat landlord payout compound delta of +$228.08/mo per stay),
 * the 14.3% GMF Escrow reserve contribution, 10.2% platform fee, and average 21-day
 * timing float balance that feeds `public.gmf_float_balance`.
 */
export function calculateWeeklyLiquiditySpread(options?: {
  weeklyRateCents?: number;
  tierId?: DailyRateTierId;
  activeStays?: number;
  payoutSchedule?: PayoutSchedule;
  existingGmfPoolBalanceCents?: number;
}): WeeklyLiquiditySpreadResult {
  const resolvedBenchmark = options?.tierId
    ? TIER_LIQUIDITY_BENCHMARKS[options.tierId]
    : resolveTierByWeeklyCents(options?.weeklyRateCents ?? DEFAULT_CALCULATOR_WEEKLY_CENTS);

  const safeWeeklyCents =
    typeof options?.weeklyRateCents === "number" &&
    Number.isFinite(options.weeklyRateCents) &&
    options.weeklyRateCents > 0
      ? options?.tierId
        ? clampTierWeeklyRateCents(options.tierId, options.weeklyRateCents)
        : Math.round(options.weeklyRateCents)
      : resolvedBenchmark.weeklyRateCents;

  const safeActiveStays =
    typeof options?.activeStays === "number" &&
    Number.isFinite(options.activeStays) &&
    options.activeStays >= 1
      ? Math.min(500, Math.round(options.activeStays))
      : 1;

  const payoutSchedule: PayoutSchedule =
    options?.payoutSchedule === "bi-weekly" ? "bi-weekly" : "monthly";

  const existingGmfPoolBalanceCents =
    typeof options?.existingGmfPoolBalanceCents === "number" &&
    Number.isFinite(options.existingGmfPoolBalanceCents) &&
    options.existingGmfPoolBalanceCents >= 0
      ? Math.round(options.existingGmfPoolBalanceCents)
      : DEFAULT_GMF_FLOAT_SEED_CENTS;

  const grossDailyRateCents = Math.round(safeWeeklyCents / 7);

  // Weekly micro-deduction split (75.5% Host / 14.3% GMF Vault / 10.2% Platform)
  const perStayWeeklyHostCents = Math.round((safeWeeklyCents * CALCULATOR_HOST_BPS) / 10000);
  const perStayWeeklyGmfVaultCents = Math.round((safeWeeklyCents * CALCULATOR_VAULT_BPS) / 10000);
  const perStayWeeklyPlatformFeeCents =
    safeWeeklyCents - perStayWeeklyHostCents - perStayWeeklyGmfVaultCents;

  // Monthly collection across the 4.3333 weeks/month calendar (52 / 12)
  // At $745/wk (74500 cents): Math.floor(74500 * 4.333) = 322808 cents ($3,228.08/mo) per Spec 3.B
  // At $315/wk (31500 cents): 31500 * (52/12) = 136500 cents ($1,365.00/mo gross) -> $1,030.58/mo net landlord payout (75.5%)
  const perStayMonthlyGrossCollectionCents =
    safeWeeklyCents === 74500
      ? Math.floor(safeWeeklyCents * SPEC_3B_WEEKS_PER_MONTH_FACTOR)
      : Math.round(safeWeeklyCents * WEEKS_PER_MONTH_CALENDAR);

  const perStayFlatMonthlyLandlordPayoutCents =
    safeWeeklyCents === resolvedBenchmark.weeklyRateCents
      ? resolvedBenchmark.flatMonthlyLandlordBenchmarkCents
      : safeWeeklyCents * 4;

  const perStayMonthlyCompoundDeltaCents = Math.max(
    0,
    perStayMonthlyGrossCollectionCents - perStayFlatMonthlyLandlordPayoutCents,
  );

  const perStayScheduledHostMonthlyDisbursementCents = Math.round(
    (perStayMonthlyGrossCollectionCents * CALCULATOR_HOST_BPS) / 10000,
  );
  const perStayMonthlyGmfVaultContributionCents = Math.round(
    (perStayMonthlyGrossCollectionCents * CALCULATOR_VAULT_BPS) / 10000,
  );
  const perStayMonthlyPlatformFeeCents =
    perStayMonthlyGrossCollectionCents -
    perStayScheduledHostMonthlyDisbursementCents -
    perStayMonthlyGmfVaultContributionCents;

  // Average 21-day timing float = 3 weeks of weekly tenant inflows held between collection & monthly host payout
  const perStayAverage21DayTimingFloatCents = Math.round(
    (safeWeeklyCents * AVERAGE_TIMING_FLOAT_DAYS) / 7,
  );
  const averageFloatHoldDays =
    payoutSchedule === "bi-weekly" ? BIWEEKLY_TIMING_FLOAT_DAYS : AVERAGE_TIMING_FLOAT_DAYS;
  const perStayScheduleAdjustedFloatCents = Math.round(
    (safeWeeklyCents * averageFloatHoldDays) / 7,
  );

  // Portfolio totals across activeStays
  const portfolioWeeklyGrossInflowCents = safeWeeklyCents * safeActiveStays;
  const portfolioWeeklyHostAccrualCents = perStayWeeklyHostCents * safeActiveStays;
  const portfolioWeeklyGmfVaultInflowCents = perStayWeeklyGmfVaultCents * safeActiveStays;
  const portfolioWeeklyPlatformFeeCents = perStayWeeklyPlatformFeeCents * safeActiveStays;

  const portfolioMonthlyGrossCollectionCents =
    perStayMonthlyGrossCollectionCents * safeActiveStays;
  const portfolioFlatMonthlyLandlordBenchmarkCents =
    perStayFlatMonthlyLandlordPayoutCents * safeActiveStays;
  const portfolioMonthlyCompoundDeltaCents =
    perStayMonthlyCompoundDeltaCents * safeActiveStays;
  const portfolioScheduledHostMonthlyDisbursementCents =
    perStayScheduledHostMonthlyDisbursementCents * safeActiveStays;
  const portfolioMonthlyGmfVaultContributionCents =
    perStayMonthlyGmfVaultContributionCents * safeActiveStays;
  const portfolioMonthlyPlatformFeeCents = perStayMonthlyPlatformFeeCents * safeActiveStays;

  const portfolioAnnualGrossCollectionCents = portfolioMonthlyGrossCollectionCents * MONTHS_PER_YEAR;
  const portfolioAnnualCompoundDeltaCents = portfolioMonthlyCompoundDeltaCents * MONTHS_PER_YEAR;
  const portfolioAnnualGmfVaultContributionCents =
    portfolioMonthlyGmfVaultContributionCents * MONTHS_PER_YEAR;
  const portfolioAnnualPlatformFeeCents = portfolioMonthlyPlatformFeeCents * MONTHS_PER_YEAR;

  const average21DayTimingFloatCents = perStayAverage21DayTimingFloatCents * safeActiveStays;
  const scheduleAdjustedTimingFloatCents = perStayScheduleAdjustedFloatCents * safeActiveStays;
  const projectedGmfFloatPoolBalanceCents =
    existingGmfPoolBalanceCents +
    average21DayTimingFloatCents +
    portfolioMonthlyGmfVaultContributionCents;

  // Distribute activeStays across all 4 universal Purpose-Verified Stay cohorts
  const baseCohortCount = Math.floor(safeActiveStays / PURPOSE_COHORTS.length);
  const remainderStays = safeActiveStays % PURPOSE_COHORTS.length;

  const cohortBreakdown: CohortLiquidityShare[] = PURPOSE_COHORTS.map((cohort, index) => {
    const allocatedStays = baseCohortCount + (index < remainderStays ? 1 : 0);
    return {
      cohortId: cohort.id,
      title: cohort.title,
      audience: cohort.audience,
      allocatedStays,
      weeklyGrossInflowCents: safeWeeklyCents * allocatedStays,
      monthlyGrossInflowCents: perStayMonthlyGrossCollectionCents * allocatedStays,
      monthlyGmfVaultContributionCents:
        perStayMonthlyGmfVaultContributionCents * allocatedStays,
      monthlyPlatformFeeCents: perStayMonthlyPlatformFeeCents * allocatedStays,
      average21DayFloatContributionCents:
        perStayAverage21DayTimingFloatCents * allocatedStays,
    };
  });

  const townhomeMonthlyDeltaPerStay = 22808;
  const townhomeSpec3BSpotlight = {
    weeklyCollectionCents: 74500 as const,
    monthlyGrossCollectionCents: 322808 as const,
    flatMonthlyLandlordPayoutCents: 300000 as const,
    monthlyCompoundDeltaPerStayCents: 22808 as const,
    portfolioMonthlyCompoundDeltaCents: townhomeMonthlyDeltaPerStay * safeActiveStays,
    portfolioAnnualCompoundDeltaCents:
      townhomeMonthlyDeltaPerStay * safeActiveStays * MONTHS_PER_YEAR,
  };

  const summaryHeadline = `${safeActiveStays} active stay${safeActiveStays === 1 ? "" : "s"} @ ${formatCurrencyCents(safeWeeklyCents)}/wk (${formatCurrencyCents(grossDailyRateCents)}/day) → ${formatCurrencyCents(perStayWeeklyHostCents)}/wk (${formatCurrencyCents(perStayScheduledHostMonthlyDisbursementCents)}/mo net) landlord payout · ${formatCurrencyCents(portfolioMonthlyGrossCollectionCents)}/mo gross inflow · +${formatCurrencyCents(portfolioMonthlyCompoundDeltaCents)}/mo calendar spread delta · ${formatCurrencyCents(average21DayTimingFloatCents)} 21-day timing float feeding public.gmf_float_balance`;

  return {
    tierId: resolvedBenchmark.tierId,
    tierLabel: resolvedBenchmark.label,
    weeklyRateCents: safeWeeklyCents,
    grossDailyRateCents,
    activeStays: safeActiveStays,
    payoutSchedule,
    weeksPerMonthCalendar: Number(WEEKS_PER_MONTH_CALENDAR.toFixed(4)),
    averageFloatHoldDays,

    perStayWeeklyGrossCents: safeWeeklyCents,
    perStayWeeklyHostCents,
    perStayWeeklyGmfVaultCents,
    perStayWeeklyPlatformFeeCents,

    perStayMonthlyGrossCollectionCents,
    perStayFlatMonthlyLandlordPayoutCents,
    perStayMonthlyCompoundDeltaCents,
    perStayScheduledHostMonthlyDisbursementCents,
    perStayMonthlyGmfVaultContributionCents,
    perStayMonthlyPlatformFeeCents,
    perStayAverage21DayTimingFloatCents,
    perStayScheduleAdjustedFloatCents,

    portfolioWeeklyGrossInflowCents,
    portfolioWeeklyHostAccrualCents,
    portfolioWeeklyGmfVaultInflowCents,
    portfolioWeeklyPlatformFeeCents,

    portfolioMonthlyGrossCollectionCents,
    portfolioFlatMonthlyLandlordBenchmarkCents,
    portfolioMonthlyCompoundDeltaCents,
    portfolioScheduledHostMonthlyDisbursementCents,
    portfolioMonthlyGmfVaultContributionCents,
    portfolioMonthlyPlatformFeeCents,

    portfolioAnnualGrossCollectionCents,
    portfolioAnnualCompoundDeltaCents,
    portfolioAnnualGmfVaultContributionCents,
    portfolioAnnualPlatformFeeCents,

    average21DayTimingFloatCents,
    scheduleAdjustedTimingFloatCents,
    projectedGmfFloatPoolBalanceCents,

    townhomeSpec3BSpotlight,
    cohortBreakdown,
    summaryHeadline,
  };
}
