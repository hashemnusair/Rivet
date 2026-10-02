import { expect, test } from "@playwright/test";

test.describe("gym-area setup", () => {
  test("explains the concept and lets an owner add a recognizable place", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Sign in as .+/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/settings?section=spaces");

    await expect(page.getByRole("heading", { name: "Gym areas" })).toBeVisible();
    await expect(page.getByText(/places inside a branch/i)).toBeVisible();
    await page.getByRole("button", { name: "Add gym area" }).click();

    const dialog = page.getByRole("dialog", { name: "Add gym area" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Ladies studio");
    await dialog.getByRole("combobox", { name: "Gym area type" }).click();
    await page.getByRole("option", { name: "Studio", exact: true }).click();
    await dialog.getByRole("button", { name: "Add gym area" }).click();

    await expect(page.getByRole("cell", { name: "Ladies studio", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Studio", exact: true })).toBeVisible();
  });
});
