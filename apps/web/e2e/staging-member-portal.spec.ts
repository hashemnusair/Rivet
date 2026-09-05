import { expect, test } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

test.describe("staged member portal", () => {
  test("keeps QR hidden until requested and synchronizes member-owned emergency details", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("member-portal", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "member-portal");
    const memberContext = await newRoleContext(browser, "member", baseURL);
    const member = await memberContext.newPage();
    const marker = guard.runId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const emergencyName = `Staging Contact ${marker}`;
    let cleanupEntry: number | undefined;

    try {
      await member.goto("/customer/my-gyms", { waitUntil: "domcontentloaded" });
      await expect(member.getByRole("heading", { name: /^Hi,/ })).toBeVisible();
      await expect(member.getByRole("heading", { name: "Entry QR" })).toHaveCount(0);

      await member.getByRole("link", { name: /Forge Fitness Club/ }).first().click();
      await expect(member).toHaveURL(/\/customer\/my-gyms\//);
      const showQr = member.getByRole("button", { name: "Show entry QR" });
      await expect(showQr).toBeVisible();
      await showQr.click();
      const qrDialog = member.getByRole("dialog", { name: "Entry QR" });
      await expect(qrDialog).toBeVisible();
      await expect(qrDialog.locator("[aria-label='Membership entry QR code']")).toBeVisible();
      await expect(qrDialog.getByText(/Expires /)).toBeVisible();
      await qrDialog.getByRole("button", { name: "Close" }).click();
      await expect(qrDialog).toBeHidden();

      await member.getByRole("link", { name: "Home", exact: true }).first().click();
      await member.getByRole("button", { name: "Open account menu" }).first().click();
      await member.getByRole("menuitem", { name: "Profile" }).click();
      await expect(member).toHaveURL(/\/customer\/profile$/);
      const marketing = member.getByRole("switch", { name: "Receive marketing updates" });
      const marketingBefore = await marketing.isChecked();
      await member.locator("#emergency-name").fill(emergencyName);
      await member.locator("#emergency-relationship").fill("Sibling");
      await member.locator("#emergency-phone").fill("+962790000000");
      await member.getByRole("button", { name: "Save profile", exact: true }).click();
      await expect(member.getByRole("status")).toContainText("Saved and shared with linked gyms");
      await expect(marketing).toBeChecked({ checked: marketingBefore });
      cleanupEntry = cleanup.plan({ targetType: "member_profile", action: "preserve", reason: "Member-owned profile remains on the disposable staging account for auditability" });
      cleanup.complete(cleanupEntry);
    } finally {
      await cleanup.attach(testInfo);
      await memberContext.close();
    }
  });
});
