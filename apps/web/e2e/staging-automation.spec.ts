import { expect, test } from "@playwright/test";
import { newRoleContext, requireStagingJourney } from "./staging-harness";

test.describe("staged automation", () => {
  test("owners and managers can inspect history while automation changes remain paused", async ({ browser, baseURL }) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    requireStagingJourney("automation", baseURL);
    for (const role of ["owner", "manager"] as const) {
      const context = await newRoleContext(browser, role, baseURL);
      try {
        const page = await context.newPage();
        await page.goto("/automations", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { level: 1, name: "Automations", exact: true })).toBeVisible();
        await expect(page.getByText("All automations are paused", { exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Recent runs", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /New rule|Create rule|Run now/ })).toHaveCount(0);
        await expect(page.getByRole("switch")).toHaveCount(0);
        await page.getByRole("link", { name: "View history", exact: true }).click();
        await expect(page).toHaveURL(/\/audit\?category=automations/);
        await expect(page.getByRole("heading", { level: 1, name: "Activity log" })).toBeVisible();
      } finally {
        await context.close();
      }
    }
  });
});
