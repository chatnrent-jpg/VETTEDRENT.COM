"use client";

import { Progress } from "@/components/ui/progress";
import { useLodgerPass } from "@/hooks/useLodgerPass";

const DEFAULT_SAVINGS_GOAL_CENTS = 150000;

interface LodgerPassWidgetProps {
  tenantId: string;
  savingsGoalCents?: number;
}

export function LodgerPassWidget({ tenantId, savingsGoalCents }: LodgerPassWidgetProps) {
  const { passData, isLoading, error } = useLodgerPass(tenantId);

  if (isLoading) {
    return (
      <article className="panel pass-widget" aria-busy="true">
        <p className="note">Checking your pass.</p>
      </article>
    );
  }

  if (error) {
    return (
      <article className="panel">
        <h2>Pass synchronization error</h2>
        <p className="error" role="alert">
          {error}
        </p>
      </article>
    );
  }

  if (!passData || !passData.hasActiveStay) {
    return (
      <article className="panel">
        <h2>No active lodging stay</h2>
        <p className="note">
          When a corporate placement or reservation activates, your digital entry pass will update
          here.
        </p>
      </article>
    );
  }

  const savedCents = passData.vaultBalanceCents;
  const goalCents = resolveGoalCents(savingsGoalCents, passData.savingsGoalCents);
  const savingsPercentage = percentFromCents(savedCents, goalCents);
  const needsAction = passData.paymentStatus === "delinquent" || passData.riskLevel === "critical";

  return (
    <article className={needsAction ? "panel pass-widget pass-widget-alert" : "panel pass-widget"}>
      <div className="row">
        <div>
          <p className="pass-kicker">Verified rental pass</p>
          <h2>Agreement access details</h2>
        </div>
        <span className="chip">{needsAction ? "Action required" : "Verified secure"}</span>
      </div>

      <div className="panel">
        <p className="pass-kicker">Door code id</p>
        <p className="pass-code">{passData.seamAccessCodeId ?? "Provisioning digital keyway..."}</p>
        {needsAction ? (
          <p className="pass-warning">
            Automated risk protocol is active. Access is scheduled to end unless the outstanding
            balance is settled.
          </p>
        ) : null}
      </div>

      <div>
        <div className="row">
          <div>
            <p className="pass-kicker">Guaranteed fund escrow</p>
            <p className="pass-amount">{formatCents(savedCents)}</p>
          </div>
          <p className="note">
            Goal: {formatCents(goalCents)} ({savingsPercentage}%)
          </p>
        </div>
        <Progress value={savingsPercentage} aria-label="Guaranteed fund escrow progress" />
        <p className="note">
          This escrow is tracked in cents and builds from the weekly stay charge.
        </p>
      </div>
    </article>
  );
}

function resolveGoalCents(override: number | undefined, fromPass: number | null): number {
  if (override !== undefined && Number.isSafeInteger(override) && override > 0) {
    return override;
  }
  if (fromPass !== null && Number.isSafeInteger(fromPass) && fromPass > 0) {
    return fromPass;
  }
  return DEFAULT_SAVINGS_GOAL_CENTS;
}

function percentFromCents(savedCents: number, goalCents: number): number {
  if (!Number.isSafeInteger(savedCents) || savedCents <= 0) {
    return 0;
  }
  if (!Number.isSafeInteger(goalCents) || goalCents <= 0) {
    return 0;
  }
  if (savedCents >= goalCents) {
    return 100;
  }
  if (!Number.isSafeInteger(savedCents * 100)) {
    return 0;
  }
  return Math.round((savedCents * 100) / goalCents);
}

function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${String(remainder).padStart(2, "0")}`;
}
