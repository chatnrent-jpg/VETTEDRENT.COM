"use client";

import { useState } from "react";
import { JURISDICTION_RULES } from "@/lib/compliance/jurisdictions";
import {
  calculateJurisdictionYield,
  DEFAULT_CALCULATOR_STAY_DAYS,
  DEFAULT_CALCULATOR_WEEKLY_CENTS,
  formatCurrencyCents,
} from "@/lib/marketing-calculator";

export function LandlordYieldCalculator({
  initialJurisdictionCode,
  initialWeeklyDollars = DEFAULT_CALCULATOR_WEEKLY_CENTS / 100,
  initialStayDays = DEFAULT_CALCULATOR_STAY_DAYS,
  allowJurisdictionSwitch = true,
}: {
  initialJurisdictionCode: string;
  initialWeeklyDollars?: number;
  initialStayDays?: number;
  allowJurisdictionSwitch?: boolean;
}) {
  const [jurisdictionCode, setJurisdictionCode] = useState(initialJurisdictionCode);
  const [weeklyDollarsInput, setWeeklyDollarsInput] = useState(String(initialWeeklyDollars));
  const [stayDaysInput, setStayDaysInput] = useState(String(initialStayDays));

  const parsedDollars = Number(weeklyDollarsInput);
  const weeklyRateCents =
    Number.isFinite(parsedDollars) && parsedDollars >= 50 && parsedDollars <= 5000
      ? Math.round(parsedDollars * 100)
      : DEFAULT_CALCULATOR_WEEKLY_CENTS;

  const parsedDays = Number(stayDaysInput);
  const intendedStayDays =
    Number.isFinite(parsedDays) && parsedDays >= 7 && parsedDays <= 365
      ? Math.round(parsedDays)
      : DEFAULT_CALCULATOR_STAY_DAYS;

  const breakdown = calculateJurisdictionYield(
    jurisdictionCode,
    weeklyRateCents,
    intendedStayDays,
  );

  return (
    <article className="panel stay-card">
      <div className="stay-card-head">
        <div>
          <p className="pass-kicker">Read-Only Simulation · No Live Listing Mutation</p>
          <h2>Landlord Statutory Risk &amp; GMF Yield Calculator</h2>
        </div>
        <span
          className="stay-badge"
          data-status={
            breakdown.allowed
              ? "active"
              : breakdown.jurisdiction.judicialRiskTier === "restricted"
                ? "terminated"
                : "warning"
          }
        >
          {breakdown.allowed ? "Rollover Protected" : "Guardrail Blocked"}
        </span>
      </div>

      <p className="note">
        Model weekly host payouts (75.5%), the 14.3% Guaranteed Maintenance Fund (GMF) escrow
        reserve, and statutory transient limits for {breakdown.jurisdiction.name} without altering
        any live listing state.
      </p>

      <div className="stack">
        {allowJurisdictionSwitch ? (
          <label className="field">
            <span>Jurisdiction ruleset</span>
            <select
              value={jurisdictionCode}
              onChange={(event) => setJurisdictionCode(event.target.value)}
            >
              {JURISDICTION_RULES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.name} ({rule.code}) — {rule.maxTransientDays}d max
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span>Weekly room rate (USD)</span>
          <input
            type="number"
            min={50}
            max={5000}
            step={5}
            value={weeklyDollarsInput}
            onChange={(event) => setWeeklyDollarsInput(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Intended contract stay length (days)</span>
          <input
            type="number"
            min={7}
            max={365}
            step={1}
            value={stayDaysInput}
            onChange={(event) => setStayDaysInput(event.target.value)}
          />
        </label>
      </div>

      <div className="stack">
        <div className="row">
          <span>Weekly gross charge</span>
          <strong>{formatCurrencyCents(breakdown.weeklyRateCents)} / week</strong>
        </div>
        <div className="row">
          <span>Host net payout (75.5%)</span>
          <strong>{formatCurrencyCents(breakdown.hostWeeklyCents)} / week</strong>
        </div>
        <div className="row">
          <span>GMF escrow reserve (14.3%)</span>
          <strong>{formatCurrencyCents(breakdown.vaultWeeklyCents)} / week</strong>
        </div>
        <div className="row">
          <span>Platform compliance &amp; lock rail (10.2%)</span>
          <strong>{formatCurrencyCents(breakdown.platformWeeklyCents)} / week</strong>
        </div>
        <div className="row">
          <span>Projected host payout ({breakdown.estimatedWeeks} wks)</span>
          <span className="chip">{formatCurrencyCents(breakdown.hostTotalCents)}</span>
        </div>
        <div className="row">
          <span>Projected GMF escrow protection ({breakdown.estimatedWeeks} wks)</span>
          <strong>{formatCurrencyCents(breakdown.vaultTotalCents)}</strong>
        </div>
        <div className="row">
          <span>Statutory ceiling check</span>
          <strong>
            {breakdown.intendedStayDays} / {breakdown.jurisdiction.maxTransientDays} days (
            {breakdown.jurisdiction.judicialRiskTier.toUpperCase()})
          </strong>
        </div>
      </div>

      <p className="payload">{breakdown.statusLabel}</p>
      {breakdown.blockReason ? <p className="error">{breakdown.blockReason}</p> : null}
    </article>
  );
}
