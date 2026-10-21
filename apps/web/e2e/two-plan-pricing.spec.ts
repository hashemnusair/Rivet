import { test, expect } from "@playwright/test";

for (const locale of ["en", "ar"] as const) {
  for (const width of [390, 1440]) {
    test(`${locale} pricing and signup at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await context.addCookies([{ name: "rivet_locale", value: locale, url: baseURL ?? "http://localhost:3100" }]);
      await page.goto("/#pricing");
      const pricing = page.locator("#pricing");
      await expect(pricing.getByText("Basic", { exact: true })).toBeVisible();
      await expect(pricing.getByText("Pro", { exact: true })).toBeVisible();
      await expect(pricing.getByText(/Enterprise|Growth|Starter/)).toHaveCount(0);
      await expect(pricing.getByTestId("website-offer").getByRole("heading", { name: locale === "en" ? /first 3 gyms/ : /أول 3 من الأندية/ })).toBeVisible();
      await expect(pricing.getByText(locale === "en" ? "Unlimited branches" : "فروع غير محدودة")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await pricing.screenshot({ path: testInfo.outputPath(`${locale}-${width}.png`), animations: "disabled" });
      await pricing.getByRole("tab", { name: locale === "en" ? /Annual/ : /سنويًا/ }).click();
      const basicLink = pricing.locator('a[href="/signup?plan=Basic&interval=annual"]');
      await basicLink.click();
      await expect(page).toHaveURL(/signup\?plan=Basic&interval=annual/);
      await expect(page.getByRole("radio", { name: /Basic/ })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("radio")).toHaveCount(2);
      await expect(page.getByText(/633\.600/).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
