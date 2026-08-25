import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildSecurityHeaders } from "./src/lib/security/security-headers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright uses its own build directory so Next 16 can run the browser-test
  // server beside a developer's existing `next dev` process.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Clerk's request proxy requires a Next.js server runtime. Keep images
  // unoptimized for now so the approved brand assets render identically.
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  // Bake the hosting deployment class into the client bundle. The runtime
  // data-mode guard may allow seeded mock data only for an explicitly marked
  // Vercel Preview; Production always resolves to Convex, even if NODE_ENV is
  // accidentally reported as development by a hosting wrapper.
  env: {
    NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: process.env.VERCEL_ENV === "preview"
      ? "preview"
      : process.env.VERCEL_ENV === "production"
        ? "production"
        : process.env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS,
  },
  async headers() {
    return [{ source: "/(.*)", headers: buildSecurityHeaders({ production: process.env.NODE_ENV === "production" }) }];
  },
  // Pin the trace root to the pnpm workspace. Without this, Next walks up and
  // may pick an unrelated lockfile in a parent directory, which it warns about.
  outputFileTracingRoot: join(__dirname, "../.."),
};

export default nextConfig;
