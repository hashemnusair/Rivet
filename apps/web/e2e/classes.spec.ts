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

    await expect(page.getByRole("heading", { name: "Classes", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New class" })).toHaveCount(0);
    // Reception clicks the calendar chip straight into the dated roster; the
    // manager menu never opens for this role.
    await page.getByRole("button", { name: /Morning HIIT, Sunday/ }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByText("Dated roster", { exact: true })).toBeVisible();
    await page.getByLabel("Add member to dated class").fill("Yara Sweidan");
    await page.getByRole("button", { name: /Yara Sweidan/ }).click();
    await expect(page.getByRole("checkbox", { name: "Mark Yara Sweidan present" })).toBeEnabled();
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
