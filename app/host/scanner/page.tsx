"use client";

import type { Html5Qrcode } from "html5-qrcode";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ActiveStayCard } from "@/components/active-stay-card";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { formatCurrencyCents } from "@/lib/marketing-calculator";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const REGION_ID = "host-qr-region";

type Gate = "checking" | "denied" | "host";

type ScanIds = {
  tenant_id: string;
  agreement_id: string;
};

type AgreementStatus = "active" | "warning" | "terminated";

type ScanResult = {
  status: AgreementStatus;
  tenantName?: string;
};

const STATUS_LABEL: Record<AgreementStatus, string> = {
  active: "Active",
  warning: "Warning",
  terminated: "Terminated",
};

export default function HostScannerPage() {
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    let cancelled = false;
    void callerIsHost().then((allowed) => {
      if (!cancelled) {
        setGate(allowed ? "host" : "denied");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {gate !== "host" ? (
        <AccessDenied checking={gate === "checking"} />
      ) : (
        <HostScanner onDenied={() => setGate("denied")} />
      )}
      <UmiPayrollDisconnectSimulator />
    </>
  );
}

function AccessDenied({ checking }: { checking: boolean }) {
  return (
    <main className="gate-screen">
      <h1>{checking ? "Checking access" : "Hosts only"}</h1>
      <p className="lede">
        {checking
          ? "Confirming your session."
          : "This scanner is limited to host accounts."}
      </p>
      {checking ? null : (
        <Link className="button" href="/dashboard">
          Back to dashboard
        </Link>
      )}
    </main>
  );
}

function HostScanner({ onDenied }: { onDenied: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const lastBadRef = useRef<string | null>(null);
  const lockedRef = useRef<ScanIds | null>(null);
  const [running, setRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [ids, setIds] = useState<ScanIds | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoKind, setPhotoKind] = useState<"face" | "id">("face");
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void stopQuietly(scanner);
      }
    };
  }, []);

  async function startScanner() {
    if (scannerRef.current) {
      return;
    }
    const allowed = await callerIsHost();
    if (!allowed) {
      await stopCamera();
      onDenied();
      return;
    }
    setScanError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
      scannerRef.current = scanner;
      const edge = Math.max(180, Math.min(260, Math.floor(window.innerWidth * 0.62)));
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: edge, height: edge } },
        (decodedText) => {
          onDecoded(decodedText);
        },
        () => {
          // Frame misses are expected while the camera is hunting.
        },
      );
      setRunning(true);
    } catch (caught) {
      scannerRef.current = null;
      setRunning(false);
      setScanError(caught instanceof Error ? caught.message : "Could not start the camera");
    }
  }

  function onDecoded(text: string) {
    if (handlingRef.current) {
      return;
    }
    const parsed = parseScanPayload(text);
    if (!parsed) {
      if (lastBadRef.current !== text) {
        lastBadRef.current = text;
        setScanError("This code is not a VettedRent agreement.");
      }
      return;
    }
    const locked = lockedRef.current;
    if (
      locked &&
      locked.agreement_id === parsed.agreement_id &&
      locked.tenant_id === parsed.tenant_id
    ) {
      return;
    }
    handlingRef.current = true;
    lastBadRef.current = null;
    setScanError(null);
    void acceptScan(parsed);
  }

  async function acceptScan(parsed: ScanIds) {
    try {
      const verified = await verifyScan(parsed);
      lockedRef.current = parsed;
      setIds(parsed);
      setResult(verified);
      setSaveNote(null);
    } catch (caught) {
      setScanError(
        caught instanceof Error ? caught.message : "Could not verify this agreement",
      );
    } finally {
      handlingRef.current = false;
    }
  }

  async function stopCamera() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setRunning(false);
    if (!scanner) {
      return;
    }
    try {
      await stopQuietly(scanner);
    } catch (caught) {
      setScanError(caught instanceof Error ? caught.message : "Could not stop the camera");
    }
  }

  function dismissResult() {
    lockedRef.current = null;
    setResult(null);
    setIds(null);
    handlingRef.current = false;
  }

  function capturePhoto(kind: "face" | "id") {
    if (!running) {
      return;
    }
    const frame = captureVideoFrame(REGION_ID);
    if (!frame) {
      setScanError("The camera has no frame yet.");
      return;
    }
    setScanError(null);
    setSaveNote(null);
    setPhotoKind(kind);
    setCapturedPhoto(frame);
  }

  async function savePhotoToStay() {
    if (!capturedPhoto || !ids || saving) {
      return;
    }
    setSaving(true);
    setScanError(null);
    setSaveNote(null);
    try {
      await persistStayPhoto(ids, photoKind, capturedPhoto);
      setCapturedPhoto(null);
      setSaveNote("Saved to this stay.");
    } catch (caught) {
      setScanError(caught instanceof Error ? caught.message : "Could not save the photo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="scanner-screen">
      <header className="topbar">
        <div>
          <h1>Scanner</h1>
          <p className="note">Point the camera at an agreement code.</p>
        </div>
        <Link href="/dashboard">Dashboard</Link>
      </header>

      <div className="viewfinder">
        <div id={REGION_ID} className="camera" />
        <div className="viewfinder-mask" aria-hidden="true">
          <div className="viewfinder-frame">
            <span className="corner corner-nw" />
            <span className="corner corner-ne" />
            <span className="corner corner-sw" />
            <span className="corner corner-se" />
          </div>
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={() => void startScanner()} disabled={running}>
          Start
        </button>
        <button type="button" onClick={() => void stopCamera()} disabled={!running}>
          Stop
        </button>
      </div>
      <div className="actions">
        <button type="button" onClick={() => capturePhoto("face")} disabled={!running}>
          Capture face
        </button>
        <button type="button" onClick={() => capturePhoto("id")} disabled={!running}>
          Capture ID
        </button>
      </div>
      <button
        className="button"
        type="button"
        onClick={() => void savePhotoToStay()}
        disabled={!capturedPhoto || !ids || saving}
      >
        {saving ? "Saving" : "Save to stay"}
      </button>

      {scanError ? (
        <p className="error" role="alert">
          {scanError}
        </p>
      ) : saveNote ? (
        <p className="note">{saveNote}</p>
      ) : (
        <p className="note">
          Lock an agreement code, then capture a face or an ID. Save stores the photo on that stay.
        </p>
      )}

      {capturedPhoto ? (
        <figure className="face-capture">
          <img src={capturedPhoto} alt={photoKind === "face" ? "Captured face" : "Captured identification"} />
          <figcaption className="note">
            {ids
              ? "This photo stays on screen until it is saved to the locked stay."
              : "Lock an agreement code before this photo can be saved."}
          </figcaption>
        </figure>
      ) : null}

      {result && ids ? (
        <StayLock ids={ids} result={result} onDismiss={dismissResult} />
      ) : null}
      <ActiveStayCard />
    </main>
  );
}

const SIMULATOR_WEEKLY_CENTS = 31500;
const SIMULATOR_BACKSTOP_CAP_CENTS = 30000;
const SIMULATOR_SIGNALS = [
  "PAYROLL_DISCONNECTED",
  "DIRECT_DEPOSIT_SWITCHED",
  "EMPLOYMENT_TERMINATED",
  "INCOME_STREAM_REVOKED",
] as const;

function UmiPayrollDisconnectSimulator() {
  const [signal, setSignal] = useState<(typeof SIMULATOR_SIGNALS)[number]>(
    "PAYROLL_DISCONNECTED",
  );
  const [outcome, setOutcome] = useState<string | null>(null);

  const hostCents = Math.round((SIMULATOR_WEEKLY_CENTS * 7550) / 10000);
  const hostMonthlyCents = Math.round(((SIMULATOR_WEEKLY_CENTS * 52) / 12 * 7550) / 10000);
  const vaultCents = Math.round((SIMULATOR_WEEKLY_CENTS * 1430) / 10000);
  const platformCents = SIMULATOR_WEEKLY_CENTS - hostCents - vaultCents;
  const backstopCents = Math.min(SIMULATOR_BACKSTOP_CAP_CENTS, SIMULATOR_WEEKLY_CENTS);

  function runSimulation() {
    setOutcome(
      `License_Revoked. Signal ${signal} stops the weekly micro-deduction. Seam access ends and the GMF pool routes ${formatCurrencyCents(backstopCents)} (cap ${formatCurrencyCents(SIMULATOR_BACKSTOP_CAP_CENTS)}). Last settled week was ${formatCurrencyCents(hostCents)}/wk (${formatCurrencyCents(hostMonthlyCents)}/mo net) host / ${formatCurrencyCents(vaultCents)} GMF escrow / ${formatCurrencyCents(platformCents)} platform.`,
    );
  }

  return (
    <section className="shell" aria-label="UMI Payroll Disconnect Simulator">
      <article className="panel stack" id="umi-payroll-disconnect-simulator">
        <div>
          <p className="pass-kicker">Section 3.C · Unvetted renting is over.</p>
          <h2>UMI Payroll Disconnect Simulator</h2>
          <p className="note">
            Models a payroll or stipend disconnect on the active Revocable Commercial License
            ($315/wk · $45.00/day [$38.56/day net after +$6.44/day 14.3% GMF Vault credit] · 84%
            less than $277/night hotel &amp; aggregator rates). The license token flips to
            License_Revoked, smart-lock access ends, and the GMF backstop protects the landlord’s{" "}
            {formatCurrencyCents(hostCents)}/wk ({formatCurrencyCents(hostMonthlyCents)}/mo net)
            guaranteed payout (capped at {formatCurrencyCents(SIMULATOR_BACKSTOP_CAP_CENTS)}). Be
            Great to Yourself.
          </p>
        </div>
        <label className="field">
          <span>Disconnect signal</span>
          <select
            value={signal}
            onChange={(event) =>
              setSignal(event.target.value as (typeof SIMULATOR_SIGNALS)[number])
            }
          >
            {SIMULATOR_SIGNALS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <span>Modeled weekly license fee ($315/wk · $45.00/day)</span>
          <strong>
            {formatCurrencyCents(hostCents)}/wk ({formatCurrencyCents(hostMonthlyCents)}/mo net)
            host · {formatCurrencyCents(vaultCents)} GMF · {formatCurrencyCents(platformCents)}{" "}
            platform
          </strong>
        </div>
        <div className="actions" style={{ flexWrap: "wrap" }}>
          <button className="button" type="button" onClick={runSimulation}>
            Run UMI Payroll Disconnect Simulator
          </button>
          <a
            className="button button-secondary"
            href="/api/agreements/license?format=pdf&jurisdiction=MD-PG&cohort=Contract-Assignment&weeklyFeeCents=31500"
            download="VettedRent-Commercial-License.pdf"
          >
            Download Revocable Commercial License (PDF) ↓
          </a>
        </div>
        {outcome ? <p className="payload">{outcome}</p> : null}
      </article>
    </section>
  );
}

function StayLock({
  ids,
  result,
  onDismiss,
}: {
  ids: ScanIds;
  result: ScanResult;
  onDismiss: () => void;
}) {
  return (
    <article className="panel" aria-live="polite">
      <p className="alert-kicker">Stay locked</p>
      <h2>{STATUS_LABEL[result.status]}</h2>
      {result.tenantName ? <p className="lede">{result.tenantName}</p> : null}
      <dl className="scan-ids">
        <div>
          <dt>Tenant</dt>
          <dd>{ids.tenant_id}</dd>
        </div>
        <div>
          <dt>Agreement</dt>
          <dd>{ids.agreement_id}</dd>
        </div>
      </dl>
      <button className="text-button" type="button" onClick={onDismiss}>
        Scan another
      </button>
    </article>
  );
}

async function callerIsHost(): Promise<boolean> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return false;
    }
    const role = await resolveCallerRole(supabase, data.user);
    return isHostRole(role);
  } catch {
    return false;
  }
}

