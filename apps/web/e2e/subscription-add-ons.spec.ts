import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`operator activates a capped Basic package and can reopen it at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await page.goto("/platform/billing");
    const more = page.locator('[aria-labelledby="gym-subscriptions-heading"]').getByRole("button", { name: /More actions for/ }).first();
    await more.click();
    await page.getByRole("menuitem", { name: "Change plan", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /Basic/ }).click();
    await dialog.getByRole("combobox", { name: "Second branch quantity" }).selectOption("1");
    await dialog.getByRole("combobox", { name: "100 members + 300 monthly emails quantity" }).selectOption("3");
    await dialog.getByRole("combobox", { name: "2 owner/staff accounts quantity" }).selectOption("3");
    await dialog.getByRole("combobox", { name: "Management reporting quantity" }).selectOption("1");
    await expect(dialog.getByRole("combobox", { name: "Financial OS quantity" })).toHaveValue("1");
    await expect(dialog.getByRole("combobox", { name: "Daily operations quantity" })).toHaveValue("1");
    await expect(dialog.getByRole("combobox", { name: "Second branch quantity" }).getByRole("option")).toHaveCount(2);
    await expect(dialog.getByRole("combobox", { name: "100 members + 300 monthly emails quantity" }).getByRole("option")).toHaveCount(4);
    await expect(dialog).toContainText("600 members");
    await expect(dialog).toContainText("158.000");
    await dialog.getByRole("textbox", { name: "Reason for this change" }).fill("Owner approved Basic with every capped add-on.");
    await dialog.screenshot({ path: testInfo.outputPath(`add-ons-${width}.png`) });
    await dialog.getByRole("button", { name: "Change plan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await more.click();
    await page.getByRole("menuitem", { name: "Change plan", exact: true }).click();
    await expect(dialog.getByRole("radio", { name: /Basic/ })).toBeChecked();
    await expect(dialog.getByRole("combobox", { name: "Second branch quantity" })).toHaveValue("1");
    await expect(dialog.getByRole("combobox", { name: "100 members + 300 monthly emails quantity" })).toHaveValue("3");
    await expect(dialog.getByRole("combobox", { name: "Management reporting quantity" })).toHaveValue("1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
