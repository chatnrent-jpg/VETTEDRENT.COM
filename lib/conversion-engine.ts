import { createHash, randomUUID } from "node:crypto";
import { addDaysIsoUtc, todayIsoUtc } from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  clampTierWeeklyRateCents,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import {
  resolvePropertyUuidForTier,
  resolveTierFromPropertyUuid,
  reserveStayDatesInAvailability,
} from "@/lib/host-availability";
import {
  BENCHMARK_45_STAYS,
  DEFAULT_GMF_FLOAT_SEED_CENTS,
} from "@/lib/liquidity-spread";
import {
  allocateIntegerSplitCents,
  divideIntegerCentsHalfUp,
} from "@/lib/marketing-calculator";
import { ListingBookingError, reserveListingStay } from "@/lib/listing-availability";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  SEASONAL_REMOTE_MIN_DAYS,
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export const VALUATION_TARGET_STAYS = BENCHMARK_45_STAYS;
export const VALUATION_TARGET_DOLLARS = 1000000;
export const UNIVERSAL_FLOOR_WEEKLY_CENTS = 31500;
export const UNIVERSAL_FLOOR_DAILY_GROSS_CENTS = 4500;
export const UNIVERSAL_FLOOR_DAILY_VAULT_CENTS = 644;
export const UNIVERSAL_FLOOR_DAILY_NET_CENTS = 3856;
export const UNIVERSAL_FLOOR_45_STAY_21D_FLOAT_CENTS = 4252500; // $42,525.00 across 45 base-tier stays

export type ActivateStayPayload = {
  applicant?: string;
  tenantId?: string;
  propertyId?: string;
  /** A published listing. When set, its own calendar is reserved (atomically) instead of the shared tier calendar. */
  listingId?: string;
  cohort?: PurposeCohortId | string;
  jurisdiction?: string;
  tier?: DailyRateTierId | string;
  weeklyRateCents?: number;
  stayDays?: number;
  checkInDate?: string;
  credentialIdentifier?: string;
  coverageRatio?: number;
};

export type ActiveCommercialLicenseRecord = {
  license_id: string;
  license_token: string;
  agreement_id: string;
  tenant_id: string;
  property_id: string;
  applicant: string;
  cohort: PurposeCohortId;
  credential_identifier: string;
  jurisdiction: string;
  tier: DailyRateTierId;
  listing_id: string;
  weekly_rate_cents: number;
  weekly_host_share_cents: number;
  weekly_gmf_share_cents: number;
  weekly_platform_share_cents: number;
  daily_rate_cents: number;
  stay_days: number;
  total_billing_cycles: number;
  check_in_date: string;
  valid_until: string;
  status: "License_Active" | "License_Revoked";
  db_status: "ACTIVE" | "UNVETTED_FLAGGED" | "SUSPENDED" | "REVOKED";
  webhook_status: "NOMINAL" | "MUTATED_GMF_ACTIVE" | "TERMINATED";
  coverage_ratio: number;
  seam_access_code_id: string;
  created_at: string;
};

export type WeeklyDeductionLedgerRecord = {
  ledger_id: string;
  agreement_id: string;
  license_token: string;
  applicant: string;
  cohort: PurposeCohortId;
  tier: DailyRateTierId;
  billing_cycle_number: number;
  target_payout_date: string;
  weekly_gross_cents: number;
  host_payout_cents: number;
  gmf_vault_cents: number;
  platform_fee_cents: number;
  rolling_21_day_float_cents: number;
  cycle_date: string;
  is_settled: boolean;
  status: "settled" | "scheduled";
  created_at: string;
};

export type WeeklyDeductionInstallmentRow = {
  id: string;
  license_id: string;
  billing_cycle_number: number;
  target_payout_date: string;
  amount_collected_cents: number;
  host_payout_cents: number;
  gmf_escrow_cents: number;
  platform_fee_cents: number;
  stripe_charge_id: string | null;
  is_settled: boolean;
  settled_at: string | null;
  created_at: string;
};

export type ValuationMilestoneSnapshot = {
  activeStaysCount: number;
  targetStaysCount: 45;
  progressPercentage: number;
  remainingStaysToTarget: number;
  cumulativeWeeklyGrossCents: number;
  cumulativeMonthlyGrossCents: number;
  cumulativeAnnualizedGmvCents: number;
  cumulativeWeeklyHostPayoutCents: number;
  cumulativeWeeklyGmfVaultCents: number;
  cumulativeWeeklyPlatformFeeCents: number;
  rolling21DayGmfTimingFloatCents: number;
  target45StayBaseTimingFloatCents: 4252500;
  liveGmfPoolBalanceCents: number;
  combinedTreasuryFloatCents: number;
  estimatedPlatformValuationCents: number;
  targetValuationCents: 100000000;
  universalFloorPricing: {
    tierId: "RoomSanctuary";
    weeklyRateCents: 31500;
    grossDailyRateCents: 4500;
    dailyGmfVaultCreditCents: 644;
    netEffectiveDailyRateCents: 3856;
    weeklyHostPayoutCents: 23783;
    monthlyHostNetPayoutCents: 103058;
    savingsVs277NightlyPercent: 84;
    benchmark45Stays21DayTimingFloatCents: 4252500;
  };
  coBranding: "VettedRent.com · Powered by Vettilo™";
  cohortDistribution: Record<PurposeCohortId, number>;
  tierDistribution: Record<DailyRateTierId, number>;
  recentLicenses: ActiveCommercialLicenseRecord[];
  storageSource:
    | "public.active_commercial_licenses"
    | "public.active_licenses"
    | "seeded_memory_ledger";
};

