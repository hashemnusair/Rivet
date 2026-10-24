import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test(`mixed billing and cancelled exports ${locale} at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    const status = width === 390 ? "pending_payment" : "suspended";
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await context.addCookies([{ name: "rivet_locale", value: locale, url: baseURL! }]);
    await page.addInitScript(value => { sessionStorage.setItem("rivet.demo.persona", "owner"); sessionStorage.setItem("rivet.demo.billingCompanion", value); sessionStorage.setItem("rivet.demo.cancelledAt", new Date().toISOString()); }, status);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/billing");
    const nav = page.getByRole("navigation", { name: locale === "en" ? "Your available gym access" : "الأندية المتاحة لحسابك" });
    await nav.getByRole("link", { name: /Cancelled Preview Gym/ }).click();
    await expect(page).toHaveURL(/\/exports\?organizationId=preview-cancelled-gym$/);
    await expect(page.locator('aside[aria-label="Primary navigation"]')).toHaveCount(0);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: locale === "en" ? "Download CSV" : "تنزيل ملف CSV", exact: true }).first().click();
    expect((await readFile((await (await download).path())!, "utf8")).length).toBeGreaterThan(100);
    await expect(page.getByRole("region", { name: locale === "en" ? "Recent downloads" : "الملفات التي نُزّلت مؤخرًا", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`mixed-access-${locale}-${width}.png`), fullPage: true });
    await nav.getByRole("link", { name: /Forge Fitness Club/ }).click();
    await expect(page).toHaveURL(/\/billing\?organizationId=10000000-0000-4a00-8a00-000000000001$/);
    await expect(page.getByText("Forge Fitness Club", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: locale === "en" ? "CliQ" : "كليك" })).toBeVisible();
    await nav.getByRole("link", { name: /Cancelled Preview Gym/ }).click();
    await expect(page.getByRole("button", { name: locale === "en" ? "Download CSV" : "تنزيل ملف CSV", exact: true }).first()).toBeEnabled();
    expect(errors).toEqual([]);
  });
}
