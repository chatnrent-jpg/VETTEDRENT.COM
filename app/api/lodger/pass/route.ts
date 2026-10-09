import { NextResponse } from "next/server";
import { resolveCallerRole } from "@/lib/host-access";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAVINGS_GOAL_CENTS = 150000;

type LodgerPass = {
  tenantId: string | null;
  agreementId: string | null;
  balanceCents: number;
  savings_goal_cents: typeof SAVINGS_GOAL_CENTS;
};

export async function GET(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Lodger session required" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ error: "Lodger session required" }, { status: 401 });
    }

    const role = await resolveCallerRole(supabase, userResult.data.user);
    if (role !== "lodger") {
      return NextResponse.json({ error: "Lodger session required" }, { status: 401 });
    }

    const pass = await loadLodgerPass(supabase, userResult.data.user.id);
    return NextResponse.json(pass);
  } catch (error) {
    console.error("lodger pass failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not load your stay";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function loadLodgerPass(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<LodgerPass> {
  const profile = await readProfile(supabase, userId);
  const tenantId = profile ? stringField(profile, "id") : null;
  if (!tenantId) {
    return {
      tenantId: null,
      agreementId: null,
      balanceCents: 0,
      savings_goal_cents: SAVINGS_GOAL_CENTS,
    };
  }

  const agreementId = await readActiveAgreementId(supabase, tenantId);
  const ledger = await readLedger(supabase, payerKeys(profile, userId, tenantId));
  const balanceCents = ledger ? integerField(ledger, "vault_balance_cents") ?? 0 : 0;

  return {
    tenantId,
    agreementId,
    balanceCents,
    savings_goal_cents: SAVINGS_GOAL_CENTS,
  };
}

async function readProfile(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      throw new Error("profile read failed");
    }
    return asRecord(data);
  } catch (error) {
    if (error instanceof Error && error.message === "profile read failed") {
      throw error;
    }
    throw new Error("profile read failed");
  }
}

async function readActiveAgreementId(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("agreements")
      .select("id, tenant_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .limit(1);
    if (error) {
      throw new Error("agreement read failed");
    }
    const row = Array.isArray(data) ? data[0] : data;
    const record = asRecord(row);
    return record ? stringField(record, "id") : null;
  } catch (error) {
    if (error instanceof Error && error.message === "agreement read failed") {
      throw error;
    }
    throw new Error("agreement read failed");
  }
}

async function readLedger(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  keys: string[],
): Promise<Record<string, unknown> | null> {
  try {
    for (const key of keys) {
      const { data, error } = await supabase
        .from("vault_ledgers")
        .select("*")
        .eq("payer_key", key)
        .maybeSingle();
      if (error) {
        throw new Error("vault read failed");
      }
      const record = asRecord(data);
      if (record) {
        return record;
      }
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message === "vault read failed") {
      throw error;
    }
    throw new Error("vault read failed");
  }
}

function payerKeys(
  profile: Record<string, unknown> | null,
  userId: string,
  tenantId: string,
): string[] {
  const keys: string[] = [];
  for (const field of ["payer_key", "stripe_customer_id", "customer_id"] as const) {
    const value = profile ? stringField(profile, field) : null;
    if (value) {
      keys.push(value);
    }
  }
  keys.push(tenantId);
  if (userId !== tenantId) {
    keys.push(userId);
  }
  return [...new Set(keys)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function integerField(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
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
