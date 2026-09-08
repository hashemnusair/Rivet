import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
});

test("changes a promised delivery date and clears the overdue filter", async ({ page }) => {
  await page.goto("/operations");
  await page.getByRole("combobox", { name: "Operations branch" }).click();
  await page.getByRole("option", { name: "Forge — Abdoun" }).click();
  await page.getByRole("tab", { name: "Purchase orders" }).click();
  await page.getByRole("button", { name: "New purchase order" }).click();
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await page.getByRole("spinbutton", { name: "Unit cost (JOD)", exact: true }).fill("1");
  await page.getByLabel("Expected delivery date", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const row = page.getByTestId("purchase-order-row").filter({ has: page.getByRole("button", { name: "Approve", exact: true }) }).first();
  await row.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Overdue", exact: true }).click();
  const overdue = page.getByTestId("purchase-order-row");
  await expect(overdue).toContainText("Delivery overdue: 2020-01-01");
  await overdue.getByRole("button", { name: "Change date" }).click();
  await overdue.getByLabel("Expected delivery date").fill("2099-01-01");
  await overdue.getByRole("button", { name: "Save date" }).click();
  await expect(page.getByText("No overdue deliveries", { exact: true })).toBeVisible();
});

test("assigns today's checklist to an individual without losing its results", async ({ page }) => {
  await page.goto("/checklists");
  const opening = page.getByRole("region", { name: "Opening walkthrough checklist" });
  await opening.getByRole("button", { name: "Assign this day" }).click();
  await opening.getByLabel("Responsible person").selectOption({ label: "Omar Al-Khatib" });
  await opening.getByRole("button", { name: "Save assignment" }).click();
  await expect(opening).toContainText("Omar Al-Khatib");
  await expect(opening).toContainText("0/4");
});
