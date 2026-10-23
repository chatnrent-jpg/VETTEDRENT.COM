import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  DEFAULT_JURISDICTION_CODE,
  parseJurisdictionCode,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import { evaluateGeoCompliance, INTENDED_STAY_DAYS } from "@/lib/geo-compliance";
import { sendSMS, type SmsResult } from "@/lib/sms";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type LeadRole = "host" | "lodger" | "enterprise";

type ParsedLead = {
  role: LeadRole;
  fullName: string | null;
  email: string;
  phone: string | null;
  jurisdictionCode: string;
  weeklyRateCents: number | null;
  intendedStayDays: number;
  agencyName: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  notes: string | null;
};

export async function POST(request: Request) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parseLeadPayload(payload);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const rule = resolveJurisdiction(parsed.jurisdictionCode);
    const compliance = evaluateGeoCompliance(
      {
        jurisdiction_code: parsed.jurisdictionCode,
        judicial_risk_tier: rule?.judicialRiskTier,
        max_transient_days: rule?.maxTransientDays,
        compliance_structure: rule?.complianceStructure,
      },
      parsed.intendedStayDays,
    );

    const smsResult = await dispatchConfirmationSms(parsed, compliance.statusLabel);
    const webhookStatus = await dispatchOutboundLeadHook(parsed, compliance.statusLabel);
    const leadRecord = await persistMarketingLead(parsed, smsResult, webhookStatus);

    return NextResponse.json({
      ok: true,
      leadId: leadRecord.leadId,
      persisted: leadRecord.persisted,
      storage: leadRecord.storage,
      role: parsed.role,
      email: parsed.email,
      phone: parsed.phone,
      jurisdictionCode: compliance.jurisdictionCode,
      geoCompliance: compliance.statusLabel,
      allowed: compliance.allowed,
      blockReason: compliance.blockReason,
      attribution: {
        utmSource: parsed.utmSource,
        utmMedium: parsed.utmMedium,
        utmCampaign: parsed.utmCampaign,
        utmContent: parsed.utmContent,
      },
      smsConfirmation: smsResult,
      webhookHook: webhookStatus,
    });
  } catch (error) {
    console.error("marketing lead capture failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not record marketing lead";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function parseLeadPayload(value: unknown): ParsedLead | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const role = parseRole(body.role);
  if (!role) {
    return { error: "Role must be host, lodger, or enterprise" };
  }
  const email = parseEmail(body.email);
  if (!email) {
    return { error: "A valid email address is required" };
  }
  const rawJurisdiction = body.jurisdictionCode ?? DEFAULT_JURISDICTION_CODE;
  const parsedJurisdiction = parseJurisdictionCode(rawJurisdiction);
  if (parsedJurisdiction && typeof parsedJurisdiction === "object") {
    return { error: parsedJurisdiction.error };
  }
  const jurisdictionCode = parsedJurisdiction ?? DEFAULT_JURISDICTION_CODE;

  const phone = normalizePhone(body.phone);
  if (body.phone !== undefined && body.phone !== null && body.phone !== "" && !phone) {
    return { error: "Phone must be E.164 format (for example +12025550123)" };
  }

  const weeklyRateCents = parsePositiveCents(body.weeklyRateCents);
  const intendedStayDays = parsePositiveDays(body.intendedStayDays) ?? INTENDED_STAY_DAYS;

  return {
    role,
    fullName: cleanText(body.fullName, 120),
    email,
    phone,
    jurisdictionCode,
    weeklyRateCents,
    intendedStayDays,
    agencyName: cleanText(body.agencyName, 120),
    utmSource: cleanText(body.utmSource ?? body.utm_source, 80),
    utmMedium: cleanText(body.utmMedium ?? body.utm_medium, 80),
    utmCampaign: cleanText(body.utmCampaign ?? body.utm_campaign, 120),
    utmContent: cleanText(body.utmContent ?? body.utm_content, 120),
    notes: cleanText(body.notes, 500),
  };
}

async function dispatchConfirmationSms(
  lead: ParsedLead,
  geoStatusLabel: string,
): Promise<{ attempted: boolean; status: SmsResult | null }> {
  if (!lead.phone) {
    return { attempted: false, status: null };
  }
  const roleLabel =
    lead.role === "host"
      ? "Property Host"
      : lead.role === "enterprise"
        ? "Enterprise Staffing Partner"
        : "VettedCare / VettedME Lodger";
  const body = `VettedRent (${lead.jurisdictionCode}): Your ${roleLabel} intake is logged. ${geoStatusLabel} Reply STOP to opt out.`;
  const result = await sendSMS(lead.phone, body);
  return { attempted: true, status: result };
}

async function dispatchOutboundLeadHook(
  lead: ParsedLead,
  geoStatusLabel: string,
): Promise<{ configured: boolean; delivered: boolean; provider: "webhook" | "resend" | "ready_noop" }> {
  const webhookUrl = cleanEnv("MARKETING_WEBHOOK_URL");
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "vettedrent.marketing.lead",
          lead,
          geoStatusLabel,
          timestamp: new Date().toISOString(),
        }),
      });
      return { configured: true, delivered: response.ok, provider: "webhook" };
    } catch {
      return { configured: true, delivered: false, provider: "webhook" };
    }
  }

  const resendApiKey = cleanEnv("RESEND_API_KEY");
  const resendFrom = cleanEnv("RESEND_FROM_EMAIL");
  if (resendApiKey && resendFrom) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [lead.email],
          subject: `VettedRent ${lead.jurisdictionCode} intake received`,
          text: `Your VettedRent (${lead.role}) intake for ${lead.jurisdictionCode} is confirmed.\n${geoStatusLabel}`,
        }),
      });
      return { configured: true, delivered: response.ok, provider: "resend" };
    } catch {
      return { configured: true, delivered: false, provider: "resend" };
    }
  }

  return { configured: false, delivered: false, provider: "ready_noop" };
}

