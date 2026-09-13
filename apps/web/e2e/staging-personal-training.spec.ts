import { expect, test, type Locator, type Page } from "@playwright/test";
import { addDays, todayISODate } from "../src/lib/utils/dates";
import { newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

/**
 * Credentialed staging journey: a real member reserves one PT credit with the
 * trainer represented by the trainer storage state, the trainer's already
 * open workspace receives the session without a reload, the member cancels
 * through the current confirmation dialog, and the credit comes back. The
 * only record written is that booking, and cleanup cancels exactly it.
 *
 * Required beyond the shared staging guard: PLAYWRIGHT_STAGING_PT_TRAINER_NAME
 * (the published display name of the trainer state). The member must belong
 * to at least one subscribed gym; PLAYWRIGHT_STAGING_PT_GYM_NAME picks one
 * when the member has several, otherwise the first subscribed gym is used.
 */

function isoDateFromToday(days: number): string {
  return addDays(todayISODate("Asia/Amman"), days);
}

test.describe("staged personal training", () => {
  test("reserves one real credit, appears for the assigned trainer in realtime, and releases the credit on cancellation", async ({ browser, baseURL }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    test.setTimeout(180_000);
    const guard = requireStagingJourney("personal-training", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "personal-training");
    const trainerName = process.env.PLAYWRIGHT_STAGING_PT_TRAINER_NAME?.trim();
    if (!trainerName) throw new Error("PLAYWRIGHT_STAGING_PT_TRAINER_NAME must name the published trainer represented by the trainer storage state.");
    const gymName = process.env.PLAYWRIGHT_STAGING_PT_GYM_NAME?.trim();
    const memberContext = await newRoleContext(browser, "member", baseURL);
    const trainerContext = await newRoleContext(browser, "trainer", baseURL);
    const member = await memberContext.newPage();
    const trainer = await trainerContext.newPage();
    let createdBooking: Locator | undefined;
    let cleanupEntry: number | undefined;

    try {
      // The trainer's workspace is open before anything is booked, so the
      // session must arrive through the live subscription, not a reload.
      await trainer.goto("/pt", { waitUntil: "domcontentloaded" });
      await expect(trainer.getByRole("heading", { name: "Personal training" })).toBeVisible();
      const trainerRows = trainer.getByTestId("pt-booking-row");
      const priorTrainerRows = await trainerRows.allTextContents();

      await member.goto("/customer/my-gyms", { waitUntil: "domcontentloaded" });
      const customerName = (await member.getByRole("heading", { name: /^Hi,/ }).innerText()).replace(/^Hi,\s*/, "").trim();
      expect(customerName, "The PT staging member must resolve to a named member profile.").toBeTruthy();
      const gymLinks = member.getByRole("region", { name: "Subscribed gyms" }).getByRole("link");
      await expect.poll(() => gymLinks.count(), { message: "The PT staging member needs at least one subscribed gym." }).toBeGreaterThan(0);
      const gymLink = gymName ? gymLinks.filter({ hasText: gymName }).first() : gymLinks.first();
      await expect(gymLink, gymName ? `The member must be subscribed to ${gymName}.` : "").toBeVisible();
      await gymLink.click();
      await member.getByRole("tab", { name: "PT", exact: true }).click();
      await expect(member.getByRole("tabpanel", { name: "Personal training" })).toBeVisible();

      const availableStat = member.getByText("Available sessions", { exact: true }).locator("..");
      const before = Number(await availableStat.locator("p").nth(1).innerText());
      expect(before, "The dedicated PT staging member needs at least one usable credit.").toBeGreaterThan(0);
      await member.getByLabel("Trainer").selectOption({ label: trainerName });
      const branch = member.getByLabel("Branch");
      await expect.poll(() => branch.locator("option").count(), { message: "The PT trainer needs one assigned branch." }).toBeGreaterThan(1);
      if (!(await branch.inputValue())) await branch.selectOption({ index: 1 });

      let slot: Locator | undefined;
      let slotDate = "";
      for (let offset = 1; offset <= 30; offset += 1) {
        slotDate = isoDateFromToday(offset);
        await member.getByLabel("Date").fill(slotDate);
        const buttons = member.getByText("Available times", { exact: true }).locator("..").getByRole("button");
        const empty = member.getByText("No open slots on this date.", { exact: true });
        await expect.poll(async () => (await buttons.count()) > 0 || await empty.isVisible(), {
          message: `PT availability for day ${offset} did not finish loading.`,
        }).toBe(true);
        if (await buttons.count()) {
          slot = buttons.first();
          break;
        }
      }
      if (!slot) throw new Error("The selected staging trainer needs one available slot in the next 30 days.");
      const slotLabel = (await slot.innerText()).trim();
      const bookingList = member.getByRole("heading", { name: "Upcoming bookings" }).locator("xpath=ancestor::section[1]");
      const bookingArticles = bookingList.getByRole("article");
      const priorBookingTexts = await bookingArticles.allTextContents();

      await slot.click();
      await expect(member.getByText("Your PT session is reserved.")).toBeVisible();
      cleanupEntry = cleanup.plan({ targetType: "pt_booking", targetId: `${trainerName} ${slotDate} ${slotLabel}`, action: "preserve", reason: `Cancel and preserve the audited staging booking created by ${guard.runId}` });
      await expect(availableStat.locator("p").nth(1)).toHaveText(String(before - 1));
      await expect.poll(() => bookingArticles.count(), { message: "The new PT booking must appear in the member schedule." }).toBe(priorBookingTexts.length + 1);
      // The one article that was not there before, and only that one, is ours.
      const newTexts = (await bookingArticles.allTextContents()).filter((text) => text.includes(trainerName) && !priorBookingTexts.includes(text));
      expect(newTexts, "Exactly one new booking must be attributable to this run.").toHaveLength(1);
      createdBooking = bookingArticles.filter({ hasText: newTexts[0]! }).first();
      await expect(createdBooking).toContainText(slotLabel);

      // Realtime: the trainer page was open the whole time and never reloaded.
      await expect.poll(() => trainerRows.count(), { message: "The trainer's live schedule must receive the member booking without a refresh." }).toBe(priorTrainerRows.length + 1);
      const assignedSession = trainerRows.filter({ hasText: customerName! }).filter({ hasText: slotLabel }).first();
      await expect(assignedSession).toBeVisible();
      await expect(assignedSession).toContainText("reserved");

      // The member cancels through the confirmation dialog, which states the credit consequence.
      await createdBooking.getByRole("button", { name: "Cancel", exact: true }).click();
      const confirm = member.getByRole("dialog", { name: "Cancel your PT session?" });
      await expect(confirm).toContainText(trainerName);
      await expect(confirm.getByRole("status")).toContainText("Your reserved credit will be returned.");
      await confirm.getByRole("button", { name: "Cancel session" }).click();
      await expect(member.getByText("Booking cancelled. Your credit was returned.")).toBeVisible();
      createdBooking = undefined;
      await expect(availableStat.locator("p").nth(1)).toHaveText(String(before));
      await expect.poll(() => trainerRows.count(), { message: "The cancelled session must leave the trainer's live schedule." }).toBe(priorTrainerRows.length);
      if (cleanupEntry !== undefined) cleanup.complete(cleanupEntry);
    } finally {
      if (createdBooking) {
        const cancelled = await cancelExactBooking(member, createdBooking);
        if (cleanupEntry !== undefined) {
          if (cancelled) cleanup.complete(cleanupEntry);
          else cleanup.fail(cleanupEntry, "The PT booking created by this run could not be cancelled");
        }
      }
      await cleanup.attach(testInfo);
      await memberContext.close();
      await trainerContext.close();
    }
  });
});

/** Cancels only the booking article this run created, never the member's other sessions. */
async function cancelExactBooking(page: Page, booking: Locator): Promise<boolean> {
  try {
    await booking.getByRole("button", { name: "Cancel", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Cancel your PT session?" });
    await confirm.getByRole("button", { name: "Cancel session" }).click();
    await expect(page.getByText(/Booking cancelled\. Your credit was returned\.|Cancelled after the cutoff\. One PT credit was used\./)).toBeVisible();
    return true;
  } catch {
    return false;
  }
}
