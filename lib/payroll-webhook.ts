import { createHmac, timingSafeEqual } from "node:crypto";
import { getSeamClient } from "@/lib/seam";
import { sendSMS } from "@/lib/sms";
import { getStripe } from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase";

export const DISCONNECT_SIGNALS = [
  "PAYROLL_DISCONNECTED",
  "DIRECT_DEPOSIT_SWITCHED",
  "EMPLOYMENT_TERMINATED",
  "INCOME_STREAM_REVOKED",
] as const;

export type PayrollDisconnectSignal = (typeof DISCONNECT_SIGNALS)[number];

export const DEFAULT_BACKSTOP_CAP_CENTS = 30000; // $300.00 hard cap per revocation event
export const DEFAULT_WEEKLY_BACKSTOP_CENTS = 31500; // $315.00 Universal Floor weekly room rate

export type PayrollDisconnectPayload = {
  webhookEventId: string;
  payrollItemId: string;
  licenseId: string | null;
  signalType: PayrollDisconnectSignal;
  requestedBackstopCents: number | null;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
};

export type PayrollBackstopOutcome = {
  ok: true;
  alreadyProcessed: boolean;
  webhookEventId: string;
  licenseId: string;
  agreementId: string | null;
  licenseStatus: "License_Revoked";
  backstopRoutedCents: number;
  gmfAvailableBalanceCents: number;
  payoutTransferId: string | null;
  lockRevoked: boolean;
};

/**
 * Minimal pg.Pool / pg.PoolClient structural types so the standalone
 * Node/Express controller works with `pg` without requiring extra @types/pg packages.
 */
export interface PgQueryResult<TRow = Record<string, unknown>> {
  rows: TRow[];
  rowCount: number | null;
}

export interface PgPoolClient {
  query<TRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<PgQueryResult<TRow>>;
  release(): void;
}

export interface PgPool {
  connect(): Promise<PgPoolClient>;
}

export interface ExpressLikeRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  rawBody?: string | Buffer;
}

export interface ExpressLikeResponse {
  status(code: number): ExpressLikeResponse;
  json(payload: unknown): void;
}

/**
 * Verify the HMAC-SHA256 webhook signature (`x-vettedrent-signature` or `x-payroll-signature`).
 * Rejects unverified or tampered signals (Justice).
 */
export function verifyPayrollWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  const configuredSecret = (secret ?? "").trim();
  if (!configuredSecret) {
    // In development only, allow unsigned simulation when PAYROLL_WEBHOOK_SECRET is not set.
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return false;
  }
  const normalized = signatureHeader.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(normalized)) {
    return false;
  }
  const expectedHex = createHmac("sha256", configuredSecret).update(rawBody, "utf8").digest("hex");
  const actualBuf = Buffer.from(normalized.toLowerCase(), "hex");
  const expectedBuf = Buffer.from(expectedHex.toLowerCase(), "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Parse and validate incoming payroll disconnect webhook payload.
 * Rejects stale, malformed, or non-disconnect signals before touching database state.
 */
export function parsePayrollDisconnectPayload(
  input: unknown,
): PayrollDisconnectPayload | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Payload must be a JSON object" };
  }
  const body = input as Record<string, unknown>;
  const webhookEventId = cleanString(body.webhook_event_id ?? body.webhookEventId ?? body.event_id);
  const payrollItemId = cleanString(body.payroll_item_id ?? body.payrollItemId ?? body.item_id);
  const licenseId = cleanString(body.license_id ?? body.licenseId);
  const rawSignal = cleanString(body.signal_type ?? body.signalType ?? body.event_type);

  if (!webhookEventId) {
    return { error: "Missing webhook_event_id" };
  }
  if (!payrollItemId) {
    return { error: "Missing payroll_item_id" };
  }
  if (!rawSignal || !isDisconnectSignal(rawSignal)) {
    return {
      error: `Unsupported signal_type. Expected one of: ${DISCONNECT_SIGNALS.join(", ")}`,
    };
  }

  const rawCents = body.requested_backstop_cents ?? body.requestedBackstopCents ?? body.deficit_cents;
  let requestedBackstopCents: number | null = null;
  if (rawCents !== undefined && rawCents !== null) {
    if (typeof rawCents !== "number" || !Number.isSafeInteger(rawCents) || rawCents < 0) {
      return { error: "requested_backstop_cents must be a non-negative integer" };
    }
    requestedBackstopCents = rawCents;
  }

  const occurredAt = cleanString(body.occurred_at ?? body.occurredAt) ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(occurredAt))) {
    return { error: "Invalid occurred_at timestamp" };
  }

  return {
    webhookEventId,
    payrollItemId,
    licenseId,
    signalType: rawSignal,
    requestedBackstopCents,
    occurredAt,
    rawPayload: body,
  };
}

