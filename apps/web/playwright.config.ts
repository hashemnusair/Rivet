import { defineConfig } from "@playwright/test";

const convexBrowserMode =
  process.env.PLAYWRIGHT_CONVEX_SMOKE === "1" ||
  process.env.PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW === "1" ||
  process.env.PLAYWRIGHT_STAGING_FULL_SUITE === "1";
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "3100";
const playwrightBaseUrl = `http://localhost:${playwrightPort}`;
// "start" serves a bundle already built with `next build` into
// PLAYWRIGHT_DIST_DIR (as an approved mock preview), so no route is compiled
// on demand during the run. The default keeps the dev server for local work.
const serveBuiltBundle = process.env.PLAYWRIGHT_SERVER_MODE === "start";
const distDir = process.env.PLAYWRIGHT_DIST_DIR ?? ".next-playwright";

export default defineConfig({
  testDir: "./e2e",
  // The design gallery lives under /dev and is a dev-server route; a built
  // bundle has no such page, so its capture specs run in the dev-mode job.
  testIgnore: serveBuiltBundle ? [/design-system-.*\.spec\.ts$/, /workflow-pass-1-visual\.spec\.ts$/] : [],
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  // GitHub's first navigation can include a cold Next.js dev-route compile.
  // Keep the test ceiling strict while giving user-visible assertions enough
  // time to observe that first navigation instead of passing only on retry.
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.015 } },
  use: {
    baseURL: playwrightBaseUrl,
    storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE || undefined,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  },
  webServer: {
    // Use the lockfile-installed binary directly. This keeps browser tests
    // hermetic when Corepack has a newer pnpm available than the workspace
    // node_modules metadata and avoids an unnecessary registry lookup.
    command: serveBuiltBundle ? `./node_modules/.bin/next start -p ${playwrightPort}` : `./node_modules/.bin/next dev --webpack -p ${playwrightPort}`,
    url: `${playwrightBaseUrl}/login`,
    // Browser tests exercise the seeded preview personas. Real local and
    // deployed sessions always go through Clerk before this chooser appears.
    env: {
      NEXT_DIST_DIR: distDir,
      NEXT_PUBLIC_RIVET_DEMO_AUTH: convexBrowserMode ? "0" : "1",
      NEXT_PUBLIC_DATA_MODE: convexBrowserMode ? "convex" : "mock",
      // A built bundle refuses mock data unless it was built as an approved
      // preview; the same marker must be present when it is served.
      ...(serveBuiltBundle && !convexBrowserMode ? { NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview" } : {}),
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
