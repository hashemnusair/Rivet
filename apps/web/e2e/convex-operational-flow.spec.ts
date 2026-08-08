import { expect, test, type Page } from "@playwright/test";

/**
 * Production-shaped write verification for the highest-value operational loop:
 * member → membership → payment → check-in → timeline/audit.
 *
 * This is intentionally opt-in. It creates and archives one disposable member
 * in the isolated Convex staging deployment, so ordinary CI and preview runs
 * never mutate a shared environment.
 */
test.describe("staged Convex operational flow", () => {
  test("persists a commercial loop across member, finance, reception, timeline and audit", async ({ page }) => {
    test.skip(
      process.env.PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW !== "1" || process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1",
      "Set PLAYWRIGHT_CONVEX_SMOKE=1 and PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW=1 for the isolated staging write test.",
    );

    const marker = `${Date.now()}`;
    const fullName = `Convex Flow ${marker}`;
    const phone = `+962 79 ${marker.slice(-7)}`;
    let memberUrl: string | undefined;

    try {
      await page.goto("/members/new", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login/);

      await page.getByTestId("member-name").fill(fullName);
      await page.getByTestId("member-phone").fill(phone);
      await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await expect(page).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = page.url();

      await page.getByTestId("sell-membership").click();
      const sale = page.getByRole("dialog");
      await expect(sale).toBeVisible();

      await sale.getByRole("combobox", { name: "Plan" }).click();
      await page.getByRole("option", { name: /Monthly All Access/i }).click();
      await sale.getByRole("combobox", { name: "Payment method" }).click();
      await page.getByRole("option", { name: "Card" }).click();
      await sale.getByTestId("confirm-sale").click();
      await expect(sale).toBeHidden();

      await page.getByTestId("tab-timeline").click();
      const timeline = page.getByTestId("member-timeline");
      await expect(timeline).toContainText("Member profile created");
      await expect(timeline).toContainText(/membership sold/i);
      await expect(timeline).toContainText(/payment collected/i);

      const memberNumber = (await page.getByRole("main").locator("header span.font-mono").first().innerText()).trim();
      await page.goto("/reception", { waitUntil: "domcontentloaded" });
      await page.getByTestId("reception-search").fill(memberNumber);

      const verdict = page.getByTestId("checkin-verdict");
      await expect(verdict).toHaveAttribute("data-decision", /allowed|warning/);
      await verdict.getByTestId("confirm-checkin").click();
      await expect(verdict).toContainText(/Checked in/i);

      await page.getByRole("link", { name: "Open profile" }).click();
      await page.getByTestId("tab-timeline").click();
      await expect(page.getByTestId("member-timeline")).toContainText(/checked in/i);

      await page.goto("/audit", { waitUntil: "domcontentloaded" });
      const auditSearch = page.getByLabel("Search audit log");
      await auditSearch.fill(fullName);
      await expect(page.getByRole("button", { name: /membership\.sale/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /payment\.collect/i })).toBeVisible();
    } finally {
      if (memberUrl) await archiveDisposableMember(page, memberUrl);
    }
  });
});

async function archiveDisposableMember(page: Page, memberUrl: string) {
  try {
    await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Archive member/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Disposable staging verification member");
    await dialog.getByRole("button", { name: "Archive member" }).click();
    await expect(dialog).toBeHidden();
  } catch {
    // Preserve the original assertion failure. The staging cleanup can be
    // retried manually from the member URL if a browser session expires.
  }
}
