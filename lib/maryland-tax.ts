import { divideIntegerCentsHalfUp } from "@/lib/marketing-calculator";

const MD_STATE_SALES_TAX_BPS = 600;
const DEFAULT_RURAL_OCCUPANCY_BPS = 500;

const COUNTY_OCCUPANCY_BPS: Record<string, number> = {
  "Baltimore City": 950,
  Montgomery: 700,
  "Prince George's": 700,
  "Baltimore County": 800,
  "Anne Arundel": 700,
  Frederick: 500,
  Howard: 700,
};

export type MarylandInvoiceSummary = {
  countyName: string;
  subtotalCents: number;
  stateSalesTaxCents: number;
  countyOccupancyTaxCents: number;
  taxCents: number;
  finalTotalCents: number;
  aleBillingAuthorized: boolean;
};

export function resolveMarylandCountyName(jurisdictionCode?: string | null): string {
  const code = (jurisdictionCode ?? "").trim().toUpperCase();
  if (code === "MD-PG") {
    return "Prince George's";
  }
  if (code === "MD-MO" || code.includes("MONTGOMERY")) {
    return "Montgomery";
  }
  if (code === "MD-BCITY" || code.includes("BALTIMORE CITY")) {
    return "Baltimore City";
  }
  if (code === "MD-BCO" || code.includes("BALTIMORE COUNTY")) {
    return "Baltimore County";
  }
  return "Prince George's";
}

export function calculateMarylandInvoice(args: {
  stayDurationDays: number;
  dailyRateCents: number;
  jurisdictionCode?: string | null;
  whoIsStaying?: string | null;
}): MarylandInvoiceSummary {
  const stayDurationDays = Math.max(0, Math.trunc(args.stayDurationDays || 0));
  const dailyRateCents = Math.max(0, Math.trunc(args.dailyRateCents || 0));
  const countyName = resolveMarylandCountyName(args.jurisdictionCode);
  const subtotalCents = dailyRateCents * stayDurationDays;

  let stateSalesTaxCents = 0;
  let countyOccupancyTaxCents = 0;

  if (stayDurationDays > 0 && stayDurationDays < 30) {
    const countyBps = COUNTY_OCCUPANCY_BPS[countyName] ?? DEFAULT_RURAL_OCCUPANCY_BPS;
    stateSalesTaxCents = divideIntegerCentsHalfUp(subtotalCents * MD_STATE_SALES_TAX_BPS, 10000);
    countyOccupancyTaxCents = divideIntegerCentsHalfUp(subtotalCents * countyBps, 10000);
  }

  const taxCents = stateSalesTaxCents + countyOccupancyTaxCents;
  const aleBillingAuthorized =
    stayDurationDays >= 30 &&
    (args.whoIsStaying === "Insurance-Relocation" ||
      args.whoIsStaying === "Family in Transition / Insurance (ALE)");

  return {
    countyName,
    subtotalCents,
    stateSalesTaxCents,
    countyOccupancyTaxCents,
    taxCents,
    finalTotalCents: subtotalCents + taxCents,
    aleBillingAuthorized,
  };
}
