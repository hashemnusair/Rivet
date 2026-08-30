import { expect, test, type Page } from "@playwright/test";
import { chooseFirstAvailableOption, newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

test.describe("staged isolation and audit", () => {
  test("keeps a tenant member private while the owning audit log records the write", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("isolation-audit", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "isolation-audit");
    const ownerContext = await newRoleContext(browser, "owner", baseURL);
    const foreignContext = await newRoleContext(browser, "foreign_tenant", baseURL);
    const platformContext = await newRoleContext(browser, "platform_admin", baseURL);
    const owner = await ownerContext.newPage();
    const foreign = await foreignContext.newPage();
    const platform = await platformContext.newPage();
    const marker = guard.runId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const fullName = `Staging Private ${marker}`;
    const phone = `+96279${Date.now().toString().slice(-7)}`;
    let memberUrl: string | undefined;
    let cleanupEntry: number | undefined;

    try {
      await owner.goto("/members/new", { waitUntil: "domcontentloaded" });
      await owner.getByTestId("member-name").fill(fullName);
      await owner.getByTestId("member-phone").fill(phone);
      await chooseFirstAvailableOption(owner, "Home branch");
      await owner.getByTestId("save-member").click();
      await expect(owner).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = owner.url();
      cleanupEntry = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable isolation and audit journey member" });

      await foreign.goto(memberUrl, { waitUntil: "domcontentloaded" });
      await expect(foreign.getByText(/Member not found|Forbidden|not available|access denied/i).first()).toBeVisible();

      await owner.goto("/audit", { waitUntil: "domcontentloaded" });
      await owner.getByLabel("Search audit log").fill(fullName);
      await expect(owner.getByRole("button").filter({ hasText: fullName }).first()).toBeVisible();

      await platform.goto("/platform/gyms", { waitUntil: "domcontentloaded" });
      await expect(platform.getByRole("heading", { name: "Gym organizations" })).toBeVisible();
      await expect(platform.getByText(fullName, { exact: true })).toHaveCount(0);
      cleanup.complete(cleanupEntry);
    } finally {
      if (memberUrl && cleanupEntry !== undefined) {
        const archived = await archiveMember(owner, memberUrl);
        if (archived) cleanup.complete(cleanupEntry);
        else cleanup.fail(cleanupEntry, "Isolation staging member could not be archived");
      }
      await cleanup.attach(testInfo);
      await ownerContext.close();
      await foreignContext.close();
      await platformContext.close();
    }
  });
});

async function archiveMember(page: Page, memberUrl: string): Promise<boolean> {
  try {
    await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Archive member/i }).click();
    const dialog = page.getByRole("dialog", { name: /Archive member/i });
    await dialog.getByRole("textbox").fill("Disposable isolation and audit journey cleanup");
    await dialog.getByRole("button", { name: "Archive member" }).click();
    await expect(dialog).toBeHidden();
    return true;
  } catch {
    return false;
  }
}
