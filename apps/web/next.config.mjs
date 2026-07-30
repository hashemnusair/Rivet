import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static output: the app is client-rendered against an in-browser mock,
  // so there is no server work to do. Deploys to any static host (e.g. Cloudflare
  // Pages connected to GitHub) with no adapter, CLI, or runtime.
  output: "export",
  // next/image optimisation needs a server; serve the brand PNGs as-is.
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the trace root to the pnpm workspace. Without this, Next walks up and
  // may pick an unrelated lockfile in a parent directory, which it warns about.
  outputFileTracingRoot: join(__dirname, "../.."),
};

export default nextConfig;
