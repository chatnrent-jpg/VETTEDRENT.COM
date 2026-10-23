"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type FormEvent } from "react";
import { ActiveStayCard } from "@/components/active-stay-card";
import { JurisdictionSelect } from "@/components/jurisdiction-select";
import { Progress } from "@/components/ui/progress";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
import { defaultGeoStatusLabel } from "@/lib/geo-compliance";
import { resolveCallerRole } from "@/lib/host-access";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Gate = "checking" | "signed-out" | "host" | "lodger" | "unknown";

type HostListingView =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "empty" }
  | {
      kind: "ready";
      name: string;
      lockConnected: boolean;
      weeklyPriceCents: number | null;
      jurisdictionCode: string;
      geoCompliance: string;
    };

export default function DashboardPage() {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    try {
      const supabase = getSupabaseBrowserClient();
      void readSessionGate().then((next) => {
        if (!cancelled) {
          setGate(next);
        }
      });
      const { data } = supabase.auth.onAuthStateChange(() => {
        void readSessionGate().then((next) => {
          if (!cancelled) {
            setGate(next);
          }
        });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      setGate("signed-out");
    }
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p className="note">
            {gate === "host"
              ? "Host account."
              : gate === "lodger"
                ? "Lodger account."
                : "Sign in to open your stay."}
          </p>
        </div>
        {gate === "host" || gate === "lodger" ? <SignOutButton /> : null}
      </header>

      {gate === "checking" ? <p className="note">Checking your session.</p> : null}
      {gate === "signed-out" ? <SignInPanel /> : null}
      {gate === "unknown" ? (
        <article className="panel">
          <h2>Account not assigned</h2>
          <p className="note">This account is not a host or a lodger yet.</p>
        </article>
      ) : null}
      {gate === "host" ? <HostPanel /> : null}
      {gate === "lodger" ? <LodgerPanel /> : null}
    </main>
  );
}

function signInErrorMessage(signError: { code?: string; message?: string }): string {
  const code = signError.code ?? "";
  const message = signError.message ?? "";
  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "Too many sign-in emails. Wait, then try this address once.";
  }
  if (code === "email_address_invalid" || message.includes("invalid")) {
    return "Use a real email address.";
  }
  return "Could not send the sign-in link.";
}

function SignInPanel() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed === "") {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (signError) {
        setError(signInErrorMessage(signError));
        return;
      }
      setSent(true);
    } catch {
      setError("Could not send the sign-in link.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <article className="panel">
        <h2>Check your email</h2>
        <p className="note">Open the sign-in link to return to this dashboard.</p>
      </article>
    );
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <h2>Sign in</h2>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={busy}>
        {busy ? "Sending" : "Email me a link"}
      </button>
    </form>
  );
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button className="text-button" type="button" onClick={() => void signOut()} disabled={busy}>
      Sign out
    </button>
  );
}

async function readSessionGate(): Promise<Gate> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return "signed-out";
    }
    const role = await resolveCallerRole(supabase, data.user);
    if (role === "host") {
      return "host";
    }
    if (role === "lodger") {
      return "lodger";
    }
    return "unknown";
  } catch {
    return "signed-out";
  }
}

