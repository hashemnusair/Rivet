import { expect, test } from "@playwright/test";

test.describe("trusted Clerk → Convex smoke", () => {
  test("opens an authenticated tenant session and reads persisted workspace data", async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1", "Set PLAYWRIGHT_CONVEX_SMOKE=1 with trusted Clerk storage state.");

    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/members|revenue|check-ins/i).first()).toBeVisible();
  });
});
