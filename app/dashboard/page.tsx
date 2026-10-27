"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type FormEvent } from "react";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { JurisdictionSelect } from "@/components/jurisdiction-select";
import { SimpleShell } from "@/components/simple-shell";
import { Progress } from "@/components/ui/progress";
import { todayIsoUtc } from "@/lib/availability-calendar";
import { DEFAULT_JURISDICTION_CODE } from "@/lib/compliance/jurisdictions";
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
    };

export default function DashboardPage() {
  const [gate, setGate] = useState<Gate>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    setLinkError(readLinkError());
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

  const signedIn = gate === "host" || gate === "lodger" || gate === "unknown";

  return (
    <SimpleShell
      perspective={gate === "host" ? "landlord" : "tenant"}
      nav={
        <>
          <Link className="text-button" href="/">
            Find a Stay
          </Link>
          {signedIn ? <SignOutButton /> : null}
        </>
      }
    >
      {gate === "checking" ? (
        <div className="vr-page vr-page--narrow">
          <p className="vr-help" style={{ textAlign: "center" }}>
            One moment...
          </p>
        </div>
      ) : null}
      {gate === "signed-out" ? <SignInPanel linkError={linkError} /> : null}
      {gate === "unknown" ? (
        <div className="vr-page vr-page--narrow">
          <div className="vr-page__head">
            <h1>Let&apos;s get you started</h1>
            <p>We don&apos;t see a stay or a property on this account yet.</p>
          </div>
          <div className="vr-tiles">
            <Link className="vr-tile" href="/">
              <strong>Find a stay</strong>
              <span>Browse furnished rooms, suites, and homes in Maryland.</span>
            </Link>
            <Link className="vr-tile" href="/host/onboard">
              <strong>List your property</strong>
              <span>Welcome guests. We handle verification.</span>
            </Link>
          </div>
        </div>
      ) : null}
      {gate === "host" ? <HostPanel /> : null}
      {gate === "lodger" ? <LodgerPanel /> : null}
    </SimpleShell>
  );
}

/**
 * Supabase reports a rejected sign-in link in the URL hash
 * (#error=access_denied&error_code=otp_expired&...). Surface it so the
 * visitor sees why they are still signed out instead of a silent loop.
 */
function readLinkError(): string | null {
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = params.get("error_code") ?? "";
    const description = params.get("error_description") ?? "";
    if (!code && !params.get("error")) {
      return null;
    }
    if (code === "otp_expired") {
      return "That sign-in link expired or was already used. Some email apps open links automatically and use them up. Request one new link, then open it right away on this device.";
    }
    return description
      ? `Sign-in link problem: ${description.replace(/\+/g, " ")}`
      : "That sign-in link did not work. Request a new one.";
  } catch {
    return null;
  }
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

