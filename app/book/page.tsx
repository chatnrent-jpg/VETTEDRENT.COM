import type { Metadata } from "next";
import { BookStay } from "@/components/book-stay";

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
  return (
    <BookStay
      initial={{
        tier: first(params, "tier"),
        listing: first(params, "listing"),
        weeklyCents: first(params, "weeklyCents"),
        days: first(params, "days"),
        checkIn: first(params, "checkIn"),
        cohort: first(params, "cohort"),
        jurisdiction: first(params, "jurisdiction"),
      }}
    />
  );
}
