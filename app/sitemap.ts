import type { MetadataRoute } from "next";
import { JURISDICTION_RULES } from "@/lib/compliance/jurisdictions";
import { MARYLAND_SEO_REGISTRY } from "@/lib/seo-registry";

const BASE_URL = "https://vettedrent.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const coreRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/underwriting`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const marylandCountyRoutes: MetadataRoute.Sitemap = Object.keys(
    MARYLAND_SEO_REGISTRY,
  ).map((key) => {
    const county = MARYLAND_SEO_REGISTRY[key];
    const stateSlug = (county?.stateCode ?? "MD").toLowerCase();
    const countySlug = county?.slug ?? key;
    return {
      url: `${BASE_URL}/jurisdictions/${stateSlug}/${countySlug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    };
  });

  const jurisdictionStatutoryRoutes: MetadataRoute.Sitemap =
    JURISDICTION_RULES.map((rule) => ({
      url: `${BASE_URL}/jurisdictions/${rule.code}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  return [
    ...coreRoutes,
    ...marylandCountyRoutes,
    ...jurisdictionStatutoryRoutes,
  ];
}
