import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sendSMS, type SmsResult } from "@/lib/sms";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  analyzeListingExposure,
  getScoredCuratedSupply,
  parseExternalListingPayload,
  type OutreachTouch,
  type ScoredSupplyTarget,
} from "@/lib/supply-scraper-agent";
import { PURPOSE_COHORT_IDS } from "@/lib/underwriting-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SupplyOutreachDispatchResult = {
  ok: true;
  target: ScoredSupplyTarget;
  matchedCohorts: ScoredSupplyTarget["matchedCohorts"];
  dispatchedTouch: OutreachTouch;
  outreachSequence: ScoredSupplyTarget["outreachSequence"];
  leadLogged: boolean;
  leadId: string | null;
  storage: "marketing_leads" | "server_audit_log" | "skipped";
  smsStatus: { attempted: boolean; result: SmsResult | null };
  emailWebhookStatus: {
    configured: boolean;
    delivered: boolean;
    provider: "webhook" | "resend" | "simulated_touch1";
  };
  confirmationMessage: string;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sourceFilter = url.searchParams.get("source")?.trim().toLowerCase() ?? null;
    const jurisdictionFilter = url.searchParams.get("jurisdiction")?.trim().toUpperCase() ?? null;
    const cohortFilter = url.searchParams.get("cohort")?.trim().toLowerCase() ?? null;
    const targetIdFilter = url.searchParams.get("targetId")?.trim().toLowerCase() ?? null;

    const allTargets = getScoredCuratedSupply();
    const filteredTargets = allTargets.filter((target) => {
      if (targetIdFilter && target.listing.id.toLowerCase() !== targetIdFilter) {
        return false;
      }
      if (sourceFilter && target.listing.source.toLowerCase() !== sourceFilter) {
        return false;
      }
      if (jurisdictionFilter && target.jurisdiction.code.toUpperCase() !== jurisdictionFilter) {
        return false;
      }
      if (
        cohortFilter &&
        !target.matchedCohorts.some((cohort) => cohort.toLowerCase() === cohortFilter)
      ) {
        return false;
      }
      return true;
    });

    const averageExposureScore =
      filteredTargets.length > 0
        ? Math.round(
            filteredTargets.reduce((sum, item) => sum + item.exposureScore, 0) /
              filteredTargets.length,
          )
        : 0;

    return NextResponse.json({
      ok: true,
      campaignMotto: "Unvetted renting is over. Be Great to Yourself.",
      universalCohorts: PURPOSE_COHORT_IDS,
      count: filteredTargets.length,
      averageExposureScore,
      targets: filteredTargets,
    });
  } catch (error) {
    console.error("supply outreach GET failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not load programmatic supply targets";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsedListing = parseExternalListingPayload(rawBody);
    if ("error" in parsedListing) {
      return NextResponse.json({ ok: false, error: parsedListing.error }, { status: 400 });
    }

    const bodyRecord =
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>)
        : {};
    const shouldLogLead = bodyRecord.logLead !== false;
    const requestedTouchNumber =
      bodyRecord.touchNumber === 2 ? 2 : bodyRecord.touchNumber === 3 ? 3 : 1;

    const scoredTarget = analyzeListingExposure(parsedListing);
    const dispatchedTouch =
      scoredTarget.outreachSequence.find((item) => item.touchNumber === requestedTouchNumber) ??
      scoredTarget.outreachSequence[0];

    const smsStatus = await dispatchTouchSms(scoredTarget, dispatchedTouch);
    const emailWebhookStatus = await dispatchTouchOutbound(scoredTarget, dispatchedTouch);

    let leadLogged = false;
    let leadId: string | null = null;
    let storage: "marketing_leads" | "server_audit_log" | "skipped" = "skipped";

    if (shouldLogLead) {
      const persisted = await logHostSupplyLead(scoredTarget, smsStatus, emailWebhookStatus);
      leadLogged = persisted.persisted;
      leadId = persisted.leadId;
      storage = persisted.storage;
    }

    const responsePayload: SupplyOutreachDispatchResult = {
      ok: true,
      target: scoredTarget,
      matchedCohorts: scoredTarget.matchedCohorts,
      dispatchedTouch,
      outreachSequence: scoredTarget.outreachSequence,
      leadLogged,
      leadId,
      storage,
      smsStatus,
      emailWebhookStatus,
      confirmationMessage: `Unvetted renting is over. Dispatched ${dispatchedTouch.title} to ${scoredTarget.listing.ownerContact.fullName} (${scoredTarget.listing.ownerContact.email}) for ${scoredTarget.jurisdiction.code} [Exposure ${scoredTarget.exposureScore}/100 · Cohorts: ${scoredTarget.matchedCohorts.join(", ")}] and logged Host-Property lead in ${storage}. Be Great to Yourself!`,
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("supply outreach POST failed");
    const message =
      error instanceof Error && error.message.includes("not configured")
        ? error.message
        : "Could not score or dispatch supply outreach";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function dispatchTouchSms(
  target: ScoredSupplyTarget,
  touch: OutreachTouch,
): Promise<{ attempted: boolean; result: SmsResult | null }> {
  const phone = target.listing.ownerContact.phone;
  if (!phone) {
    return { attempted: false, result: null };
  }
  try {
    const result = await sendSMS(phone, touch.smsPreview);
    return { attempted: true, result };
  } catch {
    return {
      attempted: true,
      result: { success: false, error: "SMS outreach send failed" },
    };
  }
}

async function dispatchTouchOutbound(
  target: ScoredSupplyTarget,
  touch: OutreachTouch,
): Promise<{
  configured: boolean;
  delivered: boolean;
  provider: "webhook" | "resend" | "simulated_touch1";
}> {
  const webhookUrl = cleanEnv("MARKETING_WEBHOOK_URL");
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "vettedrent.supply.outreach",
          targetId: target.listing.id,
          source: target.listing.source,
          jurisdictionCode: target.jurisdiction.code,
          matchedCohorts: target.matchedCohorts,
          exposureScore: target.exposureScore,
          exposureVectors: target.exposureVectors,
          ownerContact: target.listing.ownerContact,
          dispatchedTouch: touch,
          outreachSequence: target.outreachSequence,
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
          to: [target.listing.ownerContact.email],
          subject: touch.subject,
          text: touch.body,
        }),
      });
      return { configured: true, delivered: response.ok, provider: "resend" };
    } catch {
      return { configured: true, delivered: false, provider: "resend" };
    }
  }

  return {
    configured: false,
    delivered: true,
    provider: "simulated_touch1",
  };
}