function HostPanel() {
  const [listing, setListing] = useState<HostListingView>({ kind: "loading" });
  const [billingNote, setBillingNote] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [locationVersion, setLocationVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadHostListing().then((next) => {
      if (!cancelled) {
        setListing(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="stack" aria-label="Host">
      <article className="panel">
        <h2>Property</h2>
        {listing.kind === "loading" ? <p className="note">Checking your listing.</p> : null}
        {listing.kind === "error" ? (
          <p className="error" role="alert">
            Could not load the property.
          </p>
        ) : null}
        {listing.kind === "empty" ? (
          <p className="note">No listing is tied to this host yet.</p>
        ) : null}
        {listing.kind === "ready" ? (
          <>
            <div className="row">
              <span>Name</span>
              <strong>{listing.name}</strong>
            </div>
            <div className="row">
              <span>Lock</span>
              <strong>{listing.lockConnected ? "Connected" : "Not connected"}</strong>
            </div>
            <JurisdictionSelect
              value={listing.jurisdictionCode}
              disabled={savingLocation}
              onChange={(code) => void saveHostLocation(code, setListing, setSavingLocation, setLocationNote, setLocationVersion)}
            />
            <p className="note">{listing.geoCompliance}</p>
            {locationNote ? <p className="note">{locationNote}</p> : null}
          </>
        ) : null}
      </article>
      <article className="panel">
        <h2>Weekly billing</h2>
        <div className="row">
          <span>Rate</span>
          {listing.kind === "ready" && listing.weeklyPriceCents !== null ? (
            <span className="chip">{formatCentsAsDollars(listing.weeklyPriceCents)}</span>
          ) : (
            <strong>{listing.kind === "loading" ? "Checking" : "Not set"}</strong>
          )}
        </div>
        <button
          type="button"
          className="button"
          disabled={billing}
          onClick={() => void runHostWeeklyBilling(setBilling, setBillingNote)}
        >
          Run weekly billing
        </button>
        {billingNote ? <p className="note">{billingNote}</p> : null}
      </article>
      <ActiveStayCard key={locationVersion} />
      <Link className="button" href="/host/scanner">
        Open scanner
      </Link>
    </section>
  );
}

async function loadHostListing(): Promise<HostListingView> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      return { kind: "error" };
    }
    const response = await fetch("/api/host/listing", {
      method: "GET",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return { kind: "error" };
    }
    const body: unknown = await response.json();
    return hostListingFromBody(body);
  } catch {
    return { kind: "error" };
  }
}

function hostListingFromBody(body: unknown): HostListingView {
  if (!body || typeof body !== "object") {
    return { kind: "error" };
  }
  const listing = (body as { listing?: unknown }).listing;
  if (listing === null) {
    return { kind: "empty" };
  }
  if (!listing || typeof listing !== "object") {
    return { kind: "error" };
  }
  const record = listing as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name === "" || typeof record.lockConnected !== "boolean") {
    return { kind: "error" };
  }
  const geoCompliance = textValue(record.geoCompliance) ?? defaultGeoStatusLabel();
  const jurisdictionCode = textValue(record.jurisdictionCode) ?? DEFAULT_JURISDICTION_CODE;
  if (record.weeklyPriceCents === null) {
    return {
      kind: "ready",
      name,
      lockConnected: record.lockConnected,
      weeklyPriceCents: null,
      jurisdictionCode,
      geoCompliance,
    };
  }
  const weeklyPriceCents = positiveInteger(record.weeklyPriceCents);
  if (weeklyPriceCents === null) {
    return { kind: "error" };
  }
  return {
    kind: "ready",
    name,
    lockConnected: record.lockConnected,
    weeklyPriceCents,
    jurisdictionCode,
    geoCompliance,
  };
}

type StayStatus = {
  paymentStatus: string | null;
  riskLevel: string | null;
  vaultBalanceCents: number;
  seamAccessCodeId: string | null;
  listingId: string | null;
  jurisdictionCode: string;
  geoCompliance: string;
};

type LodgerView =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error" }
  | ({ kind: "empty"; balanceCents: number; savingsGoalCents: number | null } & StayStatus)
  | ({
      kind: "ready";
      tenantId: string;
      agreementId: string;
      balanceCents: number;
      savingsGoalCents: number | null;
    } & StayStatus);

function LodgerPanel() {
  const [view, setView] = useState<LodgerView>({ kind: "loading" });
  const [billingNote, setBillingNote] = useState<string | null>(null);
  const [billing, setBilling] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

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
      {view.kind === "ready" ? (
        <StayPanel
          view={view}
          savingLocation={savingLocation}
          locationNote={locationNote}
          onLocation={(code) => void saveLodgerLocation(code, setView, setSavingLocation, setLocationNote)}
        />
      ) : null}
      <VaultProgress balanceCents={view.balanceCents} savingsGoalCents={view.savingsGoalCents} />
      {view.kind === "ready" ? (
        <button
          type="button"
          className="button"
          disabled={billing}
          onClick={() => void runWeeklyBilling(setView, setBilling, setBillingNote)}
        >
          Run weekly billing
        </button>
      ) : null}
      {billingNote ? <p className="note">{billingNote}</p> : null}
      <Link className="button" href="/underwriting">
        Connect a bank
      </Link>
    </section>
  );
}

function StayPanel({
  view,
  savingLocation,
  locationNote,
  onLocation,
}: {
  view: StayStatus;
  savingLocation: boolean;
  locationNote: string | null;
  onLocation: (code: string) => void;
}) {
  return (
    <article className="panel">
      <h2>Stay</h2>
      {view.listingId ? (
        <JurisdictionSelect value={view.jurisdictionCode} disabled={savingLocation} onChange={onLocation} />
      ) : null}
      <p className="note">{view.geoCompliance}</p>
      {locationNote ? <p className="note">{locationNote}</p> : null}
      <div className="row">
        <span>Payment</span>
        <strong>{view.paymentStatus ?? "Unknown"}</strong>
      </div>
      <div className="row">
        <span>Risk</span>
        <strong>{view.riskLevel ?? "Unknown"}</strong>
      </div>
      <div className="row">
        <span>Agreement escrow</span>
        <strong>{formatCentsAsDollars(view.vaultBalanceCents)}</strong>
      </div>
      <div className="row">
        <span>Door code</span>
        <strong>{view.seamAccessCodeId ?? "Not provisioned"}</strong>
      </div>
    </article>
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

async function runHostWeeklyBilling(
  setBilling: (billing: boolean) => void,
  setBillingNote: (note: string | null) => void,
): Promise<void> {
  setBilling(true);
  setBillingNote(null);
  const billed = await postWeeklyCycle();
  setBilling(false);
  setBillingNote(billed ?? "Weekly billing failed.");
}

async function runWeeklyBilling(
  setView: (view: LodgerView) => void,
  setBilling: (billing: boolean) => void,
  setBillingNote: (note: string | null) => void,
): Promise<void> {
  setBilling(true);
  setBillingNote(null);
  const billed = await postWeeklyCycle();
  if (!billed) {
    setBilling(false);
    setBillingNote("Weekly billing failed.");
    return;
  }
  setBillingNote(billed);
  setView(await loadLodgerView());
  setBilling(false);
}

async function postWeeklyCycle(): Promise<string | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) {
      return "Sign in to run weekly billing.";
    }
    const response = await fetch("/api/billing/weekly-cycle", {
      method: "POST",
      credentials: "same-origin",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      return null;
    }
    const billed = weeklyBillingFromBody(body);
    if (!billed) {
      const message = body && typeof body === "object" ? (body as { error?: unknown }).error : null;
      return typeof message === "string" && message.trim() !== "" ? message : null;
    }
    return `Simulated weekly billing. Host ${formatCentsAsDollars(billed.hostCents)}. GMF Vault ${formatCentsAsDollars(billed.vaultCents)}. Platform ${formatCentsAsDollars(billed.platformCents)}. GMF Vault balance ${formatCentsAsDollars(billed.vaultBalanceCents)}.`;
  } catch {
    return null;
  }
}

