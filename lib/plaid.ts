import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const ENVIRONMENTS = {
  sandbox: PlaidEnvironments.sandbox,
  development: PlaidEnvironments.development,
  production: PlaidEnvironments.production,
} as const;

type PlaidEnvName = keyof typeof ENVIRONMENTS;

/**
 * Server-only Plaid client. Throws when the client id, secret, or environment is missing.
 */
export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
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
