import { expect, test } from "@playwright/test";

test("horizontal tabs stay usable through desktop-to-phone emulation and slow frames", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Emulation switching uses the Chromium protocol.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /Owner Omar/ }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/operations");
  const tabs = page.getByRole("tablist", { name: "Stock and purchasing" });
  const shell = page.getByTestId("app-scroll-shell");
  await expect(tabs).toBeVisible();
  await expect(page.locator("main .animate-pulse")).toHaveCount(0);
  await expect(shell).toHaveAttribute("data-overscroll-mode", "damped");

  // A mostly horizontal trackpad gesture must not move the page at its edge.
  const horizontal = await tabs.evaluate((list) => {
    const event = new WheelEvent("wheel", { deltaX: 160, deltaY: -3, bubbles: true, cancelable: true });
    list.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(horizontal).toBe(false);
  await expect(shell).toHaveCSS("transform", "none");

  // Reproduce the 30fps case that made the old Euler spring diverge. Delayed
  // frames are a normal condition in the in-app browser, not an invalid input.
  const recovery = await page.evaluate(async () => {
    const nativeFrame = window.requestAnimationFrame;
    let time = performance.now();
    window.requestAnimationFrame = (callback) => nativeFrame(() => { time += 1000 / 30; callback(time); });
    const target = document.querySelector<HTMLElement>("[data-testid=app-scroll-shell]")!;
    const offsets: number[] = [];
    const record = () => offsets.push(target.style.transform ? new DOMMatrix(getComputedStyle(target).transform).m42 : 0);
    const observer = new MutationObserver(record);
    observer.observe(target, { attributes: true, attributeFilter: ["style"] });
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, cancelable: true }));
    record();
    for (let frame = 0; frame < 100 && target.style.transform; frame++) {
      await new Promise<void>((resolve) => nativeFrame(() => resolve()));
    }
    observer.disconnect();
    window.requestAnimationFrame = nativeFrame;
    return { offsets, final: target.style.transform };
  });
  expect(recovery.offsets.length).toBeGreaterThan(1);
  expect(recovery.offsets.every((offset) => Number.isFinite(offset) && Math.abs(offset) <= 7)).toBe(true);
  expect(recovery.final).toBe("");

  // Match changing an already-loaded in-app browser to its iPhone preset.
  const protocol = await page.context().newCDPSession(page);
  await protocol.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect(shell).toHaveAttribute("data-overscroll-mode", "native");
  const bounds = (await tabs.boundingBox())!;
  const initialUrl = page.url();
  for (const [start, end] of [[340, 45], [45, 340], [340, 45]]) {
    await protocol.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y: bounds.y + 22 }] });
    for (let step = 1; step <= 12; step++) {
      await protocol.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start + (end - start) * step / 12, y: bounds.y + 22 + step / 12 }] });
      await page.waitForTimeout(20);
    }
    await protocol.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await expect.poll(() => tabs.evaluate((list) => list.scrollLeft)).toBeGreaterThan(100);
  expect(page.url()).toBe(initialUrl);
  await expect(page.getByRole("tab", { name: "Inventory", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(shell).toHaveCSS("transform", "none");
  const supplier = page.getByRole("tab", { name: "Suppliers", exact: true });
  await supplier.scrollIntoViewIfNeeded();
  const supplierBounds = (await supplier.boundingBox())!;
  await protocol.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: supplierBounds.x + supplierBounds.width / 2, y: supplierBounds.y + supplierBounds.height / 2 }] });
  await protocol.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page).toHaveURL(/tab=suppliers/);
  await expect(page.getByTestId("operations-suppliers")).toBeVisible();
  await page.getByRole("combobox", { name: "Operations branch" }).click();
  await expect(page.getByRole("option", { name: "All branches", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(shell).toHaveCSS("transform", "none");
});
