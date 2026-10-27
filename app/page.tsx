import type { Metadata } from "next";
import { DualBrandHome } from "@/components/dual-brand-home";
import { defaultGeoStatusLabel } from "@/lib/geo-compliance";
import { getFeaturedStay } from "@/lib/host-listing";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const FALLBACK_STAY = {
  name: "VettedRent Featured Sanctuary",
  weeklyPriceCents: 31500,
  geoCompliance: defaultGeoStatusLabel(),
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://vettedrent.com/#organization",
      name: "VettedRent",
      url: "https://vettedrent.com",
      logo: "https://vettedrent.com/vettedrent-logo-mark.jpg",
      slogan: "Be Great to Yourself.",
      areaServed: { "@type": "State", name: "Maryland" },
    },
    {
      "@type": "WebSite",
      "@id": "https://vettedrent.com/#website",
      url: "https://vettedrent.com",
      name: "VettedRent",
      publisher: { "@id": "https://vettedrent.com/#organization" },
    },
  ],
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [stay, params] = await Promise.all([loadFeaturedStay(), searchParams]);
  const weeklyRate = formatCents(stay.weeklyPriceCents);
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const initialQuery = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 80) : "";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
      />
      <DualBrandHome stay={stay} weeklyRate={weeklyRate} initialQuery={initialQuery} />
    </>
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
