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
  });

  test("prepares renewal follow-ups that are saved, explained and still there after leaving the page", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterOwner(page);
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

    // Leaving the list and coming back on the client keeps the same run.
    await page.getByRole("button", { name: /At risk/i }).first().click();
    await expect(page.getByTestId("ai-run-panel")).toHaveCount(0);
    await page.getByRole("button", { name: /Renewals/i }).first().click();
    expect(new URL(page.url()).searchParams.get("run")).toBe(runId);
    await expect(page.getByTestId("ai-run-panel")).toHaveAttribute("data-status", "completed");

    // The saved tasks are real tasks a person can open.
    const firstResult = panel.getByTestId("ai-run-results").getByRole("link", { name: "Open" }).first();
    await expect(firstResult).toBeVisible();
    expect(errors.filter((text) => !/Download the React DevTools/.test(text))).toEqual([]);
  });

  test("reads a contact note into fields and keeps the original note", async ({ page }) => {
    await enterOwner(page);
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
  });

  test("prepares a report with checked totals and a shift handover in their own pages", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await enterOwner(page);
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
    await enterOwner(page);
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

  test("works in Arabic on a phone without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
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
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});
