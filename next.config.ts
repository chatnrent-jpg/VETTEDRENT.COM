import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Streamlit multipage modules live in /pages as Python.
  // Next only treats these extensions as routes.
  pageExtensions: ["ts", "tsx"],
};

export default nextConfig;
