import { expect, test } from "@playwright/test";

test.describe("trusted Clerk → Convex smoke", () => {
  test("opens an authenticated tenant session and reads persisted workspace data", async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1", "Set PLAYWRIGHT_CONVEX_SMOKE=1 with trusted Clerk storage state.");

    // Clerk can keep a background refresh request open in development, so the
    // smoke test should wait for the document rather than the network to idle.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/i })).toBeVisible();

    // These values are the authenticated tenant's live dashboard projection,
    // not fixed seed copy. Waiting for the KPI cells to resolve proves the
    // Clerk-authenticated Convex query returned a durable operational snapshot.
    const keyNumbers = page.getByLabel("Key numbers");
    await expect(keyNumbers).toBeVisible();
    await expect(keyNumbers.getByText("Collected today", { exact: true })).toBeVisible();
    await expect(keyNumbers.getByText("New members", { exact: true })).toBeVisible();
    await expect(keyNumbers.locator(".animate-pulse")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Sales this month" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(page.getByText("Both branches, consolidated.")).toHaveCount(0);
  });
});
