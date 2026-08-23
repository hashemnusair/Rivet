import { expect, test } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("staged provisioning", () => {
  test("reviews, provisions, and suspends one disposable gym workspace", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("provisioning", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "provisioning");
    const ownerContext = await newRoleContext(browser, "owner", baseURL);
    const platformContext = await newRoleContext(browser, "platform_admin", baseURL);
    const owner = await ownerContext.newPage();
    const platform = await platformContext.newPage();
    const marker = guard.runId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const gymName = `Staging Provision ${marker}`;
    const ownerName = `Staging Owner ${marker}`;
    const email = `staging-provision-${marker.toLowerCase()}@example.invalid`;
    let gymUrl: string | undefined;
    let cleanupEntry: number | undefined;

    try {
      await owner.goto("/signup", { waitUntil: "domcontentloaded" });
      await owner.getByLabel("Owner name").fill(ownerName);
      await owner.getByLabel("Email address").fill(email);
      await owner.getByLabel("Contact number").fill(`+96279${Date.now().toString().slice(-7)}`);
      await owner.getByLabel("Gym name").fill(gymName);
      await owner.getByRole("button", { name: /Send gym application/i }).click();
      await expect(owner.getByRole("heading", { name: /We.ll be in touch soon/i })).toBeVisible();

      await platform.goto("/platform/applications", { waitUntil: "domcontentloaded" });
      await platform.getByLabel("Search gym applications").fill(gymName);
      const application = platform.getByRole("button").filter({ hasText: gymName }).first();
      await expect(application).toBeVisible();
      await application.click();
      await platform.getByRole("button", { name: "Approve application", exact: true }).click();
      await expect(platform.getByText("Application approved", { exact: false })).toBeVisible();

      await platform.getByRole("button", { name: "Provision gym workspace", exact: true }).click();
      await expect(platform.getByText("Workspace provisioned", { exact: false })).toBeVisible();

      await platform.goto("/platform/gyms", { waitUntil: "domcontentloaded" });
      await platform.getByPlaceholder("Search gyms, areas, or plans").fill(gymName);
      const gymCard = platform.locator("article").filter({ hasText: gymName }).first();
      await expect(gymCard).toBeVisible();
      await gymCard.getByRole("link", { name: /Open/i }).click();
      await expect(platform).toHaveURL(/\/platform\/gyms\/[^/]+$/);
      gymUrl = platform.url();
      cleanupEntry = cleanup.plan({ targetType: "provisioned_gym", targetId: gymUrl.split("/").at(-1), action: "suspend", reason: "Disposable provisioning journey workspace" });

      await platform.getByRole("button", { name: "Suspend", exact: true }).click();
      await platform.getByLabel("Membership end date").fill(isoDateFromToday(45));
      await platform.getByLabel("Reason for this change").fill("Disposable isolated staging workspace cleanup");
      await platform.getByRole("button", { name: "Save controls", exact: true }).click();
      await expect(platform.getByRole("button", { name: "Restore access", exact: true })).toBeVisible();
      cleanup.complete(cleanupEntry);
    } finally {
      if (gymUrl && cleanupEntry !== undefined) {
        const suspended = await suspendGym(platform, gymUrl);
        if (suspended) cleanup.complete(cleanupEntry);
        else cleanup.fail(cleanupEntry, "Provisioned staging gym could not be suspended");
      }
      await cleanup.attach(testInfo);
      await ownerContext.close();
      await platformContext.close();
    }
  });
});

async function suspendGym(page: import("@playwright/test").Page, gymUrl: string): Promise<boolean> {
  try {
    await page.goto(gymUrl, { waitUntil: "domcontentloaded" });
    const suspend = page.getByRole("button", { name: "Suspend", exact: true });
    if (await suspend.count()) {
      await suspend.click();
      await page.getByLabel("Membership end date").fill(isoDateFromToday(45));
      await page.getByLabel("Reason for this change").fill("Disposable isolated staging workspace cleanup");
      await page.getByRole("button", { name: "Save controls", exact: true }).click();
    }
    await expect(page.getByRole("button", { name: "Restore access", exact: true })).toBeVisible();
    return true;
  } catch {
    return false;
  }
}
