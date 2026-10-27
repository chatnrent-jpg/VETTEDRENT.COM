import { PlaidLinkScreen } from "@/components/PlaidLinkScreen";
import { loadPublishedListings } from "@/lib/public-listings";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function UnderwritingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const listingId = first(params, "listing")?.trim() || undefined;

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
    <PlaidLinkScreen
      liveListing={liveListing}
      listingRequested={Boolean(listingId)}
      catalogIsLive={published.length > 0}
    />
  );
}
