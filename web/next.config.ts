import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard reads D1 per request (see app/page.tsx `force-dynamic`),
  // so there is nothing to statically pre-render at build time.
  reactStrictMode: true,
};

export default nextConfig;

// Enables getCloudflareContext() — and therefore the `DB` D1 binding — while
// running `next dev` locally. No-op for the production OpenNext build.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
