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
    // A sign-in door may be prepared from another RIVET host (the chooser on
    // www prerenders the gym or member door while the pointer rests on it).
    // Same-site hosts need this opt-in; the page itself is the same one.
    const preparable = [{ key: "Supports-Loading-Mode", value: "credentialed-prerender" }];
    return [
      { source: "/(.*)", headers: buildSecurityHeaders({ production: process.env.NODE_ENV === "production" }) },
      { source: "/login", headers: preparable },
      { source: "/login/:path*", headers: preparable },
    ];
  },
  // Pin the trace root to the pnpm workspace. Without this, Next walks up and
  // may pick an unrelated lockfile in a parent directory, which it warns about.
  outputFileTracingRoot: join(__dirname, "../.."),
  webpack(config, { dev, isServer, webpack }) {
    // A production bundle selects seeded mock data only when it was built
    // with NEXT_PUBLIC_DATA_MODE=mock (see dataMode()). Every other production
    // browser bundle gets a fail-closed stub instead of the seeded database.
    if (!dev && !isServer && process.env.NEXT_PUBLIC_DATA_MODE !== "mock") {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /[\\/]src[\\/]lib[\\/]mock[\\/]MockGymOSApi\.ts$/,
        join(__dirname, "src/lib/mock/MockGymOSApi.unavailable.ts"),
      ));
    }
    // Browser bundles (dev and production) leave Arabic out of the startup
    // code. Arabic readers get it from the root layout's <ArabicCatalogue />,
    // and the language switch loads it on demand (src/lib/i18n/core.ts).
    // Server, Convex and Vitest keep both catalogues for emails and PDFs.
    if (!isServer) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(
        /[\\/]src[\\/]lib[\\/]i18n[\\/]arabic-catalogue\.ts$/,
        join(__dirname, "src/lib/i18n/arabic-catalogue.browser.ts"),
      ));
    }
    return config;
  },
  // `dev:turbo` keeps working beside the webpack hook above; the stubs only
  // matter for webpack bundles (production is always built with --webpack),
  // so Turbopack's dev bundles still carry both catalogues.
  turbopack: {},
};

export default nextConfig;
