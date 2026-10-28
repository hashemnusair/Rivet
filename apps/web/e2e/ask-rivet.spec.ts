import { expect, test, type Page } from "@playwright/test";

/**
 * Wazen (Ask RIVET in code) in the credential-free preview. The preview runs the same answer
 * loop, tools and context sources as the server with RIVET's labelled test
 * model, so these journeys verify the panel, its context and its states; the
 * server path and Claude are covered in convex/ai.chat.test.ts.
 */

test.use({ timezoneId: "Asia/Amman" });

async function enterPlatformAdmin(page: Page) {
  await page.goto("/login/admin");
  await page.getByRole("button", { name: /Open platform console/i }).click();
  await expect(page).toHaveURL(/\/platform$/);
}

async function makeGymAvailable(page: Page) {
  await enterPlatformAdmin(page);
  await page.goto("/platform/assistance");
  const panel = page.getByTestId("platform-assistance-availability");
  await panel.getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await panel.getByTestId("platform-assistance-availability-reason").fill("Ask RIVET preview");
  await panel.getByTestId("platform-assistance-make-available").click();
  await expect(panel.getByTestId("platform-assistance-gym")).toHaveCount(1);
  await page.getByRole("button", { name: /^(Sign out|تسجيل الخروج)$/ }).first().click();
  await expect(page).toHaveURL(/\/login$/);
}

