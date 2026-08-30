import { expect, test, type Page } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

function invitationAddress(runId: string): string {
  const template = process.env.PLAYWRIGHT_STAGING_STAFF_EMAIL_TEMPLATE;
  if (!template?.includes("{runId}")) {
    throw new Error("PLAYWRIGHT_STAGING_STAFF_EMAIL_TEMPLATE must be a safe staging inbox template containing {runId}.");
  }
  return template.replaceAll("{runId}", runId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(-36));
}

test.describe("staged staff authorization", () => {
  test("invites branch-scoped staff, proves role boundaries, and deactivates the disposable account", async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("staff-authorization", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "staff-authorization");
    const ownerContext = await newRoleContext(browser, "owner", baseURL);
    const owner = await ownerContext.newPage();
    const displayName = `Staging Reception ${guard.runId}`;
    const email = invitationAddress(guard.runId);
    let cleanupEntry: number | undefined;

    try {
      await owner.goto("/settings?section=users", { waitUntil: "domcontentloaded" });
      await owner.getByRole("tab", { name: "Users" }).click();
      await owner.getByRole("button", { name: "Invite user" }).click();
      const invite = owner.getByRole("dialog", { name: "Invite user" });
      await invite.getByRole("textbox", { name: "Full name" }).fill(displayName);
      await invite.getByRole("textbox", { name: "Email" }).fill(email);
      await invite.getByRole("combobox", { name: "Role" }).click();
      await owner.getByRole("option", { name: "Reception", exact: true }).click();
      await invite.getByRole("combobox", { name: "Branch scope" }).click();
      await owner.getByRole("option", { name: "Selected branches" }).click();
      const firstBranch = invite.getByRole("checkbox").first();
      if ((await firstBranch.getAttribute("aria-checked")) !== "true") await firstBranch.click();
      await invite.getByRole("button", { name: "Send invite" }).click();
      await expect(invite).toBeHidden();
      cleanupEntry = cleanup.plan({ targetType: "staff_user", targetId: email, action: "deactivate", reason: "Disposable staff-authorization journey invitation" });
      await owner.reload({ waitUntil: "domcontentloaded" });
      await owner.getByRole("tab", { name: "Users" }).click();
      await expect(owner.getByRole("row", { name: new RegExp(displayName) })).toContainText("invited");

      for (const role of ["manager", "receptionist", "trainer"] as const) {
        const context = await newRoleContext(browser, role, baseURL);
        const page = await context.newPage();
        await page.goto("/settings", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Not allowed for this role" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Invite user" })).toHaveCount(0);
        await context.close();
      }
    } finally {
      await ownerContext.close();
      if (cleanupEntry !== undefined) {
        const cleanupContext = await newRoleContext(browser, "owner", baseURL);
        const cleanupPage = await cleanupContext.newPage();
        try {
          const cleanupError = await deactivateInvitedStaff(cleanupPage, displayName);
          if (!cleanupError) cleanup.complete(cleanupEntry);
          else cleanup.fail(cleanupEntry, cleanupError);
        } finally {
          await cleanupContext.close();
        }
      }
      await cleanup.attach(testInfo);
    }
  });
});

async function deactivateInvitedStaff(page: Page, displayName: string): Promise<string | undefined> {
  try {
    await page.goto("/settings?section=users", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Users" }).click();
    await page.getByRole("button", { name: `Edit access for ${displayName}` }).click();
    const dialog = page.getByRole("dialog", { name: `Access — ${displayName}` });
    const active = dialog.getByRole("switch", { name: "Account active" });
    if ((await active.getAttribute("aria-checked")) === "true") await active.click();
    await dialog.getByRole("button", { name: "Save access" }).click();
    await expect(dialog).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("tab", { name: "Users" }).click();
    await expect(page.getByRole("row", { name: new RegExp(displayName) })).toContainText("deactivated");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "Staff invitation could not be deactivated through its access dialog";
  }
}
