import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ensureEnterpriseInvoiceGroup,
  openEnterpriseStay,
  type OpenedEnterpriseStay,
} from "@/lib/enterprise-stay";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WEEKS_PER_MONTH = 4;
const MAX_WORKERS = 50;
const MAX_WEEKLY_CENTS = Math.floor(Number.MAX_SAFE_INTEGER / 10000);
const PRICING_MISMATCH =
  "Pricing mismatch: An explicit weekly rate must be provided for this placement until listing defaults are fully migrated.";

export async function POST(request: Request) {
  try {
    if (!process.env.ENTERPRISE_PORTAL_KEY) {
      throw new Error("ENTERPRISE_PORTAL_KEY is not configured");
    }
    if (!authorizedAgency(request.headers.get("authorization"))) {
      return NextResponse.json({ ok: false, error: "Unauthorized agency token" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = parsePlacementBody(payload);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const priced = await requireWeeklyRates(supabase, parsed.workers);
    if ("error" in priced) {
      return NextResponse.json({ ok: false, error: priced.error }, { status: 400 });
    }
    const invoiceGroupId = await ensureEnterpriseInvoiceGroup(
      parsed.agencyName,
      parsed.agencyBillingEmail,
      parsed.stripeAgencyCustomerId,
    );
    const placements = await mapPool(priced.workers, 5, (worker) =>
      placeWorker(supabase, parsed.agencyName, invoiceGroupId, worker),
    );
    const failures = placements.filter((placement) => !placement.ok);
    if (failures.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Enterprise placement incomplete",
          invoiceGroupId,
          placements,
        },
        { status: 500 },
      );
    }

    const opened = placements.length === 1 ? placements[0] : null;
    return NextResponse.json({
      ok: true,
      message: "Enterprise placement opened.",
      underwritingStatus: "approved_by_corporate",
      invoiceGroupId,
      placements,
      ...(opened && opened.ok
        ? {
            tenantId: opened.tenantId,
            placementId: opened.placementId,
            agreementId: opened.agreementId,
            seamAccessCodeId: opened.seamAccessCodeId,
            subscriptionId: opened.subscriptionId,
          }
        : {}),
    });
  } catch (error) {
    console.error("enterprise placement failed");
    const message = safePlacementError(error);
    const status = message === "This email cannot be placed as a lodger" ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

type WorkerResult =
  | {
      ok: true;
      workerEmail: string;
      tenantId: string;
      placementId: string;
      agreementId: string;
      seamAccessCodeId: string | null;
      subscriptionId: string;
      invoiceGroupId: string;
      alreadyOpen: boolean;
    }
  | { ok: false; workerEmail: string; error: string };

async function placeWorker(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  agencyName: string,
  invoiceGroupId: string,
  worker: WorkerInput,
): Promise<WorkerResult> {
  try {
    const resolved = await resolveWorkerFromListing(supabase, worker);
    if ("error" in resolved) {
      return { ok: false, workerEmail: worker.workerEmail, error: resolved.error };
    }
    const tenantId = await ensureLodger(supabase, resolved.workerEmail, resolved.workerFullName);
    await saveLodgerProfile(supabase, tenantId, resolved);
    const placementId = await savePlacement(supabase, tenantId, agencyName, resolved);
    const opened: OpenedEnterpriseStay = await openEnterpriseStay(invoiceGroupId, {
      placementId,
      tenantId,
      workerEmail: resolved.workerEmail,
      workerFullName: resolved.workerFullName,
      weeklyStipendCents: resolved.weeklyStipendCents,
      hostAccountId: resolved.hostAccountId,
      hostId: resolved.hostId,
      listingId: resolved.listingId,
      seamDeviceId: resolved.seamDeviceId,
      contractStartsAt: `${resolved.contractStartDate}T00:00:00.000Z`,
      contractEndsAt: `${resolved.contractEndDate}T23:59:59.000Z`,
    });
    return {
      ok: true,
      workerEmail: worker.workerEmail,
      tenantId,
      placementId,
      agreementId: opened.agreementId,
      seamAccessCodeId: opened.seamAccessCodeId,
      subscriptionId: opened.subscriptionId,
      invoiceGroupId: opened.invoiceGroupId,
      alreadyOpen: opened.alreadyOpen,
    };
  } catch (error) {
    console.error("enterprise worker placement failed");
    return { ok: false, workerEmail: worker.workerEmail, error: safePlacementError(error) };
  }
}

type WorkerInput = {
  workerEmail: string;
  workerFullName: string;
  contractStartDate: string;
  contractEndDate: string;
  weeklyStipendCents: number | null;
  hostAccountId: string | null;
  hostId: string | null;
  listingId: string;
  seamDeviceId: string | null;
};

type ReadyWorker = WorkerInput & {
  weeklyStipendCents: number;
  hostAccountId: string;
  hostId: string;
  seamDeviceId: string;
};

type PlacementRequest = {
  agencyName: string;
  agencyBillingEmail: string | null;
  stripeAgencyCustomerId: string | null;
  workers: WorkerInput[];
};

async function ensureLodger(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  email: string,
  fullName: string,
): Promise<string> {
  try {
    const created = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: "lodger" },
      user_metadata: { full_name: fullName },
    });
    if (created.data.user) {
      return created.data.user.id;
    }
    if (!isExistingEmail(created.error)) {
      throw new Error("profile upsert failed");
    }

    const linked = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    const user = linked.data.user;
    if (linked.error || !user) {
      throw new Error("profile upsert failed");
    }
    const role = readRole(user.app_metadata);
    if (role && role !== "lodger") {
      throw new Error("worker email belongs to another role");
    }
    if (!role) {
      const updated = await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { role: "lodger" },
      });
      if (updated.error || !updated.data.user) {
        throw new Error("profile upsert failed");
      }
    }
    return user.id;
  } catch (error) {
    if (error instanceof Error && error.message === "worker email belongs to another role") {
      throw error;
    }
    if (error instanceof Error && error.message === "profile upsert failed") {
      throw error;
    }
    throw new Error("profile upsert failed");
  }
}

