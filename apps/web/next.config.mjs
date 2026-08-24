import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// gt-next's ESM config entry currently resolves its package-version helper via
// CommonJS `require`. Loading that entry through Node's standard bridge keeps
// this existing ESM Next config compatible with the published package.
const require = createRequire(import.meta.url);
const { withGTConfig } = require("gt-next/config");

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

// Keep GT configuration at the app root (`gt.config.json`). The plugin reads
// GT_PROJECT_ID and GT_API_KEY from the server environment; neither is
// embedded in this file or exposed to browser code. Browser tests still run
// the Babel auto-injection compiler, but disable remote translation calls so
// the deterministic mock suite does not require live GT credentials.
/** @type {import('gt-next/config').withGTConfigProps} */
const gtConfig = {
  // GT auto-wraps translatable JSX at build time through its webpack compiler.
  // Next 16's default Turbopack path intentionally skips this experimental
  // compiler, so production builds use the explicit webpack script below.
  experimentalCompilerOptions: {
    type: "babel",
    enableAutoJsxInjection: true,
  },
};

if (process.env.NEXT_DIST_DIR === ".next-playwright") {
  gtConfig.runtimeUrl = null;
}

export default withGTConfig(nextConfig, gtConfig);
