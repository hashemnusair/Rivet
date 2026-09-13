import { expect, test, type Page } from "@playwright/test";

/**
 * The gym-owned trainer journey in the seeded preview: an owner invites a
 * trainer and manages profiles, a trainer opens the right workspace, keeps
 * their hours and time off, sees the sessions booked with them and records
 * outcomes, and cannot reach another role's pages or another branch.
 *
 * Invitation acceptance itself is Clerk-only and stays with the credentialed
 * staging journey; here the invitation stops at the "invited" row and the
 * trainer picker that refuses it.
 */

test.use({ locale: "en-US", timezoneId: "Asia/Amman", colorScheme: "light" });

const DEMO_PERSONA_KEY = "rivet.demo.persona";
// A Monday inside the seeded trainer's Sunday–Thursday 08:00–17:00 hours.
const MONDAY_MORNING = "2026-09-14T09:00:00+03:00";
const MONDAY_EVENING = "2026-09-14T17:30:00+03:00";

async function enterOwner(page: Page) {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function enterTrainerCold(page: Page) {
  // The trainer is a seeded persona without a quick sign-in card; the same
  // sessionStorage seam the role-routing matrix uses opens their workspace.
  await page.goto("/login/gym");
  await page.evaluate(({ key, value }) => window.sessionStorage.setItem(key, value), { key: DEMO_PERSONA_KEY, value: "trainer" });
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Trainer");
}

/** Hands the open workspace to the trainer without a page load, so what the owner just did is still in the preview's memory. */
async function switchToTrainer(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /^Trainer/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Trainer");
}

async function openSidebarLink(page: Page, name: string) {
  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name }).click();
}

