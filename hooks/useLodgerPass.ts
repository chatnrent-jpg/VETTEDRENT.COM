"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export interface LodgerPassData {
  hasActiveStay: boolean;
  tenantId: string | null;
  agreementId: string | null;
  paymentStatus: "current" | "delinquent" | null;
  riskLevel: "clear" | "critical" | null;
  /** Agreement escrow in integer cents. */
  vaultBalanceCents: number;
  /** Funded vault ledger in integer cents. */
  balanceCents: number;
  savingsGoalCents: number | null;
  seamAccessCodeId: string | null;
  listingId: string | null;
}

export function useLodgerPass(tenantId: string) {
  const [passData, setPassData] = useState<LodgerPassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedId = tenantId.trim();
    if (!requestedId) {
      setPassData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function fetchPass() {
      try {
        setIsLoading(true);
        setError(null);
        const supabase = getSupabaseBrowserClient();
        const session = await supabase.auth.getSession();
        if (!active) {
          return;
        }
        const token = session.data.session?.access_token;
        const userId = session.data.session?.user.id;
        if (session.error || !token || !userId || userId !== requestedId) {
          throw new Error("Lodger session required");
        }

        const response = await fetch("/api/lodger/pass", {
          method: "GET",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            response.status === 401 ? "Lodger session required" : "Could not load your stay",
          );
        }
        const pass = parseLodgerPass(body);
        if (!pass) {
          throw new Error("Could not load your stay");
        }
        if (!active) {
          return;
        }
        setPassData(pass);
      } catch (caught) {
        if (!active || isAbortError(caught)) {
          return;
        }
        setPassData(null);
        setError(
          caught instanceof Error && caught.message.includes("not configured")
            ? caught.message
            : caught instanceof Error && caught.message === "Lodger session required"
              ? caught.message
              : "Could not load your stay",
        );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void fetchPass();
    return () => {
      active = false;
      controller.abort();
    };
  }, [tenantId]);

  return { passData, isLoading, error };
}

function parseLodgerPass(body: unknown): LodgerPassData | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.hasActiveStay !== "boolean") {
    return null;
  }
  const balanceCents = integerCents(record.balanceCents);
  const vaultBalanceCents = integerCents(record.vaultBalanceCents);
  if (balanceCents === null || vaultBalanceCents === null) {
    return null;
  }
  return {
    hasActiveStay: record.hasActiveStay,
    tenantId: textOrNull(record.tenantId),
    agreementId: textOrNull(record.agreementId),
    paymentStatus: paymentStatus(record.paymentStatus),
    riskLevel: riskLevel(record.riskLevel),
    vaultBalanceCents,
    balanceCents,
    savingsGoalCents: positiveInteger(record.savings_goal_cents),
    seamAccessCodeId: textOrNull(record.seamAccessCodeId),
    listingId: textOrNull(record.listingId),
  };
}

function paymentStatus(value: unknown): "current" | "delinquent" | null {
  if (value === "current" || value === "delinquent") {
    return value;
  }
  return null;
}

function riskLevel(value: unknown): "clear" | "critical" | null {
  if (value === "clear" || value === "critical") {
    return value;
  }
  return null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function integerCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  return null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