async function saveLodgerProfile(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  placement: ReadyWorker,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: tenantId,
          email: placement.workerEmail,
          full_name: placement.workerFullName,
          role: "lodger",
          underwriting_approved: true,
          calculated_monthly_inflow_cents: placement.weeklyStipendCents * WEEKS_PER_MONTH,
          underwriting_checked_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new Error("profile upsert failed");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "profile upsert failed") {
      throw error;
    }
    throw new Error("profile upsert failed");
  }
}

async function savePlacement(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
  agencyName: string,
  placement: ReadyWorker,
): Promise<string> {
  const row = {
    tenant_id: tenantId,
    agency_name: agencyName,
    worker_email: placement.workerEmail,
    worker_full_name: placement.workerFullName,
    contract_start_date: placement.contractStartDate,
    contract_end_date: placement.contractEndDate,
    weekly_stipend_cents: placement.weeklyStipendCents,
    underwriting_status: "approved_by_corporate",
  };
  try {
    const inserted = await supabase
      .from("corporate_placements")
      .insert({ id: randomUUID(), ...row })
      .select("id")
      .maybeSingle();
    if (!inserted.error) {
      if (!inserted.data?.id) {
        throw new Error("placement record failed");
      }
      return String(inserted.data.id);
    }
    if (inserted.error.code !== "23505") {
      throw new Error("placement record failed");
    }
    const updated = await supabase
      .from("corporate_placements")
      .update(row)
      .eq("worker_email", placement.workerEmail)
      .eq("contract_start_date", placement.contractStartDate)
      .eq("contract_end_date", placement.contractEndDate)
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data?.id) {
      throw new Error("placement record failed");
    }
    return String(updated.data.id);
  } catch (error) {
    if (error instanceof Error && error.message === "placement record failed") {
      throw error;
    }
    throw new Error("placement record failed");
  }
}

function parsePlacementBody(value: unknown): PlacementRequest | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const agencyName = textField(field(body, "agencyName", "agency_id"));
  const agencyBillingEmail = emailField(field(body, "agencyBillingEmail", "agency_billing_email"));
  const stripeAgencyCustomerId = textField(
    field(body, "stripeAgencyCustomerId", "stripe_agency_customer_id"),
  );
  if (!agencyName) {
    return { error: "Missing or invalid agencyName" };
  }
  if (stripeAgencyCustomerId && !stripeAgencyCustomerId.startsWith("cus_")) {
    return { error: "Missing or invalid stripeAgencyCustomerId" };
  }
  if (!agencyBillingEmail && !stripeAgencyCustomerId) {
    return { error: "Missing or invalid agencyBillingEmail" };
  }

  const workerList = body.workers;
  const hasWorkerList = Array.isArray(workerList);
  const hasSingleWorker = body.workerEmail !== undefined || body.lodger_email !== undefined;
  if (hasWorkerList && hasSingleWorker) {
    return { error: "Send workers or a single placement, not both" };
  }
  if (hasWorkerList) {
    if (workerList.length === 0 || workerList.length > MAX_WORKERS) {
      return { error: "workers must contain 1 to 50 placements" };
    }
    const workers: WorkerInput[] = [];
    for (const entry of workerList) {
      const worker = parseWorker(entry);
      if ("error" in worker) {
        return worker;
      }
      workers.push(worker);
    }
    return { agencyName, agencyBillingEmail, stripeAgencyCustomerId, workers };
  }

  const worker = parseWorker(body);
  if ("error" in worker) {
    return worker;
  }
  return { agencyName, agencyBillingEmail, stripeAgencyCustomerId, workers: [worker] };
}

