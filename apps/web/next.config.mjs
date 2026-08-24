import { dirname, join } from "path";
import { fileURLToPath } from "url";
/*
 * TEMPORARILY DISABLED: General Translation is paused while the Vercel
 * deployment path is stabilized. Keep this integration code commented rather
 * than deleting it so the compiler can be re-enabled once GT credentials and
 * the translation release workflow are ready.
 *
 * import { createRequire } from "module";
 * const require = createRequire(import.meta.url);
 * const { withGTConfig } = require("gt-next/config");
 */

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

// TEMPORARILY DISABLED: preserve the GT compiler configuration for later.
// /** @type {import('gt-next/config').withGTConfigProps} */
// const gtConfig = {
//   experimentalCompilerOptions: {
//     type: "babel",
//     enableAutoJsxInjection: true,
//   },
// };
//
// if (process.env.NEXT_DIST_DIR === ".next-playwright") {
//   gtConfig.runtimeUrl = null;
// }
//
// export default withGTConfig(nextConfig, gtConfig);

// TEMPORARY GT PAUSE: use the plain Next config so Vercel needs no GT values.
export default nextConfig;