async function persistMarketingLead(
  lead: ParsedLead,
  sms: { attempted: boolean; status: SmsResult | null },
  webhook: { configured: boolean; delivered: boolean; provider: string },
): Promise<{ leadId: string; persisted: boolean; storage: "marketing_leads" | "server_audit_log" }> {
  const fallbackId = randomUUID();
  const smsSummary = !sms.attempted
    ? "not_requested"
    : sms.status?.success
      ? sms.status.mocked
        ? "mocked"
        : `sent:${sms.status.sid}`
      : "failed";
  const webhookSummary = `${webhook.provider}:${webhook.delivered ? "delivered" : "standby"}`;

  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("marketing_leads")
      .insert({
        role: lead.role,
        full_name: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        jurisdiction_code: lead.jurisdictionCode,
        weekly_rate_cents: lead.weeklyRateCents,
        intended_stay_days: lead.intendedStayDays,
        agency_name: lead.agencyName,
        utm_source: lead.utmSource,
        utm_medium: lead.utmMedium,
        utm_campaign: lead.utmCampaign,
        utm_content: lead.utmContent,
        notes: lead.notes,
        sms_status: smsSummary,
        webhook_status: webhookSummary,
      })
      .select("id")
      .maybeSingle();

    if (!error && data && typeof (data as { id?: unknown }).id === "string") {
      return {
        leadId: (data as { id: string }).id,
        persisted: true,
        storage: "marketing_leads",
      };
    }
  } catch {
    // Graceful degradation when marketing_leads migration is not yet applied.
  }

  console.log(
    JSON.stringify({
      audit: "marketing_lead_captured",
      leadId: fallbackId,
      role: lead.role,
      email: lead.email,
      jurisdictionCode: lead.jurisdictionCode,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      smsSummary,
      webhookSummary,
    }),
  );
  return {
    leadId: fallbackId,
    persisted: false,
    storage: "server_audit_log",
  };
}

function parseRole(value: unknown): LeadRole | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "host" || normalized === "lodger" || normalized === "enterprise") {
    return normalized;
  }
  return null;
}

function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) {
    return null;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? trimmed : null;
}

function parsePositiveCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 10000000) {
    return value;
  }
  return null;
}

function parsePositiveDays(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 7 && value <= 365) {
    return value;
  }
  return null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.slice(0, maxLength);
}

function cleanEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
