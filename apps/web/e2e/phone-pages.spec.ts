import { expect, test, type Browser, type Page } from "@playwright/test";

// A phone is a small touch screen (src/lib/routing/phone-pages.ts). The other
// specs' 390px checks run with a mouse, like a narrow desktop window, and keep
// every page; these run as a real phone does.
async function openPhone(browser: Browser, baseURL: string | undefined, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ baseURL, viewport, hasTouch: true, isMobile: true });
  return { context, page: await context.newPage() };
}

async function signInOwner(page: Page) {
  await page.goto("/login/gym");
  // The owner is listed first; the persona label is translated in Arabic.
  await page.getByRole("radio").first().click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Phones get the short list of gym pages", () => {
  test("an owner's phone shows the key numbers and only the phone pages", async ({ browser, baseURL }) => {
    const { context, page } = await openPhone(browser, baseURL);
    try {
      await signInOwner(page);
      await expect(page.getByRole("region", { name: "Key numbers" })).toContainText("Collected today");
      await expect(page.getByRole("region", { name: "Today" })).toHaveCount(0);

      await page.getByRole("button", { name: "Open menu" }).click();
      const menu = page.getByRole("dialog", { name: "Menu" }).getByRole("navigation");
      await expect(menu.getByRole("link")).toHaveText(["Dashboard", "Reception", "Members", "Classes", "Personal training"]);
    } finally {
      await context.close();
    }
  });

  test("a page that is not on phones points to a computer or tablet", async ({ browser, baseURL }) => {
    const { context, page } = await openPhone(browser, baseURL);
    try {
      await signInOwner(page);
      await page.goto("/payments");
      await expect(page.getByRole("status")).toContainText("This page is for a computer or tablet");
      await page.getByRole("link", { name: "Go to Reception" }).click();
      await expect(page).toHaveURL(/\/reception$/);
    } finally {
      await context.close();
    }
  });

  test("members keeps finding and adding people but not bulk work", async ({ browser, baseURL }) => {
    const { context, page } = await openPhone(browser, baseURL);
    try {
      await signInOwner(page);
      await page.goto("/members");
      await expect(page.getByTestId("add-member")).toBeVisible();
      await expect(page.locator('a[href="/members/import"], a[href="/members/duplicates"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("the message reads in Arabic without sideways scrolling", async ({ browser, baseURL }) => {
    const { context, page } = await openPhone(browser, baseURL);
    try {
      const encoded = encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: null }));
      await context.addCookies([
        { name: "rivet_locale", value: "ar", domain: "localhost", path: "/" },
        { name: "rivet_ui_locale_v1", value: encoded, domain: "localhost", path: "/" },
      ]);
      await signInOwner(page);
      await page.goto("/reports");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByRole("status")).toContainText("هذه الصفحة متاحة على الكمبيوتر أو الجهاز اللوحي");
      await expect(page.getByRole("link", { name: "الانتقال إلى الاستقبال" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("a touch tablet keeps the full workspace", async ({ browser, baseURL }) => {
    const { context, page } = await openPhone(browser, baseURL, { width: 768, height: 1024 });
    try {
      await signInOwner(page);
      await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
      await page.goto("/payments");
      await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a narrow desktop window keeps every page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInOwner(page);
    await page.goto("/payments");
    await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
  });
});
