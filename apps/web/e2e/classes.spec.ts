import { expect, test, type Page } from "@playwright/test";

async function enterStaff(page: Page, role: "owner" | "receptionist") {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: role === "owner" ? /Owner Omar Al-Khatib/i : /Reception Hala Qasem/i }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("class calendar roles", () => {
  test("lets reception manage attendance without exposing schedule controls", async ({ page }) => {
    await enterStaff(page, "receptionist");
    await page.goto("/classes");

    await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New class" })).toHaveCount(0);
    await page.getByRole("button", { name: /Morning HIIT/ }).click();
    await expect(page.getByText("Who is in")).toBeVisible();
    await expect(page.getByLabel("Add member")).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeEnabled();
    await expect(page.getByRole("button", { name: "Edit class" })).toHaveCount(0);
  });

  test("keeps scheduling available to the owner", async ({ page }) => {
    await enterStaff(page, "owner");
    await page.goto("/classes");
    await page.getByRole("button", { name: "New class" }).click();
    await expect(page.getByRole("heading", { name: "New class" })).toBeVisible();
    await expect(page.getByLabel("Class name")).toBeVisible();
  });
});
