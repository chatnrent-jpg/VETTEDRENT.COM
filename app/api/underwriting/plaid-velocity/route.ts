import { NextResponse } from "next/server";
import { AccountType, type Transaction } from "plaid";
import { getPlaidClient, plaidCredentialsMissing } from "@/lib/plaid";
import { getSupabaseServerClient } from "@/lib/supabase";
import { intendedStayLengthDays, readListingCompliance } from "@/lib/geo-compliance";
import {
  MID_TERM_EXPOSURE_MESSAGE,
  contractCoversStay,
  resolveContractTerm,
  type ContractTerm,
} from "@/lib/underwriting-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const LOOKBACK_DAYS = 90;
/** Average month must cover 3.00x the four-week lodging obligation. 3.00x satisfies the 2.5x floor. */
const REQUIRED_COVERAGE = 3;
const COVERAGE_FLOOR = 2.5;
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

    if (parsed.simulated && !plaidCredentialsMissing()) {
      return NextResponse.json({ ok: false, error: "Bank connection is available" }, { status: 400 });
    }

    const contract = resolveContractTerm(payload as Record<string, unknown>, parsed.simulated);
    if ("error" in contract) {
      return NextResponse.json({ ok: false, error: contract.error }, { status: 400 });
    }

    const decision = parsed.simulated
      ? simulateCashVelocity(parsed.weeklyTargetCents)
      : await evaluateCashVelocity(parsed.accessToken, parsed.weeklyTargetCents);
    const coversStay = contractCoversStay(contract.contractEndDate, contract.intendedStayEndDate);
    const compliance = await readListingCompliance(
      supabase,
      await listingForCaller(supabase, userId),
      intendedStayLengthDays(contract.intendedStayEndDate),
    );
    const approved =
      decision.ratio >= COVERAGE_FLOOR &&
      decision.ratio >= REQUIRED_COVERAGE &&
      coversStay &&
      compliance.allowed;
    const rejection = !coversStay ? MID_TERM_EXPOSURE_MESSAGE : compliance.blockReason;
    await recordUnderwriting(supabase, userId, decision, approved, contract, parsed.simulated ? null : parsed.accessToken);

    return NextResponse.json({
      ok: true,
      simulated: parsed.simulated,
      approved,
      ratio: floor2(decision.ratio),
      monthlyInflowEstimated: round2(decision.monthlyInflowCents / 100),
      rejection,
      credentialType: contract.credentialType,
      credentialIdentifier: contract.credentialIdentifier,
      contractEndDate: contract.contractEndDate,
      intendedStayEndDate: contract.intendedStayEndDate,
      geoCompliance: compliance.statusLabel,
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

/** 90-day deposits that land exactly on the 3x four-week stay rule. */
function simulateCashVelocity(weeklyTargetCents: number): VelocityDecision {
  const monthlyInflowCents = weeklyTargetCents * WEEKS_PER_MONTH * REQUIRED_COVERAGE;
  if (!Number.isSafeInteger(monthlyInflowCents)) {
    throw new Error("underwriting check failed");
  }
  return {
    approved: true,
    ratio: REQUIRED_COVERAGE,
    monthlyInflowCents,
  };
}

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
    approved: ratio >= COVERAGE_FLOOR && ratio >= REQUIRED_COVERAGE,
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
  approved: boolean,
  contract: ContractTerm,
  accessToken: string | null,
): Promise<void> {
  const columns = {
    underwriting_approved: approved,
    calculated_monthly_inflow_cents: decision.monthlyInflowCents,
    underwriting_checked_at: new Date().toISOString(),
    credential_type: contract.credentialType,
    credential_identifier: contract.credentialIdentifier,
    contract_end_date: contract.contractEndDate,
    intended_stay_end_date: contract.intendedStayEndDate,
  };
  const withToken = await supabase
    .from("profiles")
    .update({ ...columns, plaid_access_token: accessToken })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (!withToken.error && withToken.data) {
    return;
  }
  if (withToken.error && missingContractColumn(withToken.error)) {
    const legacy = await supabase
      .from("profiles")
      .update({
        underwriting_approved: approved,
        calculated_monthly_inflow_cents: decision.monthlyInflowCents,
        underwriting_checked_at: columns.underwriting_checked_at,
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (!legacy.error && legacy.data) {
      return;
    }
  }
  if (withToken.error && missingPlaidTokenColumn(withToken.error)) {
    const saved = await supabase
      .from("profiles")
      .update(columns)
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (!saved.error && saved.data) {
      return;
    }
    if (saved.error && missingContractColumn(saved.error)) {
      const legacy = await supabase
        .from("profiles")
        .update({
          underwriting_approved: approved,
          calculated_monthly_inflow_cents: decision.monthlyInflowCents,
          underwriting_checked_at: columns.underwriting_checked_at,
        })
        .eq("id", userId)
        .select("id")
        .maybeSingle();
      if (!legacy.error && legacy.data) {
        return;
      }
    }
  }
  throw new Error("underwriting record failed");
}

function missingContractColumn(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return (
    (error.code === "42703" || error.code === "PGRST204") &&
    (message.includes("credential_type") ||
      message.includes("credential_identifier") ||
      message.includes("contract_end_date") ||
      message.includes("intended_stay_end_date"))
  );
}

function missingPlaidTokenColumn(error: { code?: string; message?: string }): boolean {
  return (error.message ?? "").includes("plaid_access_token");
}

async function listingForCaller(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<string | null> {
  const agreement = await supabase
    .from("agreements")
    .select("listing_id")
    .eq("tenant_id", userId)
    .eq("status", "active")
    .limit(1);
  const agreementRow = Array.isArray(agreement.data) ? agreement.data[0] : agreement.data;
  const agreementListing =
    agreementRow && typeof agreementRow === "object" && typeof (agreementRow as { listing_id?: unknown }).listing_id === "string"
      ? (agreementRow as { listing_id: string }).listing_id
      : "";
  if (agreementListing.trim() !== "") {
    return agreementListing.trim();
  }
  const listing = await supabase.from("listings").select("id").eq("host_id", userId).limit(1);
  const listingRow = Array.isArray(listing.data) ? listing.data[0] : listing.data;
  const hostListing = listingRow && typeof listingRow === "object" && typeof (listingRow as { id?: unknown }).id === "string"
    ? (listingRow as { id: string }).id
    : "";
  return hostListing.trim() === "" ? "vr-weekly-room" : hostListing.trim();
}

function parseUnderwritingBody(
  value: unknown,
):
  | { simulated: boolean; accessToken: string; weeklyTargetCents: number; userId: string | null }
  | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const simulated = body.simulated === true;
  const accessToken = body.accessToken;
  const weeklyTargetCents = body.weeklyTargetCents;
  const userId = body.userId;
  if (!simulated && (typeof accessToken !== "string" || !accessToken.trim().startsWith("access-"))) {
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
    simulated,
    accessToken: typeof accessToken === "string" ? accessToken.trim() : "",
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
