import { expect, test } from "@playwright/test";
for (const locale of ["en", "ar"] as const) for (const width of [390, 1440]) {
  test(`submitted upgrade correction ${locale} at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await context.addCookies([{ name: "rivet_locale", value: locale, url: baseURL! }]);
    await page.addInitScript(() => { sessionStorage.setItem("rivet.demo.persona", "owner"); sessionStorage.setItem("rivet.demo.plan", "Basic"); });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/settings?section=subscription");
    await page.getByRole("button", { name: locale === "en" ? "Change plan" : "تغيير الباقة", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: locale === "en" ? "Continue to payment" : "المتابعة إلى الدفع" }).click();
    await page.getByRole("radio", { name: locale === "en" ? "CliQ" : "كليك" }).click();
    await page.getByLabel(locale === "en" ? "Reference number" : "رقم المرجع").fill("WRONG-1");
    await page.getByLabel(locale === "en" ? "Name on the paying account" : "الاسم على الحساب الذي دفعت منه").fill("Omar Al-Khatib");
    await page.getByRole("button", { name: locale === "en" ? "Send payment details" : "إرسال بيانات الدفع", exact: true }).click();
    await expect(page.getByRole("button", { name: "Change the details" })).toHaveCount(0);
    await page.getByRole("button", { name: locale === "en" ? "Request a correction" : "طلب تصحيح البيانات" }).click();
    await page.getByLabel(locale === "en" ? "What needs correcting?" : "ما البيانات التي تحتاج إلى تصحيح؟").fill("Please return the details: the reference should be CORRECT-2.");
    await page.getByRole("button", { name: locale === "en" ? "Send correction request" : "إرسال طلب التصحيح" }).click();
    await expect(page.getByText(locale === "en" ? /Your correction request is with RIVET/ : /وصل طلب التصحيح إلى RIVET/)).toBeVisible();
    await expect(page.getByText(/WRONG-1/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`payment-correction-${locale}-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: locale === "en" ? "See it in Support" : "عرض الطلب في الدعم" }).click();
    await expect(page.getByText("Please return the details: the reference should be CORRECT-2.", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