export type ActivateStayResult = {
  ok: true;
  license: ActiveCommercialLicenseRecord;
  ledgerEntry: WeeklyDeductionLedgerRecord;
  ledgerInstallments: WeeklyDeductionInstallmentRow[];
  reservedDates: string[];
  milestone: ValuationMilestoneSnapshot;
  persistence: {
    activeCommercialLicenses: "supabase" | "memory_fallback";
    weeklyDeductionLedger: "supabase" | "memory_fallback";
    availabilityReserved: boolean;
  };
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deterministicUuidFromString(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  const p1 = hex.slice(0, 8);
  const p2 = hex.slice(8, 12);
  const p3 = `4${hex.slice(13, 16)}`;
  const variantNibble = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  const p4 = `${variantNibble}${hex.slice(17, 20)}`;
  const p5 = hex.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
}

function resolveTenantUuid(applicant: string, explicitTenantId?: unknown): string {
  if (typeof explicitTenantId === "string" && UUID_RE.test(explicitTenantId.trim())) {
    return explicitTenantId.trim().toLowerCase();
  }
  return deterministicUuidFromString(`vettedrent:tenant:${applicant.trim().toLowerCase()}`);
}

function computeTotalBillingCycles(stayDays: number): number {
  const safeDays = Math.max(7, Math.min(90, Math.trunc(stayDays)));
  return Math.max(1, Math.trunc((safeDays + 6) / 7));
}

function daysBetweenIsoUtc(startIso: string, endIso: string): number {
  const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endIso);
  if (!s || !e) {
    return 30;
  }
  const startMs = Date.UTC(Number(s[1]), Number(s[2]) - 1, Number(s[3]));
  const endMs = Date.UTC(Number(e[1]), Number(e[2]) - 1, Number(e[3]));
  const diffDays = Math.trunc((endMs - startMs) / 86400000);
  return Math.max(7, Math.min(90, diffDays > 0 ? diffDays : 30));
}

const memoryLicenses: Map<string, ActiveCommercialLicenseRecord> =
  createSeededLicenses();
const memoryLedger: Map<string, WeeklyDeductionLedgerRecord> =
  createSeededLedger(memoryLicenses);