test.describe("trainer account journey (preview)", () => {
  test("an owner invites a trainer, and only active trainer accounts can carry a profile", async ({ page }) => {
    await enterOwner(page);
    await page.goto("/settings?section=users");
    await page.getByRole("tab", { name: "Users" }).click();
    await page.getByRole("button", { name: "Invite user" }).click();
    const invite = page.getByRole("dialog", { name: "Invite user" });
    await invite.getByRole("textbox", { name: "Full name" }).fill("Nour Coach");
    await invite.getByRole("textbox", { name: "Email" }).fill("nour.coach@forgefitness.jo");
    await invite.getByRole("combobox", { name: "Role" }).click();
    await page.getByRole("option", { name: "Trainer", exact: true }).click();
    await invite.getByRole("combobox", { name: "Branch scope" }).click();
    await page.getByRole("option", { name: "Selected branches" }).click();
    const firstBranch = invite.getByRole("checkbox").first();
    if ((await firstBranch.getAttribute("aria-checked")) !== "true") await firstBranch.click();
    await invite.getByRole("button", { name: "Send invite" }).click();
    await expect(invite).toBeHidden();
    await expect(page.getByRole("row", { name: /Nour Coach/ })).toContainText(/invited/i);

    // Client-side navigation keeps the invited row in the preview's memory.
    await openSidebarLink(page, "Personal training");
    await expect(page.getByRole("heading", { name: "Trainer profiles" })).toBeVisible();
    await page.getByRole("button", { name: "Trainer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add a trainer profile" });
    const accounts = dialog.getByRole("combobox", { name: "Trainer account" });
    await expect(accounts.locator("option", { hasText: "Fadi Khoury" })).toHaveCount(1);
    await expect(accounts.locator("option", { hasText: "Nour Coach" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("a trainer sees the session booked with them, keeps their own hours, and records the outcome", async ({ page }) => {
    await page.clock.setFixedTime(new Date(MONDAY_MORNING));
    await enterOwner(page);
    await page.goto("/pt");
    await page.getByRole("button", { name: "Book session", exact: true }).click();
    await page.getByLabel("Find member").fill("Yara");
    await page.getByRole("dialog").getByRole("link", { name: /Yara Sweidan/ }).click();
    await expect(page).toHaveURL(/tab=pt/);
    await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
    await page.getByRole("button", { name: "Book session", exact: true }).click();
    const booking = page.getByRole("dialog", { name: "Book a PT session" });
    await booking.getByLabel("Trainer").selectOption({ label: "Fadi Khoury" });
    const branch = booking.getByLabel("Branch");
    if ((await branch.locator("option").count()) > 1 && !(await branch.inputValue())) await branch.selectOption({ index: 1 });
    await booking.getByLabel("Date").fill("2026-09-14");
    const times = booking.getByText("Available times", { exact: true }).locator("..").getByRole("button");
    await expect.poll(() => times.count()).toBeGreaterThan(0);
    await times.first().click();
    await expect(page.getByText("PT session reserved.")).toBeVisible();

    await switchToTrainer(page);
    await expect(page.getByRole("heading", { name: /^Today, Fadi/ })).toBeVisible();
    await expect(page.getByTestId("trainer-setup-notice")).toHaveCount(0);
    const outcomes = page.getByRole("heading", { name: "Session outcomes" }).locator("xpath=ancestor::section[1]");
    await expect(outcomes).toContainText("Yara Sweidan");
    await expect(outcomes).toContainText("Outcome controls unlock when the session begins.");
    await expect(outcomes.getByRole("button", { name: "Complete" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Assigned members" }).locator("xpath=ancestor::section[1]")).toContainText("Yara Sweidan");

    await openSidebarLink(page, "Personal training");
    await expect(page.getByRole("heading", { name: "Your trainer profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Book session", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "PT packages" })).toHaveCount(0);
    const row = page.getByTestId("pt-booking-row").filter({ hasText: "Yara Sweidan" });
    await expect(row).toContainText("with Fadi Khoury");
    await expect(row.getByRole("button", { name: "Cancel" })).toBeVisible();

    // Hours and time off belong to the trainer.
    await page.getByRole("button", { name: "Availability" }).click();
    const availability = page.getByRole("dialog", { name: "Fadi Khoury availability" });
    await availability.getByLabel("Date").fill("2026-09-21");
    await availability.getByLabel("Reason").fill("Leave");
    await availability.getByRole("button", { name: "Add time off" }).click();
    await expect(availability).toContainText("2026-09-21 · all day · Leave");
    await availability.getByRole("button", { name: "Save availability" }).click();
    await expect(page.getByText("Trainer availability and time off saved.")).toBeVisible();
    await page.getByRole("button", { name: "Availability" }).click();
    await expect(page.getByRole("dialog", { name: "Fadi Khoury availability" })).toContainText("2026-09-21 · all day · Leave");
    await page.getByRole("dialog", { name: "Fadi Khoury availability" }).getByRole("button", { name: "Cancel" }).click();

    // Later that day the session has started: the trainer records it.
    await page.clock.setFixedTime(new Date(MONDAY_EVENING));
    await openSidebarLink(page, "Dashboard");
    const started = page.getByRole("heading", { name: "Session outcomes" }).locator("xpath=ancestor::section[1]");
    await expect(started).toContainText("Awaiting outcome");
    await started.getByRole("button", { name: "Complete" }).click();
    const confirm = page.getByRole("dialog", { name: "Complete PT session?" });
    await expect(confirm).toContainText("Yara Sweidan");
    await confirm.getByRole("button", { name: "Complete session" }).click();
    await expect(page.getByText("PT session completed.")).toBeVisible();
    await expect(started).toContainText("No PT sessions today");
  });

  test("setup guidance names the missing step while the profile is a draft", async ({ page }) => {
    await enterOwner(page);
    await page.goto("/pt");
    await page.getByRole("button", { name: "Edit profile" }).first().click();
    const edit = page.getByRole("dialog", { name: "Edit trainer profile" });
    await edit.getByRole("combobox", { name: "Publication" }).selectOption("draft");
    await edit.getByRole("button", { name: "Save trainer" }).click();
    await expect(page.getByText("Trainer profile saved.")).toBeVisible();

    await switchToTrainer(page);
    const notice = page.getByTestId("trainer-setup-notice");
    await expect(notice).toContainText("Your trainer profile is still a draft");
    await expect(notice).toContainText("owner or manager publishes");
    await expect(page.getByText("Bookings open once your profile and hours are set up.")).toBeVisible();
    await notice.getByRole("link", { name: "Set availability" }).click();
    await expect(page).toHaveURL(/\/pt$/);
    await page.getByTestId("trainer-setup-notice").getByRole("button", { name: "Set availability" }).click();
    await expect(page.getByRole("dialog", { name: "Fadi Khoury availability" })).toBeVisible();
  });

  test("a trainer stays inside their role, branch and navigation by direct URL", async ({ page }) => {
    await enterTrainerCold(page);
    const sidebar = page.locator('aside[aria-label="Primary navigation"]');
    await expect(sidebar.getByRole("link", { name: "Personal training" })).toBeVisible();
    for (const hidden of ["Settings", "Leads", "Follow-ups", "Payments", "Reports", "Audit log", "Checkout"]) {
      await expect(sidebar.getByRole("link", { name: hidden })).toHaveCount(0);
    }
    // Selected-branch staff get their branch as a fixed label, not a picker.
    await expect(page.getByRole("combobox", { name: "Active branch" })).toHaveCount(0);
    await expect(page.getByText("Forge — Abdoun", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Organization settings" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Getting started" })).toBeVisible();
    await page.keyboard.press("Escape");

    for (const path of ["/settings", "/finance", "/audit", "/payments", "/crm/pipeline", "/checkout"]) {
      await page.goto(path);
      // A cold dev-server compile of a route can outlast the default expectation.
      await expect(page.getByRole("heading", { name: "Not allowed for this role" }), path).toBeVisible({ timeout: 30_000 });
    }
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Platform overview" })).toHaveCount(0);
  });
});
