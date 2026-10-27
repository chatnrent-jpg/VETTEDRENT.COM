import type { Metadata } from "next";
import { BookStay } from "@/components/book-stay";
import { loadPublishedListings } from "@/lib/public-listings";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book your stay · VettedRent",
  description: "Choose your dates, sign your license, and activate your Stay Passport.",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const listingId = first(params, "listing");

  // Published listings are the source of truth for tier and price; the URL is not trusted.
  let published: Awaited<ReturnType<typeof loadPublishedListings>> = [];
  try {
    published = await loadPublishedListings(getSupabaseServerClient());
  } catch {
    published = [];
  }
  const liveListing = listingId
    ? (published.find((card) => card.id === listingId) ?? null)
    : null;

  return (
    <BookStay
      liveListing={liveListing}
      catalogIsLive={published.length > 0}
      initial={{
        tier: first(params, "tier"),
        listing: listingId,
        weeklyCents: first(params, "weeklyCents"),
        days: first(params, "days"),
        checkIn: first(params, "checkIn"),
        cohort: first(params, "cohort"),
        jurisdiction: first(params, "jurisdiction"),
      }}
    />
  );
}
