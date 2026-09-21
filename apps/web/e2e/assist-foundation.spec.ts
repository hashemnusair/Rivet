import { expect, test } from "@playwright/test";

/**
 * The Jev foundation in the preview: an owner turns suggestions on for the
 * gym, runs the synthetic check, and sees the shared suggestion card answer
 * from the built-in fixture. No external call is made in the preview.
 */
test.describe("Jev assistance foundation", () => {
  test("owner enables suggestions and runs the synthetic check", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings?section=assist");
    await expect(page.getByRole("heading", { name: "Jev assistance", level: 2 })).toBeVisible();
    await expect(page.getByTestId("assist-mode")).toContainText("Preview answers");
    await expect(page.getByTestId("assist-blocked")).toContainText("switched off for this gym");

    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    await page.getByRole("button", { name: "Run check" }).click();
    const card = page.getByTestId("assist-check");
    await expect(card).toContainText("Jev suggestion");
    await expect(card).toContainText("Preview answer");
    await expect(card).toContainText("Likely yes (97%)");

    await page.getByRole("combobox", { name: "Simulated outcome" }).click();
    await page.getByRole("option", { name: "Simulate a provider error" }).click();
    await page.getByRole("button", { name: "Run check" }).click();
    await expect(page.getByTestId("assist-check-unavailable")).toContainText("Continue as usual");
  });
});

test.describe("intent-aware workspace search", () => {
  test("owner asks where to go and opens the suggested setting", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    // Stay inside the running app so the saved switch survives.
    await page.getByRole("button", { name: "Search members, leads and pages" }).click();
    const search = page.getByRole("combobox", { name: "Global search" });
    await search.fill("Where do I change who can refund?");
    await page.getByText(/Ask where to go for/).click();
    await page.getByText("Open Settings: Roles & permissions").click();
    await expect(page).toHaveURL(/\/settings\?section=roles$/);
    await expect(page.getByRole("heading", { name: "Roles & permissions", level: 2 })).toBeVisible();
  });
});