async function logHostSupplyLead(
  target: ScoredSupplyTarget,
  smsStatus: { attempted: boolean; result: SmsResult | null },
  emailWebhookStatus: { configured: boolean; delivered: boolean; provider: string },
): Promise<{
  leadId: string;
  persisted: boolean;
  storage: "marketing_leads" | "server_audit_log";
}> {
  const fallbackId = randomUUID();
  const smsSummary = !smsStatus.attempted
    ? "not_requested"
    : smsStatus.result?.success
      ? smsStatus.result.mocked
        ? "mocked"
        : `sent:${smsStatus.result.sid}`
      : "failed";
  const webhookSummary = `${emailWebhookStatus.provider}:${
    emailWebhookStatus.delivered ? "delivered" : "standby"
  }`;

  const notes = [
    `Source: ${target.listing.source} (${target.listing.id})`,
    `Title: ${target.listing.listingTitle}`,
    `Exposure Score: ${target.exposureScore}/100`,
    `Matched Cohorts: ${target.matchedCohorts.join(", ")}`,
    `Vectors: ${target.exposureVectors.join(", ")}`,
    `Deposit Friction: $${(target.listing.securityDepositCents / 100).toFixed(2)} -> $0.00 VettedRent GMF`,
  ]
    .join(" | ")
    .slice(0, 500);

  const baseRow = {
    role: "host",
    full_name: target.listing.ownerContact.fullName,
    email: target.listing.ownerContact.email,
    phone: target.listing.ownerContact.phone,
    jurisdiction_code: target.jurisdiction.code,
    weekly_rate_cents: target.vettedRentSplit.weeklyRateCents,
    intended_stay_days: target.intendedStayDays,
    agency_name:
      target.listing.ownerContact.propertyCompany ?? `${target.listing.source} Supply Target`,
    utm_source: `supply_scraper_${target.listing.source.toLowerCase()}`,
    utm_medium: "programmatic_outreach",
    utm_campaign: "unvetted_renting_is_over_phase3",
    utm_content: `exposure_${target.exposureScore}`,
    notes,
    sms_status: smsSummary,
    webhook_status: webhookSummary,
  };

  try {
    const supabase = getSupabaseServerClient();
    const withCohort = await supabase
      .from("marketing_leads")
      .insert({ ...baseRow, cohort: "Host-Property" })
      .select("id")
      .maybeSingle();

    if (
      !withCohort.error &&
      withCohort.data &&
      typeof (withCohort.data as { id?: unknown }).id === "string"
    ) {
      return {
        leadId: (withCohort.data as { id: string }).id,
        persisted: true,
        storage: "marketing_leads",
      };
    }

    if (withCohort.error && (withCohort.error.message ?? "").includes("cohort")) {
      const legacy = await supabase
        .from("marketing_leads")
        .insert(baseRow)
        .select("id")
        .maybeSingle();
      if (
        !legacy.error &&
        legacy.data &&
        typeof (legacy.data as { id?: unknown }).id === "string"
      ) {
        return {
          leadId: (legacy.data as { id: string }).id,
          persisted: true,
          storage: "marketing_leads",
        };
      }
    }
  } catch {
    // Graceful degradation when database table is unreachable.
  }

  console.log(
    JSON.stringify({
      audit: "supply_outreach_host_lead_logged",
      leadId: fallbackId,
      targetId: target.listing.id,
      source: target.listing.source,
      jurisdictionCode: target.jurisdiction.code,
      matchedCohorts: target.matchedCohorts,
      exposureScore: target.exposureScore,
      ownerEmail: target.listing.ownerContact.email,
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

function cleanEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
