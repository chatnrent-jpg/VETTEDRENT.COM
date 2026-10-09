import { getSupabaseServerClient } from "@/lib/supabase";

/**
 * Vault balances are integer cents (the 14.3% vault share of a captured invoice).
 * Not dollars, and not a flat credit.
 */
export type VaultCreditResult =
  | { ok: true; alreadyCredited: boolean; vaultBalanceCents: number }
  | { ok: false; error: string };

type CreditRow = {
  already_credited?: boolean;
  vault_balance_cents?: number | string;
};

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