function SignInPanel({ linkError = null }: { linkError?: string | null }) {
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
      <div className="vr-page vr-page--narrow">
        <div className="vr-card vr-card--center">
          <h2>Check your email</h2>
          <p>
            We sent a sign-in link to <strong>{email.trim()}</strong>. Tap it on this device and
            you&apos;re in.
          </p>
          <p className="vr-help">
            Don&apos;t see it? Look in spam or promotions. It can take a minute.
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vr-page vr-page--narrow">
      <div className="vr-page__head">
        <h1>Welcome back</h1>
        <p>Sign in with your email. No password needed.</p>
      </div>

      {linkError ? (
        <p className="error" role="alert">
          {linkError}
        </p>
      ) : null}

      <form className="vr-card" onSubmit={submit}>
        <label className="field">
          <span>Your email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Sending..." : "Email me a sign-in link"}
        </button>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="vr-help">
          We&apos;ll email you a secure link. Use it to see your stay pass, or to manage your
          property.
        </p>
      </form>
    </div>
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
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

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
    <div className="vr-page" aria-label="Host dashboard">
      <div className="vr-page__head">
        <h1>Welcome back</h1>
        <p>Manage your listings, check in guests, and keep your dates up to date.</p>
      </div>

      <div className="vr-tiles">
        <Link className="vr-tile" href="/host/listing">
          <strong>My listings</strong>
          <span>Add photos, set your price, and publish.</span>
        </Link>
        <Link className="vr-tile" href="/host/scanner">
          <strong>Check in a guest</strong>
          <span>Scan a guest&apos;s stay pass at the door.</span>
        </Link>
        <Link className="vr-tile" href="/host/onboard">
          <strong>Add a property</strong>
          <span>List another room, suite, or home.</span>
        </Link>
      </div>

      <article className="vr-card">
        <h2>Your property</h2>
        {listing.kind === "loading" ? <p>Loading your property...</p> : null}
        {listing.kind === "error" ? (
          <p className="error" role="alert">
            We couldn&apos;t load your property. Refresh the page to try again.
          </p>
        ) : null}
        {listing.kind === "empty" ? (
          <>
            <p>You haven&apos;t added a property yet.</p>
            <div className="vr-cta-row">
              <Link className="button" href="/host/onboard">
                List your property
              </Link>
            </div>
          </>
        ) : null}
        {listing.kind === "ready" ? (
          <>
            <dl className="vr-facts">
              <div>
                <dt>Name</dt>
                <dd>{listing.name}</dd>
              </div>
              <div>
                <dt>Weekly rate</dt>
                <dd>
                  {listing.weeklyPriceCents !== null
                    ? `${formatCentsAsDollars(listing.weeklyPriceCents)} / week`
                    : "Not set yet"}
                </dd>
              </div>
              <div>
                <dt>Smart lock</dt>
                <dd>
                  <span className={listing.lockConnected ? "vr-pill" : "vr-pill vr-pill--warn"}>
                    {listing.lockConnected ? "Connected" : "Not connected yet"}
                  </span>
                </dd>
              </div>
            </dl>
            <JurisdictionSelect
              value={listing.jurisdictionCode}
              disabled={savingLocation}
              onChange={(code) =>
                void saveHostLocation(code, setListing, setSavingLocation, setLocationNote)
              }
            />
            {locationNote ? <p>{locationNote}</p> : null}
            <div className="vr-cta-row">
              <a
                className="button button-secondary"
                href={`/api/agreements/license?format=pdf&jurisdiction=${encodeURIComponent(listing.jurisdictionCode)}&weeklyFeeCents=${listing.weeklyPriceCents ?? 31500}&propertyTitle=${encodeURIComponent(listing.name)}`}
                download={`VettedRent-Stay-Agreement-${listing.jurisdictionCode}.pdf`}
              >
                Download stay agreement (PDF)
              </a>
            </div>
          </>
        ) : null}
      </article>

      <details className="vr-card vr-fold">
        <summary>Open dates and calendar</summary>
        <div className="vr-fold__body">
          <p className="vr-help">
            Pick the days your place is open. Guests can book any open day.
          </p>
          <AvailabilityCalendar
            mode="landlord"
            tierId="RoomSanctuary"
            stayDays={90}
            checkInIso={todayIsoUtc()}
            onSelectCheckIn={() => {}}
          />
        </div>
      </details>

      <p className="vr-help" style={{ textAlign: "center" }}>
        Team member? <Link href="/admin">Open the admin console</Link>
      </p>
    </div>
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
  const jurisdictionCode = textValue(record.jurisdictionCode) ?? DEFAULT_JURISDICTION_CODE;
  if (record.weeklyPriceCents === null) {
    return {
      kind: "ready",
      name,
      lockConnected: record.lockConnected,
      weeklyPriceCents: null,
      jurisdictionCode,
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
  };
}

type StayStatus = {
  paymentStatus: string | null;
  riskLevel: string | null;
  vaultBalanceCents: number;
  seamAccessCodeId: string | null;
  listingId: string | null;
  jurisdictionCode: string;
  systemMessage: string;
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
      <div className="vr-page vr-page--narrow">
        <p className="vr-help" style={{ textAlign: "center" }}>
          Loading your stay...
        </p>
      </div>
    );
  }

  if (view.kind === "denied") {
    return (
      <div className="vr-page vr-page--narrow">
        <div className="vr-card vr-card--center">
          <h2>Guest accounts only</h2>
          <p>This page is for guests with a booked stay.</p>
        </div>
      </div>
    );
  }

  if (view.kind === "error") {
    return (
      <div className="vr-page vr-page--narrow">
        <p className="error" role="alert">
          We couldn&apos;t load your stay. Refresh the page to try again.
        </p>
      </div>
    );
  }

  const payment = paymentLabel(view.paymentStatus, view.riskLevel);

  return (
    <div className="vr-page vr-page--narrow" aria-label="Your stay">
      <div className="vr-page__head">
        <h1>Your stay</h1>
        <p>Show your code at check-in. Everything for your stay is here.</p>
      </div>

      {view.kind === "ready" ? (
        <article className="vr-card vr-card--center">
          <div className="vr-qr">
            <QRCodeSVG
              value={agreementQrValue(view.tenantId, view.agreementId)}
              size={232}
              bgColor="#ffffff"
              fgColor="#14181f"
              level="M"
              marginSize={2}
              title="Your check-in code"
            />
          </div>
          <p>
            <strong>Show this code to your host at check-in.</strong>
          </p>
        </article>
      ) : (
        <article className="vr-card vr-card--center">
          <h2>No active stay yet</h2>
          <p>Once you book, your check-in code shows up here.</p>
          <Link className="button" href="/">
            Find a stay
          </Link>
        </article>
      )}

      {view.kind === "ready" ? (
        <article className="vr-card">
          <h2>Stay details</h2>
          <dl className="vr-facts">
            <div>
              <dt>Payments</dt>
              <dd>
                <span className={payment.warn ? "vr-pill vr-pill--warn" : "vr-pill"}>
                  {payment.text}
                </span>
              </dd>
            </div>
            <div>
              <dt>Digital key</dt>
              <dd>{view.seamAccessCodeId ? "Ready" : "Set up after check-in"}</dd>
            </div>
            <div>
              <dt>Security deposit</dt>
              <dd>$0</dd>
            </div>
          </dl>
          <div className="vr-cta-row">
            <a
              className="button button-secondary"
              href={`/api/agreements/license?format=pdf&agreementId=${encodeURIComponent(view.agreementId)}&listingId=${encodeURIComponent(view.listingId ?? "vr-weekly-room")}&jurisdiction=${encodeURIComponent(view.jurisdictionCode)}&vaultBalanceCents=${view.vaultBalanceCents}&seamAccessCodeId=${encodeURIComponent(view.seamAccessCodeId ?? "access_code_mock_12345")}&status=${view.paymentStatus === "delinquent" || view.riskLevel === "critical" ? "License_Revoked" : "License_Active"}`}
              download={`VettedRent-Stay-Agreement-${view.jurisdictionCode}.pdf`}
            >
              Download stay agreement (PDF)
            </a>
            <Link className="button button-secondary" href="/underwriting">
              Set up payment
            </Link>
          </div>
        </article>
      ) : null}

      <MoveOutSavings balanceCents={view.balanceCents} savingsGoalCents={view.savingsGoalCents} />
    </div>
  );
}

