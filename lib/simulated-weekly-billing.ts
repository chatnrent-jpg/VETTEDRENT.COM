import assert from "node:assert/strict";
import { HOST_BPS, VAULT_BPS, type WeeklySplitCents } from "@/lib/stripe";
import { creditAgreementVault, creditVaultCents } from "@/lib/vault";

/** Active weekly stay used when Stripe is not configured, in integer cents. */
export const SIMULATED_WEEKLY_CENTS = 24500;

/**
 * Half-up host and vault shares. Platform cents are the remainder so the parts
 * equal the weekly total. 24500 cents splits to $184.98 / $35.04 / $24.98.
 */
export function exactWeeklySplit(totalCents: number): WeeklySplitCents {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("weekly total must be a positive integer");
  }
  const hostCents = Math.round((totalCents * HOST_BPS) / 10000);
  const vaultCents = Math.round((totalCents * VAULT_BPS) / 10000);
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
assert.equal(SAMPLE.hostCents, 18498);
assert.equal(SAMPLE.vaultCents, 3504);
assert.equal(SAMPLE.platformCents, 2498);

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
};

export async function applySimulatedWeeklyVault(input: {
  payerKey: string;
  agreementId: string;
  totalCents: number;
}): Promise<SimulatedWeeklyResult> {
  const split = exactWeeklySplit(input.totalCents);
  const invoiceId = `sim-weekly-${input.agreementId}-${Date.now()}`;
  const ledger = await creditVaultCents({
    payerKey: input.payerKey,
    invoiceId,
    vaultCents: split.vaultCents,
  });
  if (!ledger.ok) {
    throw new Error("weekly vault credit failed");
  }
  const agreement = await creditAgreementVault({
    agreementId: input.agreementId,
    invoiceId,
    vaultCents: split.vaultCents,
  });
  if (!agreement.ok) {
    throw new Error("weekly vault credit failed");
  }
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
    vaultBalanceCents: ledger.vaultBalanceCents,
    agreementVaultBalanceCents: agreement.vaultBalanceCents,
  };
}
