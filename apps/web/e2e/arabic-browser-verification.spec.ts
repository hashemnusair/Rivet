import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";

const OUT = process.env.RTL_SHOTS ?? join(tmpdir(), "rivet-arabic-rtl-evidence");

test.use({ colorScheme: "light", locale: "ar-JO", reducedMotion: "reduce", timezoneId: "Asia/Amman" });
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function seedArabicFirstPaint(page: Page) {
  // This represents a choice made before sign-in. Seeding cookies in the
  // browser context lets the server choose Arabic before it returns HTML.
  const encoded = encodeURIComponent(JSON.stringify({
    version: 1,
    locale: "ar",
    owner: null,
    pending: "browser-rtl-verification",
  }));
  await page.context().addCookies([
    { name: "rivet_locale", value: "ar", domain: "localhost", path: "/" },
    { name: "rivet_ui_locale_v1", value: encoded, domain: "localhost", path: "/" },
  ]);
}

async function signInOwner(page: Page) {
  await page.goto("/login/gym", { waitUntil: "commit" });
  await expect(page.getByRole("radio").first()).toBeVisible();
  await page.getByRole("radio").first().click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signInMember(page: Page) {
  await page.goto("/login/member", { waitUntil: "commit" });
  await expect(page.getByRole("radio", { name: /Lina Haddad/i })).toBeVisible();
  await page.getByRole("radio", { name: /Lina Haddad/i }).click();
  await page.getByTestId("member-continue").click();
  await expect(page).toHaveURL(/\/customer\/my-gyms$/);
}

async function signInPlatform(page: Page) {
  await page.goto("/login/admin", { waitUntil: "commit" });
  await expect(page.getByTestId("admin-continue")).toBeVisible();
  await page.getByTestId("admin-continue").click();
  await expect(page).toHaveURL(/\/platform$/);
}

async function checkNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowingElements = scrollWidth <= clientWidth + 1 ? [] : Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          testId: element.dataset.testid,
          className: typeof element.className === "string" ? element.className.slice(0, 100) : "",
          text: element.innerText?.trim().replace(/\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter((element) => element.right > clientWidth + 1 || element.left < -1 || element.scrollWidth > element.clientWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 12);
    return { clientWidth, scrollWidth, overflowingElements };
  });
  expect(
    dimensions.scrollWidth,
    `horizontal overflow at ${dimensions.clientWidth}px; elements: ${JSON.stringify(dimensions.overflowingElements)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function waitForResponsiveShell(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="app-scroll-shell"]')?.parentElement;
    return shell?.getAnimations().some((animation) => animation.playState === "running") ?? false;
  })).toBe(false);
}

function withoutBidiMarks(value: string) {
  return value.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
}

async function screenshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, animations: "disabled" });
}

async function switchToEnglishWithKeyboard(page: Page) {
  const accountMenu = page.getByRole("button", { name: "قائمة الحساب" });
  await accountMenu.focus();
  await page.keyboard.press("Enter");

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const languageItem = page.getByTestId("language-switch");
  await expect(languageItem).toBeVisible();
  expect(await languageItem.evaluate((element) => Boolean(element.closest("[data-radix-popper-content-wrapper]")))).toBe(true);

  // Inspect live Radix menuitem nodes and their actual focus state before and
  // after physical ArrowDown input. A nested active descendant is accepted.
  const menuItems = menu.getByRole("menuitem");
  const readMenuFocus = () => menuItems.evaluateAll((items) => {
    const active = document.activeElement;
    const descriptors = items.map((item, index) => ({
      index,
      testId: item.getAttribute("data-testid"),
      text: item.textContent?.trim(),
      active: item === active,
      containsActive: item.contains(active),
      tabIndex: (item as HTMLElement).tabIndex,
      highlighted: item.hasAttribute("data-highlighted"),
    }));
    return {
      activeElement: active ? { tag: active.tagName, role: active.getAttribute("role"), testId: (active as HTMLElement).dataset?.testid } : null,
      descriptors,
      activeIndex: descriptors.find((item) => item.active || item.containsActive)?.index ?? -1,
      languageIndex: descriptors.find((item) => item.testId === "language-switch")?.index ?? -1,
    };
  });
  const beforeArrow = await readMenuFocus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await readMenuFocus()).activeIndex).not.toBe(beforeArrow.activeIndex);
  const afterArrowDown = await readMenuFocus();

  const menuItemCount = await menuItems.count();
  expect(menuItemCount).toBeGreaterThan(0);
  expect(await languageItem.count()).toBe(1);
  let activeIndex = afterArrowDown.activeIndex;
  for (let step = 0; step < menuItemCount; step += 1) {
    if (activeIndex === afterArrowDown.languageIndex) break;
    const expectedIndex = (activeIndex + 1) % menuItemCount;
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await readMenuFocus()).activeIndex).toBe(expectedIndex);
    activeIndex = expectedIndex;
  }
  await expect(languageItem).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
}

test("serves Arabic on public first paint and preserves a staff draft through keyboard locale switching", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedArabicFirstPaint(page);

  const landingResponse = await page.goto("/");
  expect(landingResponse).not.toBeNull();
  const landingHtml = await landingResponse!.text();
  expect(landingHtml).toMatch(/<html\b[^>]*\blang="ar"[^>]*\bdir="rtl"/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 }).first()).toContainText("كل تفاصيل ناديك و مشتركينه في مكان واحد");
  await checkNoHorizontalOverflow(page);
  await screenshot(page, "public-home-ar-desktop");

  await signInOwner(page);
  await page.goto("/support");
  const reply = page.getByRole("textbox", { name: "إرسال رد للدعم" });
  await expect(reply).toBeVisible();
  await reply.fill("Browser verification draft; do not send.");
  await screenshot(page, "staff-support-ar-desktop");

  // 820px is tablet. 390px is the requested narrow phone. A 720 CSS-pixel
  // viewport is half of the 1440px desktop width and exercises 200% reflow.
  for (const [width, height] of [[820, 1180], [390, 844], [720, 900]] as const) {
    await page.setViewportSize({ width, height });
    await waitForResponsiveShell(page);
    await checkNoHorizontalOverflow(page);
    if (width === 390) await screenshot(page, "staff-support-ar-phone-390");
    if (width === 720) await screenshot(page, "staff-support-ar-zoom-200-equivalent");
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForResponsiveShell(page);
  await switchToEnglishWithKeyboard(page);
  await expect(page.getByRole("textbox", { name: "Reply to support" })).toHaveValue("Browser verification draft; do not send.");

  const persistedResponse = await page.reload();
  expect(persistedResponse).not.toBeNull();
  const persistedHtml = await persistedResponse!.text();
  expect(persistedHtml).toMatch(/<html\b[^>]*\blang="en"[^>]*\bdir="ltr"/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await checkNoHorizontalOverflow(page);
});

test("renders a member membership route in Arabic at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedArabicFirstPaint(page);
  await signInMember(page);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/customer/my-gyms/membership-lina-forge");
  await expect(page.getByRole("heading", { name: "Forge Fitness Club" })).toBeVisible();
  await expect(page.getByText("ABD-2214")).toBeVisible();
  await expect(page.getByRole("button", { name: "اعرض رمز QR عند الاستقبال." })).toBeVisible();
  await checkNoHorizontalOverflow(page);
  await screenshot(page, "member-membership-ar-phone-390");
});

test("keeps phone, receipt reference, and money readable together in an Arabic receipt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedArabicFirstPaint(page);
  await signInOwner(page);
  await page.goto("/payments");
  const firstReceiptLink = page.getByTestId("receipt-link").first();
  await expect(firstReceiptLink).toBeVisible();
  const receiptReference = (await firstReceiptLink.innerText()).trim();
  expect(receiptReference).toMatch(/^R-\d+$/);
  const paymentRow = firstReceiptLink.locator("xpath=ancestor::li[1]");
  const localizedMoney = await paymentRow.locator('bdi[dir="auto"]').first().textContent();
  expect(withoutBidiMarks(localizedMoney ?? "")).toMatch(/^\d+(?:,\d{3})*\.\d{3} د\.أ$/);
  await firstReceiptLink.click();

  const receipt = page.locator("#receipt-print");
  await expect(receipt).toBeVisible();
  await expect(receipt.getByRole("heading", { name: "Forge Fitness Club" })).toBeVisible();
  await expect(receipt.locator("p[dir='ltr']").first()).toContainText(/^\+962/);
  await expect(receipt.getByText(receiptReference, { exact: true })).toBeVisible();
  await expect(receipt.locator("span[dir='ltr']").first()).toHaveText(/^\d+\.\d{3}$/);
  const currencyFooter = await receipt.getByText(/المبالغ بعملة/).textContent();
  expect(withoutBidiMarks(currencyFooter ?? "")).toBe("JOD · المبالغ بعملة دينار أردني");
  await checkNoHorizontalOverflow(page);
  await screenshot(page, "staff-payment-receipt-ar-phone-390");
});

test("renders the platform console in Arabic at desktop and tablet widths", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedArabicFirstPaint(page);
  await signInPlatform(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "نظرة عامة على المنصة" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Forge Fitness Club/ }).first()).toBeVisible();
  await checkNoHorizontalOverflow(page);
  await screenshot(page, "platform-overview-ar-desktop");

  await page.setViewportSize({ width: 820, height: 1180 });
  await checkNoHorizontalOverflow(page);
  await screenshot(page, "platform-overview-ar-tablet");
});

test("downloads the real Arabic terms PDF with searchable title and embedded Unicode mappings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedArabicFirstPaint(page);
  const response = await page.goto("/terms");
  expect(response).not.toBeNull();
  const html = await response!.text();
  expect(html).toMatch(/<html\b[^>]*\blang="ar"[^>]*\bdir="rtl"/);
  await expect(page.getByRole("heading", { name: "شروط الاستخدام", exact: true })).toBeVisible();
  await screenshot(page, "public-terms-ar-desktop");

  const downloadEvent = page.waitForEvent("download");
  await page.getByTestId("download-document-pdf").click();
  const download = await downloadEvent;
  const destination = `${OUT}/terms-arabic-real-download.pdf`;
  await download.saveAs(destination);
  const bytes = await readFile(destination);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.byteLength).toBeGreaterThan(20_000);

  const pdfObjects = bytes.toString("latin1");
  const titleUtf16Hex = Array.from("RIVET شروط الاستخدام", (character) => character.charCodeAt(0).toString(16).padStart(4, "0")).join("").toUpperCase();
  expect(pdfObjects).toContain(`<FEFF${titleUtf16Hex}>`);
  expect(pdfObjects).toContain("/ToUnicode");
  expect(pdfObjects).toContain("/FontFile2");
});


test("fresh visitors can choose Arabic on public, login and platform surfaces", async ({ page }) => {
  // No seeded locale: exercise the controls that actual visitors must discover.
  await page.goto("/");
  // The switch sits in the bar beside "Sign in", not inside the menu.
  await page.getByRole("banner").getByRole("button", { name: "Switch to Arabic" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("كل تفاصيل ناديك و مشتركينه في مكان واحد");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => Array.from(document.fonts).some(face =>
    face.family.includes("Plex") && face.family.includes("Arabic") && !face.family.includes("Fallback") && face.status === "loaded",
  ))).toBe(true);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/login/admin");
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "h1" });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(fonts.some(font => font.familyName.includes("Plex") && font.familyName.includes("Arabic") && font.glyphCount > 0)).toBe(true);
  await cdp.detach();
  await page.getByTestId("language-switch").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByTestId("admin-continue").click();
  await expect(page).toHaveURL(/\/platform$/);
  await page.getByTestId("language-switch").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.setViewportSize({ width: 360, height: 800 });
  await checkNoHorizontalOverflow(page);
});
