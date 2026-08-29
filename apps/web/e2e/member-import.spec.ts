import { expect, test } from "@playwright/test";

test.describe("member file import", () => {
  test("uploads a CSV, previews its members, and keeps raw text secondary", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Open .+ workspace/i }).click();
    await page.goto("/members/import");

    await expect(page.getByRole("heading", { name: "Upload a member list" })).toBeVisible();
    await expect(page.getByText("Drop your CSV file here")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Member CSV content" })).toHaveCount(0);

    await page.getByLabel("Choose member CSV file").setInputFiles({
      name: "pilot-members.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("full_name,phone,email\nDina Qasem,0798112233,dina.qasem@example.com"),
    });

    await expect(page.getByText("pilot-members.csv")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review members" })).toBeEnabled();
    await page.getByRole("button", { name: "Review members" }).click();

    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 1 member" })).toBeVisible();
  });
});
