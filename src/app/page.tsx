import { DualBrandHome } from "@/components/dual-brand-home";
import { ListingDiscoveryGrid } from "../components/ListingGrid";
import { defaultGeoStatusLabel } from "@/lib/geo-compliance";
import { getFeaturedStay } from "@/lib/host-listing";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FALLBACK_STAY = {
  name: "VettedRent Featured Sanctuary",
  weeklyPriceCents: 31500,
  geoCompliance: defaultGeoStatusLabel(),
};

export default async function HomePage() {
  const stay = await loadFeaturedStay();
  const weeklyRate = formatCents(stay.weeklyPriceCents);

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100">
      <DualBrandHome stay={stay} weeklyRate={weeklyRate} />
      <ListingDiscoveryGrid />
    </div>
  );
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
