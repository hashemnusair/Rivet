import { expect, test } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function minuteValue(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

test.describe("staged owner settings and trial scheduling", () => {
  test("persists a branch trial-request window and restores the original policy", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("owner-settings", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "owner-settings");
    const context = await newRoleContext(browser, "owner", baseURL);
    const page = await context.newPage();
    let cleanupEntry: number | undefined;
    let dayLabel: string | undefined;
    let originalTrialEnabled = false;
    let originalTrialOpensAt = "";
    let originalTrialClosesAt = "";
    try {
      await page.goto("/settings?section=operations", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await page.getByRole("tab", { name: "Rules & hours" }).click();
      await expect(page.getByRole("heading", { name: "Branch hours and free trials" })).toBeVisible();

      for (const day of DAYS) {
        const open = page.getByRole("checkbox", { name: `${day} open` });
        if (await open.getAttribute("aria-checked") !== "true") continue;
        const opening = await page.getByLabel(`${day} opening time`).inputValue();
        const closing = await page.getByLabel(`${day} closing time`).inputValue();
        if (minuteValue(closing) - minuteValue(opening) < 60) continue;
        dayLabel = day;
        const trialEnabled = page.getByRole("checkbox", { name: `${day} trial requests enabled` });
        originalTrialEnabled = await trialEnabled.getAttribute("aria-checked") === "true";
        if (!originalTrialEnabled) await trialEnabled.click();
        const trialOpening = page.getByLabel(`${day} trial window opening time`);
        const trialClosing = page.getByLabel(`${day} trial window closing time`);
        originalTrialOpensAt = await trialOpening.inputValue();
        originalTrialClosesAt = await trialClosing.inputValue();
        const firstCandidate = minuteValue(opening) + 15;
        const candidateOpening = timeValue(firstCandidate) === originalTrialOpensAt ? minuteValue(opening) + 30 : firstCandidate;
        const candidateClosing = Math.min(minuteValue(closing), candidateOpening + 60);
        await trialOpening.fill(timeValue(candidateOpening));
        await trialClosing.fill(timeValue(candidateClosing));
        break;
      }
      if (!dayLabel) throw new Error("The staging gym needs one open branch day with at least a 60-minute window.");
      cleanupEntry = cleanup.plan({ targetType: "operational_policy", targetId: dayLabel, action: "preserve", reason: "Restore the original trial schedule after staging verification" });
      await page.getByRole("button", { name: "Save operational rules" }).click();
      await expect(page.getByText("Operational rules saved and audited.")).toBeVisible();
      const changedOpening = await page.getByLabel(`${dayLabel} trial window opening time`).inputValue();
      expect(changedOpening).not.toBe(originalTrialOpensAt);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "Rules & hours" }).click();
      await expect(page.getByLabel(`${dayLabel} trial window opening time`)).toHaveValue(changedOpening);

      await restoreTrialWindow(page, dayLabel, originalTrialEnabled, originalTrialOpensAt, originalTrialClosesAt);
      await page.getByRole("button", { name: "Save operational rules" }).click();
      await expect(page.getByText("Operational rules saved and audited.")).toBeVisible();
      if (cleanupEntry !== undefined) cleanup.complete(cleanupEntry);
    } finally {
      if (cleanupEntry !== undefined && dayLabel) {
        try {
          await restoreTrialWindow(page, dayLabel, originalTrialEnabled, originalTrialOpensAt, originalTrialClosesAt);
          await page.getByRole("button", { name: "Save operational rules" }).click();
          await expect(page.getByText("Operational rules saved and audited.")).toBeVisible();
          cleanup.complete(cleanupEntry);
        } catch (error) {
          cleanup.fail(cleanupEntry, error);
        }
      }
      await cleanup.attach(testInfo);
      await context.close();
    }
  });
});

async function restoreTrialWindow(page: import("@playwright/test").Page, day: string, enabled: boolean, opensAt: string, closesAt: string) {
  const toggle = page.getByRole("checkbox", { name: `${day} trial requests enabled` });
  const isEnabled = await toggle.getAttribute("aria-checked") === "true";
  if (!isEnabled) await toggle.click();
  await page.getByLabel(`${day} trial window opening time`).fill(opensAt);
  await page.getByLabel(`${day} trial window closing time`).fill(closesAt);
  if (!enabled) await toggle.click();
}
