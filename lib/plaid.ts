import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
export {
  executeWithoutLimitation,
  type ExecuteWithoutLimitationResult,
} from "@/lib/stripe";

const ENVIRONMENTS = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
} as const;

type PlaidEnvName = keyof typeof ENVIRONMENTS;

/** True when the server does not have PLAID_CLIENT_ID and PLAID_SECRET set. */
export function plaidCredentialsMissing(): boolean {
  const clientId = process.env.PLAID_CLIENT_ID?.trim() ?? "";
  const secret = process.env.PLAID_SECRET?.trim() ?? "";
  return clientId === "" || secret === "";
}

export function resolvePlaidEnvName(): PlaidEnvName {
  return plaidEnvName(process.env.PLAID_ENV) ?? "sandbox";
}

/**
 * Server-only Plaid client configured with `process.env.PLAID_CLIENT_ID`,
 * `process.env.PLAID_SECRET`, and `process.env.PLAID_ENV`.
 */
export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  const envName = plaidEnvName(process.env.PLAID_ENV);
  if (!clientId) {
    throw new Error("PLAID_CLIENT_ID is not configured");
  }
  if (!secret) {
    throw new Error("PLAID_SECRET is not configured");
  }
  if (!envName) {
    throw new Error("PLAID_ENV is not configured");
  }

  return new PlaidApi(
    new Configuration({
      basePath: ENVIRONMENTS[envName],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    }),
  );
}

function plaidEnvName(value: string | undefined): PlaidEnvName | null {
  const name = value && value.trim() !== "" ? value.trim() : "sandbox";
  if (name === "sandbox" || name === "development" || name === "production") {
    return name;
  }
  return null;
}
