"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DisplayStayStatus } from "@/lib/stay-status";

type Stay = {
  agreementId: string;
  tenantId: string;
  lodgerName: string;
  status: DisplayStayStatus;
  underwrittenTenancyDays: number;
  landlordRiskExposureCents: number;
  vaultBalanceCents: number;
  delinquentWeeklyCents: number;
};

type StayView = { kind: "loading" } | { kind: "empty" } | { kind: "error" } | { kind: "ready"; stay: Stay };

const STATUS_LABEL: Record<DisplayStayStatus, string> = {
  active: "Active",
  warning: "Warning",
  terminated: "Terminated",
};

type StayAction = "bounce" | "terminate" | "reset";

export function ActiveStayCard() {
  const [view, setView] = useState<StayView>({ kind: "loading" });
  const [pending, setPending] = useState<StayAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadStay().then((next) => {
      if (!cancelled) {
        setView(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runStayAction(action: StayAction) {
    if (view.kind !== "ready" || pending) {
      return;
    }
    if (action === "bounce" && view.stay.status !== "active") {
      return;
    }
    if (action === "terminate" && view.stay.status !== "warning") {
      return;
    }
    if (action === "reset" && view.stay.status === "active") {
      return;
    }
    setPending(action);
    setError(null);
    try {
      const next = await postStayAction(view.stay.agreementId, action);
      const reloaded = await loadStay();
      if (reloaded.kind === "ready") {
        setView(reloaded);
      } else {
        setView({ kind: "ready", stay: { ...view.stay, status: next } });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the stay.");
    } finally {
      setPending(null);
    }
  }

  if (view.kind === "loading") {
    return (
      <article className="panel">
        <h2>Current lodger stay</h2>
        <p className="note">Checking the stay.</p>
      </article>
    );
  }

  if (view.kind === "error") {
    return (
      <article className="panel">
        <h2>Current lodger stay</h2>
        <p className="error" role="alert">
          Could not load the stay.
        </p>
      </article>
    );
  }

  if (view.kind === "empty") {
    return (
      <article className="panel">
        <h2>Current lodger stay</h2>
        <p className="note">No lodger stay is ready to scan.</p>
      </article>
    );
  }

  const stay = view.stay;
  return (
    <article className="panel stay-card">
      <div className="stay-card-head">
        <div>
          <p className="note">Current lodger stay</p>
          <h2>{stay.lodgerName}</h2>
        </div>
        <span className="stay-badge" data-status={stay.status}>
          {STATUS_LABEL[stay.status]}
        </span>
      </div>
      <div className="row">
        <span>Underwritten Tenancy Days</span>
        <strong>{stay.underwrittenTenancyDays} days</strong>
      </div>
      <p className="note">{riskExposureLabel(stay)}</p>
      <div className="agreement-qr">
        <p>Agreement code</p>
        <QRCodeSVG
          value={JSON.stringify({ tenant_id: stay.tenantId, agreement_id: stay.agreementId })}
          size={220}
          bgColor="#ffffff"
          fgColor="#14181f"
          level="M"
          marginSize={4}
          title="Agreement code"
        />
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {stay.status === "active" ? (
        <button
          className="button"
          type="button"
          onClick={() => void runStayAction("bounce")}
          disabled={pending !== null}
        >
          {pending === "bounce" ? "Simulating" : "Simulate bounced weekly payment"}
        </button>
      ) : null}
      {stay.status === "warning" ? (
        <button
          className="button"
          type="button"
          onClick={() => void runStayAction("terminate")}
          disabled={pending !== null}
        >
          {pending === "terminate" ? "Terminating" : "Terminate stay"}
        </button>
      ) : null}
      {stay.status === "warning" || stay.status === "terminated" ? (
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void runStayAction("reset")}
          disabled={pending !== null}
        >
          {pending === "reset" ? "Resetting" : "Reset stay to Active"}
        </button>
      ) : null}
    </article>
  );
}

async function loadStay(): Promise<StayView> {
  try {
    const response = await fetch("/api/host/stay", {
      method: "GET",
      credentials: "same-origin",
      headers: await authHeader(),
    });
    if (!response.ok) {
      return { kind: "error" };
    }
    const body: unknown = await response.json();
    return stayFromBody(body);
  } catch {
    return { kind: "error" };
  }
}

async function postStayAction(
  agreementId: string,
  action: StayAction,
): Promise<DisplayStayStatus> {
  const response = await fetch("/api/host/stay", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...(await authHeader()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agreementId, action }),
  });
  if (!response.ok) {
    throw new Error(await stayErrorMessage(response, action));
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") {
    throw new Error(fallbackStayError(action));
  }
  const status = (body as { status?: unknown }).status;
  if (status !== "active" && status !== "warning" && status !== "terminated") {
    throw new Error(fallbackStayError(action));
  }
  return status;
}

async function stayErrorMessage(response: Response, action: StayAction): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
    if (typeof error === "string" && error.trim() !== "") {
      return error;
    }
  } catch {
    return fallbackStayError(action);
  }
  return fallbackStayError(action);
}

function fallbackStayError(action: StayAction): string {
  if (action === "bounce") {
    return "Could not record the bounced payment.";
  }
  if (action === "terminate") {
    return "Could not terminate the stay.";
  }
  return "Could not reset the stay.";
}

function stayFromBody(body: unknown): StayView {
  if (!body || typeof body !== "object") {
    return { kind: "error" };
  }
  const stay = (body as { stay?: unknown }).stay;
  if (stay === null) {
    return { kind: "empty" };
  }
  if (!stay || typeof stay !== "object") {
    return { kind: "error" };
  }
  const record = stay as Record<string, unknown>;
  const agreementId = text(record.agreementId);
  const tenantId = text(record.tenantId);
  const lodgerName = text(record.lodgerName);
  const status = record.status;
  const underwrittenTenancyDays = nonNegativeInteger(record.underwrittenTenancyDays);
  const landlordRiskExposureCents = nonNegativeInteger(record.landlordRiskExposureCents);
  const vaultBalanceCents = nonNegativeInteger(record.vaultBalanceCents);
  const delinquentWeeklyCents = nonNegativeInteger(record.delinquentWeeklyCents);
  if (
    !agreementId ||
    !tenantId ||
    !lodgerName ||
    (status !== "active" && status !== "warning" && status !== "terminated") ||
    underwrittenTenancyDays === null ||
    landlordRiskExposureCents === null ||
    vaultBalanceCents === null ||
    delinquentWeeklyCents === null
  ) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    stay: {
      agreementId,
      tenantId,
      lodgerName,
      status,
      underwrittenTenancyDays,
      landlordRiskExposureCents,
      vaultBalanceCents,
      delinquentWeeklyCents,
    },
  };
}

async function authHeader(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Host session required");
  }
  return { Authorization: `Bearer ${token}` };
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function nonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

function riskExposureLabel(stay: Stay): string {
  const exposure = formatCentsAsDollars(stay.landlordRiskExposureCents);
  if (stay.landlordRiskExposureCents === 0 && stay.vaultBalanceCents > 0) {
    return `Landlord Risk Exposure ${exposure} (Backed by ${formatCentsAsDollars(stay.vaultBalanceCents)} GMF Vault)`;
  }
  return `Landlord Risk Exposure ${exposure}`;
}

function formatCentsAsDollars(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${String(remainder).padStart(2, "0")}`;
}