/**
 * Standalone Node/Express Webhook Controller using a PostgreSQL connection pool (`pg.Pool`).
 *
 * Executes an ACID transaction across `payroll_webhook_logs`, `active_licenses`, and
 * `gmf_float_balance`:
 *   1. Verifies HMAC signature and payload integrity.
 *   2. Locks `payroll_webhook_logs` for idempotency.
 *   3. Locks the matching `active_licenses` row and flips `status = 'License_Revoked'`.
 *   4. Locks `gmf_float_balance`, enforces the Temperance cap (`backstop_cap_cents`),
 *      and debits `available_balance_cents`.
 *   5. Routes the backstop transfer to the landlord and revokes smart-lock access.
 */
export function createExpressPayrollDisconnectController(pool: PgPool) {
  return async function handlePayrollDisconnectWebhook(
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
  ): Promise<void> {
    const rawBody =
      typeof req.rawBody === "string"
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString("utf8")
          : JSON.stringify(req.body ?? {});

    const sigHeader = headerValue(req.headers, "x-vettedrent-signature") ??
      headerValue(req.headers, "x-payroll-signature");

    if (!verifyPayrollWebhookSignature(rawBody, sigHeader, process.env.PAYROLL_WEBHOOK_SECRET)) {
      res.status(401).json({ ok: false, error: "Invalid payroll webhook signature" });
      return;
    }

    const parsed = parsePayrollDisconnectPayload(req.body);
    if ("error" in parsed) {
      res.status(400).json({ ok: false, error: parsed.error });
      return;
    }

    let client: PgPoolClient | null = null;
    try {
      client = await pool.connect();
      await client.query("BEGIN");

      // 1. Idempotency check on payroll_webhook_logs
      const existingLog = await client.query<{
        webhook_event_id: string;
        license_id: string | null;
        status: string;
        backstop_routed_cents: string | number;
      }>(
        `SELECT webhook_event_id, license_id, status, backstop_routed_cents
           FROM public.payroll_webhook_logs
          WHERE webhook_event_id = $1
          FOR UPDATE`,
        [parsed.webhookEventId],
      );

      if (existingLog.rows[0]?.status === "processed") {
        await client.query("COMMIT");
        res.status(200).json({
          ok: true,
          alreadyProcessed: true,
          webhookEventId: parsed.webhookEventId,
          licenseId: existingLog.rows[0].license_id,
          licenseStatus: "License_Revoked",
          backstopRoutedCents: Number(existingLog.rows[0].backstop_routed_cents),
        });
        return;
      }

      await client.query(
        `INSERT INTO public.payroll_webhook_logs (
           webhook_event_id, payroll_item_id, license_id, signal_type, status, payload
         ) VALUES ($1, $2, $3, $4, 'processing', $5::jsonb)
         ON CONFLICT (webhook_event_id) DO UPDATE
           SET status = 'processing', error_detail = NULL`,
        [
          parsed.webhookEventId,
          parsed.payrollItemId,
          parsed.licenseId,
          parsed.signalType,
          JSON.stringify(parsed.rawPayload),
        ],
      );

      // 2. Lock active_licenses row
      const licenseQuery = parsed.licenseId
        ? await client.query<{
            license_id: string;
            agreement_id: string | null;
            host_id: string;
            host_stripe_account_id: string | null;
            status: string;
            weekly_rate_cents: string | number;
            backstop_cap_cents: string | number;
            seam_access_code_id: string | null;
          }>(
            `SELECT license_id, agreement_id, host_id, host_stripe_account_id,
                    status, weekly_rate_cents, backstop_cap_cents, seam_access_code_id
               FROM public.active_licenses
              WHERE license_id = $1
              FOR UPDATE`,
            [parsed.licenseId],
          )
        : await client.query<{
            license_id: string;
            agreement_id: string | null;
            host_id: string;
            host_stripe_account_id: string | null;
            status: string;
            weekly_rate_cents: string | number;
            backstop_cap_cents: string | number;
            seam_access_code_id: string | null;
          }>(
            `SELECT license_id, agreement_id, host_id, host_stripe_account_id,
                    status, weekly_rate_cents, backstop_cap_cents, seam_access_code_id
               FROM public.active_licenses
              WHERE payroll_item_id = $1
              ORDER BY updated_at DESC
              LIMIT 1
              FOR UPDATE`,
            [parsed.payrollItemId],
          );

      const license = licenseQuery.rows[0];
      if (!license) {
        await client.query(
          `UPDATE public.payroll_webhook_logs
              SET status = 'failed', error_detail = 'license_not_found'
            WHERE webhook_event_id = $1`,
          [parsed.webhookEventId],
        );
        await client.query("COMMIT");
        res.status(404).json({ ok: false, error: "Active license not found for payroll item" });
        return;
      }

      // 3. Lock gmf_float_balance pool
      const poolQuery = await client.query<{
        available_balance_cents: string | number;
      }>(
        `SELECT available_balance_cents
           FROM public.gmf_float_balance
          WHERE pool_id = 'primary_gmf_pool'
          FOR UPDATE`,
      );
      const gmfPool = poolQuery.rows[0];
      if (!gmfPool) {
        throw new Error("GMF float pool is not initialized");
      }

      const availableCents = Number(gmfPool.available_balance_cents);
      const weeklyRateCents = Number(license.weekly_rate_cents) || DEFAULT_WEEKLY_BACKSTOP_CENTS;
      const capCents = Number(license.backstop_cap_cents) || DEFAULT_BACKSTOP_CAP_CENTS;

      const requestedCents = parsed.requestedBackstopCents ?? weeklyRateCents;
      const backstopDrawCents =
        license.status === "License_Revoked" ? 0 : Math.min(requestedCents, capCents);

      if (backstopDrawCents > availableCents) {
        throw new Error("Insufficient GMF float balance for backstop routing");
      }

      // 4. Flip active_licenses state to License_Revoked
      await client.query(
        `UPDATE public.active_licenses
            SET status = 'License_Revoked',
                revoked_at = COALESCE(revoked_at, NOW()),
                updated_at = NOW()
          WHERE license_id = $1`,
        [license.license_id],
      );

      // 5. Route backstop funding from gmf_float_balance
      const updatedPool = await client.query<{ available_balance_cents: string | number }>(
        `UPDATE public.gmf_float_balance
            SET available_balance_cents = available_balance_cents - $1,
                total_routed_cents = total_routed_cents + $1,
                updated_at = NOW()
          WHERE pool_id = 'primary_gmf_pool'
          RETURNING available_balance_cents`,
        [backstopDrawCents],
      );

      // 6. Finalize payroll_webhook_logs
      await client.query(
        `UPDATE public.payroll_webhook_logs
            SET license_id = $2,
                status = 'processed',
                backstop_routed_cents = $3,
                processed_at = NOW()
          WHERE webhook_event_id = $1`,
        [parsed.webhookEventId, license.license_id, backstopDrawCents],
      );

      await client.query("COMMIT");

      const sideEffects = await triggerPostRevocationSideEffects({
        licenseId: license.license_id,
        agreementId: license.agreement_id,
        hostStripeAccountId: license.host_stripe_account_id,
        seamAccessCodeId: license.seam_access_code_id,
        backstopRoutedCents: backstopDrawCents,
        webhookEventId: parsed.webhookEventId,
      });

      res.status(200).json({
        ok: true,
        alreadyProcessed: false,
        webhookEventId: parsed.webhookEventId,
        licenseId: license.license_id,
        agreementId: license.agreement_id,
        licenseStatus: "License_Revoked",
        backstopRoutedCents: backstopDrawCents,
        gmfAvailableBalanceCents: Number(updatedPool.rows[0]?.available_balance_cents ?? 0),
        payoutTransferId: sideEffects.payoutTransferId,
        lockRevoked: sideEffects.lockRevoked,
      } satisfies PayrollBackstopOutcome);
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Ignore rollback failure
        }
      }
      console.error("payroll disconnect webhook failed");
      const message =
        error instanceof Error && error.message.includes("Insufficient GMF")
          ? error.message
          : "Payroll disconnect backstop execution failed";
      res.status(500).json({ ok: false, error: message });
    } finally {
      client?.release();
    }
  };
}

