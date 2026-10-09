"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { resolveCallerRole } from "@/lib/host-access";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Role = "host" | "lodger";

const WEEKLY_BILLING_LABEL = "$245";

export default function DashboardPage() {
  // TODO(Henry): replace this local toggle with the Supabase session role.
  const [role, setRole] = useState<Role>("host");

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p className="note">Shared shell. Panels follow the selected role.</p>
        </div>
        <div className="toggle" role="group" aria-label="Role">
          <button
            type="button"
            aria-pressed={role === "host"}
            onClick={() => setRole("host")}
          >
            Host
          </button>
          <button
            type="button"
            aria-pressed={role === "lodger"}
            onClick={() => setRole("lodger")}
          >
            Lodger
          </button>
        </div>
      </header>

      <p className="note">
        Status values stay disconnected until a Supabase session replaces the
        toggle.
      </p>

      {role === "host" ? <HostPanel /> : <LodgerPanel />}
    </main>
  );
}

function HostPanel() {
  return (
    <section className="stack" aria-label="Host">
      <article className="panel">
        <h2>Property</h2>
        <div className="row">
          <span>Status</span>
          <strong>Not connected</strong>
        </div>
      </article>
      <article className="panel">
        <h2>Weekly billing</h2>
        <div className="row">
          <span>Rate</span>
          <span className="chip">{WEEKLY_BILLING_LABEL}</span>
        </div>
      </article>
      <Link className="button" href="/host/scanner">
        Open scanner
      </Link>
    </section>
  );
}

type LodgerView =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "empty"; balanceCents: number; savingsGoalCents: number | null }
  | {
      kind: "ready";
      tenantId: string;
      agreementId: string;
      balanceCents: number;
      savingsGoalCents: number | null;
    };

function LodgerPanel() {
  const [view, setView] = useState<LodgerView>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadLodgerView().then((next) => {
      if (!cancelled) {
        setView(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (view.kind === "loading") {
    return (
      <section className="stack" aria-label="Lodger">
        <p className="note">Checking your session.</p>
      </section>
    );
  }

  if (view.kind === "denied") {
    return (
      <section className="stack" aria-label="Lodger">
        <article className="panel">
          <h2>Lodgers only</h2>
          <p className="note">This stay pass is limited to lodger accounts.</p>
        </article>
      </section>
    );
  }

  if (view.kind === "error") {
    return (
      <section className="stack" aria-label="Lodger">
        <p className="error" role="alert">
          Could not load your stay.
        </p>
      </section>
    );
  }

  return (
    <section className="stack lodger-screen" aria-label="Lodger">
      {view.kind === "ready" ? (
        <div className="lodger-qr">
          <QRCodeSVG
            value={agreementQrValue(view.tenantId, view.agreementId)}
            size={232}
            bgColor="#ffffff"
            fgColor="#14181f"
            level="M"
            marginSize={4}
            title="Agreement code"
          />
        </div>
      ) : (
        <article className="panel">
          <h2>No active agreement</h2>
          <p className="note">A stay code appears here when an agreement is active.</p>
        </article>
      )}
      <VaultProgress balanceCents={view.balanceCents} savingsGoalCents={view.savingsGoalCents} />
    </section>
  );
}

function VaultProgress({
  balanceCents,
  savingsGoalCents,
}: {
  balanceCents: number;
  savingsGoalCents: number | null;
}) {
  const percent = vaultCompletionPercent(balanceCents, savingsGoalCents);
  const label = `Vault Balance: ${formatCentsAsDollars(balanceCents)} / $1,500.00 — Building your path to independence.`;
  return (
    <div className="vault-progress">
      <Progress value={percent} aria-label={label} />
      <p className="vault-label">{label}</p>
    </div>
  );
}

function vaultCompletionPercent(balanceCents: number, savingsGoalCents: number | null): number {
  if (
    savingsGoalCents === null ||
    !Number.isSafeInteger(savingsGoalCents) ||
    savingsGoalCents <= 0
  ) {
    return 0;
  }
  if (!Number.isFinite(balanceCents) || balanceCents <= 0) {
    return 0;
  }
  const percent = (balanceCents / savingsGoalCents) * 100;
  if (percent >= 100) {
    return 100;
  }
  if (percent <= 0) {
    return 0;
  }
  return percent;
}

function agreementQrValue(tenantId: string, agreementId: string): string {
  return JSON.stringify({ tenant_id: tenantId, agreement_id: agreementId });
}

function formatCentsAsDollars(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${grouped}.${String(remainder).padStart(2, "0")}`;
}

async function loadLodgerView(): Promise<LodgerView> {
  let supabase: ReturnType<typeof getSupabaseBrowserClient>;
  try {
    supabase = getSupabaseBrowserClient();
  } catch {
    return { kind: "denied" };
  }
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { kind: "denied" };
    }
    const role = await resolveCallerRole(supabase, data.user);
    if (role !== "lodger") {
      return { kind: "denied" };
    }
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) {
      return { kind: "denied" };
    }
    const response = await fetch("/api/lodger/pass", {
      method: "GET",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      return { kind: "denied" };
    }
    if (!response.ok) {
      return { kind: "error" };
    }
    const body: unknown = await response.json();
    return viewFromPass(body);
  } catch {
    return { kind: "error" };
  }
}

function viewFromPass(body: unknown): LodgerView {
  if (!body || typeof body !== "object") {
    return { kind: "error" };
  }
  const record = body as Record<string, unknown>;
  const balanceCents = integerValue(record.balanceCents);
  if (balanceCents === null) {
    return { kind: "error" };
  }
  const savingsGoalCents = positiveInteger(record.savings_goal_cents);
  const tenantId = typeof record.tenantId === "string" ? record.tenantId : null;
  const agreementId = typeof record.agreementId === "string" ? record.agreementId : null;
  if (!tenantId || !agreementId) {
    return { kind: "empty", balanceCents, savingsGoalCents };
  }
  return {
    kind: "ready",
    tenantId,
    agreementId,
    balanceCents,
    savingsGoalCents,
  };
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  return null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  return null;
}
