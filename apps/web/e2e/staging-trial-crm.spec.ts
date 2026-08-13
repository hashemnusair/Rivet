import { expect, test, type Page } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("staged trial and simple CRM sale", () => {
  test("books and completes a trial, then creates the member and membership in one sale", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("trial-crm", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "trial-crm");
    const memberContext = await newRoleContext(browser, "member", baseURL);
    const member = await memberContext.newPage();
    const salespersonContext = await newRoleContext(browser, "salesperson", baseURL);
    const sales = await salespersonContext.newPage();
    const managerContext = await newRoleContext(browser, "manager", baseURL);
    const manager = await managerContext.newPage();
    let memberUrl: string | undefined;
    let cleanupEntry: number | undefined;

    try {
      await member.goto("/customer/discover", { waitUntil: "domcontentloaded" });
      const gymCard = member.getByRole("article").filter({ has: member.getByRole("link", { name: "View & book" }) }).first();
      await expect(gymCard, "The staging tenant needs one published gym with a configured trial schedule.").toBeVisible();
      await gymCard.getByRole("link", { name: "View & book" }).click();
      const fullName = await member.getByRole("textbox", { name: "Full name" }).inputValue();
      expect(fullName.trim(), "The member Clerk storage state must resolve to a named customer profile.").not.toBe("");
      await member.getByRole("textbox", { name: "What are you looking for?" }).fill(`Staging CRM verification ${guard.runId}`);

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
      cleanupEntry = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable trial and CRM staging journey" });
      await sales.getByTestId("tab-timeline").click();
      await expect(sales.getByTestId("member-timeline")).toContainText(/membership sold/i);
    } finally {
      if (memberUrl && cleanupEntry !== undefined) {
        const archived = await archiveMember(manager, memberUrl);
        if (archived) cleanup.complete(cleanupEntry);
        else cleanup.fail(cleanupEntry, "Converted staging member could not be archived");
      }
      await cleanup.attach(testInfo);
      await memberContext.close();
      await salespersonContext.close();
      await managerContext.close();
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
