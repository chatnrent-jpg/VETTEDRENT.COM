"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DAILY_RATE_TIER_LIST,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import {
  BENCHMARK_45_STAYS,
  DEFAULT_GMF_FLOAT_SEED_CENTS,
  calculateWeeklyLiquiditySpread,
  type PayoutSchedule,
} from "@/lib/liquidity-spread";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { resolvePurposeCohort } from "@/lib/underwriting-contract";

export function WeeklyLiquiditySpreadPanel({
  defaultTierId = "ExecutiveTownhome",
  defaultActiveStays = BENCHMARK_45_STAYS,
}: {
  defaultTierId?: DailyRateTierId;
  defaultActiveStays?: number;
}) {
  const [tierId, setTierId] = useState<DailyRateTierId>(defaultTierId);
  const [activeStays, setActiveStays] = useState<number>(defaultActiveStays);
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule>("monthly");
  const [gmfPoolBalanceCents, setGmfPoolBalanceCents] = useState<number>(
    DEFAULT_GMF_FLOAT_SEED_CENTS,
  );
  const [poolSource, setPoolSource] = useState<string>("public.gmf_float_balance");

  useEffect(() => {
    let cancelled = false;
    async function fetchPoolSnapshot() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          return;
        }
        const res = await fetch(
          `/api/billing/liquidity-spread?tier=${encodeURIComponent(tierId)}&stays=${activeStays}&schedule=${payoutSchedule}`,
          {
            cache: "no-store",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!res.ok) {
          return;
        }
        const body: unknown = await res.json();
        if (!cancelled && body && typeof body === "object") {
          const pool = (body as { gmfFloatPool?: unknown }).gmfFloatPool;
          if (pool && typeof pool === "object") {
            const record = pool as Record<string, unknown>;
            if (typeof record.availableBalanceCents === "number") {
              setGmfPoolBalanceCents(record.availableBalanceCents);
            }
            if (typeof record.source === "string") {
              setPoolSource(record.source);
            }
          }
        }
      } catch {
        // Keep seeded fallback on transient network error
      }
    }
    void fetchPoolSnapshot();
    return () => {
      cancelled = true;
    };
  }, [tierId, activeStays, payoutSchedule]);

  const spread = calculateWeeklyLiquiditySpread({
    tierId,
    activeStays,
    payoutSchedule,
    existingGmfPoolBalanceCents: gmfPoolBalanceCents,
  });

  const singleStaySpread = calculateWeeklyLiquiditySpread({
    tierId,
    activeStays: 1,
    payoutSchedule,
    existingGmfPoolBalanceCents: gmfPoolBalanceCents,
  });

  return (
    <article className="panel stay-card" id="weekly-liquidity-spread">
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">
            System Spec 3.B · Weekly Liquidity Spread &amp; GMF Treasury Float Engine
          </p>
          <h2>Weekly Micro-Deduction Inflows vs. Scheduled Host Disbursements</h2>
        </div>
        <span className="stay-badge" data-status="active">
          +{formatCurrencyCents(spread.portfolioMonthlyCompoundDeltaCents)}/mo Calendar Spread
        </span>
      </div>

      <p className="note">
        <strong>Be Great to Yourself.</strong> VettedRent collects tenant payments weekly across the{" "}
        <strong>4.3333 weeks/month calendar (52 / 12)</strong> on Days 1, 8, 15, 22, and 29 while
        disbursing landlord payouts on a scheduled bi-weekly or monthly cadence. On the{" "}
        <strong>$745.00/wk ($106.43/day) Executive/Family Townhome tier</strong>, weekly collections
        yield <strong>$3,228.08/mo</strong> against a <strong>$3,000.00/mo</strong> flat landlord
        benchmark—generating a <strong>+$228.08/mo per stay</strong> compound delta alongside the
        14.3% GMF Escrow reserve, 10.2% platform fee, and an average{" "}
        <strong>21-day timing float</strong> feeding <code>public.gmf_float_balance</code>.
      </p>

      <div
        className="toggle"
        role="group"
        aria-label="Select lodging tier for Weekly Liquidity Spread"
        style={{ flexWrap: "wrap" }}
      >
        {DAILY_RATE_TIER_LIST.map((tier) => (
          <button
            key={tier.id}
            type="button"
            aria-pressed={tierId === tier.id}
            onClick={() => setTierId(tier.id)}
          >
            {tier.label}
          </button>
        ))}
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
        <div className="actions" style={{ flexWrap: "wrap" }}>
          {[1, 10, 25, 45].map((count) => (
            <button
              key={count}
              type="button"
              className={activeStays === count ? "button" : "button button-secondary"}
              onClick={() => setActiveStays(count)}
            >
              {count === 45 ? "45 Stays ($1M Valuation)" : `${count} Stay${count === 1 ? "" : "s"}`}
            </button>
          ))}
        </div>

        <div className="actions" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className={payoutSchedule === "monthly" ? "button" : "button button-secondary"}
            onClick={() => setPayoutSchedule("monthly")}
          >
            Monthly Host Payout (21d Avg Float)
          </button>
          <button
            type="button"
            className={payoutSchedule === "bi-weekly" ? "button" : "button button-secondary"}
            onClick={() => setPayoutSchedule("bi-weekly")}
          >
            Bi-Weekly Host Payout (10.5d Avg Float)
          </button>
        </div>
      </div>

      <label className="field">
        <span>
          Active Stays Scaled Across 4 Universal Cohorts: <strong>{spread.activeStays} Stays</strong>
        </span>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={activeStays}
          onChange={(event) => setActiveStays(Number(event.target.value) || 1)}
        />
      </label>

      <div className="stack">
        <div className="row">
          <span>
            Single-Stay Weekly Split ({formatCurrencyCents(singleStaySpread.weeklyRateCents)}/wk ={" "}
            {formatCurrencyCents(singleStaySpread.grossDailyRateCents)}/day)
          </span>
          <strong>
            Host 75.5%: {formatCurrencyCents(singleStaySpread.perStayWeeklyHostCents)} · GMF 14.3%:{" "}
            {formatCurrencyCents(singleStaySpread.perStayWeeklyGmfVaultCents)} · Platform 10.2%:{" "}
            {formatCurrencyCents(singleStaySpread.perStayWeeklyPlatformFeeCents)}
          </strong>
        </div>

        <div className="row">
          <span>
            Single-Stay Monthly Collection (4.3333 wks/mo) vs. Flat Monthly Landlord Benchmark
          </span>
          <strong>
            {formatCurrencyCents(singleStaySpread.perStayMonthlyGrossCollectionCents)}/mo vs.{" "}
            {formatCurrencyCents(singleStaySpread.perStayFlatMonthlyLandlordPayoutCents)}/mo (
            +{formatCurrencyCents(singleStaySpread.perStayMonthlyCompoundDeltaCents)}/mo delta)
          </strong>
        </div>

        <div className="row">
          <span>
            Spec 3.B Townhome Spotlight ($745/wk = $106.43/day → $3,228.08/mo vs. $3,000.00/mo)
          </span>
          <span className="chip">
            +$228.08/mo per stay · +
            {formatCurrencyCents(
              spread.townhomeSpec3BSpotlight.portfolioMonthlyCompoundDeltaCents,
            )}
            /mo across {spread.activeStays} stays
          </span>
        </div>

        <div className="row">
          <span>
            Portfolio Monthly Gross Collection ({spread.activeStays} stays × 4.3333 wks/mo)
          </span>
          <strong>{formatCurrencyCents(spread.portfolioMonthlyGrossCollectionCents)} / mo</strong>
        </div>

        <div className="row">
          <span>
            Scheduled {spread.payoutSchedule === "monthly" ? "Monthly" : "Bi-Weekly"} Host
            Disbursement Pool (75.5%)
          </span>
          <strong>
            {formatCurrencyCents(spread.portfolioScheduledHostMonthlyDisbursementCents)} / mo
          </strong>
        </div>

        <div className="row">
          <span>14.3% GMF Escrow Reserve Contribution ({spread.activeStays} stays)</span>
          <strong>
            {formatCurrencyCents(spread.portfolioMonthlyGmfVaultContributionCents)} / mo (
            {formatCurrencyCents(spread.portfolioAnnualGmfVaultContributionCents)} / yr)
          </strong>
        </div>

        <div className="row">
          <span>10.2% Net Platform Treasury Fee ({spread.activeStays} stays)</span>
          <strong>
            {formatCurrencyCents(spread.portfolioMonthlyPlatformFeeCents)} / mo (
            {formatCurrencyCents(spread.portfolioAnnualPlatformFeeCents)} / yr)
          </strong>
        </div>

        <div className="row">
          <span>
            Average 21-Day Timing Float Balance Feeding <code>public.gmf_float_balance</code>
          </span>
          <span className="stay-badge" data-status="active">
            {formatCurrencyCents(spread.average21DayTimingFloatCents)} float (Schedule-adjusted{" "}
            {spread.averageFloatHoldDays}d:{" "}
            {formatCurrencyCents(spread.scheduleAdjustedTimingFloatCents)})
          </span>
        </div>

        <div className="row">
          <span>
            Projected <code>public.gmf_float_balance</code> Treasury Capacity (Seed + 21d Float +
            Monthly GMF Inflow)
          </span>
          <strong>
            {formatCurrencyCents(spread.projectedGmfFloatPoolBalanceCents)} ({poolSource})
          </strong>
        </div>
      </div>

      <div>
        <p className="pass-kicker">
          4-Cohort Liquidity Allocation ({spread.activeStays} Active Stays @{" "}
          {formatCurrencyCents(spread.grossDailyRateCents)}/Day)
        </p>
        <div className="pipeline-table-wrap" style={{ marginTop: "0.5rem" }}>
          <table className="pipeline-table">
            <thead>
              <tr>
                <th>Universal Cohort</th>
                <th>Stays</th>
                <th>Monthly Collection</th>
                <th>14.3% GMF Reserve</th>
                <th>21-Day Timing Float</th>
                <th>Deep-Link Underwriting</th>
              </tr>
            </thead>
            <tbody>
              {spread.cohortBreakdown.map((item) => {
                const cohortRule = resolvePurposeCohort(item.cohortId);
                const deepLink = `/underwriting?weeklyCents=${spread.weeklyRateCents}&days=${cohortRule.defaultStayDays}&cohort=${encodeURIComponent(item.cohortId)}&jurisdiction=MD-PG`;
                return (
                  <tr key={item.cohortId}>
                    <td>
                      <strong>{item.title}</strong>
                      <br />
                      <span className="note">{item.audience}</span>
                    </td>
                    <td>
                      <strong>{item.allocatedStays}</strong>
                    </td>
                    <td>{formatCurrencyCents(item.monthlyGrossInflowCents)}/mo</td>
                    <td>+{formatCurrencyCents(item.monthlyGmfVaultContributionCents)}/mo</td>
                    <td>{formatCurrencyCents(item.average21DayFloatContributionCents)}</td>
                    <td>
                      <Link className="button button-secondary" href={deepLink}>
                        Lock In {formatCurrencyCents(spread.grossDailyRateCents)}/Day →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}
