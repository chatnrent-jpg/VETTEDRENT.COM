import { NextResponse } from "next/server";
import {
  INTENDED_STAY_DAYS,
  readListingCompliance,
} from "@/lib/geo-compliance";
import {
  delinquentWeeklyCents,
  landlordRiskExposureCents,
  underwrittenTenancyDays,
} from "@/lib/host-metrics";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { displayStayStatus, type DisplayStayStatus } from "@/lib/stay-status";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKLY_STAY_CENTS = 24500;

type StayCard = {
  agreementId: string;
  tenantId: string;
  lodgerName: string;
  status: DisplayStayStatus;
  underwrittenTenancyDays: number;
  landlordRiskExposureCents: number;
  vaultBalanceCents: number;
  delinquentWeeklyCents: number;
  geoCompliance: string;
};

type StayRow = {
  agreementId: string;
  tenantId: string;
  lodgerName: string;
  status: DisplayStayStatus;
  vaultBalanceCents: number;
  warningCount: number;
  listingId: string | null;
};

export async function GET(request: Request) {
  try {
    const supabase = await hostClient(request);
    if (supabase instanceof NextResponse) {
      return supabase;
    }
    const stay = await readStay(supabase);
    return NextResponse.json({ stay });
  } catch (error) {
    console.error("host stay failed");
    return NextResponse.json({ error: clientMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await hostClient(request);
    if (supabase instanceof NextResponse) {
      return supabase;
    }
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = stayActionFrom(payload);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const status = await applyStayAction(supabase, parsed.agreementId, parsed.action);
    return NextResponse.json({ status });
  } catch (error) {
    console.error("host stay update failed");
    const message = clientMessage(error);
    const status = conflictMessage(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function hostClient(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    return NextResponse.json({ error: "Host session required" }, { status: 401 });
  }
  const supabase = getSupabaseServerClient();
  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    return NextResponse.json({ error: "Host session required" }, { status: 401 });
  }
  const role = await resolveCallerRole(supabase, userResult.data.user);
  if (!isHostRole(role)) {
    return NextResponse.json({ error: "Host session required" }, { status: 401 });
  }
  return supabase;
}

async function readStay(
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<StayCard | null> {
  const listed = await supabase
    .from("agreements")
    .select("id, tenant_id, tenant_name, status, vault_balance_cents, warning_count, listing_id")
    .limit(20);
  if (listed.error) {
    throw new Error("stay read failed");
  }
  const stays = (listed.data ?? [])
    .map(stayFromRow)
    .filter((stay): stay is StayRow => stay !== null);
  const chosen = stays.find((stay) => stay.status === "active") ?? stays[0] ?? null;
  if (!chosen) {
    return null;
  }
  const dates = await contractDates(supabase, chosen.agreementId);
  const weeklyCents = await weeklyCentsForListing(supabase, chosen.listingId);
  const delinquent = delinquentWeeklyCents({
    status: chosen.status,
    warningCount: chosen.warningCount,
    weeklyCents,
  });
  const compliance = await readListingCompliance(supabase, chosen.listingId, INTENDED_STAY_DAYS);
  return {
    agreementId: chosen.agreementId,
    tenantId: chosen.tenantId,
    lodgerName: chosen.lodgerName,
    status: chosen.status,
    underwrittenTenancyDays: underwrittenTenancyDays({
      startDate: dates?.startDate ?? null,
      endDate: dates?.endDate ?? null,
      vaultBalanceCents: chosen.vaultBalanceCents,
    }),
    landlordRiskExposureCents: landlordRiskExposureCents(delinquent, chosen.vaultBalanceCents),
    vaultBalanceCents: chosen.vaultBalanceCents,
    delinquentWeeklyCents: delinquent,
    geoCompliance: compliance.statusLabel,
  };
}

type StayAction = "bounce" | "terminate" | "reset";

const WARNING_STATUSES = ["warning", "warning_1", "warning_2"] as const;

async function applyStayAction(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
  action: StayAction,
): Promise<DisplayStayStatus> {
  if (action === "bounce") {
    return bounceActiveStay(supabase, agreementId);
  }
  if (action === "terminate") {
    return terminateWarnedStay(supabase, agreementId);
  }
  return resetStay(supabase, agreementId);
}

async function bounceActiveStay(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<DisplayStayStatus> {
  const current = await readStayRow(supabase, agreementId);
  if (displayStayStatus(current.status) !== "active") {
    throw new Error("This stay is not active.");
  }
  const updated = await supabase
    .from("agreements")
    .update({
      status: "warning_1",
      warning_count: 1,
      payment_status: "delinquent",
      risk_level: "critical",
    })
    .eq("id", agreementId)
    .eq("warning_count", 0)
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) {
    throw new Error("stay bounce failed");
  }
  return "warning";
}

async function terminateWarnedStay(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<DisplayStayStatus> {
  const current = await readStayRow(supabase, agreementId);
  if (displayStayStatus(current.status) !== "warning") {
    throw new Error("This stay is not in warning.");
  }
  const updated = await supabase
    .from("agreements")
    .update({ status: "terminated" })
    .eq("id", agreementId)
    .in("status", [...WARNING_STATUSES])
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) {
    throw new Error("stay terminate failed");
  }
  return "terminated";
}

async function resetStay(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<DisplayStayStatus> {
  const current = await readStayRow(supabase, agreementId);
  const shown = displayStayStatus(current.status);
  if (shown !== "warning" && shown !== "terminated") {
    throw new Error("This stay is already active.");
  }
  const updated = await supabase
    .from("agreements")
    .update({
      status: "active",
      warning_count: 0,
      payment_status: "current",
      risk_level: "clear",
    })
    .eq("id", agreementId)
    .in("status", [...WARNING_STATUSES, "terminated"])
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) {
    throw new Error("stay reset failed");
  }
  return "active";
}

async function readStayRow(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<{ status: unknown }> {
  const current = await supabase
    .from("agreements")
    .select("id, status")
    .eq("id", agreementId)
    .maybeSingle();
  if (current.error) {
    throw new Error("stay read failed");
  }
  if (!current.data) {
    throw new Error("stay read failed");
  }
  return current.data;
}

function stayFromRow(row: {
  id?: unknown;
  tenant_id?: unknown;
  tenant_name?: unknown;
  status?: unknown;
  vault_balance_cents?: unknown;
  warning_count?: unknown;
  listing_id?: unknown;
}): StayRow | null {
  const agreementId = text(row.id);
  const tenantId = text(row.tenant_id);
  const status = displayStayStatus(row.status);
  if (!agreementId || !tenantId || !status) {
    return null;
  }
  const name = text(row.tenant_name);
  return {
    agreementId,
    tenantId,
    lodgerName: name ?? "Lodger",
    status,
    vaultBalanceCents: nonNegativeInteger(row.vault_balance_cents),
    warningCount: nonNegativeInteger(row.warning_count),
    listingId: text(row.listing_id),
  };
}

async function contractDates(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<{ startDate: string; endDate: string } | null> {
  const result = await supabase
    .from("corporate_placements")
    .select("contract_start_date, contract_end_date")
    .eq("agreement_id", agreementId)
    .limit(1);
  if (result.error) {
    return null;
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || typeof row !== "object") {
    return null;
  }
  const startDate = text((row as { contract_start_date?: unknown }).contract_start_date);
  const endDate = text((row as { contract_end_date?: unknown }).contract_end_date);
  if (!startDate || !endDate) {
    return null;
  }
  return { startDate, endDate };
}

async function weeklyCentsForListing(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  listingId: string | null,
): Promise<number> {
  if (!listingId) {
    return WEEKLY_STAY_CENTS;
  }
  const result = await supabase
    .from("listings")
    .select("weekly_price_cents")
    .eq("id", listingId)
    .limit(1);
  if (result.error) {
    return WEEKLY_STAY_CENTS;
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const cents = row && typeof row === "object" ? nonNegativeInteger((row as { weekly_price_cents?: unknown }).weekly_price_cents) : 0;
  return cents > 0 ? cents : WEEKLY_STAY_CENTS;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

function stayActionFrom(
  value: unknown,
): { agreementId: string; action: StayAction } | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Expected a JSON object" };
  }
  const agreementId = text((value as { agreementId?: unknown }).agreementId);
  if (!agreementId) {
    return { error: "agreementId must be a string" };
  }
  const action = (value as { action?: unknown }).action;
  if (action !== "bounce" && action !== "terminate" && action !== "reset") {
    return { error: "action must be bounce, terminate, or reset" };
  }
  return { agreementId, action };
}

function conflictMessage(message: string): boolean {
  return (
    message === "This stay is not active." ||
    message === "This stay is not in warning." ||
    message === "This stay is already active."
  );
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function clientMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Could not load the stay.";
  }
  if (error.message.includes("not configured")) {
    return error.message;
  }
  if (
    error.message === "This stay is not active." ||
    error.message === "This stay is not in warning." ||
    error.message === "This stay is already active."
  ) {
    return error.message;
  }
  if (error.message === "stay bounce failed") {
    return "Could not record the bounced payment.";
  }
  if (error.message === "stay terminate failed") {
    return "Could not terminate the stay.";
  }
  if (error.message === "stay reset failed") {
    return "Could not reset the stay.";
  }
  return "Could not load the stay.";
}
