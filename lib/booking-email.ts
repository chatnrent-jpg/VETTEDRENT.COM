import {
  buildLicenseHref,
  buildPassportHref,
  type StayDocumentInput,
} from "@/lib/stay-documents";

export type BookingEmailStatus = "sent" | "failed" | "not_configured";

const EMAIL_RE = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,255}\.[^\s@<>"]{2,}$/;

export function isDeliverableEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 320 && EMAIL_RE.test(value.trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function siteOrigin(): string {
  const configured = cleanEnv("NEXT_PUBLIC_SITE_URL");
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/+$/, "");
  }
  return "https://vettedrent.com";
}

/**
 * Sends the booking confirmation with Stay Passport and license links.
 * Never throws: a failed email must not undo a completed booking, and the caller
 * reports the real status to the guest instead of claiming delivery.
 */
export async function sendBookingConfirmationEmail(input: {
  stay: StayDocumentInput;
  guestName: string;
  checkInDate: string;
  licenseId: string;
}): Promise<BookingEmailStatus> {
  const apiKey = cleanEnv("RESEND_API_KEY");
  const from = cleanEnv("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    return "not_configured";
  }

  const origin = siteOrigin();
  const passportUrl = buildPassportHref(input.stay, origin);
  const licenseUrl = buildLicenseHref(input.stay, origin);
  const firstName = input.guestName.trim().split(/\s+/)[0] || "there";

  const text = [
    `Hi ${firstName},`,
    "",
    `Your VettedRent stay is booked: ${input.checkInDate} to ${input.stay.validUntil} (${input.stay.stayDays} days).`,
    `License ID: ${input.licenseId}`,
    "",
    `Stay Passport: ${passportUrl}`,
    `Signed license: ${licenseUrl}`,
    "",
    "Save both documents. They are your proof of booking and your entry credentials.",
    "",
    "VettedRent · Be Great to Yourself.",
  ].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
<h2 style="margin:0 0 8px">You're booked, ${escapeHtml(firstName)}.</h2>
<p style="margin:0 0 16px">${escapeHtml(input.checkInDate)} &rarr; ${escapeHtml(input.stay.validUntil)} (${input.stay.stayDays} days)<br>License ID: <strong>${escapeHtml(input.licenseId)}</strong></p>
<p style="margin:0 0 8px"><a href="${escapeHtml(passportUrl)}" style="display:inline-block;background:#10b981;color:#052e22;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Download Stay Passport</a></p>
<p style="margin:0 0 16px"><a href="${escapeHtml(licenseUrl)}">Download signed license</a></p>
<p style="color:#475569;font-size:13px">Save both documents. They are your proof of booking and your entry credentials.</p>
<p style="color:#475569;font-size:13px">VettedRent &middot; Be Great to Yourself.</p>
</div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.stay.email],
        subject: `You're booked: ${input.checkInDate} stay confirmed`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
