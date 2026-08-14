import { expect, test, type Page } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

test.describe("staged automation", () => {
  test("creates, manually runs, and pauses one auditable automation rule", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("automation", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "automation");
    const ownerContext = await newRoleContext(browser, "owner", baseURL);
    const managerContext = await newRoleContext(browser, "manager", baseURL);
    const owner = await ownerContext.newPage();
    const manager = await managerContext.newPage();
    const marker = guard.runId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const ruleName = `Staging automation ${marker}`;
    let ruleUrl: string | undefined;
    let cleanupEntry: number | undefined;

    try {
      await owner.goto("/automations", { waitUntil: "domcontentloaded" });
      await owner.getByRole("button", { name: "New rule", exact: true }).click();
      const dialog = owner.getByRole("dialog", { name: "New automation rule" });
      await dialog.getByLabel("Rule name").fill(ruleName);
      await dialog.getByRole("button", { name: "Create rule", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(owner.getByRole("link", { name: ruleName, exact: true })).toBeVisible();
      await owner.getByRole("link", { name: ruleName, exact: true }).click();
      await expect(owner).toHaveURL(/\/automations\/[^/]+$/);
      ruleUrl = owner.url();
      cleanupEntry = cleanup.plan({ targetType: "automation_rule", targetId: ruleUrl.split("/").at(-1), action: "deactivate", reason: "Disposable automation staging journey rule" });

      await owner.getByRole("button", { name: "Run now", exact: true }).click();
      const runDialog = owner.getByRole("dialog", { name: "Run automation now" });
      await runDialog.getByRole("textbox", { name: "Reason" }).fill("Verify the isolated automation execution path");
      await runDialog.getByRole("button", { name: "Run eligible records", exact: true }).click();
      await expect(owner.getByText(/Created \d+ execution/i)).toBeVisible();

      await manager.goto(ruleUrl, { waitUntil: "domcontentloaded" });
      await expect(manager.getByRole("heading", { name: ruleName })).toBeVisible();
      const enabled = manager.getByRole("switch", { name: "Enable rule" });
      if (await enabled.isChecked()) await enabled.click();
      await expect(manager.getByText("Paused", { exact: true })).toBeVisible();
      cleanup.complete(cleanupEntry);
    } finally {
      if (ruleUrl && cleanupEntry !== undefined) {
        const paused = await pauseRule(manager, ruleUrl);
        if (paused) cleanup.complete(cleanupEntry);
        else cleanup.fail(cleanupEntry, "Automation staging rule could not be paused");
      }
      await cleanup.attach(testInfo);
      await ownerContext.close();
      await managerContext.close();
    }
  });
});

async function pauseRule(page: Page, ruleUrl: string): Promise<boolean> {
  try {
    await page.goto(ruleUrl, { waitUntil: "domcontentloaded" });
    const enabled = page.getByRole("switch", { name: "Enable rule" });
    if (await enabled.isChecked()) await enabled.click();
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    return true;
  } catch {
    return false;
  }
}
