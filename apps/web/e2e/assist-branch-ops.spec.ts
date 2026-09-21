import { expect, test } from "@playwright/test";

/**
 * Branch-operations assistance in the preview: a manager describes a fault,
 * Jev suggests the report kind and the branch's own machine, the existing
 * issue form opens prefilled with severity and safety left to the person,
 * the machine's repair history compares an earlier report on request, and the
 * notification bell offers a grouped reading that keeps the unread count and
 * every alert. The equipment tab then holds up at phone width in RTL.
 */
test.describe("branch-operations assistance", () => {
  test("describe, file, compare history and read grouped notifications", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    // Stay inside the running app so the created records survive.
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Stock & purchasing", exact: true }).click();
    await page.getByRole("tab", { name: /Equipment/ }).click();
    // Equipment belongs to one branch; pick Abdoun, where the seeded treadmill lives.
    await page.getByRole("combobox", { name: "Operations branch" }).click();
    await page.getByRole("option", { name: /Abdoun/ }).click();
    await expect(page.getByTestId("operations-equipment")).toBeVisible();

    const intake = page.getByTestId("report-intake");
    await expect(intake).toBeVisible();
    await intake.getByTestId("report-intake-text").fill("TREAD-01 belt slipping again under load, grinding noise at speed 10");
    await intake.getByTestId("report-intake-run").click();
    await expect(intake.getByTestId("report-intake-category-label")).toHaveText("Machine issue");
    await expect(intake.getByTestId("report-intake-target-label")).toContainText("TREAD-01");
    await intake.getByTestId("report-intake-file-issue").click();
    const dialog = page.getByRole("dialog", { name: "Report machine issue" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Issue machine" })).toContainText("TREAD-01");
    await expect(dialog.getByRole("combobox", { name: "Equipment safety status" })).toContainText("Needs assessment");
    await expect(dialog.getByRole("combobox", { name: "Issue severity" })).toContainText("Medium");
    await dialog.getByRole("textbox", { name: "Issue title" }).fill("Belt slipping again");
    await dialog.getByRole("button", { name: "Report issue" }).click();
    await expect(dialog).toBeHidden();

    // The machine's history shows the earlier report; the comparison is explicit and changes nothing.
    const history = page.getByTestId("repair-history");
    await expect(history).toBeVisible();
    await expect(history.getByTestId("repair-history-disclosure")).toContainText("Other machines and other branches are not included");
    await history.getByRole("button", { name: "Compare with Jev" }).first().click();
    await expect(history.getByText(/Same fault, recurring|Possibly the same fault|Similar wording, separate fault|Unclear/).first()).toBeVisible();

    // Notifications: the grouped reading keeps the unread badge and the mandatory alert.
    const bell = page.getByRole("button", { name: /unread notifications/ });
    const badge = await bell.getAttribute("aria-label");
    await bell.click();
    await page.getByTestId("notifications-view-toggle").click();
    await expect(page.getByTestId("notification-mandatory")).toContainText("Entry denied at the door");
    await expect(page.getByTestId("notification-group").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /unread notifications/ })).toHaveAttribute("aria-label", badge ?? "");
    await page.keyboard.press("Escape");

    // Manual RTL layout at phone width: the equipment tab with its intake still fits.
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("switch", { name: "Manual RTL layout" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("report-intake")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
