import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { getSupabaseServerClient } from "../lib/supabase.ts";

const LOCAL_API_URL = "http://localhost:3000/api/webhooks/stripe";
const MOCK_AGREEMENT_ID = "00000000-0000-0000-0000-000000000000";
const MOCK_SUBSCRIPTION_ID = "sub_test_sovereign_risk_9999";
const MOCK_SEAM_ACCESS_CODE_ID = "access_code_mock_12345";
const MOCK_VAULT_BALANCE_CENTS = 37500;
const SIM_LODGERS_EMAIL = "sim-lodger@vettedrent.test";
const SMS_BODY =
  "VettedRent: your weekly room payment bounced. Open the app and update your card within 48 hours.";

type TwilioMessage = {
  sid?: string;
  status?: string;
  error_code?: number | null;
  error_message?: string | null;
};

loadLocalEnv();

async function sendSMS(phone: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim() ?? "";
  if (accountSid === "" || authToken === "" || fromNumber === "") {
    console.error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
    );
    process.exit(1);
  }

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams({ To: phone, From: fromNumber, Body: body });
  let response: Response;
  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    console.error(`Twilio SMS failed: ${message}`);
    process.exit(1);
  }

  if (!response.ok) {
    const detail = await response.text();
    console.error(`Twilio SMS failed: ${response.status} ${detail}`);
    process.exit(1);
  }
  const created = (await response.json()) as TwilioMessage;
  const messageSid = created.sid?.trim() ?? "";
  console.log(`Twilio accepted ${messageSid} with status ${created.status ?? "unknown"}.`);

  if (messageSid !== "") {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const check = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(messageSid)}.json`,
      { headers: { Authorization: `Basic ${credentials}` } },
    );
    if (check.ok) {
      const row = (await check.json()) as TwilioMessage;
      const errorCode = row.error_code ?? "";
      const errorMessage = row.error_message?.trim() ?? "";
      console.log(`Twilio delivery ${row.status ?? "unknown"} ${errorCode} ${errorMessage}`.trim());
      if (row.status === "undelivered" || row.status === "failed") {
        process.exit(1);
      }
    }
  }
  console.log(`sendSMS ${phone}`);
  console.log(body);
}

async function runSimulation(): Promise<void> {
  console.log("Starting sovereign-risk payment failure simulation.");
  await stageAgreement();

  const guestPhone = "+13017447404";
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
        guestPhone,
        metadata: {
          agreement_id: MOCK_AGREEMENT_ID,
        },
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

  await sendSMS(guestPhone, SMS_BODY);
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
    process.exit(1);
  }
}

async function stageAgreement(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (supabaseUrl === "" || serviceKey === "") {
    console.error("Supabase URL and service role key are required to stage the agreement.");
    process.exit(1);
  }

  const supabase = getSupabaseServerClient();
  const tenantId = await ensureProfileId(supabase);
  const staged = await supabase.from("agreements").upsert(
    {
      id: MOCK_AGREEMENT_ID,
      tenant_id: tenantId,
      status: "active",
      tenant_name: "Simulated Travel Professional",
      stripe_subscription_id: MOCK_SUBSCRIPTION_ID,
      seam_access_code_id: MOCK_SEAM_ACCESS_CODE_ID,
      payment_status: "current",
      risk_level: "clear",
      vault_balance_cents: MOCK_VAULT_BALANCE_CENTS,
      warning_count: 0,
    },
    { onConflict: "id" },
  );
  if (staged.error) {
    console.error(`Could not stage the agreement: ${staged.error.message}`);
    process.exit(1);
  }
  console.log("Agreement row is ready.");
}

async function ensureProfileId(
  supabase: ReturnType<typeof getSupabaseServerClient>,
): Promise<string> {
  const existing = await supabase.from("profiles").select("id").limit(1).maybeSingle();
  if (existing.error) {
    console.error(`Could not read profiles: ${existing.error.message}`);
    process.exit(1);
  }
  const existingId = typeof existing.data?.id === "string" ? existing.data.id.trim() : "";
  if (existingId !== "") {
    return existingId;
  }

  const created = await supabase.auth.admin.createUser({
    email: SIM_LODGERS_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "Simulated Travel Professional" },
  });
  let userId = created.data.user?.id ?? "";
  if (userId === "") {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = listed.data.users.find((user) => user.email === SIM_LODGERS_EMAIL);
    userId = match?.id ?? "";
  }
  if (userId === "") {
    console.error(
      `Could not create the test lodger: ${created.error?.message ?? "no user id"}`,
    );
    process.exit(1);
  }

  const saved = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: SIM_LODGERS_EMAIL,
      full_name: "Simulated Travel Professional",
      role: "lodger",
    },
    { onConflict: "id" },
  );
  if (saved.error) {
    console.error(`Could not save the test profile: ${saved.error.message}`);
    process.exit(1);
  }
  return userId;
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
