import { expect, test } from "@playwright/test";

test.describe("gym-space setup", () => {
  test("explains the concept and lets an owner add a recognizable place", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Open .+ workspace/i }).click();
    await page.goto("/settings?section=spaces");

    await expect(page.getByRole("heading", { name: "Gym spaces" })).toBeVisible();
    await expect(page.getByText(/places inside a branch/i)).toBeVisible();
    await page.getByRole("button", { name: "Add gym space" }).click();

    const dialog = page.getByRole("dialog", { name: "Add gym space" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Ladies studio");
    await dialog.getByRole("combobox", { name: "Gym space type" }).click();
    await page.getByRole("option", { name: "Studio", exact: true }).click();
    await dialog.getByRole("button", { name: "Add gym space" }).click();

    await expect(page.getByRole("cell", { name: "Ladies studio", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Studio", exact: true })).toBeVisible();
  });
});
