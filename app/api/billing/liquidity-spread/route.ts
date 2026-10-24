import { NextResponse } from "next/server";
import type { DailyRateTierId } from "@/lib/daily-rate-comparison";
import {
  BENCHMARK_45_STAYS,
  DEFAULT_GMF_FLOAT_SEED_CENTS,
  calculateWeeklyLiquiditySpread,
  type PayoutSchedule,
} from "@/lib/liquidity-spread";
import { getSupabaseServerClient } from "@/lib/supabase";
import { PURPOSE_COHORT_IDS } from "@/lib/underwriting-contract";

type GmfPoolSnapshot = {
  poolId: string;
  availableBalanceCents: number;
  reservedBackstopCents: number;
  totalRoutedCents: number;
  source: "public.gmf_float_balance" | "seeded_fallback";
};

function parseTierId(value: string | null): DailyRateTierId | undefined {
  if (
    value === "RoomSanctuary" ||
    value === "PrivateSuite" ||
    value === "ExecutiveTownhome"
  ) {
    return value;
  }
  return undefined;
}

function parsePayoutSchedule(value: string | null): PayoutSchedule {
  if (value === "bi-weekly") {
    return "bi-weekly";
  }
  return "monthly";
}

async function readGmfFloatPoolSnapshot(): Promise<GmfPoolSnapshot> {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("gmf_float_balance")
      .select("pool_id, available_balance_cents, reserved_backstop_cents, total_routed_cents")
      .eq("pool_id", "primary_gmf_pool")
      .maybeSingle();

    if (!error && data && typeof data === "object") {
      const row = data as Record<string, unknown>;
      const available =
        typeof row.available_balance_cents === "number" &&
        Number.isFinite(row.available_balance_cents)
          ? Math.round(row.available_balance_cents)
          : DEFAULT_GMF_FLOAT_SEED_CENTS;
      const reserved =
        typeof row.reserved_backstop_cents === "number" &&
        Number.isFinite(row.reserved_backstop_cents)
          ? Math.round(row.reserved_backstop_cents)
          : 0;
      const routed =
        typeof row.total_routed_cents === "number" &&
        Number.isFinite(row.total_routed_cents)
          ? Math.round(row.total_routed_cents)
          : 0;

      return {
        poolId: typeof row.pool_id === "string" ? row.pool_id : "primary_gmf_pool",
        availableBalanceCents: available,
        reservedBackstopCents: reserved,
        totalRoutedCents: routed,
        source: "public.gmf_float_balance",
      };
    }
  } catch {
    // Graceful fallback when Supabase or public.gmf_float_balance is unavailable
  }

  return {
    poolId: "primary_gmf_pool",
    availableBalanceCents: DEFAULT_GMF_FLOAT_SEED_CENTS,
    reservedBackstopCents: 0,
    totalRoutedCents: 0,
    source: "seeded_fallback",
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const tierId = parseTierId(url.searchParams.get("tier"));
    const rawWeeklyCents = Number(url.searchParams.get("weeklyCents"));
    const weeklyRateCents =
      Number.isFinite(rawWeeklyCents) && rawWeeklyCents >= 5000 && rawWeeklyCents <= 500000
        ? Math.round(rawWeeklyCents)
        : undefined;
    const rawStays = Number(url.searchParams.get("stays"));
    const activeStays =
      Number.isFinite(rawStays) && rawStays >= 1 && rawStays <= 500
        ? Math.round(rawStays)
        : 1;
    const payoutSchedule = parsePayoutSchedule(url.searchParams.get("schedule"));

    const gmfFloatPool = await readGmfFloatPoolSnapshot();

    const requested = calculateWeeklyLiquiditySpread({
      tierId,
      weeklyRateCents,
      activeStays,
      payoutSchedule,
      existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
    });

    const singleStay = calculateWeeklyLiquiditySpread({
      tierId,
      weeklyRateCents,
      activeStays: 1,
      payoutSchedule,
      existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
    });

    const benchmark45Stays = calculateWeeklyLiquiditySpread({
      tierId,
      weeklyRateCents,
      activeStays: BENCHMARK_45_STAYS,
      payoutSchedule,
      existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
    });

    const tiers = {
      RoomSanctuary: {
        singleStay: calculateWeeklyLiquiditySpread({
          tierId: "RoomSanctuary",
          activeStays: 1,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
        benchmark45Stays: calculateWeeklyLiquiditySpread({
          tierId: "RoomSanctuary",
          activeStays: BENCHMARK_45_STAYS,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
      },
      PrivateSuite: {
        singleStay: calculateWeeklyLiquiditySpread({
          tierId: "PrivateSuite",
          activeStays: 1,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
        benchmark45Stays: calculateWeeklyLiquiditySpread({
          tierId: "PrivateSuite",
          activeStays: BENCHMARK_45_STAYS,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
      },
      ExecutiveTownhome: {
        singleStay: calculateWeeklyLiquiditySpread({
          tierId: "ExecutiveTownhome",
          activeStays: 1,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
        benchmark45Stays: calculateWeeklyLiquiditySpread({
          tierId: "ExecutiveTownhome",
          activeStays: BENCHMARK_45_STAYS,
          payoutSchedule,
          existingGmfPoolBalanceCents: gmfFloatPool.availableBalanceCents,
        }),
      },
    };

    return NextResponse.json({
      ok: true,
      spec: "System Spec 3.B — Weekly Liquidity Spread Schema Engine",
      motto: "Be Great to Yourself.",
      gmfFloatPool,
      universalCohorts: PURPOSE_COHORT_IDS,
      requested,
      singleStay,
      benchmark45Stays,
      tiers,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not compute weekly liquidity spread" },
      { status: 500 },
    );
  }
}