function createSeededLicenses(): Map<string, ActiveCommercialLicenseRecord> {
  const map = new Map<string, ActiveCommercialLicenseRecord>();
  const today = todayIsoUtc();

  const seeds: Array<{
    applicant: string;
    cohort: PurposeCohortId;
    jurisdiction: string;
    tier: DailyRateTierId;
    stayDays: number;
    offsetDays: number;
  }> = [
    {
      applicant: "jordan.taylor.rn@vettedcare.com",
      cohort: "Contract-Assignment",
      jurisdiction: "MD-PG",
      tier: "RoomSanctuary",
      stayDays: 90,
      offsetDays: 0,
    },
    {
      applicant: "maya.lin.pharmd@umd.edu",
      cohort: "Academic-Enrollment",
      jurisdiction: "MD",
      tier: "PrivateSuite",
      stayDays: 60,
      offsetDays: 2,
    },
    {
      applicant: "devon.brooks@remotepass.io",
      cohort: "Seasonal-Remote",
      jurisdiction: "FL",
      tier: "RoomSanctuary",
      stayDays: 30,
      offsetDays: 5,
    },
    {
      applicant: "marcus.vance@carrier-relocation.com",
      cohort: "Insurance-Relocation",
      jurisdiction: "TX",
      tier: "ExecutiveTownhome",
      stayDays: 90,
      offsetDays: 7,
    },
  ];

  seeds.forEach((seed, idx) => {
    const tierPreset = DAILY_RATE_PRESET_TIERS[seed.tier];
    const cohortRule = resolvePurposeCohort(seed.cohort);
    const checkIn = addDaysIsoUtc(today, seed.offsetDays);
    const validUntil = addDaysIsoUtc(checkIn, seed.stayDays);
    const agreementId = `00000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
    const split = allocateIntegerSplitCents(tierPreset.weeklyRateCents);
    const totalBillingCycles = computeTotalBillingCycles(seed.stayDays);
    const token = buildCryptographicLicenseToken({
      agreementId,
      applicant: seed.applicant,
      cohort: seed.cohort,
      jurisdiction: seed.jurisdiction,
      weeklyRateCents: split.grossCents,
      stayDays: seed.stayDays,
      checkInDate: checkIn,
      validUntil,
    });

    const record: ActiveCommercialLicenseRecord = {
      license_id: `VR-LIC-${seed.cohort.slice(0, 3).toUpperCase()}-${seed.jurisdiction}-SEED0${idx + 1}`,
      license_token: token,
      agreement_id: agreementId,
      tenant_id: resolveTenantUuid(seed.applicant),
      property_id: resolvePropertyUuidForTier(seed.tier),
      applicant: seed.applicant,
      cohort: seed.cohort,
      credential_identifier: cohortRule.defaultIdentifier,
      jurisdiction: seed.jurisdiction,
      tier: seed.tier,
      listing_id: listingIdForTier(seed.tier),
      weekly_rate_cents: split.grossCents,
      weekly_host_share_cents: split.hostShareCents,
      weekly_gmf_share_cents: split.gmfShareCents,
      weekly_platform_share_cents: split.platformShareCents,
      daily_rate_cents: tierPreset.grossDailyRateCents,
      stay_days: seed.stayDays,
      total_billing_cycles: totalBillingCycles,
      check_in_date: checkIn,
      valid_until: validUntil,
      status: "License_Active",
      db_status: "ACTIVE",
      webhook_status: "NOMINAL",
      coverage_ratio: 3.25,
      seam_access_code_id: `seam_key_${token.slice(-8).toLowerCase()}`,
      created_at: new Date().toISOString(),
    };
    map.set(record.agreement_id, record);
  });

  return map;
}

function createSeededLedger(
  licenses: Map<string, ActiveCommercialLicenseRecord>,
): Map<string, WeeklyDeductionLedgerRecord> {
  const map = new Map<string, WeeklyDeductionLedgerRecord>();
  for (const lic of licenses.values()) {
    const entry = buildLedgerEntryForLicense(lic);
    map.set(entry.ledger_id, entry);
  }
  return map;
}

function normalizeHydratedLicenseFloor(
  rec: ActiveCommercialLicenseRecord,
): ActiveCommercialLicenseRecord {
  const safeTier: DailyRateTierId =
    rec.tier === "PrivateSuite" || rec.tier === "ExecutiveTownhome"
      ? rec.tier
      : "RoomSanctuary";
  const clampedWeekly = clampTierWeeklyRateCents(safeTier, rec.weekly_rate_cents);
  const split = allocateIntegerSplitCents(clampedWeekly);
  const dailyCents = divideIntegerCentsHalfUp(clampedWeekly, 7);
  return {
    ...rec,
    tier: safeTier,
    property_id: rec.property_id || resolvePropertyUuidForTier(safeTier),
    tenant_id: rec.tenant_id || resolveTenantUuid(rec.applicant || "verified.lodger@vettedrent.com"),
    weekly_rate_cents: split.grossCents,
    weekly_host_share_cents: split.hostShareCents,
    weekly_gmf_share_cents: split.gmfShareCents,
    weekly_platform_share_cents: split.platformShareCents,
    daily_rate_cents: dailyCents,
    total_billing_cycles:
      rec.total_billing_cycles || computeTotalBillingCycles(rec.stay_days || 30),
  };
}

function listingIdForTier(tier: DailyRateTierId): string {
  if (tier === "ExecutiveTownhome") {
    return "vr-executive-townhome";
  }
  if (tier === "PrivateSuite") {
    return "vr-private-suite";
  }
  return "vr-weekly-room";
}

function resolveTierFromInput(
  tierInput: unknown,
  weeklyRateCentsInput: unknown,
  propertyIdInput?: unknown,
): DailyRateTierId {
  if (
    tierInput === "RoomSanctuary" ||
    tierInput === "PrivateSuite" ||
    tierInput === "ExecutiveTownhome"
  ) {
    return tierInput;
  }
  const fromProp = resolveTierFromPropertyUuid(propertyIdInput);
  if (fromProp) {
    return fromProp;
  }
  const cents = Number(weeklyRateCentsInput);
  if (cents >= 74500) {
    return "ExecutiveTownhome";
  }
  if (cents === 52500 || cents === 49000 || cents > 63000) {
    return "PrivateSuite";
  }
  return "RoomSanctuary";
}

function buildCryptographicLicenseToken(params: {
  agreementId: string;
  applicant: string;
  cohort: PurposeCohortId;
  jurisdiction: string;
  weeklyRateCents: number;
  stayDays: number;
  checkInDate: string;
  validUntil: string;
}): string {
  const digest = createHash("sha256")
    .update(
      [
        params.agreementId,
        params.applicant,
        params.cohort,
        params.jurisdiction,
        String(params.weeklyRateCents),
        String(params.stayDays),
        params.checkInDate,
        params.validUntil,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  const cleanJur = params.jurisdiction.replace(/[^A-Z0-9]/g, "");
  const cohortPrefix = params.cohort.slice(0, 3).toUpperCase();
  return `vrtl_${cleanJur}_${cohortPrefix}_${digest}`;
}

function buildLedgerEntryForLicense(
  license: ActiveCommercialLicenseRecord,
): WeeklyDeductionLedgerRecord {
  const split = allocateIntegerSplitCents(license.weekly_rate_cents);
  const float21 = split.grossCents * 3;
  const targetPayoutDate = addDaysIsoUtc(license.check_in_date, 7);

  return {
    ledger_id: deterministicUuidFromString(`vettedrent:ledger:${license.agreement_id}:1`),
    agreement_id: license.agreement_id,
    license_token: license.license_token,
    applicant: license.applicant,
    cohort: license.cohort,
    tier: license.tier,
    billing_cycle_number: 1,
    target_payout_date: targetPayoutDate,
    weekly_gross_cents: split.grossCents,
    host_payout_cents: split.hostShareCents,
    gmf_vault_cents: split.gmfShareCents,
    platform_fee_cents: split.platformShareCents,
    rolling_21_day_float_cents: float21,
    cycle_date: license.check_in_date,
    is_settled: true,
    status: "settled",
    created_at: license.created_at,
  };
}

/**
 * Generates the complete sequence of weekly micro-deduction installments
 * (`1 .. totalBillingCycles`) for `public.weekly_deduction_ledger` using pure
 * integer-cents split allocations (75.5% Host / 14.3% GMF / 10.2% Platform).
 */
export function buildLedgerInstallmentsForLicense(
  license: ActiveCommercialLicenseRecord,
): WeeklyDeductionInstallmentRow[] {
  const split = allocateIntegerSplitCents(license.weekly_rate_cents);
  const totalCycles = Math.max(1, Math.trunc(license.total_billing_cycles));
  const installments: WeeklyDeductionInstallmentRow[] = [];

  for (let cycle = 1; cycle <= totalCycles; cycle++) {
    const isInitialCycle = cycle === 1;
    installments.push({
      id: deterministicUuidFromString(
        `vettedrent:ledger:${license.agreement_id}:${cycle}`,
      ),
      license_id: license.agreement_id,
      billing_cycle_number: cycle,
      target_payout_date: addDaysIsoUtc(license.check_in_date, cycle * 7),
      amount_collected_cents: split.grossCents,
      host_payout_cents: split.hostShareCents,
      gmf_escrow_cents: split.gmfShareCents,
      platform_fee_cents: split.platformShareCents,
      stripe_charge_id: null,
      is_settled: isInitialCycle,
      settled_at: isInitialCycle ? license.created_at : null,
      created_at: license.created_at,
    });
  }

  return installments;
}

type DbActiveCommercialLicenseRow = {
  id?: unknown;
  tenant_id?: unknown;
  property_id?: unknown;
  jurisdiction_code?: unknown;
  stay_cohort?: unknown;
  crypto_token?: unknown;
  status?: unknown;
  webhook_status?: unknown;
  weekly_gross_cents?: unknown;
  weekly_host_share_cents?: unknown;
  weekly_gmf_share_cents?: unknown;
  weekly_platform_share_cents?: unknown;
  check_in_date?: unknown;
  check_out_date?: unknown;
  total_billing_cycles?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function mapDbLicenseRowToRecord(
  row: DbActiveCommercialLicenseRow,
): ActiveCommercialLicenseRecord | null {
  const agreementId =
    typeof row.id === "string" && UUID_RE.test(row.id) ? row.id : null;
  const licenseToken =
    typeof row.crypto_token === "string" && row.crypto_token.trim() !== ""
      ? row.crypto_token.trim()
      : null;
  if (!agreementId || !licenseToken) {
    return null;
  }

  const cohortRule = resolvePurposeCohort(
    typeof row.stay_cohort === "string" ? row.stay_cohort : undefined,
  );
  const jurisdictionRule =
    resolveJurisdiction(
      typeof row.jurisdiction_code === "string" ? row.jurisdiction_code : undefined,
    ) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE) ??
    JURISDICTION_RULES[0];

  const rawWeekly = Number(row.weekly_gross_cents);
  const tierId = resolveTierFromInput(undefined, rawWeekly, row.property_id);
  const weeklyRateCents = clampTierWeeklyRateCents(
    tierId,
    Number.isFinite(rawWeekly) ? Math.trunc(rawWeekly) : undefined,
  );
  const split = allocateIntegerSplitCents(weeklyRateCents);
  const dailyRateCents = divideIntegerCentsHalfUp(weeklyRateCents, 7);

  const checkInDate =
    typeof row.check_in_date === "string" && ISO_DATE_RE.test(row.check_in_date)
      ? row.check_in_date
      : todayIsoUtc();
  const validUntil =
    typeof row.check_out_date === "string" && ISO_DATE_RE.test(row.check_out_date)
      ? row.check_out_date
      : addDaysIsoUtc(checkInDate, cohortRule.defaultStayDays);
  const stayDays = daysBetweenIsoUtc(checkInDate, validUntil);
  const rawCycles = Number(row.total_billing_cycles);
  const totalBillingCycles =
    Number.isFinite(rawCycles) && rawCycles >= 1
      ? Math.trunc(rawCycles)
      : computeTotalBillingCycles(stayDays);

  const dbStatus =
    row.status === "REVOKED" ||
    row.status === "SUSPENDED" ||
    row.status === "UNVETTED_FLAGGED"
      ? row.status
      : "ACTIVE";
  const webhookStatus =
    row.webhook_status === "MUTATED_GMF_ACTIVE" ||
    row.webhook_status === "TERMINATED"
      ? row.webhook_status
      : "NOMINAL";

  const existingMem = memoryLicenses.get(agreementId);
  const applicant =
    existingMem?.applicant ?? "verified.lodger@vettedrent.com";
  const credentialIdentifier =
    existingMem?.credential_identifier ?? cohortRule.defaultIdentifier;

  return {
    license_id:
      existingMem?.license_id ??
      `VR-LIC-${cohortRule.id.slice(0, 3).toUpperCase()}-${jurisdictionRule.code}-${checkInDate.replace(/-/g, "")}-${agreementId.slice(0, 4).toUpperCase()}`,
    license_token: licenseToken,
    agreement_id: agreementId,
    tenant_id:
      typeof row.tenant_id === "string" && UUID_RE.test(row.tenant_id)
        ? row.tenant_id
        : resolveTenantUuid(applicant),
    property_id: resolvePropertyUuidForTier(tierId, row.property_id),
    applicant,
    cohort: cohortRule.id,
    credential_identifier: credentialIdentifier,
    jurisdiction: jurisdictionRule.code,
    tier: tierId,
    listing_id: listingIdForTier(tierId),
    weekly_rate_cents: split.grossCents,
    weekly_host_share_cents: split.hostShareCents,
    weekly_gmf_share_cents: split.gmfShareCents,
    weekly_platform_share_cents: split.platformShareCents,
    daily_rate_cents: dailyRateCents,
    stay_days: stayDays,
    total_billing_cycles: totalBillingCycles,
    check_in_date: checkInDate,
    valid_until: validUntil,
    status: dbStatus === "ACTIVE" ? "License_Active" : "License_Revoked",
    db_status: dbStatus,
    webhook_status: webhookStatus,
    coverage_ratio: existingMem?.coverage_ratio ?? 3.25,
    seam_access_code_id: `seam_key_${licenseToken.slice(-8).toLowerCase()}`,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
  };
}

/**
 * Automates the Underwriting → `public.active_commercial_licenses` →
 * `public.weekly_deduction_ledger` → `public.host_tier_availability` loop.
 */
export async function activateStayFromUnderwriting(
  payload: ActivateStayPayload = {},
): Promise<ActivateStayResult> {
  const cohortRule = resolvePurposeCohort(payload.cohort);
  const jurisdictionRule =
    resolveJurisdiction(payload.jurisdiction) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE) ??
    JURISDICTION_RULES[0];

  const tierId = resolveTierFromInput(
    payload.tier,
    payload.weeklyRateCents,
    payload.propertyId,
  );

  const rawWeekly = Number(payload.weeklyRateCents);
  const weeklyRateCents = clampTierWeeklyRateCents(
    tierId,
    Number.isFinite(rawWeekly) ? Math.trunc(rawWeekly) : undefined,
  );

  // Pure integer-cents basis-point split (75.5% Host / 14.3% GMF / 10.2% Platform)
  const split = allocateIntegerSplitCents(weeklyRateCents);
  const dailyRateCents = divideIntegerCentsHalfUp(split.grossCents, 7);

  const minFloorDays =
    cohortRule.id === "Seasonal-Remote" ? SEASONAL_REMOTE_MIN_DAYS : 7;
  const rawStayDays = Number(payload.stayDays);
  const stayDays =
    Number.isFinite(rawStayDays) && rawStayDays >= 7 && rawStayDays <= 90
      ? Math.max(minFloorDays, Math.trunc(rawStayDays))
      : Math.min(90, Math.max(minFloorDays, cohortRule.defaultStayDays));

  const totalBillingCycles = computeTotalBillingCycles(stayDays);

  const checkInDate =
    typeof payload.checkInDate === "string" &&
    ISO_DATE_RE.test(payload.checkInDate.trim())
      ? payload.checkInDate.trim()
      : todayIsoUtc();

  const validUntil = addDaysIsoUtc(checkInDate, stayDays);

  // A real listing owns its calendar. Reserve the days first, atomically, so a refused or
  // double-booked stay never produces a license. Nothing below runs unless the days are ours.
  const bookedListingId =
    typeof payload.listingId === "string" && payload.listingId.trim() !== ""
      ? payload.listingId.trim()
      : null;
  let listingReservedDates: string[] | null = null;
  if (bookedListingId) {
    if (checkInDate < todayIsoUtc()) {
      throw new ListingBookingError("conflict");
    }
    const reservation = await reserveListingStay(
      getSupabaseServerClient(),
      bookedListingId,
      checkInDate,
      stayDays,
    );
    if (!reservation.ok) {
      throw new ListingBookingError(reservation.reason);
    }
    listingReservedDates = reservation.reservedDates;
  }

  const applicant =
    typeof payload.applicant === "string" && payload.applicant.trim() !== ""
      ? payload.applicant.trim().slice(0, 120)
      : "verified.lodger@vettedrent.com";

  const credentialIdentifier =
    typeof payload.credentialIdentifier === "string" &&
    payload.credentialIdentifier.trim() !== ""
      ? payload.credentialIdentifier.trim().slice(0, 80)
      : cohortRule.defaultIdentifier;

  const rawRatio = Number(payload.coverageRatio);
  const coverageRatio =
    Number.isFinite(rawRatio) && rawRatio >= 2.5 && rawRatio <= 50
      ? rawRatio
      : 3.0;

  const agreementId = randomUUID();
  const tenantUuid = resolveTenantUuid(applicant, payload.tenantId);
  const propertyUuid = resolvePropertyUuidForTier(tierId, payload.propertyId);

  const licenseToken = buildCryptographicLicenseToken({
    agreementId,
    applicant,
    cohort: cohortRule.id,
    jurisdiction: jurisdictionRule.code,
    weeklyRateCents: split.grossCents,
    stayDays,
    checkInDate,
    validUntil,
  });

  const nowIso = new Date().toISOString();
  const licenseId = `VR-LIC-${cohortRule.id.slice(0, 3).toUpperCase()}-${jurisdictionRule.code}-${checkInDate.replace(/-/g, "")}-${agreementId.slice(0, 4).toUpperCase()}`;

  const licenseRecord: ActiveCommercialLicenseRecord = {
    license_id: licenseId,
    license_token: licenseToken,
    agreement_id: agreementId,
    tenant_id: tenantUuid,
    property_id: propertyUuid,
    applicant,
    cohort: cohortRule.id,
    credential_identifier: credentialIdentifier,
    jurisdiction: jurisdictionRule.code,
    tier: tierId,
    listing_id: bookedListingId ?? listingIdForTier(tierId),
    weekly_rate_cents: split.grossCents,
    weekly_host_share_cents: split.hostShareCents,
    weekly_gmf_share_cents: split.gmfShareCents,
    weekly_platform_share_cents: split.platformShareCents,
    daily_rate_cents: dailyRateCents,
    stay_days: stayDays,
    total_billing_cycles: totalBillingCycles,
    check_in_date: checkInDate,
    valid_until: validUntil,
    status: "License_Active",
    db_status: "ACTIVE",
    webhook_status: "NOMINAL",
    coverage_ratio: coverageRatio,
    seam_access_code_id: `seam_key_${licenseToken.slice(-8).toLowerCase()}`,
    created_at: nowIso,
  };

  const ledgerEntry = buildLedgerEntryForLicense(licenseRecord);
  const ledgerInstallments = buildLedgerInstallmentsForLicense(licenseRecord);

  // Record in memory so runtime metrics reflect the stay immediately
  memoryLicenses.set(licenseRecord.agreement_id, licenseRecord);
  memoryLedger.set(ledgerEntry.ledger_id, ledgerEntry);

  let licensesPersistence: "supabase" | "memory_fallback" = "memory_fallback";
  let ledgerPersistence: "supabase" | "memory_fallback" = "memory_fallback";

  try {
    const supabase = getSupabaseServerClient();

    // 1. Insert new commercial license directly into public.active_commercial_licenses
    const { error: commLicError } = await supabase
      .from("active_commercial_licenses")
      .upsert(
        {
          id: licenseRecord.agreement_id,
          tenant_id: licenseRecord.tenant_id,
          property_id: licenseRecord.property_id,
          jurisdiction_code: licenseRecord.jurisdiction,
          stay_cohort: licenseRecord.cohort,
          crypto_token: licenseRecord.license_token,
          status: licenseRecord.db_status,
          webhook_status: licenseRecord.webhook_status,
          weekly_gross_cents: licenseRecord.weekly_rate_cents,
          weekly_host_share_cents: licenseRecord.weekly_host_share_cents,
          weekly_gmf_share_cents: licenseRecord.weekly_gmf_share_cents,
          weekly_platform_share_cents: licenseRecord.weekly_platform_share_cents,
          check_in_date: licenseRecord.check_in_date,
          check_out_date: licenseRecord.valid_until,
          total_billing_cycles: licenseRecord.total_billing_cycles,
          created_at: licenseRecord.created_at,
          updated_at: licenseRecord.created_at,
        },
        { onConflict: "id" },
      );

    if (!commLicError) {
      licensesPersistence = "supabase";
    }

    // 2. Initialize the weekly micro-deduction installments sequence in public.weekly_deduction_ledger
    const { error: ledgerError } = await supabase
      .from("weekly_deduction_ledger")
      .upsert(ledgerInstallments, { onConflict: "id" });

    if (!ledgerError) {
      ledgerPersistence = "supabase";
    }
  } catch {
    // Graceful fallback to in-memory ledger when Supabase env vars aren't wired
  }

  // 3. Mark the booked date range as reserved in public.host_tier_availability
  let reservedDates: string[] = [];
  let availabilityReserved = false;
  if (listingReservedDates) {
    // Real listing: its own calendar was already reserved above.
    reservedDates = listingReservedDates;
    availabilityReserved = true;
  } else {
    try {
      const reservation = await reserveStayDatesInAvailability({
        tierId: licenseRecord.tier,
        propertyId: licenseRecord.property_id,
        checkInDate: licenseRecord.check_in_date,
        stayDays: licenseRecord.stay_days,
        applicantEmail: licenseRecord.applicant,
        weeklyRateCents: licenseRecord.weekly_rate_cents,
        configuredDailyRateCents: licenseRecord.daily_rate_cents,
      });
      reservedDates = reservation.reservedDates;
      availabilityReserved = true;
    } catch {
      availabilityReserved = false;
    }
  }

  const milestone = await getValuationMilestoneSnapshot();

  return {
    ok: true,
    license: licenseRecord,
    ledgerEntry,
    ledgerInstallments,
    reservedDates,
    milestone,
    persistence: {
      activeCommercialLicenses: licensesPersistence,
      weeklyDeductionLedger: ledgerPersistence,
      availabilityReserved,
    },
  };
}

export async function getValuationMilestoneSnapshot(): Promise<ValuationMilestoneSnapshot> {
  let storageSource: ValuationMilestoneSnapshot["storageSource"] =
    "seeded_memory_ledger";
  let liveGmfPoolBalanceCents = DEFAULT_GMF_FLOAT_SEED_CENTS;

  try {
    const supabase = getSupabaseServerClient();

    // Hydrate live GMF pool balance if available
    const { data: poolRow, error: poolErr } = await supabase
      .from("gmf_float_balance")
      .select("*")
      .eq("pool_id", "primary_gmf_pool")
      .maybeSingle();

    if (!poolErr && poolRow && typeof poolRow === "object") {
      const r = poolRow as Record<string, unknown>;
      const rawAvail =
        typeof r.available_balance_cents === "number"
          ? r.available_balance_cents
          : typeof r.available_buffer_cents === "number"
            ? r.available_buffer_cents
            : DEFAULT_GMF_FLOAT_SEED_CENTS;
      if (Number.isFinite(rawAvail)) {
        liveGmfPoolBalanceCents = Math.trunc(rawAvail);
      }
    }

    // 1. Query public.active_commercial_licenses
    const { data: commRows, error: commErr } = await supabase
      .from("active_commercial_licenses")
      .select("*")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!commErr && Array.isArray(commRows)) {
      storageSource = "public.active_commercial_licenses";

      if (commRows.length === 0) {
        // Seed the 4 baseline licenses + their weekly deduction installments into Supabase once
        const seedRecords = Array.from(memoryLicenses.values());
        const dbSeeds = seedRecords.map((rec) => ({
          id: rec.agreement_id,
          tenant_id: rec.tenant_id,
          property_id: rec.property_id,
          jurisdiction_code: rec.jurisdiction,
          stay_cohort: rec.cohort,
          crypto_token: rec.license_token,
          status: rec.db_status,
          webhook_status: rec.webhook_status,
          weekly_gross_cents: rec.weekly_rate_cents,
          weekly_host_share_cents: rec.weekly_host_share_cents,
          weekly_gmf_share_cents: rec.weekly_gmf_share_cents,
          weekly_platform_share_cents: rec.weekly_platform_share_cents,
          check_in_date: rec.check_in_date,
          check_out_date: rec.valid_until,
          total_billing_cycles: rec.total_billing_cycles,
          created_at: rec.created_at,
          updated_at: rec.created_at,
        }));
        await supabase
          .from("active_commercial_licenses")
          .upsert(dbSeeds, { onConflict: "id" });

        const allSeedInstallments = seedRecords.flatMap((rec) =>
          buildLedgerInstallmentsForLicense(rec),
        );
        if (allSeedInstallments.length > 0) {
          await supabase
            .from("weekly_deduction_ledger")
            .upsert(allSeedInstallments, { onConflict: "id" });
        }
      } else {
        for (const rawRow of commRows as DbActiveCommercialLicenseRow[]) {
          if (rawRow && typeof rawRow === "object") {
            const mapped = mapDbLicenseRowToRecord(rawRow);
            if (mapped) {
              const normalized = normalizeHydratedLicenseFloor(mapped);
              memoryLicenses.set(normalized.agreement_id, normalized);
            }
          }
        }
      }
    }
  } catch {
    // Graceful fallback to memoryLicenses when Supabase env vars aren't wired
  }

  const allActive = Array.from(memoryLicenses.values()).filter(
    (item) => item.status === "License_Active",
  );

  const activeStaysCount = allActive.length;
  const progressPercentage = Math.min(
    100,
    divideIntegerCentsHalfUp(activeStaysCount * 100, VALUATION_TARGET_STAYS),
  );
  const remainingStaysToTarget = Math.max(
    0,
    VALUATION_TARGET_STAYS - activeStaysCount,
  );

  let cumulativeWeeklyGrossCents = 0;
  let cumulativeWeeklyHostPayoutCents = 0;
  let cumulativeWeeklyGmfVaultCents = 0;
  let cumulativeWeeklyPlatformFeeCents = 0;
  let rolling21DayGmfTimingFloatCents = 0;

  const cohortDistribution: Record<PurposeCohortId, number> = {
    "Contract-Assignment": 0,
    "Academic-Enrollment": 0,
    "Seasonal-Remote": 0,
    "Insurance-Relocation": 0,
  };

  const tierDistribution: Record<DailyRateTierId, number> = {
    RoomSanctuary: 0,
    PrivateSuite: 0,
    ExecutiveTownhome: 0,
  };

  for (const lic of allActive) {
    const split = allocateIntegerSplitCents(lic.weekly_rate_cents);
    const float21 = split.grossCents * 3;

    cumulativeWeeklyGrossCents += split.grossCents;
    cumulativeWeeklyHostPayoutCents += split.hostShareCents;
    cumulativeWeeklyGmfVaultCents += split.gmfShareCents;
    cumulativeWeeklyPlatformFeeCents += split.platformShareCents;
    rolling21DayGmfTimingFloatCents += float21;

    if (lic.cohort in cohortDistribution) {
      cohortDistribution[lic.cohort] += 1;
    }
    if (lic.tier in tierDistribution) {
      tierDistribution[lic.tier] += 1;
    }
  }

  const cumulativeMonthlyGrossCents = Number(
    (BigInt(cumulativeWeeklyGrossCents) * BigInt(4333) + BigInt(500)) / BigInt(1000),
  );
  const cumulativeAnnualizedGmvCents = cumulativeWeeklyGrossCents * 52;
  const combinedTreasuryFloatCents =
    liveGmfPoolBalanceCents + rolling21DayGmfTimingFloatCents;

  const targetValuationCents = 100000000 as const; // $1,000,000.00
  const estimatedPlatformValuationCents = Math.min(
    targetValuationCents,
    divideIntegerCentsHalfUp(
      activeStaysCount * targetValuationCents,
      VALUATION_TARGET_STAYS,
    ),
  );

  const recentLicenses = allActive.slice(-6).reverse();

  return {
    activeStaysCount,
    targetStaysCount: 45,
    progressPercentage,
    remainingStaysToTarget,
    cumulativeWeeklyGrossCents,
    cumulativeMonthlyGrossCents,
    cumulativeAnnualizedGmvCents,
    cumulativeWeeklyHostPayoutCents,
    cumulativeWeeklyGmfVaultCents,
    cumulativeWeeklyPlatformFeeCents,
    rolling21DayGmfTimingFloatCents,
    target45StayBaseTimingFloatCents: 4252500,
    liveGmfPoolBalanceCents,
    combinedTreasuryFloatCents,
    estimatedPlatformValuationCents,
    targetValuationCents,
    universalFloorPricing: {
      tierId: "RoomSanctuary",
      weeklyRateCents: 31500,
      grossDailyRateCents: 4500,
      dailyGmfVaultCreditCents: 644,
      netEffectiveDailyRateCents: 3856,
      weeklyHostPayoutCents: 23783,
      monthlyHostNetPayoutCents: 103058,
      savingsVs277NightlyPercent: 84,
      benchmark45Stays21DayTimingFloatCents: 4252500,
    },
    coBranding: "VettedRent.com · Powered by Vettilo™",
    cohortDistribution,
    tierDistribution,
    recentLicenses,
    storageSource,
  };
}
