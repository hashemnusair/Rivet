import { expect, test } from "@playwright/test";
for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test(`owner Pro capacity labels ${locale} at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await context.addCookies([{ name: "rivet_locale", value: locale, url: baseURL! }]);
    await page.addInitScript(() => { sessionStorage.setItem("rivet.demo.plan", "Basic"); sessionStorage.setItem("rivet.demo.persona", "owner"); });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/settings?section=subscription");
    await page.getByRole("button", { name: locale === "en" ? "Change plan" : "تغيير الباقة", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const pro = dialog.getByRole("radio", { name: /Pro/ });
    await expect(pro).toContainText(locale === "en" ? "Unlimited" : "غير محدود");
    await expect(pro).not.toContainText("-1");
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath(`owner-upgrade-${locale}-${width}.png`) });
    expect(errors).toEqual([]);
  });
}
