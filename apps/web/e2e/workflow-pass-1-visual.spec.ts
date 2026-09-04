import { expect, test, type Page } from "@playwright/test";

test.use({
  colorScheme: "light",
  locale: "en-US",
  reducedMotion: "reduce",
  timezoneId: "Asia/Amman",
});

async function disableFrameworkChrome(page: Page) {
  const response = await page.request.post("/__nextjs_disable_dev_indicator");
  expect(response.ok()).toBe(true);
}

async function signIn(page: Page, persona: "Owner" | "Reception") {
  await page.goto("/");
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByRole("button", { name: /^Open .+ workspace$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function prepare(page: Page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}",
  });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function capture(page: Page, name: string) {
  await prepare(page);
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.04,
  });
}

test("captures the tablet front desk command path", async ({ page }) => {
  await disableFrameworkChrome(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await signIn(page, "Reception");

  await expect(page.getByTestId("reception-search")).toBeFocused();
  await capture(page, "workflow-reception-tablet.png");

  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Choose items" })).toBeVisible();
  await capture(page, "workflow-checkout-tablet.png");
});

test("captures the owner member path on a phone", async ({ page }) => {
  await disableFrameworkChrome(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Owner");

  await page.goto("/members");
  await expect(page.getByTestId("member-card").first()).toBeVisible();
  await capture(page, "workflow-members-phone.png");

  await page.getByTestId("member-card").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/members\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await capture(page, "workflow-member-detail-phone.png");

  await page.goto("/members/new");
  await expect(page.getByRole("dialog", { name: "Add member" })).toBeVisible();
  await capture(page, "workflow-member-create-phone.png");
});

test("captures finance and migration at narrow widths", async ({ page }) => {
  await disableFrameworkChrome(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "Owner");

  await page.goto("/payments");
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await capture(page, "workflow-payments-phone.png");

  await page.goto("/members/import");
  await expect(page.getByRole("heading", { name: "Import members" })).toBeVisible();
  await capture(page, "workflow-member-import-phone.png");

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/payments/shifts");
  await expect(page.getByRole("heading", { name: "Shifts & cash" })).toBeVisible();
  await capture(page, "workflow-shifts-tablet.png");
});
