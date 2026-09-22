import { expect, test } from "@playwright/test";

/**
 * The daily operating brief in the preview: an owner opens the dashboard and
 * reads the exact queues with their scope, freshness and coverage, the
 * mandatory items stay on top, the complete queue is one click away, every
 * action returns to the original workflow, Jev's prepared emphasis appears
 * once the switch is on, and the brief holds up at phone width in RTL.
 */
test.describe("daily operating brief", () => {
  test("owner reads the brief with and without Jev, follows an action back to its workflow, and fits at phone width in RTL", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const brief = page.getByTestId("operating-brief");
    await expect(brief).toBeVisible();
    await expect(brief.getByTestId("brief-coverage")).toHaveText("Complete coverage");
    await expect(brief.getByTestId("brief-scope")).toContainText("All 2 branches, consolidated.");
    await expect(brief.getByTestId("brief-scope")).toContainText("Generated");
    // Without Jev the standard order leads and the figures are still exact.
    await expect(brief.getByTestId("brief-emphasis-default")).toContainText("Safety, cash and entry problems come first");
    await expect(brief.getByTestId("brief-emphasis-jev")).toHaveCount(0);
    await expect(brief.getByTestId("brief-mandatory")).toBeVisible();
    const mandatoryCount = await brief.getByTestId("brief-mandatory-item").count();
    expect(mandatoryCount).toBeGreaterThan(0);
    await expect(brief.getByTestId("brief-figures-collections")).toContainText("Outstanding");
    await expect(brief.getByTestId("brief-figures-collections")).toContainText("JOD");

    // The complete queue lists everything; the toggle names the exact count.
    const toggle = brief.getByTestId("brief-queue-toggle");
    const total = Number((await toggle.textContent())?.match(/(\d+)/)?.[1]);
    await toggle.click();
    await expect(brief.getByTestId("brief-queue-item")).toHaveCount(total);
    await brief.getByRole("button", { name: "Sections" }).click();

    // An action from a mandatory row goes to the original workflow. A person's
    // record is used because the operations tab would also select its branch
    // for the whole session, which is that page's own behaviour, not the brief's.
    const memberRow = brief.getByTestId("brief-mandatory-item").filter({ has: page.locator('a[href^="/members/"], a[href^="/crm/leads/"]') }).first();
    const memberLink = memberRow.getByRole("link").first();
    const href = await memberLink.getAttribute("href");
    await memberLink.click();
    await expect(page).toHaveURL(new RegExp(href!.split("?")[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByTestId("operating-brief")).toBeVisible();

    // Jev on: the prepared emphasis leads with its evidence; dismissing it keeps every mandatory item.
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Settings", exact: true }).click();
    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Dashboard", exact: true }).click();
    const jev = page.getByTestId("brief-emphasis-jev");
    await expect(jev).toBeVisible();
    await expect(jev).toContainText("Safety, cash and entry problems come first");
    await expect(jev.getByTestId("brief-emphasis-evidence")).toContainText("Approvals, cash and entry");
    await jev.getByRole("button", { name: "Dismiss suggestion" }).click();
    await expect(page.getByTestId("brief-emphasis-default")).toBeVisible();
    await expect(page.getByTestId("brief-mandatory-item")).toHaveCount(mandatoryCount);

    // Refresh is explicit and keeps the same scope.
    await page.getByTestId("brief-refresh").click();
    await expect(page.getByTestId("brief-coverage")).toHaveText("Complete coverage");

    // Manual RTL layout at phone width: the brief still fits.
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("switch", { name: "Manual RTL layout" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("operating-brief")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