async function enterOwner(page: Page) {
  await page.goto("/login/gym");
  await page.getByRole("radio").first().click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function turnOnAssistance(page: Page, mode = /Prepare and save work|تجهيز العمل وحفظه/) {
  await page.goto("/settings?section=assistance");
  const section = page.getByTestId("assistance-settings");
  await section.getByRole("radio", { name: mode }).click();
  await page.getByRole("button", { name: /^(Save changes|حفظ التغييرات)$/ }).click();
  await expect(page.getByRole("button", { name: /^(Save changes|حفظ التغييرات)$/ })).toBeHidden();
}

async function openFirstMember(page: Page) {
  await page.getByRole("link", { name: /^(Members|الأعضاء)$/ }).first().click();
  await page.locator("table tbody tr a").first().click();
  await expect(page).toHaveURL(/\/members\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

test.describe("Wazen", () => {
  test("stays hidden until RIVET makes the gym available and the gym turns assistance on", async ({ page }) => {
    await enterOwner(page);
    await expect(page.getByTestId("app-topbar")).toBeVisible();
    await expect(page.getByTestId("ask-rivet-launcher")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+j");
    await expect(page.getByTestId("ask-rivet-panel")).toHaveCount(0);
  });

  test("answers about the screen with its record attached, linked records and a folded work log", async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await openFirstMember(page);
    const name = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";

    await page.keyboard.press("ControlOrMeta+j");
    const panel = page.getByTestId("ask-rivet-panel");
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(panel).toHaveAttribute("data-mode", "popup");
    await expect(panel.getByTestId("ask-attached")).toContainText(name);
    await expect(panel.getByTestId("ask-test-badge")).toBeVisible();
    await expect(panel.getByTestId("ask-prompts")).toContainText(name.split(" ")[0]!);
    await expect(panel.getByTestId("ask-input")).toBeFocused();

    await panel.getByTestId("ask-prompts").getByRole("button").first().click();
    const answer = panel.getByTestId("ask-answer").last();
    // The work shows while it happens, then folds into one line.
    await expect(answer.getByTestId("ask-worklog")).toBeVisible();
    await expect(answer).toHaveAttribute("data-status", "complete", { timeout: 20_000 });
    await expect(answer.getByTestId("ask-worklog")).toHaveAttribute("data-state", "done");
    await expect(answer.getByTestId("ask-record-link").first()).toContainText(name);
    await expect(panel.getByTestId("ask-user-message")).toContainText(name);

    // A follow-up about many people goes gym-wide and links the filtered list.
    await panel.getByTestId("ask-input").fill("Which members owe money?");
    await page.keyboard.press("Enter");
    const second = panel.getByTestId("ask-answer").nth(1);
    await expect(second).toHaveAttribute("data-status", "complete", { timeout: 20_000 });
    await expect(second.getByRole("table")).toBeVisible();
    await second.getByTestId("ask-screen-link").click();
    await expect(page).toHaveURL(/\/members\?membership=outstanding/);
    // Floating in the corner, the window stays open while the person follows links.
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(panel.getByTestId("ask-title")).toContainText(/Brief me|before/);
    expect(errors).toEqual([]);
  });

  test("stops an answer on request and keeps the conversation usable", async ({ page }) => {
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await page.getByTestId("ask-rivet-launcher").click();
    const panel = page.getByTestId("ask-rivet-panel");
    await panel.getByTestId("ask-input").fill("Who should I call about renewals this week?");
    await page.keyboard.press("Enter");
    // The settings toast is still showing; it must have moved clear of the panel's Stop button.
    await expect(panel.getByTestId("ask-stop")).toBeVisible();
    await panel.getByTestId("ask-stop").click({ timeout: 5_000 });
    const answer = panel.getByTestId("ask-answer").last();
    await expect(answer).toHaveAttribute("data-status", "stopped", { timeout: 10_000 });
    await expect(answer).toContainText("Stopped");
    await expect(panel.getByTestId("ask-send")).toBeVisible();
    await panel.getByTestId("ask-input").fill("What needs my attention today?");
    await page.keyboard.press("Enter");
    await expect(panel.getByTestId("ask-answer").last()).toHaveAttribute("data-status", "complete", { timeout: 20_000 });
  });

  test("attaches members by name with @ and from the screen's suggestions", async ({ page }) => {
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await openFirstMember(page);
    await page.getByTestId("ask-rivet-launcher").click();
    const panel = page.getByTestId("ask-rivet-panel");
    await panel.getByTestId("ask-suggestion").first().click();
    await expect(panel.getByTestId("ask-attached").getByTestId("ask-context-chip")).toHaveCount(2);
    await panel.getByTestId("ask-input").click();
    await page.keyboard.type("compare with @a", { delay: 30 });
    const options = page.getByTestId("ask-mentions").getByRole("option");
    await expect(options.first()).toBeVisible();
    const picked = (await options.first().locator("bdi").first().textContent())?.trim() ?? "";
    await page.keyboard.press("Enter");
    await expect(panel.getByTestId("ask-attached")).toContainText(picked);
    await expect(panel.getByTestId("ask-input")).toHaveValue("compare with ");
  });

  test("asks from search", async ({ page }) => {
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox", { name: /search/i }).fill("What needs my attention today?");
    await page.getByRole("option", { name: /Ask Wazen: “What needs my attention today\?”/ }).click();
    const panel = page.getByTestId("ask-rivet-panel");
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(panel.getByTestId("ask-user-message")).toContainText("What needs my attention today?");
    await expect(panel.getByTestId("ask-answer").last()).toHaveAttribute("data-status", "complete", { timeout: 20_000 });
  });

  test("works full screen in Arabic on a phone without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await makeGymAvailable(page);
    const encoded = encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: null, pending: "ask-rivet" }));
    await page.context().addCookies([
      { name: "rivet_locale", value: "ar", domain: "localhost", path: "/" },
      { name: "rivet_ui_locale_v1", value: encoded, domain: "localhost", path: "/" },
    ]);
    await enterOwner(page);
    await turnOnAssistance(page);
    await page.goto("/dashboard");
    await page.getByTestId("ask-rivet-launcher").click();
    const panel = page.getByTestId("ask-rivet-panel");
    await expect(panel).toHaveAttribute("data-mode", "full");
    await expect(panel.getByTestId("ask-prompts")).toContainText("ما الذي يتطلب انتباهي اليوم؟");
    await panel.getByTestId("ask-prompts").getByRole("button").nth(2).click();
    const answer = panel.getByTestId("ask-answer").last();
    await expect(answer).toHaveAttribute("data-status", "complete", { timeout: 20_000 });
    await expect(answer).toContainText("عدد الاشتراكات التي تنتهي");
    await expect(answer).toContainText(/تشرين|كانون/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // Following a record link on a phone closes the panel so the record is visible.
    await answer.getByTestId("ask-record-link").first().click();
    await expect(page).toHaveURL(/\/members\/[^/]+$/);
    await expect(panel).toHaveAttribute("data-state", "closed");
  });

  test("floats over the page at every desktop and tablet size without moving it", async ({ page }) => {
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await openFirstMember(page);
    const panel = page.getByTestId("ask-rivet-panel");
    for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [1024, 768], [768, 1024]] as const) {
      await page.setViewportSize({ width, height });
      const column = async () => {
        const box = (await page.locator("main").boundingBox())!;
        return { x: box.x, width: box.width };
      };
      const before = await column();
      await page.getByTestId("ask-rivet-launcher").click();
      await expect(panel).toHaveAttribute("data-state", "open");
      await expect(panel).toHaveAttribute("data-mode", "popup");
      // The page keeps its width: nothing reflows under the window.
      expect(await column()).toEqual(before);
      for (const size of ["compact", "large"] as const) {
        await expect(panel).toHaveAttribute("data-size", size);
        await page.waitForTimeout(320);
        const box = (await panel.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y + box.height).toBeLessThanOrEqual(height);
        await expect(panel.getByTestId("ask-input")).toBeVisible();
        if (size === "compact") await panel.getByTestId("ask-size").click();
      }
      await expect(panel.getByTestId("ask-rail")).toHaveCount(width >= 900 ? 1 : 0);
      await panel.getByTestId("ask-size").click();
      await panel.getByTestId("ask-close").click();
      await expect(panel).toHaveAttribute("data-state", "closed");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  });

  test("renews a membership only after the person confirms the card", async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await openFirstMember(page);
    await expect(page.getByTestId("member-next-term")).toHaveCount(0);
    await page.getByTestId("ask-rivet-launcher").click();
    const panel = page.getByTestId("ask-rivet-panel");
    await panel.getByTestId("ask-input").fill("Renew his membership");
    await page.keyboard.press("Enter");
    const card = panel.getByTestId("ask-action");
    await expect(card).toHaveAttribute("data-status", "proposed", { timeout: 20_000 });
    await expect(card).toContainText("Nothing changes until you confirm.");
    // Nothing has changed on the page yet.
    await expect(page.getByTestId("member-next-term")).toHaveCount(0);
    await card.getByTestId("ask-action-confirm").click();
    await expect(card).toHaveAttribute("data-status", "done");
    await expect(card).toContainText("Membership renewed");
    // The member's page shows the new term at once. It starts after the current one, so its
    // charge is due then and the card does not offer to collect it today.
    await expect(page.getByTestId("member-next-term")).toBeVisible();
    await expect(card.getByTestId("ask-action-collect")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("asks from the home screen's chatbox", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await makeGymAvailable(page);
    await enterOwner(page);
    await turnOnAssistance(page);
    await page.goto("/dashboard");
    const box = page.getByTestId("ask-rivet-chatbox");
    await expect(box).toBeVisible();
    await page.getByTestId("ask-rivet-chatbox-input").fill("What needs my attention today?");
    await page.keyboard.press("Enter");
    const panel = page.getByTestId("ask-rivet-panel");
    await expect(panel).toHaveAttribute("data-state", "open");
    await expect(box).toHaveAttribute("inert", "");
    await expect(panel.getByTestId("ask-user-message")).toContainText("What needs my attention today?");
    await expect(panel.getByTestId("ask-answer").last()).toHaveAttribute("data-status", "complete", { timeout: 20_000 });
    // The conversation is kept: closing and reopening shows it, and the list has it.
    await panel.getByTestId("ask-close").click();
    await page.getByTestId("ask-rivet-chatbox").getByRole("button").click();
    await expect(panel.getByTestId("ask-user-message")).toContainText("What needs my attention today?");
    await panel.getByTestId("ask-history").click();
    await expect(panel.getByTestId("ask-thread")).toHaveCount(1);
  });
});
