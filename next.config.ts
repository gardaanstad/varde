import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.NEXT_TEST_DIST_DIR || ".next",
  // Test builds skip type checking; `bun run typecheck` covers it.
  typescript: { ignoreBuildErrors: Boolean(process.env.NEXT_TEST_DIST_DIR) },
};

export default nextConfig;
