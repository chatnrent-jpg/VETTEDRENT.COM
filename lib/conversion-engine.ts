import { createHash, randomUUID } from "node:crypto";
import { addDaysIsoUtc, todayIsoUtc } from "@/lib/availability-calendar";
import {
  DEFAULT_JURISDICTION_CODE,
  JURISDICTION_RULES,
  resolveJurisdiction,
} from "@/lib/compliance/jurisdictions";
import {
  DAILY_RATE_PRESET_TIERS,
  type DailyRateTierId,
} from "@/lib/daily-rate-comparison";
import { reserveStayDatesInAvailability } from "@/lib/host-availability";
import {
  AVERAGE_TIMING_FLOAT_DAYS,
  BENCHMARK_45_STAYS,
  DEFAULT_GMF_FLOAT_SEED_CENTS,
  SPEC_3B_WEEKS_PER_MONTH_FACTOR,
} from "@/lib/liquidity-spread";
import {
  CALCULATOR_HOST_BPS,
  CALCULATOR_PLATFORM_BPS,
  CALCULATOR_VAULT_BPS,
} from "@/lib/marketing-calculator";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  SEASONAL_REMOTE_MIN_DAYS,
  resolvePurposeCohort,
  type PurposeCohortId,
} from "@/lib/underwriting-contract";

export const VALUATION_TARGET_STAYS = BENCHMARK_45_STAYS;
export const VALUATION_TARGET_DOLLARS = 1000000;

