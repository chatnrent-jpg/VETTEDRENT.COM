import { NextResponse } from "next/server";
import { createBankLinkToken } from "@/lib/plaid-link";
import { plaidCredentialsMissing } from "@/lib/plaid";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (plaidCredentialsMissing()) {
      return NextResponse.json({ ok: true, simulated: true });
    }

    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ ok: false, error: "Session required" }, { status: 401 });
    }

    const supabase = getSupabaseServerClient();
    const userResult = await supabase.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ ok: false, error: "Session required" }, { status: 401 });
    }

    const linkToken = await createBankLinkToken(userResult.data.user.id);
    return NextResponse.json({ ok: true, linkToken });
  } catch (error) {
    console.error("bank link token failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Bank link token failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
