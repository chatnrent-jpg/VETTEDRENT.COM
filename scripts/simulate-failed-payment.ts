import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const LOCAL_API_URL = "http://localhost:3000/api/webhooks/stripe";
const MOCK_AGREEMENT_ID = "00000000-0000-0000-0000-000000000000";
const MOCK_TENANT_ID = "tenant_sim_nurse";
const MOCK_SUBSCRIPTION_ID = "sub_test_sovereign_risk_9999";
const MOCK_SEAM_ACCESS_CODE_ID = "access_code_mock_12345";
const MOCK_VAULT_BALANCE_CENTS = 37500;

loadLocalEnv();

async function runSimulation(): Promise<void> {
  console.log("Starting sovereign-risk payment failure simulation.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    console.error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    process.exit(1);
  }
  if (!supabaseServiceKey) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is missing.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log("Staging the mock agreement.");

  const cleared = await supabase
    .from("agreements")
    .delete()
    .eq("stripe_subscription_id", MOCK_SUBSCRIPTION_ID);
  if (cleared.error) {
    console.error(`Database staging failed: ${cleared.error.message}`);
    process.exit(1);
  }

  const staged = await supabase.from("agreements").upsert(
    {
      id: MOCK_AGREEMENT_ID,
      tenant_id: MOCK_TENANT_ID,
      status: "active",
      tenant_name: "Simulated Nurse Test Account",
      stripe_subscription_id: MOCK_SUBSCRIPTION_ID,
      seam_access_code_id: MOCK_SEAM_ACCESS_CODE_ID,
      payment_status: "current",
      risk_level: "clear",
      vault_balance_cents: MOCK_VAULT_BALANCE_CENTS,
    },
    { onConflict: "id" },
  );
  if (staged.error) {
    console.error(`Database staging failed: ${staged.error.message}`);
    process.exit(1);
  }
  console.log("Mock agreement is current / clear.");

  const eventId = `evt_test_bounce_${Date.now()}`;
  const payload = {
    id: eventId,
    object: "event",
    api_version: "2023-10-16",
    created: Math.floor(Date.now() / 1000),
    type: "invoice.payment_failed",
    data: {
      object: {
        id: `in_test_${Date.now()}`,
        object: "invoice",
        subscription: MOCK_SUBSCRIPTION_ID,
        customer: "cus_mock_user_123",
        amount_due: MOCK_VAULT_BALANCE_CENTS,
        status: "open",
      },
    },
  };
  const payloadString = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (webhookSecret) {
    headers["stripe-signature"] = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: webhookSecret,
    });
  } else {
    console.log("STRIPE_WEBHOOK_SECRET is unset. Sending an unsigned event for next dev.");
  }

  console.log(`Dispatching invoice.payment_failed to ${LOCAL_API_URL}.`);
  let response: Response;
  try {
    response = await fetch(LOCAL_API_URL, {
      method: "POST",
      headers,
      body: payloadString,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.error(`Could not reach the local server. Start it with npm run dev. ${message}`);
    process.exit(1);
  }

  const responseText = await response.text();
  console.log(`Route response code: ${response.status}`);
  console.log(`Route response body: ${responseText}`);
  if (!response.ok) {
    console.error("Simulation failed. The webhook returned an error.");
    process.exit(1);
  }

  const agreement = await supabase
    .from("agreements")
    .select("payment_status, risk_level, seam_access_code_id")
    .eq("id", MOCK_AGREEMENT_ID)
    .maybeSingle();
  if (agreement.error || !agreement.data) {
    console.error("The webhook returned success, but the agreement could not be read back.");
    process.exit(1);
  }

  const ledger = await supabase
    .from("platform_ledger")
    .select("amount_cents, type")
    .eq("stripe_event_id", eventId)
    .maybeSingle();

  console.log(
    `Agreement ${MOCK_SUBSCRIPTION_ID} is now ${agreement.data.payment_status} / ${agreement.data.risk_level}.`,
  );
  if (ledger.data) {
    console.log(
      `platform_ledger recorded ${ledger.data.amount_cents} cents as ${ledger.data.type}.`,
    );
  } else {
    console.log("platform_ledger has no row for this event.");
  }
  console.log(
    "The next dev terminal shows whether Seam scheduled the mock door code to expire. A fake Seam code id is rejected and the agreement still flips to delinquent.",
  );
}

function loadLocalEnv(): void {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

runSimulation().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "simulation failed";
  console.error(message);
  process.exit(1);
});
