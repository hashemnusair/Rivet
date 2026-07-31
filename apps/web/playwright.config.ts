import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  },
  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: "http://localhost:3100/login",
    // Browser tests exercise the seeded preview personas. Real local and
    // deployed sessions always go through Clerk before this chooser appears.
    env: {
      NEXT_DIST_DIR: ".next-playwright",
      NEXT_PUBLIC_RIVET_DEMO_AUTH: "1",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
