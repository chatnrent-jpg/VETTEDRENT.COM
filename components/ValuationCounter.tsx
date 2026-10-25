"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FintechCard, FintechMetricTile } from "@/components/ui/FintechCard";
import { Progress } from "@/components/ui/progress";
import type { ValuationMilestoneSnapshot } from "@/lib/conversion-engine";
import { formatCurrencyCents } from "@/lib/marketing-calculator";

const FALLBACK_SNAPSHOT: ValuationMilestoneSnapshot = {
  activeStaysCount: 4,
  targetStaysCount: 45,
  progressPercentage: 9,
  remainingStaysToTarget: 41,
  cumulativeWeeklyGrossCents: 190000,
  cumulativeMonthlyGrossCents: 823270,
  cumulativeAnnualizedGmvCents: 9880000,
  cumulativeWeeklyHostPayoutCents: 143452,
  cumulativeWeeklyGmfVaultCents: 27172,
  cumulativeWeeklyPlatformFeeCents: 19376,
  rolling21DayGmfTimingFloatCents: 570000,
  target45StayBaseTimingFloatCents: 4252500,
  liveGmfPoolBalanceCents: 1500000,
  combinedTreasuryFloatCents: 2070000,
  estimatedPlatformValuationCents: 8888889,
  targetValuationCents: 100000000,
  universalFloorPricing: {
    tierId: "RoomSanctuary",
    weeklyRateCents: 31500,
    grossDailyRateCents: 4500,
    dailyGmfVaultCreditCents: 644,
    netEffectiveDailyRateCents: 3856,
    weeklyHostPayoutCents: 23783,
    monthlyHostNetPayoutCents: 103058,
    savingsVs277NightlyPercent: 84,
    benchmark45Stays21DayTimingFloatCents: 4252500,
  },
  coBranding: "VettedRent.com · Powered by Vettilo™",
  cohortDistribution: {
    "Contract-Assignment": 1,
    "Academic-Enrollment": 1,
    "Seasonal-Remote": 1,
    "Insurance-Relocation": 1,
  },
  tierDistribution: {
    RoomSanctuary: 2,
    PrivateSuite: 1,
    ExecutiveTownhome: 1,
  },
  recentLicenses: [],
  storageSource: "seeded_memory_ledger",
};

