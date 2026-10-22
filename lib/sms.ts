import twilio from "twilio";

export type SmsResult =
  | { success: true; mocked: true }
  | { success: true; mocked: false; sid: string }
  | { success: false; error: string };

let client: ReturnType<typeof twilio> | null = null;

/**
 * Send one transactional SMS.
 * Missing Twilio env falls back to a server log so local runs do not crash.
 * The client is created only when the account SID and token are present.
 */
export async function sendSMS(to: string, message: string): Promise<SmsResult> {
  const destination = to.trim();
  const body = message.trim();
  const accountSid = envValue("TWILIO_ACCOUNT_SID");
  const authToken = envValue("TWILIO_AUTH_TOKEN");
  const fromNumber = envValue("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS FALLBACK] To: ${destination || "(missing)"} | Message: ${body}`);
    return { success: true, mocked: true };
  }
  if (!isE164(destination) || body === "") {
    console.error("SMS recipient or message is invalid");
    return { success: false, error: "SMS recipient or message is invalid" };
  }

  try {
    const sms = twilioClient(accountSid, authToken);
    const sent = await sms.messages.create({
      body,
      from: fromNumber,
      to: destination,
    });
    if (!sent.sid) {
      console.error("Failed to send SMS");
      return { success: false, error: "SMS provider did not return a message id" };
    }
    return { success: true, mocked: false, sid: sent.sid };
  } catch (error) {
    console.error("Failed to send SMS");
    const detail = error instanceof Error ? error.message : "SMS send failed";
    return { success: false, error: detail };
  }
}

function twilioClient(accountSid: string, authToken: string): ReturnType<typeof twilio> {
  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

function envValue(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
