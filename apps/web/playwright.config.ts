import { defineConfig } from "@playwright/test";

const convexBrowserMode =
  process.env.PLAYWRIGHT_CONVEX_SMOKE === "1" ||
  process.env.PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW === "1" ||
  process.env.PLAYWRIGHT_STAGING_FULL_SUITE === "1";
const playwrightPort = process.env.PLAYWRIGHT_PORT ?? "3100";
const playwrightBaseUrl = `http://localhost:${playwrightPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"]],
  // GitHub's first navigation can include a cold Next.js dev-route compile.
  // Keep the test ceiling strict while giving user-visible assertions enough
  // time to observe that first navigation instead of passing only on retry.
  expect: { timeout: 15_000 },
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
    command: `./node_modules/.bin/next dev --webpack -p ${playwrightPort}`,
    url: `${playwrightBaseUrl}/login`,
    // Browser tests exercise the seeded preview personas. Real local and
    // deployed sessions always go through Clerk before this chooser appears.
    env: {
      NEXT_DIST_DIR: ".next-playwright",
      NEXT_PUBLIC_RIVET_DEMO_AUTH: convexBrowserMode ? "0" : "1",
      NEXT_PUBLIC_DATA_MODE: convexBrowserMode ? "convex" : "mock",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
