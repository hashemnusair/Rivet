import { expect, test } from "@playwright/test";

test.describe("trusted Clerk → Convex smoke", () => {
  test("opens an authenticated tenant session and reads persisted workspace data", async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1", "Set PLAYWRIGHT_CONVEX_SMOKE=1 with trusted Clerk storage state.");

    // Clerk can keep a background refresh request open in development, so the
    // smoke test should wait for the document rather than the network to idle.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/i })).toBeVisible();
    await expect(page.getByText("Both branches, consolidated.")).toBeVisible();
    await expect(page.getByText(/^Forge .* Abdoun$/)).toBeVisible();
  });
});
