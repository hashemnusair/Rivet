import { dirname, join } from "path";
import { fileURLToPath } from "url";

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
  // Pin the trace root to the pnpm workspace. Without this, Next walks up and
  // may pick an unrelated lockfile in a parent directory, which it warns about.
  outputFileTracingRoot: join(__dirname, "../.."),
};

export default nextConfig;
