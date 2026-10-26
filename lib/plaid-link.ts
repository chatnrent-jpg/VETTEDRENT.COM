import { CountryCode, Products } from "plaid";
import { getPlaidClient, resolvePlaidEnvName } from "@/lib/plaid";

const LOOKBACK_DAYS = 90;
const DEFAULT_SANDBOX_INSTITUTION_ID = "ins_109508";

/**
 * Mint a short-lived Plaid Link token for the user via the live Plaid API.
 * The browser may hold this token. It cannot read transactions.
 */
export async function createBankLinkToken(clientUserId: string): Promise<string> {
  const userId = clientUserId.trim();
  if (!userId) {
    throw new Error("bank link token failed");
  }
  try {
    const plaid = getPlaidClient();
    const response = await plaid.linkTokenCreate({
      client_name: "VettedRent",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: userId },
      products: [Products.Transactions],
      transactions: { days_requested: LOOKBACK_DAYS },
    });
    const linkToken = response.data.link_token.trim();
    if (!linkToken.startsWith("link-")) {
      throw new Error("bank link token failed");
    }
    return linkToken;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      throw error;
    }
    if (error instanceof Error && error.message === "bank link token failed") {
      throw error;
    }
    throw new Error("bank link token failed");
  }
}

/**
 * Exchange a one-time public token for an access token via the live Plaid API.
 * The access token stays on the server.
 */
export async function exchangeBankPublicToken(publicToken: string): Promise<string> {
  const token = publicToken.trim();
  if (!token.startsWith("public-")) {
    throw new Error("bank link exchange failed");
  }
  try {
    const plaid = getPlaidClient();
    const response = await plaid.itemPublicTokenExchange({ public_token: token });
    const accessToken = response.data.access_token.trim();
    if (!accessToken.startsWith("access-")) {
      throw new Error("bank link exchange failed");
    }
    return accessToken;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not configured")) {
      throw error;
    }
    if (error instanceof Error && error.message === "bank link exchange failed") {
      throw error;
    }
    throw new Error("bank link exchange failed");
  }
}

/**
 * When running in Plaid `sandbox` environment with valid `PLAID_CLIENT_ID` and `PLAID_SECRET`,
 * creates a live Plaid sandbox public token and exchanges it for a real `access-sandbox-...`
 * token so authentic Plaid `accountsGet` and `transactionsGet` APIs can be executed.
 */
export async function createPlaidSandboxAccessToken(): Promise<string> {
  if (resolvePlaidEnvName() !== "sandbox") {
    throw new Error("PLAID_SANDBOX_ONLY");
  }
  const plaid = getPlaidClient();
  const sandboxPub = await plaid.sandboxPublicTokenCreate({
    institution_id: DEFAULT_SANDBOX_INSTITUTION_ID,
    initial_products: [Products.Transactions],
  });
  const publicToken = sandboxPub.data.public_token?.trim() ?? "";
  if (!publicToken.startsWith("public-")) {
    throw new Error("bank link exchange failed");
  }
  return exchangeBankPublicToken(publicToken);
}