function paymentLabel(
  paymentStatus: string | null,
  riskLevel: string | null,
): { text: string; warn: boolean } {
  if (paymentStatus === "delinquent" || riskLevel === "critical") {
    return { text: "Payment needed", warn: true };
  }
  if (!paymentStatus) {
    return { text: "Not set up yet", warn: true };
  }
  const readable = paymentStatus.replace(/_/g, " ");
  return { text: readable.charAt(0).toUpperCase() + readable.slice(1), warn: false };
}

function MoveOutSavings({
  balanceCents,
  savingsGoalCents,
}: {
  balanceCents: number;
  savingsGoalCents: number | null;
}) {
  const percent = vaultCompletionPercent(balanceCents, savingsGoalCents);
  const goalCents = savingsGoalCents ?? 150000;
  const label = `Move-out savings: ${formatCentsAsDollars(balanceCents)} of ${formatCentsAsDollars(goalCents)}`;
  return (
    <article className="vr-card">
      <h2>Move-out savings</h2>
      <Progress value={percent} aria-label={label} />
      <p>{label}. Every on-time week brings you closer to your next place.</p>
    </article>
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
    systemMessage: optionalText(record.systemMessage) ?? "Be Great to Yourself.",
  };
}

async function saveHostLocation(
  code: string,
  setListing: (update: (current: HostListingView) => HostListingView) => void,
  setSaving: (saving: boolean) => void,
  setNote: (note: string | null) => void,
): Promise<void> {
  setSaving(true);
  setNote(null);
  const saved = await postJurisdiction(code);
  setSaving(false);
  if (!saved) {
    setNote("Could not save the location. Try again.");
    return;
  }
  setListing((current) =>
    current.kind === "ready" ? { ...current, jurisdictionCode: saved.jurisdictionCode } : current,
  );
  setNote(saved.blockReason);
}

async function postJurisdiction(
  code: string,
): Promise<{ jurisdictionCode: string; blockReason: string | null } | null> {
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
    if (record.ok !== true || typeof record.jurisdictionCode !== "string") {
      return null;
    }
    return {
      jurisdictionCode: record.jurisdictionCode,
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
  return optionalText(value);
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