export function ValuationCounter({
  variant = "full",
}: {
  variant?: "compact" | "full";
}) {
  const [snapshot, setSnapshot] =
    useState<ValuationMilestoneSnapshot>(FALLBACK_SNAPSHOT);
  const [loading, setLoading] = useState<boolean>(false);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversion/activate-stay", {
        cache: "no-store",
      });
      if (!res.ok) {
        return;
      }
      const body: unknown = await res.json();
      if (body && typeof body === "object") {
        const milestone = (body as { milestone?: ValuationMilestoneSnapshot })
          .milestone;
        if (milestone && typeof milestone.activeStaysCount === "number") {
          setSnapshot(milestone);
        }
      }
    } catch {
      // Keep fallback snapshot on transient network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
    function handleStayActivated(event: Event) {
      const custom = event as CustomEvent<{
        milestone?: ValuationMilestoneSnapshot;
      }>;
      if (
        custom.detail?.milestone &&
        typeof custom.detail.milestone.activeStaysCount === "number"
      ) {
        setSnapshot(custom.detail.milestone);
      } else {
        void loadSnapshot();
      }
    }
    window.addEventListener("vettedrent:stay-activated", handleStayActivated);
    return () => {
      window.removeEventListener(
        "vettedrent:stay-activated",
        handleStayActivated,
      );
    };
  }, [loadSnapshot]);

  if (variant === "compact") {
    return (
      <FintechCard
        as="div"
        variant="gold"
        className="vr-valuation-compact"
      >
        <div
          className="vr-valuation-compact__top"
          aria-label="45-Stay $1M Valuation Live Tracker"
        >
          <div className="vr-valuation-compact__title">
            <span className="fintech-live-dot" aria-hidden="true" />
            <strong>
              {snapshot.activeStaysCount} / {snapshot.targetStaysCount} Active
              Underwritten Stays
            </strong>
            <span>
              ({snapshot.progressPercentage}% toward $1.00M Valuation · VettedRent.com · Powered by
              Vettilo™)
            </span>
          </div>
          <div className="vr-valuation-compact__metrics">
            <span>
              Floor:{" "}
              <strong>
                $315/wk ($45.00/day · $38.56/day net)
              </strong>
            </span>
            <span>·</span>
            <span>
              Weekly Gross:{" "}
              <strong>
                {formatCurrencyCents(snapshot.cumulativeWeeklyGrossCents)}/wk
              </strong>
            </span>
            <span>·</span>
            <span>
              45-Stay 21d Float:{" "}
              <strong>
                {formatCurrencyCents(
                  snapshot.target45StayBaseTimingFloatCents ?? 4252500,
                )}
              </strong>
            </span>
          </div>
        </div>
        <Progress
          value={snapshot.progressPercentage}
          aria-label={`45-Stay Milestone Progress: ${snapshot.activeStaysCount} of ${snapshot.targetStaysCount} active stays`}
        />
      </FintechCard>
    );
  }

  return (
    <FintechCard
      id="valuation-counter"
      variant="gold"
      kicker="VettedRent.com · Powered by Vettilo™ (vettilo.com UMI Engine)"
      title="45-Stay ($1M Valuation) Live Underwritten Stay Tracker"
      badge={`${snapshot.activeStaysCount} / ${snapshot.targetStaysCount} Active Stays (${snapshot.progressPercentage}%)`}
      badgeTone="active"
    >
      <div className="vault-progress">
        <Progress
          value={snapshot.progressPercentage}
          aria-label={`$1M Valuation Milestone: ${snapshot.activeStaysCount} of ${snapshot.targetStaysCount} active stays`}
        />
        <div className="row" style={{ marginTop: "0.35rem", flexWrap: "wrap" }}>
          <span className="vault-label">
            <strong>{snapshot.activeStaysCount}</strong> active underwritten
            stays live across all 4 Purpose-Verified cohorts (
            <strong>{snapshot.remainingStaysToTarget}</strong> stays remaining to{" "}
            <strong>45-Stay / $1,000,000.00 Valuation</strong> target ·{" "}
            <strong>$42,525.00</strong> 21-day timing float across 45 base-tier
            stays @ $315/wk).
          </span>
          <button
            type="button"
            className="vr-cal-btn"
            disabled={loading}
            onClick={() => void loadSnapshot()}
          >
            {loading ? "Syncing..." : "Refresh Live Count"}
          </button>
        </div>
      </div>

      <div
        className="simple-three-stats"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(12.5rem, 1fr))" }}
      >
        <FintechMetricTile
          tone="gold"
          label="Active Underwritten Stays"
          badge={`${snapshot.progressPercentage}% of 45`}
          value={`${snapshot.activeStaysCount} / ${snapshot.targetStaysCount}`}
          subvalue={`Implied Valuation: ${formatCurrencyCents(snapshot.estimatedPlatformValuationCents)}`}
        />
        <FintechMetricTile
          tone="emerald"
          label="Cumulative Weekly Gross"
          badge="$315/wk Floor"
          value={`${formatCurrencyCents(snapshot.cumulativeWeeklyGrossCents)}/wk`}
          subvalue={`${formatCurrencyCents(snapshot.cumulativeAnnualizedGmvCents)}/yr annualized GMV`}
        />
        <FintechMetricTile
          tone="gold"
          label="Rolling 21-Day GMF Float"
          badge="$42,525 @ 45 Stays"
          value={formatCurrencyCents(snapshot.rolling21DayGmfTimingFloatCents)}
          subvalue={`+${formatCurrencyCents(snapshot.cumulativeWeeklyGmfVaultCents)}/wk 14.3% GMF Vault`}
        />
        <FintechMetricTile
          tone="emerald"
          label="Combined Treasury Capacity"
          badge="GMF Pool + Float"
          value={formatCurrencyCents(snapshot.combinedTreasuryFloatCents)}
          subvalue={`75.5% Host Payouts: ${formatCurrencyCents(snapshot.cumulativeWeeklyHostPayoutCents)}/wk ($237.83/wk base)`}
        />
      </div>

      {snapshot.recentLicenses.length > 0 ? (
        <div className="stack" style={{ marginTop: "0.25rem", gap: "0.45rem" }}>
          <p className="pass-kicker">
            Recently Activated Commercial Licenses (7–90 Day Stays)
          </p>
          <div className="actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
            {snapshot.recentLicenses.slice(0, 4).map((lic) => (
              <span
                key={lic.agreement_id}
                className="stay-badge"
                data-status="active"
              >
                {lic.cohort} · {lic.jurisdiction} · {lic.stay_days}d (
                {formatCurrencyCents(lic.daily_rate_cents)}/day) ·{" "}
                {lic.license_token.slice(0, 16)}…
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="actions" style={{ marginTop: "0.25rem", flexWrap: "wrap" }}>
        <Link className="button" href="/underwriting">
          Activate Another 7–90 Day Stay →
        </Link>
      </div>
    </FintechCard>
  );
}
