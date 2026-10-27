import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const SITE_DESCRIPTION =
  "Furnished rooms, suites, and townhomes across Maryland with $0 security deposit and no credit check. Stays from $45/day for professionals, students, and families.";

export const metadata: Metadata = {
  metadataBase: new URL("https://vettedrent.com"),
  title: "VettedRent · Furnished Stays in Maryland · $0 Deposit",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "VettedRent",
    title: "VettedRent · Furnished Stays in Maryland · $0 Deposit",
    description: SITE_DESCRIPTION,
    images: [{ url: "/vettedrent-hero-renter.jpg", alt: "VettedRent furnished stay" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VettedRent · Furnished Stays in Maryland · $0 Deposit",
    description: SITE_DESCRIPTION,
    images: ["/vettedrent-hero-renter.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