function parseWorker(value: unknown): WorkerInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Payload must be a valid JSON object" };
  }
  const body = value as Record<string, unknown>;
  const workerEmail = emailField(field(body, "workerEmail", "lodger_email"));
  const workerFullName = textField(field(body, "workerFullName", "lodger_name"));
  const contractStartDate = isoDate(field(body, "contractStartDate", "start_date"));
  const contractEndDate = isoDate(field(body, "contractEndDate", "end_date"));
  const rawRate = field(body, "weeklyStipendCents", "custom_weekly_rate_cents");
  const weeklyStipendCents = rawRate === undefined ? null : stipendCents(rawRate);
  const rawHostAccount = field(body, "hostAccountId");
  const hostAccountId = rawHostAccount === undefined ? null : textField(rawHostAccount);
  const rawHostId = field(body, "hostId");
  const hostId = rawHostId === undefined ? null : textField(rawHostId);
  const listingId = textField(field(body, "listingId", "listing_id"));
  const rawDevice = field(body, "seamDeviceId");
  const seamDeviceId = rawDevice === undefined ? null : textField(rawDevice);

  if (!workerEmail) {
    return { error: "Missing or invalid workerEmail" };
  }
  if (!workerFullName) {
    return { error: "Missing or invalid workerFullName" };
  }
  if (!contractStartDate || !contractEndDate || contractEndDate < contractStartDate) {
    return { error: "Missing or invalid contract dates" };
  }
  if (rawRate !== undefined && weeklyStipendCents === null) {
    return { error: "Missing or invalid weeklyStipendCents amount" };
  }
  if (rawHostAccount !== undefined && (!hostAccountId || !hostAccountId.startsWith("acct_"))) {
    return { error: "Missing or invalid Stripe hostAccountId" };
  }
  if (rawHostId !== undefined && !hostId) {
    return { error: "Missing or invalid hostId" };
  }
  if (!listingId) {
    return { error: "Missing or invalid listingId" };
  }
  if (rawDevice !== undefined && !seamDeviceId) {
    return { error: "Missing or invalid seamDeviceId" };
  }
  return {
    workerEmail,
    workerFullName,
    contractStartDate,
    contractEndDate,
    weeklyStipendCents,
    hostAccountId,
    hostId,
    listingId,
    seamDeviceId,
  };
}

async function resolveWorkerFromListing(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  worker: WorkerInput,
): Promise<ReadyWorker | { error: string }> {
  if (
    worker.weeklyStipendCents !== null &&
    worker.hostAccountId &&
    worker.hostId &&
    worker.seamDeviceId
  ) {
    return {
      ...worker,
      weeklyStipendCents: worker.weeklyStipendCents,
      hostAccountId: worker.hostAccountId,
      hostId: worker.hostId,
      seamDeviceId: worker.seamDeviceId,
    };
  }

  const columns = listingColumns(worker);
  try {
    const { data, error } = await supabase
      .from("listings")
      .select(columns)
      .eq("id", worker.listingId)
      .maybeSingle();
    if (error) {
      if (worker.weeklyStipendCents === null && missingListingColumn(error, "weekly_price_cents")) {
        return { error: PRICING_MISMATCH };
      }
      return { error: "Target listing not found" };
    }
    if (!data) {
      return { error: "Target listing not found" };
    }
    const row = listingRow(data);
    if (!row) {
      return { error: "Target listing not found" };
    }
    const weeklyRent = worker.weeklyStipendCents ?? integerCents(row.weekly_price_cents);
    if (!weeklyRent) {
      return { error: PRICING_MISMATCH };
    }
    const hostAccountId = worker.hostAccountId ?? accountId(row.stripe_host_account_id);
    const hostId = worker.hostId ?? textOrNull(row.host_id);
    const seamDeviceId = worker.seamDeviceId ?? textOrNull(row.seam_device_id);
    if (!hostAccountId) {
      return { error: "Missing or invalid Stripe hostAccountId" };
    }
    if (!hostId) {
      return { error: "Missing or invalid hostId" };
    }
    if (!seamDeviceId) {
      return { error: "Missing or invalid seamDeviceId" };
    }
    return {
      ...worker,
      weeklyStipendCents: weeklyRent,
      hostAccountId,
      hostId,
      seamDeviceId,
    };
  } catch {
    return { error: "Target listing not found" };
  }
}

