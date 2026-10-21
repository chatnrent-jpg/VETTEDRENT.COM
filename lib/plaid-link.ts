import { CountryCode, Products } from "plaid";
import { getPlaidClient } from "@/lib/plaid";

const LOOKBACK_DAYS = 90;

/**
 * Mint a short-lived Plaid Link token for the signed-in user.
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
 * Exchange a one-time public token for an access token.
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
