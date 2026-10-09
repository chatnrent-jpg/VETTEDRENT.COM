import { NextResponse } from "next/server";
import { isHostRole, resolveCallerRole } from "@/lib/host-access";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGREEMENT_STATUSES = ["active", "warning", "terminated"] as const;
type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

type ScanBody = {
  tenant_id: string;
  agreement_id: string;
};

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Host session required" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseScanBody(payload);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
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

    const { data, error } = await supabase
      .from("agreements")
      .select("id, tenant_id, status, tenant_name")
      .eq("id", parsed.agreement_id)
      .eq("tenant_id", parsed.tenant_id)
      .maybeSingle();

    if (error) {
      console.error("verify scan failed");
      return NextResponse.json(
        { error: "Could not verify this agreement" },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "No agreement matches this code" }, { status: 404 });
    }

    const status = agreementStatus(data.status);
    if (!status) {
      console.error("verify scan failed");
      return NextResponse.json(
        { error: "Could not verify this agreement" },
        { status: 500 },
      );
    }

    const tenantName = readTenantName(data.tenant_name);
    return NextResponse.json(
      tenantName ? { status, tenantName } : { status },
    );
  } catch (error) {
    console.error("verify scan failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not verify this agreement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function parseScanBody(value: unknown): ScanBody | { error: string } {
  if (value === null || typeof value !== "object") {
    return { error: "Expected a JSON object" };
  }
  const body = value as Record<string, unknown>;
  if (typeof body.tenant_id !== "string" || body.tenant_id.trim() === "") {
    return { error: "tenant_id must be a string" };
  }
  if (typeof body.agreement_id !== "string" || body.agreement_id.trim() === "") {
    return { error: "agreement_id must be a string" };
  }
  return {
    tenant_id: body.tenant_id.trim(),
    agreement_id: body.agreement_id.trim(),
  };
}

function agreementStatus(value: unknown): AgreementStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  return AGREEMENT_STATUSES.includes(value as AgreementStatus)
    ? (value as AgreementStatus)
    : null;
}

function readTenantName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
