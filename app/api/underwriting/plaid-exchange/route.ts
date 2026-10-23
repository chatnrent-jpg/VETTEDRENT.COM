import { NextResponse } from "next/server";
import { exchangeBankPublicToken } from "@/lib/plaid-link";
import { getSupabaseServerClient } from "@/lib/supabase";
import { resolveContractTerm, type ContractTerm } from "@/lib/underwriting-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEEKLY_TARGET_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 36);

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ ok: false, error: "Session required" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseExchangeBody(payload);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ ok: false, error: "Session required" }, { status: 401 });
    }
    const userId = userResult.data.user.id;
    if (parsed.userId && parsed.userId !== userId) {
      return NextResponse.json(
        { ok: false, error: "userId does not match the signed-in user" },
        { status: 400 },
      );
    }

    const accessToken = await exchangeBankPublicToken(parsed.publicToken);
    return forwardVelocityCheck(request, token, accessToken, parsed.weeklyTargetCents, userId, parsed.contract);
  } catch (error) {
    console.error("bank link exchange failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Bank connection failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function forwardVelocityCheck(
  request: Request,
  sessionToken: string,
  accessToken: string,
  weeklyTargetCents: number,
  userId: string,
  contract: ContractTerm,
): Promise<NextResponse> {
  try {
    const velocityUrl = new URL("/api/underwriting/plaid-velocity", request.url);
    const response = await fetch(velocityUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accessToken,
        weeklyTargetCents,
        userId,
        credentialType: contract.credentialType,
        credentialIdentifier: contract.credentialIdentifier,
        contractEndDate: contract.contractEndDate,
        intendedStayEndDate: contract.intendedStayEndDate,
      }),
    });
    const body: unknown = await response.json();
    const decision = parseVelocityBody(body);
    if (!decision) {
      return NextResponse.json({ ok: false, error: "Underwriting check failed" }, { status: 500 });
    }
    return NextResponse.json(decision, { status: response.ok ? 200 : response.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Underwriting check failed" }, { status: 500 });
  }
}

function parseExchangeBody(
  value: unknown,
): { publicToken: string; weeklyTargetCents: number; userId: string | null; contract: ContractTerm } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const publicToken = body.publicToken;
  const weeklyTargetCents = body.weeklyTargetCents;
  const userId = body.userId;
  if (typeof publicToken !== "string" || !publicToken.trim().startsWith("public-")) {
    return { error: "Missing or invalid publicToken" };
  }
  if (
    typeof weeklyTargetCents !== "number" ||
    !Number.isSafeInteger(weeklyTargetCents) ||
    weeklyTargetCents <= 0 ||
    weeklyTargetCents > MAX_WEEKLY_TARGET_CENTS
  ) {
    return { error: "Missing or invalid weeklyTargetCents amount" };
  }
  if (userId !== undefined && (typeof userId !== "string" || userId.trim() === "")) {
    return { error: "Missing or invalid userId" };
  }
  const contract = resolveContractTerm(body, false);
  if ("error" in contract) {
    return contract;
  }
  return {
    publicToken: publicToken.trim(),
    weeklyTargetCents,
    userId: typeof userId === "string" ? userId.trim() : null,
    contract,
  };
}

function parseVelocityBody(
  value: unknown,
):
  | {
      ok: true;
      approved: boolean;
      ratio: number;
      monthlyInflowEstimated: number;
      simulated: boolean;
      rejection: string | null;
      credentialType: string;
      credentialIdentifier: string;
      contractEndDate: string;
      intendedStayEndDate: string;
    }
  | { ok: false; error: string }
  | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (body.ok === false && typeof body.error === "string" && body.error.trim() !== "") {
    return { ok: false, error: body.error };
  }
  if (
    body.ok === true &&
    typeof body.approved === "boolean" &&
    typeof body.ratio === "number" &&
    Number.isFinite(body.ratio) &&
    typeof body.monthlyInflowEstimated === "number" &&
    Number.isFinite(body.monthlyInflowEstimated)
  ) {
    return {
      ok: true,
      approved: body.approved,
      ratio: body.ratio,
      monthlyInflowEstimated: body.monthlyInflowEstimated,
      simulated: body.simulated === true,
      rejection: typeof body.rejection === "string" ? body.rejection : null,
      credentialType: typeof body.credentialType === "string" ? body.credentialType : "",
      credentialIdentifier: typeof body.credentialIdentifier === "string" ? body.credentialIdentifier : "",
      contractEndDate: typeof body.contractEndDate === "string" ? body.contractEndDate : "",
      intendedStayEndDate: typeof body.intendedStayEndDate === "string" ? body.intendedStayEndDate : "",
    };
  }
  return null;
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
