import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/book", "/admin", "/dashboard", "/host/scanner"],
      },
    ],
    sitemap: "https://vettedrent.com/sitemap.xml",
    host: "https://vettedrent.com",
  };
}
