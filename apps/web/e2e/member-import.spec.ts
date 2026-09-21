import { expect, test } from "@playwright/test";

test.describe("member file import", () => {
  test("uploads a CSV, previews its members, and keeps raw text secondary", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Open .+ workspace/i }).click();
    // The persona is stored once the sign-in resolves; jumping to a deep
    // route before that leaves the workspace guard waiting for nobody.
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/members/import");

    await expect(page.getByRole("heading", { name: "Import members" })).toBeVisible();
    await expect(page.getByText("Drop a member file here")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Member CSV content" })).toHaveCount(0);

    await page.getByLabel("Choose member file").setInputFiles({
      name: "pilot-members.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("full_name,phone,gender,email\nDina Qasem,0798112233,female,dina.qasem@example.com"),
    });

    await expect(page.getByText("pilot-members.csv")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check members" })).toBeEnabled();
    await page.getByRole("button", { name: "Check members" }).click();

    await expect(page.getByRole("heading", { name: "Review before import" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 1 member" })).toBeVisible();
  });
});

test.describe("member file import with Jev assistance", () => {
  test("owner accepts a column suggestion for an unfamiliar heading and reaches the normal preview", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Open .+ workspace/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Suggestions are off for every gym until an owner switches them on.
    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    // Stay inside the running app: a hard navigation would recreate the preview
    // runtime and drop the switch that was just saved.
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Members", exact: true }).click();
    await page.getByRole("link", { name: "Import CSV" }).click();
    await expect(page.getByRole("heading", { name: "Import members" })).toBeVisible();
    await page.getByLabel("Choose member file").setInputFiles({
      name: "legacy-members.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Name,Tel,Sex\nDina Qasem,0798112233,female"),
    });
    await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check members" })).toBeDisabled();

    const panel = page.getByTestId("import-unmatched-columns");
    await expect(panel).toContainText("Tel");
    await panel.getByRole("button", { name: "Suggest mapping for Tel" }).click();
    const card = page.getByTestId("import-column-card-1");
    await expect(card).toContainText("Fill Phone from this column.");
    await card.getByRole("button", { name: "Use as Phone" }).click();
    await expect(page.getByRole("combobox", { name: "Phone source column" })).toContainText("Tel");

    await expect(page.getByRole("button", { name: "Check members" })).toBeEnabled();
    await page.getByRole("button", { name: "Check members" }).click();
    await expect(page.getByRole("heading", { name: "Review before import" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 1 member" })).toBeVisible();
  });
});