export type ActivateStayPayload = {
  applicant?: string;
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
  applicant: string;
  cohort: PurposeCohortId;
  credential_identifier: string;
  jurisdiction: string;
  tier: DailyRateTierId;
  listing_id: string;
  weekly_rate_cents: number;
  daily_rate_cents: number;
  stay_days: number;
  check_in_date: string;
  valid_until: string;
  status: "License_Active" | "License_Revoked";
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
  weekly_gross_cents: number;
  host_payout_cents: number;
  gmf_vault_cents: number;
  platform_fee_cents: number;
  rolling_21_day_float_cents: number;
  cycle_date: string;
  status: "settled";
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
  liveGmfPoolBalanceCents: number;
  combinedTreasuryFloatCents: number;
  estimatedPlatformValuationCents: number;
  targetValuationCents: 100000000;
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
  reservedDates: string[];
  milestone: ValuationMilestoneSnapshot;
  persistence: {
    activeCommercialLicenses: "supabase" | "memory_fallback";
    weeklyDeductionLedger: "supabase" | "memory_fallback";
    availabilityReserved: boolean;
  };
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const token = buildCryptographicLicenseToken({
      agreementId,
      applicant: seed.applicant,
      cohort: seed.cohort,
      jurisdiction: seed.jurisdiction,
      weeklyRateCents: tierPreset.weeklyRateCents,
      stayDays: seed.stayDays,
      checkInDate: checkIn,
      validUntil,
    });

    const record: ActiveCommercialLicenseRecord = {
      license_id: `VR-LIC-${seed.cohort.slice(0, 3).toUpperCase()}-${seed.jurisdiction}-SEED0${idx + 1}`,
      license_token: token,
      agreement_id: agreementId,
      applicant: seed.applicant,
      cohort: seed.cohort,
      credential_identifier: cohortRule.defaultIdentifier,
      jurisdiction: seed.jurisdiction,
      tier: seed.tier,
      listing_id: listingIdForTier(seed.tier),
      weekly_rate_cents: tierPreset.weeklyRateCents,
      daily_rate_cents: tierPreset.grossDailyRateCents,
      stay_days: seed.stayDays,
      check_in_date: checkIn,
      valid_until: validUntil,
      status: "License_Active",
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
): DailyRateTierId {
  if (
    tierInput === "RoomSanctuary" ||
    tierInput === "PrivateSuite" ||
    tierInput === "ExecutiveTownhome"
  ) {
    return tierInput;
  }
  const cents = Number(weeklyRateCentsInput);
  if (cents === 74500) {
    return "ExecutiveTownhome";
  }
  if (cents === 52500 || cents === 49000) {
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
  const gross = license.weekly_rate_cents;
  const host = Math.round((gross * CALCULATOR_HOST_BPS) / 10000);
  const vault = Math.round((gross * CALCULATOR_VAULT_BPS) / 10000);
  const platform = gross - host - vault;
  const float21 = Math.round((gross * AVERAGE_TIMING_FLOAT_DAYS) / 7);

  return {
    ledger_id: `wdl_${license.agreement_id.replace(/-/g, "").slice(0, 16)}`,
    agreement_id: license.agreement_id,
    license_token: license.license_token,
    applicant: license.applicant,
    cohort: license.cohort,
    tier: license.tier,
    weekly_gross_cents: gross,
    host_payout_cents: host,
    gmf_vault_cents: vault,
    platform_fee_cents: platform,
    rolling_21_day_float_cents: float21,
    cycle_date: license.check_in_date,
    status: "settled",
    created_at: license.created_at,
  };
}

/**
 * Automates the Underwriting → Active Commercial License → Weekly Deduction Ledger
 * → Host Availability Calendar reservation loop.
 */
export async function activateStayFromUnderwriting(
  payload: ActivateStayPayload = {},
): Promise<ActivateStayResult> {
  const cohortRule = resolvePurposeCohort(payload.cohort);
  const jurisdictionRule =
    resolveJurisdiction(payload.jurisdiction) ??
    resolveJurisdiction(DEFAULT_JURISDICTION_CODE) ??
    JURISDICTION_RULES[0];

  const tierId = resolveTierFromInput(payload.tier, payload.weeklyRateCents);
  const tierPreset = DAILY_RATE_PRESET_TIERS[tierId];

  const rawWeekly = Number(payload.weeklyRateCents);
  const weeklyRateCents =
    Number.isFinite(rawWeekly) && rawWeekly >= 5000 && rawWeekly <= 500000
      ? Math.round(rawWeekly)
      : tierPreset.weeklyRateCents;

  const minFloorDays =
    cohortRule.id === "Seasonal-Remote" ? SEASONAL_REMOTE_MIN_DAYS : 7;
  const rawStayDays = Number(payload.stayDays);
  const stayDays =
    Number.isFinite(rawStayDays) && rawStayDays >= 7 && rawStayDays <= 90
      ? Math.max(minFloorDays, Math.round(rawStayDays))
      : Math.min(90, Math.max(minFloorDays, cohortRule.defaultStayDays));

  const checkInDate =
    typeof payload.checkInDate === "string" &&
    ISO_DATE_RE.test(payload.checkInDate.trim())
      ? payload.checkInDate.trim()
      : todayIsoUtc();

  const validUntil = addDaysIsoUtc(checkInDate, stayDays);

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
  const licenseToken = buildCryptographicLicenseToken({
    agreementId,
    applicant,
    cohort: cohortRule.id,
    jurisdiction: jurisdictionRule.code,
    weeklyRateCents,
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
    applicant,
    cohort: cohortRule.id,
    credential_identifier: credentialIdentifier,
    jurisdiction: jurisdictionRule.code,
    tier: tierId,
    listing_id: listingIdForTier(tierId),
    weekly_rate_cents: weeklyRateCents,
    daily_rate_cents: Math.round(weeklyRateCents / 7),
    stay_days: stayDays,
    check_in_date: checkInDate,
    valid_until: validUntil,
    status: "License_Active",
    coverage_ratio: coverageRatio,
    seam_access_code_id: `seam_key_${licenseToken.slice(-8).toLowerCase()}`,
    created_at: nowIso,
  };

  const ledgerEntry = buildLedgerEntryForLicense(licenseRecord);

  // Always record in memory so live runtime metrics immediately reflect the new stay
  memoryLicenses.set(licenseRecord.agreement_id, licenseRecord);
  memoryLedger.set(ledgerEntry.ledger_id, ledgerEntry);

  let licensesPersistence: "supabase" | "memory_fallback" = "memory_fallback";
  let ledgerPersistence: "supabase" | "memory_fallback" = "memory_fallback";

  try {
    const supabase = getSupabaseServerClient();

    // 1. Attempt upsert into public.active_commercial_licenses
    const { error: commLicError } = await supabase
      .from("active_commercial_licenses")
      .upsert(
        {
          license_id: licenseRecord.license_id,
          license_token: licenseRecord.license_token,
          agreement_id: licenseRecord.agreement_id,
          applicant: licenseRecord.applicant,
          cohort: licenseRecord.cohort,
          credential_identifier: licenseRecord.credential_identifier,
          jurisdiction: licenseRecord.jurisdiction,
          tier: licenseRecord.tier,
          listing_id: licenseRecord.listing_id,
          weekly_rate_cents: licenseRecord.weekly_rate_cents,
          daily_rate_cents: licenseRecord.daily_rate_cents,
          stay_days: licenseRecord.stay_days,
          check_in_date: licenseRecord.check_in_date,
          valid_until: licenseRecord.valid_until,
          status: licenseRecord.status,
          coverage_ratio: licenseRecord.coverage_ratio,
          seam_access_code_id: licenseRecord.seam_access_code_id,
          created_at: licenseRecord.created_at,
        },
        { onConflict: "license_id" },
      );

    if (!commLicError) {
      licensesPersistence = "supabase";
    } else {
      // Also mirror into public.active_licenses if present
      const { error: activeLicError } = await supabase
        .from("active_licenses")
        .upsert(
          {
            license_id: licenseRecord.license_id,
            agreement_id: licenseRecord.agreement_id,
            tenant_id: licenseRecord.applicant,
            host_id: "host_vettedrent_shield",
            payroll_item_id: `payroll_${licenseRecord.credential_identifier}`,
            status: "Active",
            weekly_rate_cents: licenseRecord.weekly_rate_cents,
            backstop_cap_cents: 30000,
            seam_access_code_id: licenseRecord.seam_access_code_id,
          },
          { onConflict: "license_id" },
        );
      if (!activeLicError) {
        licensesPersistence = "supabase";
      }
    }

    // 2. Attempt upsert into public.weekly_deduction_ledger
    const { error: ledgerError } = await supabase
      .from("weekly_deduction_ledger")
      .upsert(
        {
          ledger_id: ledgerEntry.ledger_id,
          agreement_id: ledgerEntry.agreement_id,
          license_token: ledgerEntry.license_token,
          applicant: ledgerEntry.applicant,
          cohort: ledgerEntry.cohort,
          tier: ledgerEntry.tier,
          weekly_gross_cents: ledgerEntry.weekly_gross_cents,
          host_payout_cents: ledgerEntry.host_payout_cents,
          gmf_vault_cents: ledgerEntry.gmf_vault_cents,
          platform_fee_cents: ledgerEntry.platform_fee_cents,
          rolling_21_day_float_cents: ledgerEntry.rolling_21_day_float_cents,
          cycle_date: ledgerEntry.cycle_date,
          status: ledgerEntry.status,
          created_at: ledgerEntry.created_at,
        },
        { onConflict: "ledger_id" },
      );

    if (!ledgerError) {
      ledgerPersistence = "supabase";
    }

    // 3. Log conversion event in public.marketing_leads for cross-instance hydration
    await supabase.from("marketing_leads").insert({
      role: "lodger",
      cohort: licenseRecord.cohort,
      email: licenseRecord.applicant,
      jurisdiction_code: licenseRecord.jurisdiction,
      weekly_rate_cents: licenseRecord.weekly_rate_cents,
      intended_stay_days: licenseRecord.stay_days,
      utm_source: "conversion_engine",
      utm_medium: "underwriting_activation",
      utm_campaign: "active_stay_conversion",
      notes: JSON.stringify(licenseRecord),
    });
  } catch {
    // Graceful fallback to in-memory ledger when Supabase env vars aren't wired
  }

  // 4. Mark the booked date range as reserved in the availability state
  let reservedDates: string[] = [];
  let availabilityReserved = false;
  try {
    const reservation = await reserveStayDatesInAvailability({
      tierId: licenseRecord.tier,
      checkInDate: licenseRecord.check_in_date,
      stayDays: licenseRecord.stay_days,
      applicantEmail: licenseRecord.applicant,
    });
    reservedDates = reservation.reservedDates;
    availabilityReserved = true;
  } catch {
    availabilityReserved = false;
  }

  const milestone = await getValuationMilestoneSnapshot();

  return {
    ok: true,
    license: licenseRecord,
    ledgerEntry,
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
        liveGmfPoolBalanceCents = Math.round(rawAvail);
      }
    }

    // 1. Check public.active_commercial_licenses
    const { data: commRows, error: commErr } = await supabase
      .from("active_commercial_licenses")
      .select("*")
      .eq("status", "License_Active")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!commErr && Array.isArray(commRows) && commRows.length > 0) {
      storageSource = "public.active_commercial_licenses";
      for (const row of commRows) {
        if (row && typeof row === "object") {
          const rec = row as ActiveCommercialLicenseRecord;
          if (typeof rec.agreement_id === "string") {
            memoryLicenses.set(rec.agreement_id, rec);
          }
        }
      }
    } else {
      // 2. Also hydrate any conversion records logged via marketing_leads
      const { data: leadRows, error: leadErr } = await supabase
        .from("marketing_leads")
        .select("notes")
        .eq("utm_campaign", "active_stay_conversion")
        .order("created_at", { ascending: false })
        .limit(60);

      if (!leadErr && Array.isArray(leadRows)) {
        for (const row of leadRows) {
          const notes =
            row && typeof row === "object"
              ? (row as { notes?: unknown }).notes
              : null;
          if (typeof notes === "string" && notes.startsWith("{")) {
            try {
              const parsed = JSON.parse(notes) as ActiveCommercialLicenseRecord;
              if (
                parsed &&
                typeof parsed.agreement_id === "string" &&
                typeof parsed.license_token === "string"
              ) {
                memoryLicenses.set(parsed.agreement_id, parsed);
              }
            } catch {
              // Ignore non-JSON notes
            }
          }
        }
      }

      // 3. Check public.agreements for active stays
      const { data: agrRows, error: agrErr } = await supabase
        .from("agreements")
        .select("id, status")
        .eq("status", "active")
        .limit(50);

      if (!agrErr && Array.isArray(agrRows) && agrRows.length > 0) {
        storageSource = "public.active_licenses";
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
    Math.round((activeStaysCount / VALUATION_TARGET_STAYS) * 100),
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
    const gross = lic.weekly_rate_cents;
    const host = Math.round((gross * CALCULATOR_HOST_BPS) / 10000);
    const vault = Math.round((gross * CALCULATOR_VAULT_BPS) / 10000);
    const platform = gross - host - vault;
    const float21 = Math.round((gross * AVERAGE_TIMING_FLOAT_DAYS) / 7);

    cumulativeWeeklyGrossCents += gross;
    cumulativeWeeklyHostPayoutCents += host;
    cumulativeWeeklyGmfVaultCents += vault;
    cumulativeWeeklyPlatformFeeCents += platform;
    rolling21DayGmfTimingFloatCents += float21;

    if (lic.cohort in cohortDistribution) {
      cohortDistribution[lic.cohort] += 1;
    }
    if (lic.tier in tierDistribution) {
      tierDistribution[lic.tier] += 1;
    }
  }

  const cumulativeMonthlyGrossCents = Math.round(
    cumulativeWeeklyGrossCents * SPEC_3B_WEEKS_PER_MONTH_FACTOR,
  );
  const cumulativeAnnualizedGmvCents = cumulativeWeeklyGrossCents * 52;
  const combinedTreasuryFloatCents =
    liveGmfPoolBalanceCents + rolling21DayGmfTimingFloatCents;

  const targetValuationCents = 100000000 as const; // $1,000,000.00
  const estimatedPlatformValuationCents = Math.min(
    targetValuationCents,
    Math.round((activeStaysCount / VALUATION_TARGET_STAYS) * targetValuationCents),
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
    liveGmfPoolBalanceCents,
    combinedTreasuryFloatCents,
    estimatedPlatformValuationCents,
    targetValuationCents,
    cohortDistribution,
    tierDistribution,
    recentLicenses,
    storageSource,
  };
}
