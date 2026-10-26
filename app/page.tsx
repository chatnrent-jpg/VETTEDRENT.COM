import { DualBrandHome } from "@/components/dual-brand-home";
import { defaultGeoStatusLabel } from "@/lib/geo-compliance";
import { getFeaturedStay } from "@/lib/host-listing";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FALLBACK_STAY = {
  name: "VettedRent Featured Sanctuary",
  weeklyPriceCents: 31500,
  geoCompliance: defaultGeoStatusLabel(),
};

/**
 * Clean Airbnb/Hotwire-style consumer booking viewport:
 * - Minimalist destination selector: "Where are you traveling?"
 * - Straightforward Check-In / Check-Out date range picker
 * - Single premium tier selector with visual cards:
 *   - RoomSanctuary ($45/day)
 *   - PrivateSuite ($75/day)
 *   - ExecutiveTownhome ($106/day)
 * - Consumer value copy: "$0 Security Deposit", "No Credit Check", "Instant Bank Link Setup"
 */
export default async function HomePage() {
  const stay = await loadFeaturedStay();
  const weeklyRate = formatCents(stay.weeklyPriceCents);

  return <DualBrandHome stay={stay} weeklyRate={weeklyRate} />;
}

async function loadFeaturedStay(): Promise<{
  name: string;
  weeklyPriceCents: number;
  geoCompliance: string;
}> {
  try {
    return await getFeaturedStay(getSupabaseServerClient());
  } catch {
    return FALLBACK_STAY;
  }
}

function formatCents(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const remainder = Math.abs(cents) % 100;
  return `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}
