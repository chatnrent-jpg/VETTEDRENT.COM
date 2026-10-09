import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKS_PER_MONTH = 4;

export async function POST(request: Request) {
  try {
    if (!process.env.ENTERPRISE_PORTAL_KEY) {
      throw new Error("ENTERPRISE_PORTAL_KEY is not configured");
    }
    if (!authorizedAgency(request.headers.get("authorization"))) {
      return NextResponse.json({ ok: false, error: "Unauthorized agency token" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parsePlacementBody(payload);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const tenantId = await ensureLodger(supabase, parsed.workerEmail, parsed.workerFullName);
    await saveLodgerProfile(supabase, tenantId, parsed);
    await savePlacement(supabase, tenantId, parsed);

    return NextResponse.json({
      ok: true,
      message: "Worker placement pre-verified and profile initialized successfully.",
      tenantId,
      underwritingStatus: "approved_by_corporate",
    });
  } catch (error) {
    console.error("enterprise placement failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : error instanceof Error && error.message === "worker email belongs to another role"
          ? "This email cannot be placed as a lodger"
          : "Failed to establish worker profile record";
    const status = message === "This email cannot be placed as a lodger" ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

type PlacementInput = {
  agencyName: string;
  workerEmail: string;
  workerFullName: string;
  contractStartDate: string;
  contractEndDate: string;
  weeklyStipendCents: number;
};

async function ensureLodger(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  email: string,
  fullName: string,
): Promise<string> {
  try {
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: "lodger" },
      user_metadata: { full_name: fullName },
    });
    if (created.data.user) {
      return created.data.user.id;
    }
    if (!isExistingEmail(created.error)) {
      throw new Error("profile upsert failed");
    }

    const linked = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    const user = linked.data.user;
    if (linked.error || !user) {
      throw new Error("profile upsert failed");
    }
    const role = readRole(user.app_metadata);
    if (role && role !== "lodger") {
      throw new Error("worker email belongs to another role");
    }
    if (!role) {
      const updated = await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { role: "lodger" },
      });
      if (updated.error || !updated.data.user) {
        throw new Error("profile upsert failed");
      }
    }
    return user.id;
  } catch (error) {
    if (error instanceof Error && error.message === "worker email belongs to another role") {
      throw error;
    }
    if (error instanceof Error && error.message === "profile upsert failed") {
      throw error;
    }
    throw new Error("profile upsert failed");
  }
}

async function saveLodgerProfile(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  placement: PlacementInput,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: tenantId,
          email: placement.workerEmail,
          full_name: placement.workerFullName,
          role: "lodger",
          underwriting_approved: true,
          calculated_monthly_inflow_cents: placement.weeklyStipendCents * WEEKS_PER_MONTH,
          underwriting_checked_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new Error("profile upsert failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "profile upsert failed") {
      throw error;
    }
    throw new Error("profile upsert failed");
  }
}

async function savePlacement(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  placement: PlacementInput,
): Promise<void> {
  const row = {
    tenant_id: tenantId,
    agency_name: placement.agencyName,
    worker_email: placement.workerEmail,
    worker_full_name: placement.workerFullName,
    contract_start_date: placement.contractStartDate,
    contract_end_date: placement.contractEndDate,
    weekly_stipend_cents: placement.weeklyStipendCents,
    underwriting_status: "approved_by_corporate",
  };
  try {
    const inserted = await supabase
      .from("corporate_placements")
      .insert({ id: randomUUID(), ...row })
      .select("id")
      .maybeSingle();
    if (!inserted.error) {
      return;
    }
    if (inserted.error.code !== "23505") {
      throw new Error("placement record failed");
    }
    const updated = await supabase
      .from("corporate_placements")
      .update(row)
      .eq("worker_email", placement.workerEmail)
      .eq("contract_start_date", placement.contractStartDate)
      .eq("contract_end_date", placement.contractEndDate)
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      throw new Error("placement record failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "placement record failed") {
      throw error;
    }
    throw new Error("placement record failed");
  }
}

function parsePlacementBody(value: unknown): PlacementInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const agencyName = textField(body.agencyName);
  const workerEmail = textField(body.workerEmail)?.toLowerCase() ?? null;
  const workerFullName = textField(body.workerFullName);
  const contractStartDate = isoDate(body.contractStartDate);
  const contractEndDate = isoDate(body.contractEndDate);
  const weeklyStipendCents = stipendCents(body.weeklyStipendCents);

  if (!agencyName) {
    return { error: "Missing or invalid agencyName" };
  }
  if (!workerEmail || !workerEmail.includes("@") || /\s/.test(workerEmail)) {
    return { error: "Missing or invalid workerEmail" };
  }
  if (!workerFullName) {
    return { error: "Missing or invalid workerFullName" };
  }
  if (!contractStartDate || !contractEndDate || contractEndDate < contractStartDate) {
    return { error: "Missing or invalid contract dates" };
  }
  if (weeklyStipendCents === null) {
    return { error: "Missing or invalid weeklyStipendCents amount" };
  }
  return {
    agencyName,
    workerEmail,
    workerFullName,
    contractStartDate,
    contractEndDate,
    weeklyStipendCents,
  };
}

function stipendCents(value: unknown): number | null {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }
  if (!Number.isSafeInteger(value * WEEKS_PER_MONTH)) {
    return null;
  }
  return value;
}

function textField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return value;
}

function readRole(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const role = (metadata as { role?: unknown }).role;
  if (typeof role !== "string") {
    return null;
  }
  const trimmed = role.trim();
  return trimmed === "" ? null : trimmed;
}

function isExistingEmail(error: { code?: string | null; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    (error.message ?? "").includes("already been registered")
  );
}

function authorizedAgency(header: string | null): boolean {
  const key = process.env.ENTERPRISE_PORTAL_KEY;
  if (!key || !header) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${key}`);
  const provided = Buffer.from(header.trim());
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}
