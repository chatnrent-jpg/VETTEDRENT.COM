import assert from "node:assert/strict";
import { HOST_BPS, VAULT_BPS, type WeeklySplitCents } from "@/lib/stripe";
import {
  creditAgreementVault,
  creditVaultCents,
  recordInstallmentInWeeklyDeductionLedger,
  type LedgerInstallmentSettlementResult,
} from "@/lib/vault";

/** Active weekly stay used when Stripe is not configured, in integer cents ($315.00/wk Universal Floor). */
export const SIMULATED_WEEKLY_CENTS = 31500;

/**
 * Half-up host and vault shares using pure BigInt integer math. Platform cents
 * are the remainder so the parts equal the weekly total.
 * 31500 cents splits to $237.83 / $45.05 / $32.12.
 */
export function exactWeeklySplit(totalCents: number): WeeklySplitCents {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("weekly total must be a positive integer");
  }
  const totalBig = BigInt(totalCents);
  const halfBps = BigInt(5000);
  const bpsDenom = BigInt(10000);
  const hostCents = Number((totalBig * BigInt(HOST_BPS) + halfBps) / bpsDenom);
  const vaultCents = Number((totalBig * BigInt(VAULT_BPS) + halfBps) / bpsDenom);
  const platformCents = totalCents - hostCents - vaultCents;
  if (platformCents < 0 || !Number.isSafeInteger(platformCents)) {
    throw new Error("weekly split failed");
  }
  const split: WeeklySplitCents = {
    totalCents,
    hostCents,
    vaultCents,
    platformCents,
    applicationFeeCents: vaultCents + platformCents,
  };
  assert.equal(split.hostCents + split.vaultCents + split.platformCents, totalCents);
  return split;
}

const SAMPLE = exactWeeklySplit(SIMULATED_WEEKLY_CENTS);
assert.equal(SAMPLE.hostCents, 23783);
assert.equal(SAMPLE.vaultCents, 4505);
assert.equal(SAMPLE.platformCents, 3212);

export type SimulatedWeeklyResult = {
  ok: true;
  simulated: true;
  invoiceId: string;
  totalCents: number;
  split: {
    hostCents: number;
    vaultCents: number;
    platformCents: number;
  };
  vaultBalanceCents: number;
  agreementVaultBalanceCents: number;
  ledgerInstallment: LedgerInstallmentSettlementResult;
};

/**
 * Internal GMF Vault mechanism: credits the payer vault, agreement escrow (if present),
 * and logs the 14.3% GMF allocation (`gmf_escrow_cents`), 75.5% host payout (`host_payout_cents`),
 * and 10.2% platform fee (`platform_fee_cents`) into `public.weekly_deduction_ledger` and
 * `public.gmf_float_balance`.
 */
export async function applySimulatedWeeklyVault(input: {
  payerKey: string;
  agreementId: string;
  totalCents: number;
  licenseId?: string | null;
}): Promise<SimulatedWeeklyResult> {
  const split = exactWeeklySplit(input.totalCents);
  const invoiceId = `gmf-vault-${input.agreementId}-${Date.now()}`;

  const ledgerInstallment = await recordInstallmentInWeeklyDeductionLedger({
    totalCents: split.totalCents,
    licenseId: input.licenseId ?? input.agreementId,
    agreementId: input.agreementId,
    tenantId: input.payerKey,
    stripeChargeId: invoiceId,
  });

  const ledger = await creditVaultCents({
    payerKey: input.payerKey,
    invoiceId,
    vaultCents: split.vaultCents,
  });

  const agreement = await creditAgreementVault({
    agreementId: input.agreementId,
    invoiceId,
    vaultCents: split.vaultCents,
  });

  const vaultBalanceCents = ledger.ok
    ? ledger.vaultBalanceCents
    : (ledgerInstallment.gmfFloatPoolBalanceCents ?? split.vaultCents);
  const agreementVaultBalanceCents = agreement.ok
    ? agreement.vaultBalanceCents
    : split.vaultCents;

  return {
    ok: true,
    simulated: true,
    invoiceId,
    totalCents: split.totalCents,
    split: {
      hostCents: split.hostCents,
      vaultCents: split.vaultCents,
      platformCents: split.platformCents,
    },
    vaultBalanceCents,
    agreementVaultBalanceCents,
    ledgerInstallment,
  };
}
