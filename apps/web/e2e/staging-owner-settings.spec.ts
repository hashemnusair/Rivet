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
  test("persists an exact branch trial time and restores the original policy", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("owner-settings", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "owner-settings");
    const context = await newRoleContext(browser, "owner", baseURL);
    const page = await context.newPage();
    let cleanupEntry: number | undefined;
    let trialInputName: string | undefined;
    let originalTimes: string | undefined;
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
        const trial = page.getByLabel(`${day} trial times, comma separated`);
        const current = (await trial.inputValue()).split(",").map((item) => item.trim()).filter(Boolean);
        const candidate = Array.from({ length: 48 }, (_, index) => index * 30)
          .find((minutes) => minutes >= minuteValue(opening) && minutes + 60 <= minuteValue(closing) && !current.includes(timeValue(minutes)));
        if (candidate === undefined) continue;
        trialInputName = `${day} trial times, comma separated`;
        originalTimes = current.join(", ");
        await trial.fill([...current, timeValue(candidate)].join(", "));
        break;
      }
      if (!trialInputName || originalTimes === undefined) throw new Error("The staging gym needs one open branch day with an unused 60-minute trial start.");
      cleanupEntry = cleanup.plan({ targetType: "operational_policy", targetId: trialInputName, action: "preserve", reason: "Restore the original trial schedule after staging verification" });
      await page.getByRole("button", { name: "Save operational rules" }).click();
      await expect(page.getByText("Operational rules saved and audited.")).toBeVisible();
      const changedTimes = await page.getByLabel(trialInputName).inputValue();
      expect(changedTimes).not.toBe(originalTimes);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "Rules & hours" }).click();
      await expect(page.getByLabel(trialInputName)).toHaveValue(changedTimes);

      await page.getByLabel(trialInputName).fill(originalTimes);
      await page.getByRole("button", { name: "Save operational rules" }).click();
      await expect(page.getByText("Operational rules saved and audited.")).toBeVisible();
      if (cleanupEntry !== undefined) cleanup.complete(cleanupEntry);
    } finally {
      if (cleanupEntry !== undefined && originalTimes !== undefined && trialInputName) {
        try {
          if (await page.getByLabel(trialInputName).inputValue() !== originalTimes) {
            await page.getByLabel(trialInputName).fill(originalTimes);
            await page.getByRole("button", { name: "Save operational rules" }).click();
            await expect(page.getByText("Operational rules saved and audited.")).toBeVisible();
          }
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
