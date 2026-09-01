import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, persona: "Owner" | "Reception") {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByRole("button", { name: /^Open .+ workspace$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectNoHorizontalScroll(page: Page) {
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test.describe("canonical checkout", () => {
  test("reception completes an anonymous cash sale from the desk on desktop", async ({ page }) => {
    await signIn(page, "Reception");
    await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Checkout", exact: true }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("heading", { name: "Choose items" })).toBeVisible();
    // The assigned branch is preselected: no branch picker, no "All branches" sale.
    await expect(page.getByRole("combobox", { name: "Checkout branch" })).toHaveCount(0);
    await expect(page.getByTestId("customer-attach")).toContainText("Walk-in customer");
    await expect(page.getByRole("textbox", { name: "Guest name" })).toHaveCount(0);

    await page.getByRole("textbox", { name: "Search sellable stock" }).fill("Protein");
    await page.getByRole("button", { name: "Add Protein bar" }).click();
    await expect(page.getByTestId("checkout-cart")).toContainText("Protein bar");
    await expect(page.getByTestId("payment-section")).toContainText(/Cash goes into the open shift/);
    await page.getByTestId("complete-retail-sale").click();

    const result = page.getByTestId("sale-result");
    await expect(result).toContainText("Sale completed");
    await expect(result).toContainText(/Receipt R-/);
    await expect(result).toContainText("No customer profile was created");
    await result.getByRole("link", { name: /Open receipt/ }).click();
    await expect(page).toHaveURL(/\/payments\/receipts\//);
    await expect(page.getByText("Walk-in customer")).toBeVisible();
    await page.getByRole("link", { name: "New sale" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test("works one-handed on a 390px phone with a bottom sheet and no sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "Reception");
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Choose items" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole("button", { name: "Add Protein bar" }).click();
    const bar = page.getByTestId("mobile-cart-bar");
    await expect(bar).toBeVisible();
    const barBox = await bar.getByRole("button").boundingBox();
    expect(barBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await bar.getByRole("button").click();
    const sheet = page.getByTestId("mobile-cart-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Protein bar");
    await expectNoHorizontalScroll(page);
    const complete = sheet.getByTestId("complete-retail-sale");
    const completeBox = await complete.boundingBox();
    expect(completeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await complete.click();
    await expect(page.getByTestId("sale-result")).toContainText("Sale completed");
    await expectNoHorizontalScroll(page);

    await page.setViewportSize({ width: 360, height: 780 });
    await page.getByTestId("next-sale").click();
    await expect(page.getByRole("heading", { name: "Choose items" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("redirects the old operations checkout route and keeps the branch parameter", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/operations/checkout?productId=nothing");
    await expect(page).toHaveURL(/\/checkout\?productId=nothing$/);
  });
});

test.describe("supplier payables", () => {
  test("settles a payable in cash from the open drawer, prints a remittance record, and reverses it with a reason", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/operations/payables");
    await expect(page.getByTestId("payables-workspace")).toBeVisible();
    const row = page.getByTestId("payable-row").first();
    await expect(row).toContainText("Jordan Sports Supply");
    await expect(row).toContainText("Unpaid");
    await expect(row).toContainText("1,650.000");

    await row.getByRole("button", { name: /^Pay Jordan Sports Supply/ }).click();
    const dialog = page.getByRole("dialog", { name: "Record supplier payment" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox", { name: "Paying branch" }).click();
    await page.getByRole("option", { name: "Forge — Abdoun" }).click();
    await expect(dialog.getByRole("status")).toContainText(/Open cash shift/);
    const amount = dialog.getByRole("textbox", { name: "Amount paid" });
    await amount.fill("650");
    await expect(dialog.getByRole("textbox", { name: /Allocate to Purchase order/ })).toHaveValue("650.000");
    await dialog.getByTestId("confirm-supplier-payment").click();

    await expect(page).toHaveURL(/\/operations\/payables\/payments\//);
    const confirmation = page.getByTestId("supplier-payment-confirmation");
    await expect(confirmation).toContainText("Supplier payment confirmation");
    await expect(confirmation).toContainText("Jordan Sports Supply");
    await expect(confirmation).toContainText("Not posted to ledger yet");
    await expect(confirmation).toContainText("1,000.000");

    await page.getByTestId("reverse-supplier-payment").click();
    await page.getByTestId("reverse-supplier-payment-reason").fill("Paid the same invoice twice");
    await page.getByTestId("confirm-reverse-supplier-payment").click();
    await expect(confirmation).toContainText("REVERSED");
    await expect(page.getByTestId("reverse-supplier-payment")).toHaveCount(0);

    await page.getByRole("link", { name: "All payables" }).click();
    await expect(page.getByTestId("payable-row").first()).toContainText("Unpaid");
  });
});
