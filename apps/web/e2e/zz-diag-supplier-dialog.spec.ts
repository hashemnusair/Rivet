import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", contextOptions: { reducedMotion: "reduce" }, colorScheme: "light" });
const branch = "10000000-0000-4a00-8a00-000000000002";
const out = path.resolve(process.cwd(), "diag-out");
fs.mkdirSync(out, { recursive: true });

async function enter(page: Page, fixed: boolean) {
  if (fixed) await page.clock.setFixedTime(new Date("2026-09-05T09:00:00+03:00"));
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /Owner/i }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.request.post("/__nextjs_disable_dev_indicator");
}

async function snap(page: Page, label: string) {
  return page.evaluate((label) => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]');
    const submit = document.querySelector<HTMLElement>('[data-testid="confirm-supplier-payment"]');
    const r = (el: Element | null | undefined) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height), left: Math.round(b.left), width: Math.round(b.width) }; };
    const cs = dialog ? getComputedStyle(dialog) : null;
    const form = dialog?.querySelector("form");
    return {
      label, t: Math.round(performance.now()), now: new Date().toString(),
      inner: { w: innerWidth, h: innerHeight }, vv: window.visualViewport ? { h: window.visualViewport.height, top: window.visualViewport.offsetTop, scale: window.visualViewport.scale } : null,
      docScroll: { top: document.scrollingElement?.scrollTop, h: document.scrollingElement?.scrollHeight, ch: document.documentElement.clientHeight },
      dialog: dialog ? { rect: r(dialog), scrollTop: dialog.scrollTop, scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight, transform: cs?.transform, animation: cs?.animationName, maxHeight: cs?.maxHeight, overflowY: cs?.overflowY, display: cs?.display, gridTemplateRows: cs?.gridTemplateRows } : null,
      children: dialog ? Array.from(dialog.children).map((c) => ({ tag: c.tagName, cls: (c as HTMLElement).className.slice(0, 60), rect: r(c) })) : null,
      formChildren: form ? Array.from(form.children).map((c) => ({ tag: c.tagName, text: (c.textContent ?? "").slice(0, 80), rect: r(c) })) : null,
      submit: submit ? { rect: r(submit), disabled: (submit as HTMLButtonElement).disabled, text: submit.textContent } : null,
      active: document.activeElement ? `${document.activeElement.tagName} ${(document.activeElement.textContent ?? "").slice(0, 40)} ${document.activeElement.getAttribute("aria-label") ?? ""}` : null,
      status: Array.from(dialog?.querySelectorAll('[role="status"],[role="alert"]') ?? []).map((n) => (n.textContent ?? "").slice(0, 120)),
      fonts: document.fonts.status,
    };
  }, label);
}

async function ratio(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve) => {
    const el = document.querySelector('[data-testid="confirm-supplier-payment"]');
    if (!el) return resolve(-1);
    const io = new IntersectionObserver((entries) => { resolve(entries[0]!.intersectionRatio); io.disconnect(); });
    io.observe(el);
  }));
}

for (const fixed of [true, false]) {
  for (const height of [600, 844]) {
    test(`diag supplier dialog fixed=${fixed} h=${height}`, async ({ page }, info) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 390, height });
      await enter(page, fixed);
      const log: unknown[] = [];
      page.on("console", (m) => log.push({ console: m.type(), text: m.text().slice(0, 300) }));
      page.on("pageerror", (e) => log.push({ pageerror: e.message }));
      await page.goto(`/operations/payables?branch=${branch}`);
      log.push({ serverHeaderDate: (await page.request.get("/login")).headers()["date"] });
      await page.getByRole("button", { name: "Record payment", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Record supplier payment", exact: true });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 6; i++) { log.push(await snap(page, `open+${i * 100}`)); await page.waitForTimeout(100); }
      const notice = await dialog.getByText(/^(Open cash shift at|No cash shift is open at)/).isVisible().catch(() => false);
      log.push({ noticeVisible: notice });
      await expect(dialog.getByText(/^(Open cash shift at|No cash shift is open at)/)).toBeVisible().catch((e) => log.push({ noticeErr: String(e).slice(0, 300) }));
      log.push(await snap(page, "notice"));
      await page.screenshot({ path: path.join(out, `fixed${fixed}-h${height}-before.png`) });
      const submit = dialog.getByRole("button", { name: "Record payment", exact: true });
      await submit.scrollIntoViewIfNeeded();
      log.push(await snap(page, "afterScroll"));
      log.push({ ratioAfterScroll: await ratio(page) });
      for (let i = 0; i < 10; i++) { await page.waitForTimeout(150); log.push(await snap(page, `after+${(i + 1) * 150}`)); }
      log.push({ ratioLater: await ratio(page) });
      await page.screenshot({ path: path.join(out, `fixed${fixed}-h${height}-after.png`) });
      await dialog.screenshot({ path: path.join(out, `fixed${fixed}-h${height}-dialog.png`) }).catch(() => {});
      fs.writeFileSync(path.join(out, `fixed${fixed}-h${height}-r${info.retry}.json`), JSON.stringify(log, null, 1));
    });
  }
}
