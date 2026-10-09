"use client";

import type { Html5Qrcode } from "html5-qrcode";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
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

  if (gate !== "host") {
    return <AccessDenied checking={gate === "checking"} />;
  }

  return <HostScanner onDenied={() => setGate("denied")} />;
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
  const [running, setRunning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [ids, setIds] = useState<ScanIds | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

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
    if (scannerRef.current || result) {
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
    handlingRef.current = true;
    lastBadRef.current = null;
    setScanError(null);
    void acceptScan(parsed);
  }

  async function acceptScan(parsed: ScanIds) {
    await stopCamera();
    try {
      const verified = await verifyScan(parsed);
      setIds(parsed);
      setResult(verified);
    } catch (caught) {
      handlingRef.current = false;
      setScanError(
        caught instanceof Error ? caught.message : "Could not verify this agreement",
      );
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
    setResult(null);
    setIds(null);
    handlingRef.current = false;
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
        <button
          type="button"
          onClick={() => void startScanner()}
          disabled={running || result !== null}
        >
          Start
        </button>
        <button type="button" onClick={() => void stopCamera()} disabled={!running}>
          Stop
        </button>
      </div>

      {scanError ? (
        <p className="error" role="alert">
          {scanError}
        </p>
      ) : (
        <p className="note">The camera reads the code. It does not run it.</p>
      )}

      {result && ids ? (
        <StatusDialog ids={ids} result={result} onDismiss={dismissResult} />
      ) : null}
    </main>
  );
}

function StatusDialog({
  ids,
  result,
  onDismiss,
}: {
  ids: ScanIds;
  result: ScanResult;
  onDismiss: () => void;
}) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dismissRef.current?.focus();
  }, []);

  return (
    <div className="alert-scrim">
      <div
        className="alert-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="scan-status-title"
        data-status={result.status}
      >
        <p className="alert-kicker">{STATUS_LABEL[result.status]}</p>
        <h2 id="scan-status-title">{STATUS_LABEL[result.status]}</h2>
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
        <button ref={dismissRef} className="button" type="button" onClick={onDismiss}>
          Scan another
        </button>
      </div>
    </div>
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

async function stopQuietly(scanner: Html5Qrcode): Promise<void> {
  if (scanner.isScanning) {
    await scanner.stop();
  }
  scanner.clear();
}
