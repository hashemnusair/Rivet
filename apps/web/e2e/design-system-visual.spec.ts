import { expect, test, type Page } from "@playwright/test";

test.use({
  colorScheme: "light",
  locale: "en-US",
  reducedMotion: "reduce",
  timezoneId: "Asia/Amman",
});

async function prepare(page: Page) {
  await page.addStyleTag({
    content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}",
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const removeFrameworkChrome = () => {
      document.querySelectorAll("nextjs-portal").forEach((portal) => portal.remove());
    };

    removeFrameworkChrome();
    const observer = new MutationObserver(removeFrameworkChrome);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function disableFrameworkChrome(page: Page) {
  const response = await page.request.post("/__nextjs_disable_dev_indicator");
  expect(response.ok()).toBe(true);
}

async function resetDemoSession(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.sessionStorage.clear());
}

async function signInStaff(page: Page, persona: "Owner" | "Reception") {
  await resetDemoSession(page);
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signInMember(page: Page) {
  await resetDemoSession(page);
  await page.goto("/login/member");
  await page.getByRole("radio", { name: /Lina Haddad/i }).click();
  await page.getByRole("button", { name: /Continue as Lina/i }).click();
  await expect(page).toHaveURL(/\/customer\/my-gyms$/);
}

async function signInPlatform(page: Page) {
  await resetDemoSession(page);
  await page.goto("/login/admin");
  await page.getByRole("button", { name: /Open platform console/i }).click();
  await expect(page).toHaveURL(/\/platform$/);
}

async function capture(page: Page, name: string) {
  await prepare(page);
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    // The committed references are authored on macOS while CI runs Linux.
    // Chromium layout must remain identical, but font rasterization can vary
    // slightly across those hosts. A 4% ceiling catches layout and component
    // regressions while tolerating the observed subpixel glyph differences.
    maxDiffPixelRatio: 0.04,
  });
}

test("commits the representative product UI set", async ({ page }) => {
  await disableFrameworkChrome(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInStaff(page, "Owner");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await capture(page, "owner-dashboard-desktop.png");

  await page.goto("/members");
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
  await capture(page, "members-desktop.png");

  await page.goto("/settings?section=roles");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Permission matrix")).toBeVisible();
  await capture(page, "settings-desktop.png");

  await page.setViewportSize({ width: 820, height: 1180 });
  await signInStaff(page, "Reception");
  await expect(page.getByTestId("reception-search")).toBeVisible();
  await capture(page, "reception-tablet.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await signInMember(page);
  await page.goto("/customer/finance");
  await expect(page.getByRole("heading", { name: "Payments and receipts" })).toBeVisible();
  await capture(page, "member-finance-phone.png");

  await page.setViewportSize({ width: 1440, height: 900 });
  await signInPlatform(page);
  await page.goto("/platform/gyms");
  await expect(page.getByRole("heading", { name: "Gym organizations" })).toBeVisible();
  await capture(page, "platform-gyms-desktop.png");
});

test("commits the product gallery at desktop and phone sizes", async ({ page }) => {
  await disableFrameworkChrome(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/design-system");
  await expect(page.getByRole("heading", { name: "RIVET product system" })).toBeVisible();
  await capture(page, "design-gallery-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/design-system");
  await capture(page, "design-gallery-phone.png");
});
