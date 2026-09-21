import { expect, test } from "@playwright/test";

/**
 * The member resolution workspace in the preview: an owner turns
 * suggestions on, opens a member record, writes what they are helping with,
 * and the training-payment panel opens beside the unchanged tabs. The same
 * area then holds up at phone width in the manual RTL layout.
 */
test.describe("member resolution workspace", () => {
  test("owner finds the training-payment panel from a typed goal, on desktop and at phone width in RTL", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    // Stay inside the running app so the saved switch survives.
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Members", exact: true }).click();
    await page.getByTestId("member-row").first().click();
    const area = page.getByTestId("resolution-area");
    await expect(area).toBeVisible();
    await expect(area.getByTestId("resolution-facts")).toBeVisible();

    const goal = area.getByRole("textbox", { name: "What are you helping with?" });
    await goal.fill("I already paid for training");
    await area.getByRole("button", { name: "Find panels" }).click();
    await expect(page.getByTestId("resolution-panel-panel.training_payment")).toBeVisible();
    await expect(page.getByTestId("resolution-service-note")).toContainText("A payment settles only the charge it was recorded against");
    await expect(goal).toHaveValue("I already paid for training");
    // The normal tabs and history stay in place.
    await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible();

    // Manual RTL layout, then phone width: the area still renders without horizontal overflow.
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("switch", { name: "Manual RTL layout" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(area).toBeVisible();
    await expect(page.getByTestId("resolution-panel-panel.training_payment")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await area.getByRole("button", { name: "Standard view" }).click();
    await expect(page.getByTestId("resolution-panel-panel.training_payment")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  });
});
