import { expect, test, type Locator, type Page } from "@playwright/test";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe("staged personal training", () => {
  test("reserves one real credit, appears for the assigned trainer in realtime, and releases the credit on cancellation", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("personal-training", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "personal-training");
    const trainerName = process.env.PLAYWRIGHT_STAGING_PT_TRAINER_NAME?.trim();
    if (!trainerName) throw new Error("PLAYWRIGHT_STAGING_PT_TRAINER_NAME must name the published trainer represented by the trainer storage state.");
    const memberContext = await newRoleContext(browser, "member", baseURL);
    const trainerContext = await newRoleContext(browser, "trainer", baseURL);
    const member = await memberContext.newPage();
    const trainer = await trainerContext.newPage();
    let bookingCreated = false;
    let cleanupEntry: number | undefined;

    try {
      await member.goto("/customer/my-gyms", { waitUntil: "domcontentloaded" });
      const welcome = await member.getByRole("heading", { name: /Welcome back,/ }).innerText();
      const customerName = welcome.match(/^Welcome back, (.+)\.$/)?.[1]?.trim();
      expect(customerName, "The PT staging member must resolve to a named member profile.").toBeTruthy();
      await member.getByRole("link", { name: "PT sessions" }).first().click();
      await expect(member.getByRole("tabpanel", { name: "Personal training" })).toBeVisible();

      const availableStat = member.getByText("Available sessions", { exact: true }).locator("..");
      const before = Number(await availableStat.locator("p").nth(1).innerText());
      expect(before, "The dedicated PT staging member needs at least one usable credit.").toBeGreaterThan(0);
      await member.getByLabel("Trainer").selectOption({ label: trainerName });

      let slot: Locator | undefined;
      for (let offset = 1; offset <= 30; offset += 1) {
        await member.getByLabel("Date").fill(isoDateFromToday(offset));
        const buttons = member.getByText("Available times", { exact: true }).locator("..").getByRole("button");
        if (await buttons.count()) {
          slot = buttons.first();
          break;
        }
      }
      if (!slot) throw new Error("The selected staging trainer needs one available slot in the next 30 days.");
      await slot.click();
      await expect(member.getByText("Your PT session is reserved.")).toBeVisible();
      bookingCreated = true;
      cleanupEntry = cleanup.plan({ targetType: "pt_booking", action: "preserve", reason: `Cancel and preserve the audited staging booking created by ${guard.runId}` });
      await expect(availableStat.locator("p").nth(1)).toHaveText(String(before - 1));

      await trainer.goto("/pt", { waitUntil: "domcontentloaded" });
      await expect(trainer.getByRole("heading", { name: "Personal training" })).toBeVisible();
      const assignedSession = trainer.getByRole("article").filter({ hasText: customerName! }).filter({ hasText: trainerName }).first();
      await expect(assignedSession, "The trainer's realtime schedule must receive the member booking without a refresh.").toBeVisible();
      await expect(assignedSession).toContainText("reserved");

      await member.bringToFront();
      await member.getByRole("button", { name: "Cancel", exact: true }).last().click();
      await expect(member.getByText("Booking cancelled. Your credit balance has been updated.")).toBeVisible();
      bookingCreated = false;
      await expect(availableStat.locator("p").nth(1)).toHaveText(String(before));
      if (cleanupEntry !== undefined) cleanup.complete(cleanupEntry);
    } finally {
      if (bookingCreated) {
        const cancelled = await cancelLatestBooking(member);
        if (cleanupEntry !== undefined) {
          if (cancelled) cleanup.complete(cleanupEntry);
          else cleanup.fail(cleanupEntry, "Reserved PT booking could not be cancelled");
        }
      }
      await cleanup.attach(testInfo);
      await memberContext.close();
      await trainerContext.close();
    }
  });
});

async function cancelLatestBooking(page: Page): Promise<boolean> {
  try {
    const cancel = page.getByRole("button", { name: "Cancel", exact: true }).last();
    if (await cancel.isVisible()) await cancel.click();
    await expect(page.getByText("Booking cancelled. Your credit balance has been updated.")).toBeVisible();
    return true;
  } catch {
    return false;
  }
}
