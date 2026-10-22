import { NextResponse } from "next/server";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { displayStayStatus, type DisplayStayStatus } from "@/lib/stay-status";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StayCard = {
  agreementId: string;
  tenantId: string;
  lodgerName: string;
  status: DisplayStayStatus;
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
    const agreementId = agreementIdFrom(payload);
    if (!agreementId) {
      return NextResponse.json({ error: "agreementId must be a string" }, { status: 400 });
    }
    const status = await bounceActiveStay(supabase, agreementId);
    return NextResponse.json({ status });
  } catch (error) {
    console.error("host stay bounce failed");
    const message = clientMessage(error);
    const status = message === "This stay is not active." ? 409 : 500;
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
    .select("id, tenant_id, tenant_name, status")
    .limit(20);
  if (listed.error) {
    throw new Error("stay read failed");
  }
  const stays = (listed.data ?? [])
    .map(stayFromRow)
    .filter((stay): stay is StayCard => stay !== null);
  return stays.find((stay) => stay.status === "active") ?? stays[0] ?? null;
}

async function bounceActiveStay(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agreementId: string,
): Promise<DisplayStayStatus> {
  const current = await supabase
    .from("agreements")
    .select("id, status, warning_count")
    .eq("id", agreementId)
    .maybeSingle();
  if (current.error) {
    throw new Error("stay read failed");
  }
  if (!current.data || displayStayStatus(current.data.status) !== "active") {
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
    throw new Error("stay update failed");
  }
  return "warning";
}

function stayFromRow(row: {
  id?: unknown;
  tenant_id?: unknown;
  tenant_name?: unknown;
  status?: unknown;
}): StayCard | null {
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
  };
}

function agreementIdFrom(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return text((value as { agreementId?: unknown }).agreementId);
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
  if (error.message === "This stay is not active.") {
    return error.message;
  }
  if (error.message === "stay update failed") {
    return "Could not record the bounced payment.";
  }
  return "Could not load the stay.";
}