async function requireWeeklyRates(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  workers: WorkerInput[],
): Promise<{ workers: WorkerInput[] } | { error: string }> {
  const priced: WorkerInput[] = [];
  for (const worker of workers) {
    if (worker.weeklyStipendCents !== null) {
      priced.push(worker);
      continue;
    }
    const rate = await listingWeeklyRate(supabase, worker.listingId);
    if ("error" in rate) {
      return rate;
    }
    priced.push({ ...worker, weeklyStipendCents: rate.weeklyStipendCents });
  }
  return { workers: priced };
}

async function listingWeeklyRate(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  listingId: string,
): Promise<{ weeklyStipendCents: number } | { error: string }> {
  try {
    const { data, error } = await supabase
      .from("listings")
      .select("weekly_price_cents")
      .eq("id", listingId)
      .maybeSingle();
    if (error) {
      if (missingListingColumn(error, "weekly_price_cents")) {
        return { error: PRICING_MISMATCH };
      }
      return { error: "Target listing not found" };
    }
    const weeklyRent = data ? integerCents(data.weekly_price_cents) : null;
    if (!weeklyRent) {
      return { error: data ? PRICING_MISMATCH : "Target listing not found" };
    }
    return { weeklyStipendCents: weeklyRent };
  } catch {
    return { error: PRICING_MISMATCH };
  }
}

function listingRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function listingColumns(worker: WorkerInput): string {
  const columns = ["seam_device_id", "host_id"];
  if (worker.weeklyStipendCents === null) {
    columns.push("weekly_price_cents");
  }
  if (!worker.hostAccountId) {
    columns.push("stripe_host_account_id");
  }
  return columns.join(", ");
}

function missingListingColumn(error: { message?: string }, column: string): boolean {
  return (error.message ?? "").includes(column);
}

function field(body: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (body[key] !== undefined) {
      return body[key];
    }
  }
  return undefined;
}

function textOrNull(value: unknown): string | null {
  return textField(value);
}

function accountId(value: unknown): string | null {
  const account = textField(value);
  if (!account || !account.startsWith("acct_")) {
    return null;
  }
  return account;
}

function integerCents(value: unknown): number | null {
  if (typeof value === "number") {
    return stipendCents(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return stipendCents(parsed);
  }
  return null;
}

function stipendCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  if (value > MAX_WEEKLY_CENTS || !Number.isSafeInteger(value * WEEKS_PER_MONTH)) {
    return null;
  }
  return value;
}

function emailField(value: unknown): string | null {
  const email = textField(value)?.toLowerCase() ?? null;
  if (!email || !email.includes("@") || /\s/.test(email)) {
    return null;
  }
  return email;
}

function textField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return value;
}

function readRole(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const role = (metadata as { role?: unknown }).role;
  if (typeof role !== "string") {
    return null;
  }
  const trimmed = role.trim();
  return trimmed === "" ? null : trimmed;
}

function isExistingEmail(error: { code?: string | null; message?: string } | null): boolean {
  if (!error) {
    return false;
  }
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    (error.message ?? "").includes("already been registered")
  );
}

function safePlacementError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Failed to establish worker profile record";
  }
  if (error.message.includes("not configured")) {
    return error.message;
  }
  if (error.message === "worker email belongs to another role") {
    return "This email cannot be placed as a lodger";
  }
  if (
    error.message === "profile upsert failed" ||
    error.message === "placement record failed" ||
    error.message === "agreement insert failed" ||
    error.message === "Subscription creation failed" ||
    error.message === "Target listing not found" ||
    error.message === PRICING_MISMATCH
  ) {
    return error.message;
  }
  return "Failed to establish worker profile record";
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function authorizedAgency(header: string | null): boolean {
  const key = process.env.ENTERPRISE_PORTAL_KEY;
  if (!key || !header) {
    return false;
  }
  const expected = Buffer.from(`Bearer ${key}`);
  const provided = Buffer.from(header.trim());
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}