function weeklyBillingFromBody(body: unknown): {
  hostCents: number;
  vaultCents: number;
  platformCents: number;
  vaultBalanceCents: number;
} | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  const split = record.split;
  if (!split || typeof split !== "object") {
    return null;
  }
  const parts = split as Record<string, unknown>;
  const hostCents = integerValue(parts.hostCents);
  const vaultCents = integerValue(parts.vaultCents);
  const platformCents = integerValue(parts.platformCents);
  const vaultBalanceCents = integerValue(record.vaultBalanceCents);
  if (hostCents === null || vaultCents === null || platformCents === null || vaultBalanceCents === null) {
    return null;
  }
  return { hostCents, vaultCents, platformCents, vaultBalanceCents };
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
  const stay = stayFromPass(record);
  const tenantId = typeof record.tenantId === "string" ? record.tenantId : null;
  const agreementId = typeof record.agreementId === "string" ? record.agreementId : null;
  if (!tenantId || !agreementId) {
    return { kind: "empty", balanceCents, savingsGoalCents, ...stay };
  }
  return {
    kind: "ready",
    tenantId,
    agreementId,
    balanceCents,
    savingsGoalCents,
    ...stay,
  };
}

function stayFromPass(record: Record<string, unknown>): StayStatus {
  const vaultBalanceCents = integerValue(record.vaultBalanceCents);
  return {
    paymentStatus: optionalText(record.paymentStatus),
    riskLevel: optionalText(record.riskLevel),
    vaultBalanceCents: vaultBalanceCents ?? 0,
    seamAccessCodeId: optionalText(record.seamAccessCodeId),
    listingId: optionalText(record.listingId),
    jurisdictionCode: optionalText(record.jurisdictionCode) ?? DEFAULT_JURISDICTION_CODE,
    geoCompliance: optionalText(record.geoCompliance) ?? defaultGeoStatusLabel(),
  };
}

async function saveHostLocation(
  code: string,
  setListing: (update: (current: HostListingView) => HostListingView) => void,
  setSaving: (saving: boolean) => void,
  setNote: (note: string | null) => void,
  setLocationVersion: (update: (current: number) => number) => void,
): Promise<void> {
  setSaving(true);
  setNote(null);
  const saved = await postJurisdiction(code);
  setSaving(false);
  if (!saved) {
    setNote("Could not save the listing location.");
    return;
  }
  setListing((current) =>
    current.kind === "ready"
      ? { ...current, jurisdictionCode: saved.jurisdictionCode, geoCompliance: saved.geoCompliance }
      : current,
  );
  setNote(saved.blockReason);
  setLocationVersion((current) => current + 1);
}

async function saveLodgerLocation(
  code: string,
  setView: (update: (current: LodgerView) => LodgerView) => void,
  setSaving: (saving: boolean) => void,
  setNote: (note: string | null) => void,
): Promise<void> {
  setSaving(true);
  setNote(null);
  const saved = await postJurisdiction(code);
  setSaving(false);
  if (!saved) {
    setNote("Could not save the listing location.");
    return;
  }
  setView((current) =>
    current.kind === "ready" || current.kind === "empty"
      ? { ...current, jurisdictionCode: saved.jurisdictionCode, geoCompliance: saved.geoCompliance }
      : current,
  );
  setNote(saved.blockReason);
}

async function postJurisdiction(
  code: string,
): Promise<{ jurisdictionCode: string; geoCompliance: string; blockReason: string | null } | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (session.error || !token) {
      return null;
    }
    const response = await fetch("/api/compliance/jurisdiction", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jurisdictionCode: code }),
    });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== "object") {
      return null;
    }
    const record = body as Record<string, unknown>;
    if (record.ok !== true || typeof record.jurisdictionCode !== "string" || typeof record.geoCompliance !== "string") {
      return null;
    }
    return {
      jurisdictionCode: record.jurisdictionCode,
      geoCompliance: record.geoCompliance,
      blockReason: typeof record.blockReason === "string" ? record.blockReason : null,
    };
  } catch {
    return null;
  }
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
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
