import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createBankLinkToken } from "@/lib/plaid-link";
import { executeWithoutLimitation } from "@/lib/plaid";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"));
    let clientUserId = `vr_lodger_${randomUUID().slice(0, 12)}`;

    if (token) {
      try {
        const supabase = getSupabaseServerClient();
        const userResult = await supabase.auth.getUser(token);
        if (!userResult.error && userResult.data.user) {
          clientUserId = userResult.data.user.id;
        }
      } catch {
        // Proceed with ephemeral clientUserId if session lookup hiccups
      }
    }

    const execution = await executeWithoutLimitation<{
      ok: true;
      simulated: boolean;
      linkToken: string | null;
      fallbackReason?: string;
    }>({
      operationName: "plaid.linkTokenCreate",
      liveOperation: async () => {
        const linkToken = await createBankLinkToken(clientUserId);
        return {
          ok: true,
          simulated: false,
          linkToken,
        };
      },
      fallbackOperation: (reason) => ({
        ok: true,
        simulated: true,
        linkToken: null,
        fallbackReason: reason,
      }),
    });

    return NextResponse.json({
      ...execution.value,
      fallbackUsed: execution.usedFallback,
      fallbackSource: execution.fallbackSource,
    });
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
