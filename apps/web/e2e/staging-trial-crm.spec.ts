import { expect, test, type Page } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("staged trial and CRM conversion", () => {
  test("books a public trial, closes the follow-up, accepts an offer, and converts without retyping identity", async ({ browser, baseURL }, testInfo) => {
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
        if (await time.locator("option:not([value=''])").count()) {
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
      await trial.getByRole("button", { name: "Confirm" }).click();
      await expect(trial).toContainText("confirmed");
      await trial.getByRole("button", { name: "Complete" }).click();
      const outcome = sales.getByRole("dialog", { name: "Complete free trial" });
      await outcome.getByRole("textbox", { name: "Outcome note" }).fill(`Completed staging trial ${guard.runId}`);
      await outcome.getByRole("button", { name: "Save outcome" }).click();
      await expect(trial).toContainText("completed");

      await sales.getByRole("button", { name: "Create offer" }).click();
      const offer = sales.getByRole("dialog", { name: "Create offer" });
      await offer.getByRole("combobox", { name: "Plan" }).click();
      await sales.getByRole("option").first().click();
      await offer.getByRole("combobox", { name: "Delivery state" }).click();
      await sales.getByRole("option", { name: /Confirm manual delivery/ }).click();
      await offer.getByRole("textbox", { name: "External reference (optional)" }).fill(`staging-${guard.runId}`);
      await offer.getByRole("button", { name: "Confirm manual delivery" }).click();
      await expect(offer).toBeHidden();
      await sales.getByRole("button", { name: "Record accepted" }).click();
      const response = sales.getByRole("dialog", { name: "Record accepted offer" });
      await response.getByRole("textbox", { name: "Response note (optional)" }).fill("Accepted during the isolated staging journey");
      await response.getByRole("button", { name: "Save response" }).click();
      await expect(sales.getByText("accepted", { exact: true }).first()).toBeVisible();

      await sales.getByTestId("convert-lead").click();
      const convert = sales.getByRole("dialog", { name: "Convert to member" });
      await convert.getByTestId("confirm-convert").click();
      await expect(sales).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = sales.url();
      cleanupEntry = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable trial and CRM staging journey" });
      await sales.getByTestId("tab-timeline").click();
      await expect(sales.getByTestId("member-timeline")).toContainText(/converted|offer accepted/i);
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
