"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export interface BankLinkDecision {
  approved: boolean;
  ratio: number;
  monthlyInflowEstimated: number;
}

type BankLinkPhase = "loading" | "ready" | "checking" | "done";

export function usePlaidLinkFlow(weeklyTargetCents: number) {
  const [phase, setPhase] = useState<BankLinkPhase>("loading");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<BankLinkDecision | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadLinkToken() {
      try {
        if (attempt === 0) {
          setPhase("loading");
          setError(null);
        }
        const supabase = getSupabaseBrowserClient();
        const session = await supabase.auth.getSession();
        if (!active) {
          return;
        }
        const token = session.data.session?.access_token;
        const signedInUserId = session.data.session?.user.id;
        if (session.error || !token || !signedInUserId) {
          throw new Error("Lodger session required");
        }
        const response = await fetch("/api/underwriting/plaid-link-token", {
          method: "POST",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!active) {
          return;
        }
        const nextToken = readLinkToken(body);
        if (!response.ok || !nextToken) {
          throw new Error(readError(body) ?? "Could not start the bank connection");
        }
        setSessionToken(token);
        setUserId(signedInUserId);
        setLinkToken(nextToken);
        setPhase("ready");
      } catch (caught) {
        if (!active || isAbortError(caught)) {
          return;
        }
        setLinkToken(null);
        setPhase("ready");
        setError(safeClientMessage(caught, "Could not start the bank connection"));
      }
    }

    void loadLinkToken();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const onSuccess = useCallback(
    (publicToken: string) => {
      const token = sessionToken;
      const signedInUserId = userId;
      if (!token || !signedInUserId) {
        setError("Lodger session required");
        return;
      }
      void exchangePublicToken(token, signedInUserId, publicToken, weeklyTargetCents, {
        setPhase,
        setError,
        setDecision,
        setLinkToken,
        setAttempt,
      });
    },
    [sessionToken, userId, weeklyTargetCents],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (exitError) => {
      if (exitError) {
        setError("Bank connection was closed before it finished");
      }
    },
  });

  return {
    phase,
    error,
    decision,
    ready: phase === "ready" && ready && linkToken !== null,
    open,
  };
}

async function exchangePublicToken(
  sessionToken: string,
  userId: string,
  publicToken: string,
  weeklyTargetCents: number,
  setters: {
    setPhase: (phase: BankLinkPhase) => void;
    setError: (message: string | null) => void;
    setDecision: (decision: BankLinkDecision | null) => void;
    setLinkToken: (token: string | null) => void;
    setAttempt: (update: (attempt: number) => number) => void;
  },
): Promise<void> {
  setters.setPhase("checking");
  setters.setError(null);
  try {
    const response = await fetch("/api/underwriting/plaid-exchange", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publicToken, weeklyTargetCents, userId }),
    });
    const body: unknown = await response.json();
    const decision = readDecision(body);
    if (!response.ok || !decision) {
      throw new Error(readError(body) ?? "Underwriting check failed");
    }
    setters.setDecision(decision);
    setters.setPhase("done");
  } catch (caught) {
    setters.setLinkToken(null);
    setters.setAttempt((current) => current + 1);
    setters.setError(safeClientMessage(caught, "Underwriting check failed"));
  }
}

function readLinkToken(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const token = (value as { linkToken?: unknown }).linkToken;
  if (typeof token !== "string" || !token.startsWith("link-")) {
    return null;
  }
  return token;
}

function readDecision(value: unknown): BankLinkDecision | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const body = value as {
    ok?: unknown;
    approved?: unknown;
    ratio?: unknown;
    monthlyInflowEstimated?: unknown;
  };
  if (
    body.ok !== true ||
    typeof body.approved !== "boolean" ||
    typeof body.ratio !== "number" ||
    !Number.isFinite(body.ratio) ||
    typeof body.monthlyInflowEstimated !== "number" ||
    !Number.isFinite(body.monthlyInflowEstimated)
  ) {
    return null;
  }
  return {
    approved: body.approved,
    ratio: body.ratio,
    monthlyInflowEstimated: body.monthlyInflowEstimated,
  };
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const error = (value as { error?: unknown }).error;
  if (typeof error !== "string" || error.trim() === "") {
    return null;
  }
  return error;
}

function safeClientMessage(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message.includes("not configured")) {
    return caught.message;
  }
  if (caught instanceof Error && caught.message === "Lodger session required") {
    return caught.message;
  }
  if (caught instanceof Error && caught.message.trim() !== "") {
    return caught.message;
  }
  return fallback;
}

function isAbortError(caught: unknown): boolean {
  return caught instanceof DOMException && caught.name === "AbortError";
}
