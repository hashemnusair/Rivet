import { expect, test } from "@playwright/test";

test.describe("stock and purchasing workflows", () => {
  test("gates writes on a concrete branch, moves purchasing into tabs, and resolves an equipment issue", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Open .+ workspace/i }).click();
    await page.goto("/operations");
    await expect(page.getByTestId("operations-command-center")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stock & purchasing" })).toBeVisible();

    // The all-branches comparison view is deliberately read-only: branch
    // writes stay disabled until one concrete branch is chosen.
    await expect(page.getByText(/Select a branch above to add items/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add item" })).toBeDisabled();

    await page.getByRole("combobox", { name: "Operations branch" }).click();
    await page.getByRole("option", { name: "Forge — Abdoun" }).click();
    await expect(page.getByText(/Select a branch above to add items/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add item" })).toBeEnabled();

    // Purchasing lives in its own tabs now; a received supplier order shows
    // up as a payable with the supplier's outstanding balance.
    await page.getByRole("tab", { name: "Purchase orders" }).click();
    await expect(page.getByTestId("operations-orders")).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByTestId("purchase-order-row").first()).toContainText("Jordan Sports Supply");
    await page.getByRole("tab", { name: "Suppliers" }).click();
    await expect(page.getByTestId("supplier-row").first()).toContainText("Jordan Sports Supply");
    await page.getByRole("tab", { name: "Payables" }).click();
    await expect(page.getByTestId("payable-row").first()).toContainText("Jordan Sports Supply");
    await page.getByRole("tab", { name: "Inventory" }).click();

    // Stock movements between branches go through the transfer dialog.
    await page.getByRole("button", { name: "Move stock" }).click();
    const transferDialog = page.getByRole("dialog", { name: "Move stock to another branch" });
    await expect(transferDialog).toBeVisible();
    await transferDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(transferDialog).toHaveCount(0);

    // Resolving a machine issue confirms the machine is safe to operate and
    // keeps the report in the immutable issue history.
    await page.getByRole("tab", { name: /Equipment/i }).click();
    const issueCard = page
      .getByText("Belt slipping under load")
      .locator("xpath=ancestor::div[contains(@class, 'space-y-2')][1]");
    await expect(issueCard).toContainText("in progress");
    await issueCard.getByRole("button", { name: "Resolve issue" }).click();
    await expect(issueCard).toContainText("resolved");
    await expect(issueCard.getByRole("button", { name: "Resolve issue" })).toHaveCount(0);

    // Maintenance is linked from here and lives on its own page.
    await page.getByRole("link", { name: "Maintenance" }).click();
    await expect(page).toHaveURL(/\/maintenance/);
    await expect(page.getByRole("heading", { name: "Maintenance list" })).toBeVisible();
    await expect(page.getByTestId("operations-facilities").getByText(/Cleaning, inspections, and incidents/)).toBeVisible();
  });
});
