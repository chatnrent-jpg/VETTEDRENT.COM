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
};

type StayView = { kind: "loading" } | { kind: "empty" } | { kind: "error" } | { kind: "ready"; stay: Stay };

const STATUS_LABEL: Record<DisplayStayStatus, string> = {
  active: "Active",
  warning: "Warning",
  terminated: "Terminated",
};

export function ActiveStayCard() {
  const [view, setView] = useState<StayView>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
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

  async function simulateBounce() {
    if (view.kind !== "ready" || view.stay.status !== "active" || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await bounceStay(view.stay.agreementId);
      setView({ kind: "ready", stay: { ...view.stay, status: next } });
    } catch {
      setError("Could not record the bounced payment.");
    } finally {
      setBusy(false);
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
      <button
        className="button"
        type="button"
        onClick={() => void simulateBounce()}
        disabled={busy || stay.status !== "active"}
      >
        {busy ? "Simulating" : "Simulate bounced weekly payment"}
      </button>
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

async function bounceStay(agreementId: string): Promise<DisplayStayStatus> {
  const response = await fetch("/api/host/stay", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...(await authHeader()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agreementId }),
  });
  if (!response.ok) {
    throw new Error("bounce failed");
  }
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") {
    throw new Error("bounce failed");
  }
  const status = (body as { status?: unknown }).status;
  if (status !== "active" && status !== "warning" && status !== "terminated") {
    throw new Error("bounce failed");
  }
  return status;
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
  if (
    !agreementId ||
    !tenantId ||
    !lodgerName ||
    (status !== "active" && status !== "warning" && status !== "terminated")
  ) {
    return { kind: "error" };
  }
  return { kind: "ready", stay: { agreementId, tenantId, lodgerName, status } };
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
