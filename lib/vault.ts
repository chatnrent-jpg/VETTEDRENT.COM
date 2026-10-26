import { addDaysIsoUtc, todayIsoUtc } from "@/lib/availability-calendar";
import { splitWeeklyCapture } from "@/lib/stripe";
import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * Vault balances are integer cents (the 14.3% vault share of a captured invoice).
 * Not dollars, and not a flat credit.
 */
export type VaultCreditResult =
  | { ok: true; alreadyCredited: boolean; vaultBalanceCents: number }
  | { ok: false; error: string };

export type LedgerInstallmentSettlementResult = {
  ok: true;
  ledgerRowId: string | null;
  licenseId: string | null;
  billingCycleNumber: number;
  amountCollectedCents: number;
  hostPayoutCents: number;
  gmfEscrowCents: number;
  platformFeeCents: number;
  stripeChargeId: string | null;
  gmfFloatPoolBalanceCents: number | null;
  persistedToSupabase: boolean;
};

type CreditRow = {
  already_credited?: boolean;
  vault_balance_cents?: number | string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Add vaultCents to the payer's balance once per Stripe invoice id.
 * A retry with the same invoice id does not credit again.
 * Missing Supabase env returns an error and does not report a moved balance.
 */
export async function creditVaultCents(input: {
  payerKey: string;
  invoiceId: string;
  vaultCents: number;
}): Promise<VaultCreditResult> {
  const payerKey = input.payerKey.trim();
  const invoiceId = input.invoiceId.trim();
  if (!payerKey) {
    return { ok: false, error: "payer key is required" };
  }
  if (!invoiceId) {
    return { ok: false, error: "invoice id is required" };
  }
  if (!Number.isSafeInteger(input.vaultCents) || input.vaultCents < 0) {
    return { ok: false, error: "vault cents must be a non-negative integer" };
  }

  const missing = missingSupabaseEnv();
  if (missing) {
    return { ok: false, error: missing };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("credit_vault_invoice", {
      p_payer_key: payerKey,
      p_invoice_id: invoiceId,
      p_vault_cents: input.vaultCents,
    });
    if (error) {
      console.error("vault credit failed");
      return { ok: false, error: "Vault credit failed" };
    }
    const row = firstRow(data);
    const balance = parseCents(row?.vault_balance_cents);
    if (balance === null) {
      console.error("vault credit failed");
      return { ok: false, error: "Vault credit failed" };
    }
    return {
      ok: true,
      alreadyCredited: row?.already_credited === true,
      vaultBalanceCents: balance,
    };
  } catch (error) {
    console.error("vault credit failed");
    if (error instanceof Error && error.message.includes("not configured")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Vault credit failed" };
  }
}

/**
 * Add vaultCents to agreements.vault_balance_cents once per Stripe invoice id.
 * A retry with the same invoice id does not add the share again.
 */
export async function creditAgreementVault(input: {
  agreementId: string;
  invoiceId: string;
  vaultCents: number;
}): Promise<VaultCreditResult> {
  const agreementId = input.agreementId.trim();
  const invoiceId = input.invoiceId.trim();
  if (!agreementId) {
    return { ok: false, error: "agreement id is required" };
  }
  if (!invoiceId) {
    return { ok: false, error: "invoice id is required" };
  }
  if (!Number.isSafeInteger(input.vaultCents) || input.vaultCents < 0) {
    return { ok: false, error: "vault cents must be a non-negative integer" };
  }

  const missing = missingSupabaseEnv();
  if (missing) {
    return { ok: false, error: missing };
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("credit_agreement_vault", {
      p_agreement_id: agreementId,
      p_invoice_id: invoiceId,
      p_vault_cents: input.vaultCents,
    });
    if (error) {
      console.error("agreement escrow sync failed");
      return { ok: false, error: "Agreement escrow sync failed" };
    }
    const row = firstRow(data);
    const balance = parseCents(row?.vault_balance_cents);
    if (balance === null) {
      console.error("agreement escrow sync failed");
      return { ok: false, error: "Agreement escrow sync failed" };
    }
    return {
      ok: true,
      alreadyCredited: row?.already_credited === true,
      vaultBalanceCents: balance,
    };
  } catch (error) {
    console.error("agreement escrow sync failed");
    if (error instanceof Error && error.message.includes("not configured")) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Agreement escrow sync failed" };
  }
}

/**
 * Records a resolved weekly installment in `public.weekly_deduction_ledger` and
 * updates `public.gmf_float_balance` using pure BigInt integer-cents math:
 * - 75.5% (`host_payout_cents`)
 * - 14.3% (`gmf_escrow_cents`)
 * - 10.2% (`platform_fee_cents`)
 */
export async function recordInstallmentInWeeklyDeductionLedger(input: {
  totalCents: number;
  licenseId?: string | null;
  agreementId?: string | null;
  tenantId?: string | null;
  stripeChargeId?: string | null;
  billingCycleNumber?: number;
}): Promise<LedgerInstallmentSettlementResult> {
  const safeTotalCents =
    typeof input.totalCents === "number" &&
    Number.isSafeInteger(input.totalCents) &&
    input.totalCents > 0
      ? input.totalCents
      : 31500;

  const split = splitWeeklyCapture(safeTotalCents);
  const nowIso = new Date().toISOString();
  const stripeChargeId =
    typeof input.stripeChargeId === "string" && input.stripeChargeId.trim() !== ""
      ? input.stripeChargeId.trim()
      : null;

  let resolvedLicenseId: string | null = null;
  let ledgerRowId: string | null = null;
  let billingCycleNumber =
    typeof input.billingCycleNumber === "number" &&
    Number.isSafeInteger(input.billingCycleNumber) &&
    input.billingCycleNumber >= 1
      ? input.billingCycleNumber
      : 1;
  let gmfFloatPoolBalanceCents: number | null = null;
  let persistedToSupabase = false;

  if (!missingSupabaseEnv()) {
    try {
      const supabase = getSupabaseServerClient();

      // 1. Resolve target license_id in public.active_commercial_licenses
      const candidateUuid =
        typeof input.licenseId === "string" && UUID_RE.test(input.licenseId.trim())
          ? input.licenseId.trim()
          : typeof input.agreementId === "string" && UUID_RE.test(input.agreementId.trim())
            ? input.agreementId.trim()
            : null;

      if (candidateUuid) {
        const { data: matchRow } = await supabase
          .from("active_commercial_licenses")
          .select("id")
          .eq("id", candidateUuid)
          .maybeSingle();
        if (matchRow && typeof (matchRow as { id?: unknown }).id === "string") {
          resolvedLicenseId = (matchRow as { id: string }).id;
        }
      }

      if (
        !resolvedLicenseId &&
        typeof input.tenantId === "string" &&
        UUID_RE.test(input.tenantId.trim())
      ) {
        const { data: tenantLic } = await supabase
          .from("active_commercial_licenses")
          .select("id")
          .eq("tenant_id", input.tenantId.trim())
          .eq("status", "ACTIVE")
          .order("created_at", { ascending: false })
          .limit(1);
        const first = Array.isArray(tenantLic) ? tenantLic[0] : null;
        if (first && typeof (first as { id?: unknown }).id === "string") {
          resolvedLicenseId = (first as { id: string }).id;
        }
      }

      if (!resolvedLicenseId) {
        const { data: latestLic } = await supabase
          .from("active_commercial_licenses")
          .select("id")
          .eq("status", "ACTIVE")
          .order("created_at", { ascending: false })
          .limit(1);
        const first = Array.isArray(latestLic) ? latestLic[0] : null;
        if (first && typeof (first as { id?: unknown }).id === "string") {
          resolvedLicenseId = (first as { id: string }).id;
        }
      }

      // 2. Settle next unsettled installment or insert a new installment in public.weekly_deduction_ledger
      if (resolvedLicenseId) {
        const { data: unsettledRows } = await supabase
          .from("weekly_deduction_ledger")
          .select("id, billing_cycle_number")
          .eq("license_id", resolvedLicenseId)
          .eq("is_settled", false)
          .order("billing_cycle_number", { ascending: true })
          .limit(1);

        const nextUnsettled = Array.isArray(unsettledRows) ? unsettledRows[0] : null;
        if (nextUnsettled && typeof (nextUnsettled as { id?: unknown }).id === "string") {
          const targetId = (nextUnsettled as { id: string }).id;
          const cycleNum = Number(
            (nextUnsettled as { billing_cycle_number?: unknown }).billing_cycle_number,
          );
          if (Number.isSafeInteger(cycleNum) && cycleNum >= 1) {
            billingCycleNumber = cycleNum;
          }

          const { data: updated, error: updateErr } = await supabase
            .from("weekly_deduction_ledger")
            .update({
              amount_collected_cents: split.totalCents,
              host_payout_cents: split.hostCents,
              gmf_escrow_cents: split.vaultCents,
              platform_fee_cents: split.platformCents,
              stripe_charge_id: stripeChargeId,
              is_settled: true,
              settled_at: nowIso,
            })
            .eq("id", targetId)
            .select("id")
            .maybeSingle();

          if (!updateErr && updated) {
            ledgerRowId = targetId;
            persistedToSupabase = true;
          }
        } else {
          const { data: existingCycles } = await supabase
            .from("weekly_deduction_ledger")
            .select("billing_cycle_number")
            .eq("license_id", resolvedLicenseId)
            .order("billing_cycle_number", { ascending: false })
            .limit(1);
          const highestRow = Array.isArray(existingCycles) ? existingCycles[0] : null;
          const highestCycle = Number(
            (highestRow as { billing_cycle_number?: unknown } | null)?.billing_cycle_number,
          );
          if (Number.isSafeInteger(highestCycle) && highestCycle >= 1) {
            billingCycleNumber = highestCycle + 1;
          }

          const { data: inserted, error: insertErr } = await supabase
            .from("weekly_deduction_ledger")
            .insert({
              license_id: resolvedLicenseId,
              billing_cycle_number: billingCycleNumber,
              target_payout_date: addDaysIsoUtc(todayIsoUtc(), 7),
              amount_collected_cents: split.totalCents,
              host_payout_cents: split.hostCents,
              gmf_escrow_cents: split.vaultCents,
              platform_fee_cents: split.platformCents,
              stripe_charge_id: stripeChargeId,
              is_settled: true,
              settled_at: nowIso,
            })
            .select("id")
            .maybeSingle();

          if (!insertErr && inserted && typeof (inserted as { id?: unknown }).id === "string") {
            ledgerRowId = (inserted as { id: string }).id;
            persistedToSupabase = true;
          }
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from("weekly_deduction_ledger")
          .insert({
            billing_cycle_number: billingCycleNumber,
            target_payout_date: addDaysIsoUtc(todayIsoUtc(), 7),
            amount_collected_cents: split.totalCents,
            host_payout_cents: split.hostCents,
            gmf_escrow_cents: split.vaultCents,
            platform_fee_cents: split.platformCents,
            stripe_charge_id: stripeChargeId,
            is_settled: true,
            settled_at: nowIso,
          })
          .select("id")
          .maybeSingle();

        if (!insertErr && inserted && typeof (inserted as { id?: unknown }).id === "string") {
          ledgerRowId = (inserted as { id: string }).id;
          persistedToSupabase = true;
        }
      }

      // 3. Credit the 14.3% GMF escrow allocation into public.gmf_float_balance
      const { data: poolRow } = await supabase
        .from("gmf_float_balance")
        .select("*")
        .eq("pool_id", "primary_gmf_pool")
        .maybeSingle();

      if (poolRow && typeof poolRow === "object") {
        const r = poolRow as Record<string, unknown>;
        const currentEscrow =
          typeof r.total_escrow_cents === "number" && Number.isFinite(r.total_escrow_cents)
            ? Math.trunc(r.total_escrow_cents)
            : 0;
        const currentAvail =
          typeof r.available_balance_cents === "number" &&
          Number.isFinite(r.available_balance_cents)
            ? Math.trunc(r.available_balance_cents)
            : 1500000;
        const nextEscrow = currentEscrow + split.vaultCents;
        const nextAvail = currentAvail + split.vaultCents;
        gmfFloatPoolBalanceCents = nextAvail;

        await supabase
          .from("gmf_float_balance")
          .update({
            total_escrow_cents: nextEscrow,
            available_balance_cents: nextAvail,
            available_buffer_cents: nextAvail,
            total_float_cents: nextAvail,
            updated_at: nowIso,
          })
          .eq("pool_id", "primary_gmf_pool");
      }
    } catch {
      // Non-fatal fallback; split values are still returned
    }
  }

  return {
    ok: true,
    ledgerRowId,
    licenseId: resolvedLicenseId,
    billingCycleNumber,
    amountCollectedCents: split.totalCents,
    hostPayoutCents: split.hostCents,
    gmfEscrowCents: split.vaultCents,
    platformFeeCents: split.platformCents,
    stripeChargeId,
    gmfFloatPoolBalanceCents,
    persistedToSupabase,
  };
}

function missingSupabaseEnv(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return "NEXT_PUBLIC_SUPABASE_URL is not configured";
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "SUPABASE_SERVICE_ROLE_KEY is not configured";
  }
  return null;
}

function firstRow(data: unknown): CreditRow | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === "object" ? (row as CreditRow) : null;
  }
  if (data && typeof data === "object") {
    return data as CreditRow;
  }
  return null;
}

function parseCents(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}
