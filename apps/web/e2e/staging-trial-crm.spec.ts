import { expect, test, type Page } from "@playwright/test";
import { addDays, todayISODate } from "../src/lib/utils/dates";
import { chooseFirstAvailableOption, newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function isoDateFromToday(days: number): string {
  return addDays(todayISODate("Asia/Amman"), days);
}

test.describe("staged trial and simple CRM sale", () => {
  test("books and completes a trial, then creates the member and membership in one sale", async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("trial-crm", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "trial-crm");
    const memberContext = await newRoleContext(browser, "member", baseURL);
    const member = await memberContext.newPage();
    const salespersonContext = await newRoleContext(browser, "salesperson", baseURL);
    const sales = await salespersonContext.newPage();
    const managerContext = await newRoleContext(browser, "manager", baseURL);
    const manager = await managerContext.newPage();
    const ownerContext = await newRoleContext(browser, "owner", baseURL);
    const owner = await ownerContext.newPage();
    let memberUrl: string | undefined;
    let memberCleanup: number | undefined;
    let policyCleanup: number | undefined;
    let dayLabel: string | undefined;
    let originalTrialEnabled = false;
    let originalTrialOpensAt = "";
    let originalTrialClosesAt = "";

    try {
      await owner.goto("/settings?section=operations", { waitUntil: "domcontentloaded" });
      await owner.getByRole("tab", { name: "Rules & hours" }).click();
      await chooseFirstAvailableOption(owner, "Branch schedule");
      for (const day of DAYS) {
        const open = owner.getByRole("checkbox", { name: `${day} open` });
        if (await open.getAttribute("aria-checked") !== "true") continue;
        const opening = await owner.getByLabel(`${day} opening time`).inputValue();
        const closing = await owner.getByLabel(`${day} closing time`).inputValue();
        if (minuteValue(closing) - minuteValue(opening) < 60) continue;
        dayLabel = day;
        const trialEnabled = owner.getByRole("checkbox", { name: `${day} trial requests enabled` });
        originalTrialEnabled = await trialEnabled.getAttribute("aria-checked") === "true";
        if (!originalTrialEnabled) await trialEnabled.click();
        const trialOpening = owner.getByLabel(`${day} trial window opening time`);
        const trialClosing = owner.getByLabel(`${day} trial window closing time`);
        originalTrialOpensAt = await trialOpening.inputValue();
        originalTrialClosesAt = await trialClosing.inputValue();
        const configuredOpening = minuteValue(opening) + 15;
        await trialOpening.fill(timeValue(configuredOpening));
        await trialClosing.fill(timeValue(Math.min(minuteValue(closing), configuredOpening + 60)));
        break;
      }
      if (!dayLabel) throw new Error("The staging gym needs one open branch day with at least a 60-minute window.");
      policyCleanup = cleanup.plan({ targetType: "operational_policy", targetId: dayLabel, action: "preserve", reason: "Restore the original trial schedule after the CRM journey" });
      await owner.getByRole("button", { name: "Save operational rules" }).click();
      await expect(owner.getByText("Operational rules saved and audited.")).toBeVisible();

      await member.goto("/customer/discover", { waitUntil: "domcontentloaded" });
      const gymCard = member.getByRole("article").filter({ has: member.getByRole("link", { name: "View & book" }) }).first();
      await expect(gymCard, "The staging tenant needs one published gym with a configured trial schedule.").toBeVisible();
      await gymCard.getByRole("link", { name: "View & book" }).click();
      const fullName = await member.getByRole("textbox", { name: "Full name" }).inputValue();
      expect(fullName.trim(), "The member Clerk storage state must resolve to a named customer profile.").not.toBe("");
      await member.getByRole("textbox", { name: "What are you looking for?" }).fill(`Staging CRM verification ${guard.runId}`);
      await member.getByRole("combobox", { name: "Branch", exact: true }).selectOption({ index: 1 });

      const date = member.getByLabel("Preferred date");
      const time = member.getByLabel("Time");
      let configured = false;
      for (let offset = 1; offset <= 21; offset += 1) {
        await date.fill(isoDateFromToday(offset));
        if (await time.isEnabled()) {
          const opensAt = await time.getAttribute("min");
          const closesAt = await time.getAttribute("max");
          if (opensAt && closesAt) {
            const midpoint = Math.floor((minuteValue(opensAt) + minuteValue(closesAt)) / 2);
            await time.fill(timeValue(midpoint));
          }
          configured = true;
          break;
        }
      }
      expect(configured, "The published staging gym needs at least one trial time in the next 21 days.").toBe(true);
      await member.getByRole("button", { name: "Send trial request" }).click();
      await expect(member.getByRole("heading", { name: "Your free trial request is recorded." })).toBeVisible();

      await sales.goto("/crm/pipeline", { waitUntil: "domcontentloaded" });
      await sales.getByRole("button", { name: "List" }).click();
      const search = sales.getByPlaceholder(/Search/i);
      await search.fill(fullName);
      const leadLink = sales.getByRole("link", { name: new RegExp(fullName, "i") }).first();
      await expect(leadLink).toBeVisible();
      await leadLink.click();

      const trial = sales.getByTestId("trial-workflow");
      await expect(trial).toContainText("requested");
      await trial.getByRole("button", { name: "Confirm trial" }).click();
      await expect(trial).toContainText("confirmed");
      await trial.getByRole("button", { name: "Completed" }).click();
      const outcome = sales.getByRole("dialog", { name: "Trial completed" });
      await outcome.getByRole("textbox", { name: "Note (optional)" }).fill(`Completed staging trial ${guard.runId}`);
      await outcome.getByRole("button", { name: "Save" }).click();
      await expect(trial).toContainText("completed");

      await sales.getByTestId("sell-membership").click();
      const sale = sales.getByRole("dialog", { name: "Complete membership sale" });
      await sale.getByRole("combobox", { name: "Membership plan" }).click();
      await sales.getByRole("option").first().click();
      await sale.getByTestId("confirm-membership-sale").click();
      await expect(sales).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = sales.url();
      memberCleanup = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable trial and CRM staging journey" });
      await sales.getByTestId("tab-timeline").click();
      await expect(sales.getByTestId("member-timeline")).toContainText(/membership sold/i);
    } finally {
      if (memberUrl && memberCleanup !== undefined) {
        const archived = await archiveMember(manager, memberUrl);
        if (archived) cleanup.complete(memberCleanup);
        else cleanup.fail(memberCleanup, "Converted staging member could not be archived");
      }
      if (policyCleanup !== undefined && dayLabel) {
        try {
          await owner.goto("/settings?section=operations", { waitUntil: "domcontentloaded" });
          await owner.getByRole("tab", { name: "Rules & hours" }).click();
          await chooseFirstAvailableOption(owner, "Branch schedule");
          await restoreTrialWindow(owner, dayLabel, originalTrialEnabled, originalTrialOpensAt, originalTrialClosesAt);
          await owner.getByRole("button", { name: "Save operational rules" }).click();
          await expect(owner.getByText("Operational rules saved and audited.")).toBeVisible();
          cleanup.complete(policyCleanup);
        } catch (error) {
          cleanup.fail(policyCleanup, error);
        }
      }
      await cleanup.attach(testInfo);
      await memberContext.close();
      await salespersonContext.close();
      await managerContext.close();
      await ownerContext.close();
    }
  });
});

function minuteValue(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

async function archiveMember(page: Page, memberUrl: string): Promise<boolean> {
  try {
    await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Archive member/i }).click();
    const dialog = page.getByRole("dialog", { name: /Archive member/i });
    await dialog.getByRole("textbox").fill("Disposable trial and CRM staging journey");
    await dialog.getByRole("button", { name: "Archive member" }).click();
    await expect(dialog).toBeHidden();
    return true;
  } catch {
    return false;
  }
}

async function restoreTrialWindow(page: Page, day: string, enabled: boolean, opensAt: string, closesAt: string) {
  const toggle = page.getByRole("checkbox", { name: `${day} trial requests enabled` });
  const isEnabled = await toggle.getAttribute("aria-checked") === "true";
  if (!isEnabled) await toggle.click();
  await page.getByLabel(`${day} trial window opening time`).fill(opensAt);
  await page.getByLabel(`${day} trial window closing time`).fill(closesAt);
  if (!enabled) await toggle.click();
}
