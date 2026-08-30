import { expect, test, type Page } from "@playwright/test";
import { chooseFirstAvailableOption, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

/**
 * Production-shaped write verification for the highest-value operational loop:
 * member → membership → payment → check-in → timeline/audit.
 *
 * This is intentionally opt-in. It creates and archives one disposable member
 * in the isolated Convex staging deployment, so ordinary CI and preview runs
 * never mutate a shared environment.
 */
test.describe("staged Convex operational flow", () => {
  test("persists a commercial loop across member, finance, reception, timeline and audit", async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(
      process.env.PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW !== "1" || process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging",
      "Set the Convex smoke/write switches and PLAYWRIGHT_TARGET_CLASSIFICATION=staging for the isolated staging write test.",
    );

    // The classification is deliberately independent from URL naming. A
    // production hostname that happens to contain "dev" must never bypass the
    // release gate, and a staging deployment must be opted into explicitly.
    const guard = requireStagingJourney("membership-lifecycle", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "membership-lifecycle");

    const marker = `${guard.runId}-${Date.now()}`;
    const fullName = `Convex Flow ${marker}`;
    const phone = `+962 79 ${marker.slice(-7)}`;
    let memberUrl: string | undefined;
    let cleanupEntry: number | undefined;

    try {
      await page.goto("/members/new", { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/login/);

      await page.getByTestId("member-name").fill(fullName);
      await page.getByTestId("member-phone").fill(phone);
      await chooseFirstAvailableOption(page, "Home branch");
      await page.getByTestId("save-member").click();
      await expect(page).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = page.url();
      cleanupEntry = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable staging commercial journey" });

      await page.getByTestId("sell-membership").click();
      const sale = page.getByRole("dialog");
      await expect(sale).toBeVisible();

      await sale.getByRole("combobox", { name: "Plan" }).click();
      await page.getByRole("option", { name: /Monthly All Access/i }).click();
      await sale.getByRole("combobox", { name: "Payment method" }).click();
      await page.getByRole("option", { name: "Card" }).click();
      await sale.getByPlaceholder("e.g. POS-88213").fill(`STAGING-${guard.runId}`);
      await sale.getByTestId("confirm-sale").click();
      await expect(sale).toBeHidden();

      await page.getByTestId("tab-timeline").click();
      const timeline = page.getByTestId("member-timeline");
      await expect(timeline).toContainText("Member profile created");
      await expect(timeline).toContainText(/membership sold/i);
      await expect(timeline).toContainText(/payment collected/i);

      const memberNumber = (await page.getByRole("main").locator("header span.font-mono").first().innerText()).trim();
      await page.goto("/reception", { waitUntil: "domcontentloaded" });
      await chooseFirstAvailableOption(page, "Active branch");
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
      await expect(page.getByRole("button", { name: /membership\.sale/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /payment\.collect/i }).first()).toBeVisible();
    } finally {
      if (memberUrl) {
        const archived = await archiveDisposableMember(page, memberUrl);
        if (cleanupEntry !== undefined) {
          if (archived) cleanup.complete(cleanupEntry);
          else cleanup.fail(cleanupEntry, "Member archive did not complete");
        }
      }
      await cleanup.attach(testInfo);
    }
  });
});

async function archiveDisposableMember(page: Page, memberUrl: string): Promise<boolean> {
  try {
    await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Archive member/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Disposable staging verification member");
    await dialog.getByRole("button", { name: "Archive member" }).click();
    await expect(dialog).toBeHidden();
    return true;
  } catch {
    // Preserve the original assertion failure. The staging cleanup can be
    // retried manually from the member URL if a browser session expires.
    return false;
  }
}
