import { NextResponse } from "next/server";
import { AccountType, type Transaction } from "plaid";
import { getPlaidClient } from "@/lib/plaid";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const LOOKBACK_DAYS = 90;
/** Average month must cover 3x the four-week lodging obligation. */
const REQUIRED_COVERAGE = 3;
const WEEKS_PER_MONTH = 4;

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

    const parsed = parseUnderwritingBody(payload);
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

    const decision = await evaluateCashVelocity(parsed.accessToken, parsed.weeklyTargetCents);
    await recordUnderwriting(supabase, userId, decision);

    return NextResponse.json({
      ok: true,
      approved: decision.approved,
      ratio: floor2(decision.ratio),
      monthlyInflowEstimated: round2(decision.monthlyInflowCents / 100),
    });
  } catch (error) {
    console.error("plaid underwriting failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Underwriting check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type VelocityDecision = {
  approved: boolean;
  ratio: number;
  monthlyInflowCents: number;
};

async function evaluateCashVelocity(
  accessToken: string,
  weeklyTargetCents: number,
): Promise<VelocityDecision> {
  const plaid = getPlaidClient();
  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  try {
    const accounts = await plaid.accountsGet({ access_token: accessToken });
    const depositoryIds = new Set(
      accounts.data.accounts
        .filter((account) => account.type === AccountType.Depository)
        .map((account) => account.account_id),
    );

    const transactions = await listTransactions(plaid, accessToken, isoDate(start), isoDate(end));
    const totalInflowCents = sumDepositoryInflowCents(transactions, depositoryIds);
    const monthlyInflowCents = Math.round(totalInflowCents / 3);
    const ratio = totalInflowCents / (weeklyTargetCents * WEEKS_PER_MONTH * 3);
    return {
      approved: ratio >= REQUIRED_COVERAGE,
      ratio,
      monthlyInflowCents,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      throw error;
    }
    if (error instanceof Error && error.message === "transaction history incomplete") {
      throw new Error("underwriting check failed");
    }
    throw new Error("underwriting check failed");
  }
}

async function listTransactions(
  plaid: ReturnType<typeof getPlaidClient>,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const transactions: Transaction[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  for (let page = 0; page < MAX_PAGES && offset < total; page += 1) {
    const response = await plaid.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: PAGE_SIZE, offset },
    });
    const batch = response.data.transactions;
    total = response.data.total_transactions;
    transactions.push(...batch);
    if (batch.length === 0) {
      break;
    }
    offset += batch.length;
  }

  if (offset < total) {
    throw new Error("transaction history incomplete");
  }
  return transactions;
}

function sumDepositoryInflowCents(transactions: Transaction[], depositoryIds: Set<string>): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.pending || !depositoryIds.has(transaction.account_id)) {
      continue;
    }
    if (transaction.unofficial_currency_code || (transaction.iso_currency_code && transaction.iso_currency_code !== "USD")) {
      continue;
    }
    if (!(transaction.amount < 0)) {
      continue;
    }
    const cents = dollarsToCents(transaction.amount);
    if (cents === null || !Number.isSafeInteger(total + cents)) {
      throw new Error("underwriting check failed");
    }
    total += cents;
  }
  return total;
}

async function recordUnderwriting(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
  decision: VelocityDecision,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        underwriting_approved: decision.approved,
        calculated_monthly_inflow_cents: decision.monthlyInflowCents,
        underwriting_checked_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new Error("underwriting record failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "underwriting record failed") {
      throw error;
    }
    throw new Error("underwriting record failed");
  }
}

function parseUnderwritingBody(
  value: unknown,
): { accessToken: string; weeklyTargetCents: number; userId: string | null } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const accessToken = body.accessToken;
  const weeklyTargetCents = body.weeklyTargetCents;
  const userId = body.userId;
  if (typeof accessToken !== "string" || !accessToken.trim().startsWith("access-")) {
    return { error: "Missing or invalid accessToken" };
  }
  if (
    typeof weeklyTargetCents !== "number" ||
    !Number.isSafeInteger(weeklyTargetCents) ||
    weeklyTargetCents <= 0 ||
    weeklyTargetCents > Math.floor(Number.MAX_SAFE_INTEGER / (WEEKS_PER_MONTH * REQUIRED_COVERAGE * 3))
  ) {
    return { error: "Missing or invalid weeklyTargetCents amount" };
  }
  if (userId !== undefined && (typeof userId !== "string" || userId.trim() === "")) {
    return { error: "Missing or invalid userId" };
  }
  return {
    accessToken: accessToken.trim(),
    weeklyTargetCents,
    userId: typeof userId === "string" ? userId.trim() : null,
  };
}

function dollarsToCents(amount: number): number | null {
  if (!Number.isFinite(amount)) {
    return null;
  }
  const cents = Math.round(Math.abs(amount) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function floor2(value: number): number {
  return Math.floor(value * 100) / 100;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
