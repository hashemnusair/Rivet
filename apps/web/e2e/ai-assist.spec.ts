import { expect, test, type Page } from "@playwright/test";

/**
 * RIVET assistance in the credential-free preview. The preview adapter uses
 * the same shared decision code as Convex but is explicitly a simulation:
 * these journeys verify the screens, states and truthful wording, not the
 * real backend (see convex/ai.delegation.test.ts for that).
 */

test.use({ timezoneId: "Asia/Amman" });

async function enterOwner(page: Page) {
  await page.goto("/login/gym");
  await page.getByRole("radio").first().click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function enterPlatformAdmin(page: Page) {
  await page.goto("/login/admin");
  await page.getByRole("button", { name: /Open platform console/i }).click();
  await expect(page).toHaveURL(/\/platform$/);
}

/** Platform console: the sign-out button sits in the console header. */
async function signOut(page: Page) {
  await page.getByRole("button", { name: /^(Sign out|تسجيل الخروج)$/ }).first().click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Gym workspace: sign-out of the demo persona is in the account menu. */
async function signOutOfWorkspace(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out of demo" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** No gym can use assistance until a platform admin makes it available, so each journey starts there. */
async function changeGymAvailability(page: Page, available: boolean, reason: string) {
  await enterPlatformAdmin(page);
  await page.goto("/platform/assistance");
  const panel = page.getByTestId("platform-assistance-availability");
  if (available) {
    await expect(panel.getByTestId("platform-assistance-none")).toBeVisible();
    await panel.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await panel.getByTestId("platform-assistance-availability-reason").fill(reason);
    await panel.getByTestId("platform-assistance-make-available").click();
    await expect(panel.getByTestId("platform-assistance-gym")).toHaveCount(1);
  } else {
    await expect(panel.getByTestId("platform-assistance-gym")).toHaveCount(1);
    await panel.getByTestId("platform-assistance-availability-reason").fill(reason);
    await panel.getByTestId("platform-assistance-remove").click();
    await expect(panel.getByTestId("platform-assistance-none")).toBeVisible();
  }
  await signOut(page);
}

async function enterAvailableOwner(page: Page) {
  await changeGymAvailability(page, true, "Preview pilot gym");
  await enterOwner(page);
}

async function turnOnAssistance(page: Page, mode: "Prepare only" | "Prepare and save work" | "تجهيز العمل وحفظه") {
  await page.goto("/settings?section=assistance");
  const section = page.getByTestId("assistance-settings");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("assistance-provider")).toBeVisible();
  await section.getByRole("radio", { name: new RegExp(mode) }).click();
  await page.getByRole("button", { name: /^(Save changes|حفظ التغييرات)$/ }).click();
  await expect(page.getByRole("button", { name: /^(Save changes|حفظ التغييرات)$/ })).toBeHidden();
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function noHorizontalOverflow(page: Page) {
  return await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

test.describe("RIVET assistance", () => {
  test("stays out of the way until an owner turns it on", async ({ page }) => {
    await enterOwner(page);
    await page.goto("/crm/queues?view=renewals");
    await expect(page.getByTestId("follow-up-results")).toBeVisible();
    await expect(page.getByTestId("prepare-follow-ups")).toHaveCount(0);
    await expect(page.getByTestId("renewal-row-headline")).toHaveCount(0);
  });

  test("stays hidden from a gym until RIVET makes it available, and stops again when that is removed", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterOwner(page);
    await page.goto("/settings?section=roles");
    await expect(page.getByRole("heading", { name: "Roles & access" }).first()).toBeVisible();
    await expect(page.getByTestId("assistance-link")).toHaveCount(0);
    await page.goto("/settings?section=assistance");
    await expect(page.getByTestId("assistance-settings-unavailable")).toContainText("RIVET has not made assistance available for your gym yet.");
    await expect(page.getByTestId("assistance-mode-execute")).toHaveCount(0);
    await signOutOfWorkspace(page);

    await enterAvailableOwner(page);
    await page.goto("/settings?section=roles");
    await expect(page.getByTestId("assistance-link")).toContainText("Now: Off");
    await turnOnAssistance(page, "Prepare and save work");
    await page.goto("/crm/queues?view=renewals");
    await expect(page.getByTestId("prepare-follow-ups")).toBeVisible();
    await signOutOfWorkspace(page);

    // Removing availability hides assistance again; the gym's ordinary work is unchanged.
    await changeGymAvailability(page, false, "Pilot paused");
    await enterOwner(page);
    await page.goto("/crm/queues?view=renewals");
    await expect(page.getByTestId("follow-up-results")).toBeVisible();
    await expect(page.getByTestId("prepare-follow-ups")).toHaveCount(0);
    await page.goto("/settings?section=roles");
    await expect(page.getByTestId("assistance-link")).toHaveCount(0);
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("prepares renewal follow-ups that are saved, explained and still there after leaving the page", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    await page.goto("/crm/queues?view=renewals");
    const prepare = page.getByTestId("prepare-follow-ups");
    await expect(prepare).toBeVisible();
    await prepare.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByTestId("ai-run-panel");
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/[?&]run=/);
    await expect(panel).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    await expect(panel.getByTestId("ai-run-stage")).toHaveText("Ready");
    await expect(panel.getByTestId("ai-run-counts")).toContainText(/Created: \d+/);
    await expect(panel.getByText("Test mode: prepared by RIVET's test reader, not a live model.")).toBeVisible();
    const runId = new URL(page.url()).searchParams.get("run");
    expect(runId).toBeTruthy();
    // Each visible row carries its member's one-line brief.
    await expect(page.getByTestId("follow-up-results").getByTestId("renewal-row-headline").first()).toBeVisible();

    // Leaving the list and coming back on the client keeps the same run.
    await page.getByRole("button", { name: /At risk/i }).first().click();
    await expect(page.getByTestId("ai-run-panel")).toHaveCount(0);
    await page.getByRole("button", { name: /Renewals/i }).first().click();
    expect(new URL(page.url()).searchParams.get("run")).toBe(runId);
    await expect(page.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "completed");

    // The saved tasks are real tasks a person can open.
    const firstResult = panel.getByTestId("ai-run-results").getByRole("link", { name: "Open" }).first();
    await expect(firstResult).toBeVisible();
    // A call that turns out not to be needed is closed and counted, once.
    const notNeeded = panel.getByTestId("ai-run-mark-not-needed");
    const before = await notNeeded.count();
    await notNeeded.first().click();
    await expect(panel.getByTestId("ai-run-not-needed")).toHaveCount(1);
    await expect(notNeeded).toHaveCount(before - 1);
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("reads a contact note into fields and keeps the original note", async ({ page }) => {
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare only");
    await page.goto("/crm/queues?view=renewals");
    await page.getByTestId("follow-up-results").getByRole("button").filter({ hasText: /ends \d/i }).first().click();
    const selected = page.getByTestId("follow-up-panel");
    await expect(selected.getByTestId("member-brief")).toBeVisible();
    await selected.getByRole("button", { name: "Log contact" }).click();
    const dialog = page.getByRole("dialog", { name: "Log contact" });
    await expect(dialog.getByTestId("member-brief-headline")).toBeVisible();
    await dialog.getByTestId("contact-notes").fill("No answer, try again tomorrow evening");
    await dialog.getByTestId("note-assist-fill").click();
    await expect(dialog.getByTestId("note-assist-suggestions")).toBeVisible();
    await dialog.getByTestId("note-assist-use-all").click();
    await expect(dialog.getByRole("radio", { name: "No answer" })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByText("Call at 18:00")).toBeVisible();
    await expect(dialog.getByTestId("contact-notes")).toHaveValue("No answer, try again tomorrow evening");
    // Hiding the suggestions keeps what the person already chose and wrote.
    await dialog.getByTestId("note-assist-dismiss").click();
    await expect(dialog.getByTestId("note-assist-suggestions")).toHaveCount(0);
    await expect(dialog.getByRole("radio", { name: "No answer" })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByTestId("contact-notes")).toHaveValue("No answer, try again tomorrow evening");
  });

  test("prepares a report with checked totals and a shift handover in their own pages", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    await page.goto("/reports");
    await page.getByTestId("prepare-report").click();
    await page.getByTestId("prepare-report-start").click();
    const report = page.getByTestId("ai-run-panel");
    await expect(report).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    const artifact = report.getByTestId("ai-artifact");
    await expect(artifact).toHaveAttribute("data-kind", "management_report");
    await expect(artifact.getByTestId("ai-artifact-verification")).toHaveText("Totals checked against the payments list.");
    await expect(artifact.getByTestId("ai-artifact-section-money")).toContainText("Collected:");

    await page.goto("/checklists");
    await page.getByTestId("prepare-handover").click();
    await page.getByTestId("prepare-handover-start").click();
    const handover = page.getByTestId("ai-run-panel");
    await expect(handover).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    await expect(handover.getByTestId("ai-artifact")).toHaveAttribute("data-kind", "shift_handover");
    await expect(handover.getByTestId("ai-artifact")).toContainText("Handover for");
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("looks into a cash difference and says plainly when nothing recorded matches it", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    // The seeded Abdoun drawer closed 7.000 short and is waiting for approval.
    await page.goto("/payments/shifts?branch=10000000-0000-4a00-8a00-000000000002");
    await page.getByTestId("check-cash-difference").filter({ visible: true }).first().click();
    const panel = page.getByTestId("ai-run-panel");
    await expect(panel).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]run=/);
    const artifact = panel.getByTestId("ai-artifact");
    await expect(artifact).toHaveAttribute("data-kind", "cash_difference");
    await expect(artifact.getByTestId("ai-artifact-section-difference")).toContainText("Cash short:");
    await expect(artifact.getByTestId("ai-artifact-section-candidates")).toContainText("Nothing recorded in this shift matches the difference exactly.");
    await expect(artifact.getByTestId("ai-artifact-section-candidates")).toContainText("RIVET cannot see the cash drawer.");
    // Nothing to approve: RIVET prepares an approval only for an exact match.
    await expect(panel.getByTestId("ai-proposal")).toHaveCount(0);
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("brings a prepared cash approval to Today and approves it from there", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    // One client-side session from here: the preview keeps records made here only until a full page load.
    await page.goto("/members?membership=outstanding");
    await page.getByTestId("member-filters").waitFor();
    await page.locator('main a[href^="/members/"]:not([href^="/members/duplicates"]):not([href^="/members/import"]):not([href^="/members/new"])').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/members\/[^/?]+/);
    // A cash payment of 7.300: no other recorded payment, or pair of payments, makes that amount.
    await page.getByTestId("collect-outstanding").click();
    const collect = page.getByRole("dialog", { name: "Collect payment" });
    await collect.getByTestId("payment-amount").fill("7.300");
    await collect.getByTestId("payment-method").click();
    await page.getByRole("option", { name: "Cash", exact: true }).click();
    await collect.getByTestId("confirm-payment").click();
    await expect(collect).toBeHidden();
    const receipt = page.getByRole("dialog", { name: "Cash collected" });
    await expect(receipt).toContainText("7.300");
    // The receipt names the branch whose drawer took the cash: "{time} · {branch}".
    const takenAt = (await receipt.getByText(/^Receipt /).locator("xpath=following-sibling::p[1]").textContent())!;
    const branchName = takenAt.split(" · ").at(-1)!.trim();
    await receipt.getByRole("button", { name: "Done" }).click();
    await expect(receipt).toBeHidden();

    // The drawer is closed 7.300 short: counted as if that cash never arrived.
    await page.locator('aside[aria-label="Primary navigation"] a[href="/payments"]').click();
    await page.locator('a[href="/payments/shifts"]').first().click();
    await expect(page).toHaveURL(/\/payments\/shifts/);
    const picker = page.getByRole("combobox", { name: "Branch" }).first();
    if (!(await picker.textContent())?.includes(branchName)) {
      await picker.click();
      await page.getByRole("option", { name: branchName, exact: true }).click();
    }
    await page.getByTestId("close-shift").click();
    const close = page.getByRole("dialog", { name: "Close shift" });
    await expect(close.getByTestId("confirm-close-shift")).toBeEnabled();
    const expectedText = (await close.getByTestId("variance-panel").textContent())!;
    const expectedMinor = Math.round(Number(/expected[^\d]*([\d,.]+)/i.exec(expectedText)![1]!.replace(/,/g, "")) * 1000);
    let left = expectedMinor - 7_300;
    for (const [label, minor] of [["50", 50_000], ["20", 20_000], ["10", 10_000], ["5", 5_000], ["1", 1_000], ["0.5", 500], ["0.10", 100]] as const) {
      const count = Math.floor(left / minor);
      left -= count * minor;
      if (count) await close.getByTestId(`denom-${label}`).fill(String(count));
    }
    expect(left).toBe(0);
    await close.getByTestId("variance-explanation").fill("Counted twice; one cash payment is not in the drawer");
    await close.getByTestId("confirm-close-shift").click();
    await expect(close).toBeHidden();

    await page.getByTestId("check-cash-difference").filter({ visible: true }).first().click();
    const panel = page.getByTestId("ai-run-panel");
    await expect(panel).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    await expect(panel.getByTestId("ai-proposal")).toHaveCount(1);
    // A single prepared change approves on its own; grouped approval is only for two or more.
    await expect(panel.getByTestId("ai-proposals-approve-all-button")).toHaveCount(0);

    // The approval waits on Today, in place of the drawer's own item, and opens the work that holds it.
    await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Dashboard" }).click();
    const waiting = page.locator('[data-item-id^="ai-proposal:"]');
    await expect(waiting).toBeVisible({ timeout: 20_000 });
    await expect(waiting).toContainText("A prepared change is waiting for approval");
    await waiting.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/payments\/shifts\?run=/);
    const proposal = page.getByTestId("ai-proposal");
    await proposal.getByTestId("ai-proposal-approve").click();
    await expect(proposal).toHaveAttribute("data-status", "executed");
    await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await expect(page.locator('[data-item-id^="ai-proposal:"]')).toHaveCount(0);
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("prepares lead follow-ups from the pipeline with drafts a person sends", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    await page.goto("/crm/pipeline");
    await page.getByTestId("prepare-lead-follow-ups").click();
    const panel = page.getByTestId("ai-run-panel");
    await expect(panel).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
    await expect(page).toHaveURL(/[?&]run=/);
    await expect(panel.getByTestId("ai-run-counts")).toContainText(/Created: \d+/);
    const results = panel.getByTestId("ai-run-results");
    await expect(results.getByText(/^Follow up with /).first()).toBeVisible();
    // Drafts are copied or opened by a person; nothing was sent.
    await expect(results.getByText("Message", { exact: true }).first()).toBeVisible();
    await results.getByRole("link", { name: "Open" }).first().click();
    await expect(page).toHaveURL(/\/crm\/leads\//);
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("leaves out a lead who asked not to be contacted, and says why", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    await page.goto("/crm/pipeline");
    await page.getByTestId("prepare-lead-follow-ups").click();
    const first = page.getByTestId("ai-run-panel");
    await expect(first).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
    const firstResult = first.getByTestId("ai-run-results").locator("li").first();
    const name = (await firstResult.locator("span.font-medium").first().textContent())!.trim();
    await firstResult.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/crm\/leads\//);
    const consent = page.getByTestId("lead-contact-consent");
    await consent.getByTestId("lead-contact-consent-mark").click();
    await page.getByLabel("Note (optional)").fill("Asked us to stop calling");
    await page.getByTestId("lead-contact-consent-confirm").click();
    await expect(consent.getByTestId("lead-contact-consent-state")).toContainText("No, asked not to be contacted");
    // Back through the app's own link, so the preview keeps what was just recorded.
    await page.getByRole("navigation", { name: /breadcrumb/i }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/crm\/pipeline/);
    await page.getByTestId("prepare-lead-follow-ups").click();
    const second = page.getByTestId("ai-run-panel");
    await expect(second).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
    const left = second.getByTestId("ai-run-exclusions").locator("li").filter({ hasText: name });
    await expect(left).toContainText("Asked not to be contacted");
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("turns a plain request into the members list's own filters", async ({ page }) => {
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare only");
    await page.goto("/members");
    const filters = page.getByTestId("natural-filters");
    await filters.getByTestId("natural-filters-input").fill("members who owe money and haven't visited in 2 weeks");
    await filters.getByTestId("natural-filters-interpret").click();
    await expect(filters.getByTestId("natural-filters-membership")).toHaveText("Membership: Owes money");
    await expect(filters.getByTestId("natural-filters-not-applied")).toContainText("Not visited for 14 days isn't a filter on this list.");
    await filters.getByTestId("natural-filters-apply").click();
    await expect(page).toHaveURL(/[?&]membership=outstanding/);
    // The ordinary control now shows the filter, ready to change.
    await expect(page.getByRole("combobox", { name: /Membership/ })).toContainText("Owes money");
  });

  test("prepares an unsaved collections call list beside the owes-money filter", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare only");
    await page.goto("/members?membership=outstanding");
    const panel = page.getByTestId("collection-calls");
    await panel.getByTestId("collection-calls-prepare").click();
    const list = panel.getByTestId("collection-calls-list");
    await expect(list.getByTestId("collection-call").first()).toBeVisible();
    await expect(list.getByTestId("collection-call").first()).toContainText(/Owes /);
    await expect(list.getByTestId("collection-call").first()).toContainText(/overdue|Due today/);
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("finds a class a member can take and books it through the roster rules", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterAvailableOwner(page);
    await turnOnAssistance(page, "Prepare and save work");
    await page.goto("/members?membership=active");
    await page.getByTestId("member-filters").waitFor();
    await page.locator('main a[href^="/members/"]:not([href^="/members/duplicates"]):not([href^="/members/import"]):not([href^="/members/new"])').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/members\/[^/?]+/);
    const finder = page.getByTestId("class-finder");
    await finder.getByTestId("class-finder-find").click();
    const option = finder.getByTestId("class-option").first();
    await expect(option).toBeVisible();
    await expect(option).toContainText(/spots? left/);
    await option.getByTestId("class-option-book").click();
    const panel = finder.getByTestId("ai-run-panel");
    await expect(panel).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    await expect(panel.getByTestId("ai-run-results")).toBeVisible();
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("works in Arabic on a phone without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await changeGymAvailability(page, true, "Preview pilot gym");
    const encoded = encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: null, pending: "ai-assist" }));
    await page.context().addCookies([
      { name: "rivet_locale", value: "ar", domain: "localhost", path: "/" },
      { name: "rivet_ui_locale_v1", value: encoded, domain: "localhost", path: "/" },
    ]);
    await enterOwner(page);
    await turnOnAssistance(page, "تجهيز العمل وحفظه");
    expect(await noHorizontalOverflow(page)).toBe(true);
    await page.goto("/crm/queues?view=renewals");
    await page.getByTestId("prepare-follow-ups").click();
    const panel = page.getByTestId("ai-run-panel");
    await expect(panel).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
    await expect(panel.getByTestId("ai-run-stage")).toHaveText("جاهز");
    await expect(panel.getByTestId("ai-run-counts")).toContainText("تم إنشاؤها");
    // The calls RIVET saved read in Arabic, though each task keeps its stored English title too.
    await expect(panel.getByTestId("ai-run-results").getByText(/^الاتصال بـ .+ بشأن تجديد الاشتراك/).first()).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
