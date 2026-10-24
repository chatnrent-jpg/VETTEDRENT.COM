import { NextResponse } from "next/server";
import {
  executePayrollDisconnectBackstop,
  parsePayrollDisconnectPayload,
  verifyPayrollWebhookSignature,
} from "@/lib/payroll-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get("x-vettedrent-signature") ??
      request.headers.get("x-payroll-signature");

    if (
      !verifyPayrollWebhookSignature(
        rawBody,
        signature,
        process.env.PAYROLL_WEBHOOK_SECRET,
      )
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid payroll webhook signature" },
        { status: 401 },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = parsePayrollDisconnectPayload(payload);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const result = await executePayrollDisconnectBackstop(parsed);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("payroll webhook route failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Payroll webhook processing failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