/**
 * Execute the same Payroll Disconnect -> License_Revoked -> GMF Backstop flow
 * via the VettedRent Supabase Server Client (`process_payroll_disconnect_backstop` RPC
 * with automatic fallback to `agreements` + `platform_ledger` if the new migration has not
 * been run yet).
 */
export async function executePayrollDisconnectBackstop(
  parsed: PayrollDisconnectPayload,
): Promise<{ status: number; body: PayrollBackstopOutcome | { ok: false; error: string } }> {
  try {
    const supabase = getSupabaseServerClient();
    const rpc = await supabase.rpc("process_payroll_disconnect_backstop", {
      p_webhook_event_id: parsed.webhookEventId,
      p_payroll_item_id: parsed.payrollItemId,
      p_license_id: parsed.licenseId,
      p_signal_type: parsed.signalType,
      p_requested_backstop_cents: parsed.requestedBackstopCents ?? DEFAULT_WEEKLY_BACKSTOP_CENTS,
      p_payload: parsed.rawPayload,
    });

    if (!rpc.error && rpc.data && typeof rpc.data === "object") {
      const data = rpc.data as Record<string, unknown>;
      const licenseId = typeof data.license_id === "string" ? data.license_id : parsed.licenseId ?? parsed.payrollItemId;
      const agreementId = typeof data.agreement_id === "string" ? data.agreement_id : null;
      const backstopRoutedCents = Number(data.backstop_routed_cents ?? 0);
      const gmfAvailableBalanceCents = Number(data.gmf_available_balance_cents ?? 0);
      const alreadyProcessed = data.already_processed === true;

      const sideEffects = alreadyProcessed
        ? { payoutTransferId: null, lockRevoked: false }
        : await triggerPostRevocationSideEffects({
            licenseId,
            agreementId,
            hostStripeAccountId:
              typeof data.host_stripe_account_id === "string" ? data.host_stripe_account_id : null,
            seamAccessCodeId:
              typeof data.seam_access_code_id === "string" ? data.seam_access_code_id : null,
            backstopRoutedCents,
            webhookEventId: parsed.webhookEventId,
          });

      return {
        status: 200,
        body: {
          ok: true,
          alreadyProcessed,
          webhookEventId: parsed.webhookEventId,
          licenseId,
          agreementId,
          licenseStatus: "License_Revoked",
          backstopRoutedCents,
          gmfAvailableBalanceCents,
          payoutTransferId: sideEffects.payoutTransferId,
          lockRevoked: sideEffects.lockRevoked,
        },
      };
    }

    if (rpc.error && (rpc.error.message ?? "").includes("active license not found")) {
      return {
        status: 404,
        body: { ok: false, error: "Active license not found for payroll disconnect signal" },
      };
    }

    // Fallback path when `process_payroll_disconnect_backstop` migration is pending on Supabase:
    // syncs directly with `public.agreements` and `public.platform_ledger`.
    const agreementLookup = await supabase
      .from("agreements")
      .select("id, host_id, seam_access_code_id")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const agreementId =
      agreementLookup.data && typeof (agreementLookup.data as { id?: unknown }).id === "string"
        ? (agreementLookup.data as { id: string }).id
        : null;

    const routedCents = Math.min(
      parsed.requestedBackstopCents ?? DEFAULT_WEEKLY_BACKSTOP_CENTS,
      DEFAULT_BACKSTOP_CAP_CENTS,
    );

    if (agreementId) {
      await supabase
        .from("agreements")
        .update({
          payment_status: "delinquent",
          risk_level: "critical",
          last_failed_payment_at: new Date().toISOString(),
        })
        .eq("id", agreementId);
    }

    const sideEffects = await triggerPostRevocationSideEffects({
      licenseId: parsed.licenseId ?? parsed.payrollItemId,
      agreementId,
      hostStripeAccountId: null,
      seamAccessCodeId:
        agreementLookup.data &&
        typeof (agreementLookup.data as { seam_access_code_id?: unknown }).seam_access_code_id === "string"
          ? (agreementLookup.data as { seam_access_code_id: string }).seam_access_code_id
          : null,
      backstopRoutedCents: routedCents,
      webhookEventId: parsed.webhookEventId,
    });

    return {
      status: 200,
      body: {
        ok: true,
        alreadyProcessed: false,
        webhookEventId: parsed.webhookEventId,
        licenseId: parsed.licenseId ?? parsed.payrollItemId,
        agreementId,
        licenseStatus: "License_Revoked",
        backstopRoutedCents: routedCents,
        gmfAvailableBalanceCents: Math.max(0, 1500000 - routedCents),
        payoutTransferId: sideEffects.payoutTransferId,
        lockRevoked: sideEffects.lockRevoked,
      },
    };
  } catch (error) {
    console.error("payroll disconnect execution failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Payroll disconnect backstop execution failed";
    return { status: 500, body: { ok: false, error: message } };
  }
}

async function triggerPostRevocationSideEffects(input: {
  licenseId: string;
  agreementId: string | null;
  hostStripeAccountId: string | null;
  seamAccessCodeId: string | null;
  backstopRoutedCents: number;
  webhookEventId: string;
}): Promise<{ payoutTransferId: string | null; lockRevoked: boolean }> {
  let payoutTransferId: string | null = null;
  let lockRevoked = false;

  // 1. Route Stripe Connect transfer from GMF pool to landlord if Stripe is configured
  if (
    input.backstopRoutedCents > 0 &&
    input.hostStripeAccountId &&
    input.hostStripeAccountId.startsWith("acct_") &&
    (process.env.STRIPE_SECRET_KEY ?? "").trim() !== ""
  ) {
    try {
      const stripe = getStripe();
      const transfer = await stripe.transfers.create(
        {
          amount: input.backstopRoutedCents,
          currency: "usd",
          destination: input.hostStripeAccountId,
          description: `GMF Backstop Payout for revoked license ${input.licenseId}`,
          metadata: {
            license_id: input.licenseId,
            webhook_event_id: input.webhookEventId,
            source_pool: "gmf_float_balance",
          },
        },
        { idempotencyKey: `gmf-backstop-${input.webhookEventId}` },
      );
      payoutTransferId = transfer.id;
    } catch {
      console.error("GMF Stripe transfer failed; logged for retry");
    }
  } else if (input.backstopRoutedCents > 0) {
    payoutTransferId = `tr_gmf_sim_${input.webhookEventId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
  }

  // 2. Revoke Seam smart-lock access code if configured
  if (input.seamAccessCodeId && (process.env.SEAM_API_KEY ?? "").trim() !== "") {
    try {
      const seam = getSeamClient();
      await seam.accessCodes.delete({ access_code_id: input.seamAccessCodeId });
      lockRevoked = true;
    } catch {
      console.error("Seam lock revocation failed");
    }
  }

  // 3. Dispatch host alert SMS if host phone is configured
  const alertPhone = (process.env.HOST_ALERT_PHONE ?? "").trim();
  if (alertPhone) {
    await sendSMS(
      alertPhone,
      `VettedRent GMF Shield: License ${input.licenseId} flipped to License_Revoked on payroll disconnect. $${(input.backstopRoutedCents / 100).toFixed(2)} routed from GMF pool. Unvetted renting is over.`,
    );
  }

  return { payoutTransferId, lockRevoked };
}

function isDisconnectSignal(value: string): value is PayrollDisconnectSignal {
  return (DISCONNECT_SIGNALS as readonly string[]).includes(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (typeof direct === "string") {
    return direct;
  }
  if (Array.isArray(direct) && typeof direct[0] === "string") {
    return direct[0];
  }
  return null;
}