function parseScanPayload(text: string): ScanIds | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.tenant_id !== "string" || record.tenant_id.trim() === "") {
    return null;
  }
  if (typeof record.agreement_id !== "string" || record.agreement_id.trim() === "") {
    return null;
  }
  return {
    tenant_id: record.tenant_id.trim(),
    agreement_id: record.agreement_id.trim(),
  };
}

async function persistStayPhoto(
  ids: ScanIds,
  photoKind: "face" | "id",
  image: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Host session required");
  }
  const response = await fetch("/api/host/stay-photo", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenant_id: ids.tenant_id,
      agreement_id: ids.agreement_id,
      photoKind,
      image,
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(messageForPhotoStatus(response.status, message));
  }
}

function messageForPhotoStatus(status: number, body: string): string {
  if (body.includes("Stay photo columns are not ready.")) {
    return "Stay photo columns are not ready.";
  }
  return messageForStatus(status);
}

async function verifyScan(ids: ScanIds): Promise<ScanResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Host session required");
  }
  const response = await fetch("/api/agreements/verify-scan", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenant_id: ids.tenant_id,
      agreement_id: ids.agreement_id,
    }),
  });
  if (!response.ok) {
    throw new Error(messageForStatus(response.status));
  }
  const body: unknown = await response.json();
  if (!isScanResult(body)) {
    throw new Error("Could not verify this agreement");
  }
  return body;
}

function messageForStatus(status: number): string {
  if (status === 401) {
    return "Host session required";
  }
  if (status === 404) {
    return "No agreement matches this code";
  }
  if (status === 400) {
    return "This code could not be verified";
  }
  return "Could not verify this agreement";
}

function isScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    record.status !== "active" &&
    record.status !== "warning" &&
    record.status !== "terminated"
  ) {
    return false;
  }
  if (record.tenantName !== undefined && typeof record.tenantName !== "string") {
    return false;
  }
  return true;
}

function captureVideoFrame(regionId: string): string | null {
  const region = document.getElementById(regionId);
  const video = region?.querySelector("video");
  if (!(video instanceof HTMLVideoElement) || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function stopQuietly(scanner: Html5Qrcode): Promise<void> {
  if (scanner.isScanning) {
    await scanner.stop();
  }
  scanner.clear();
}
