import { expect, test, type Page } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

test.describe("staged reception entry", () => {
  test("sells a disposable membership, checks it in at reception, and preserves the timeline", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("reception-entry", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "reception-entry");
    const managerContext = await newRoleContext(browser, "manager", baseURL);
    const receptionistContext = await newRoleContext(browser, "receptionist", baseURL);
    const memberContext = await newRoleContext(browser, "member", baseURL);
    const manager = await managerContext.newPage();
    const reception = await receptionistContext.newPage();
    const member = await memberContext.newPage();
    const marker = guard.runId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const fullName = `Staging Entry ${marker}`;
    const phone = `+96279${Date.now().toString().slice(-7)}`;
    let memberUrl: string | undefined;
    let cleanupEntry: number | undefined;

    try {
      await manager.goto("/members/new", { waitUntil: "domcontentloaded" });
      await manager.getByTestId("member-name").fill(fullName);
      await manager.getByTestId("member-phone").fill(phone);
      await manager.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await expect(manager).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = manager.url();
      cleanupEntry = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable reception entry journey member" });
      const memberNumber = (await manager.getByRole("main").locator("header span.font-mono").first().innerText()).trim();

      await manager.getByTestId("sell-membership").click();
      const sale = manager.getByRole("dialog", { name: "Sell membership" });
      await sale.getByRole("combobox", { name: "Plan" }).click();
      await manager.getByRole("option").first().click();
      await sale.getByTestId("confirm-sale").click();
      await expect(sale).toBeHidden();

      await reception.goto("/reception", { waitUntil: "domcontentloaded" });
      await reception.getByTestId("reception-search").fill(memberNumber);
      const verdict = reception.getByTestId("checkin-verdict");
      await expect(verdict).toHaveAttribute("data-decision", /allowed|warning/);
      await verdict.getByTestId("confirm-checkin").click();
      await expect(verdict).toContainText(/Checked in/i);
      await reception.getByRole("link", { name: "Open profile" }).click();
      await expect(reception).toHaveURL(new RegExp(`/members/${memberUrl.split("/").at(-1)}$`));
      await reception.getByTestId("tab-timeline").click();
      await expect(reception.getByTestId("member-timeline")).toContainText(/checked in/i);

      await member.goto("/customer/my-gyms", { waitUntil: "domcontentloaded" });
      await expect(member.getByRole("heading", { name: "Member home" })).toBeVisible();
      cleanup.complete(cleanupEntry);
    } finally {
      if (memberUrl && cleanupEntry !== undefined) {
        const archived = await archiveMember(manager, memberUrl);
        if (archived) cleanup.complete(cleanupEntry);
        else cleanup.fail(cleanupEntry, "Reception staging member could not be archived");
      }
      await cleanup.attach(testInfo);
      await managerContext.close();
      await receptionistContext.close();
      await memberContext.close();
    }
  });
});

async function archiveMember(page: Page, memberUrl: string): Promise<boolean> {
  try {
    await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Archive member/i }).click();
    const dialog = page.getByRole("dialog", { name: /Archive member/i });
    await dialog.getByRole("textbox").fill("Disposable reception entry journey cleanup");
    await dialog.getByRole("button", { name: "Archive member" }).click();
    await expect(dialog).toBeHidden();
    return true;
  } catch {
    return false;
  }
}
