import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce", colorScheme: "light" });

const MEMBERSHIP = "/customer/my-gyms/membership-lina-forge";

async function fixClock(page: Page) {
  // Fix date-dependent seed content while keeping native browser timers.
  await page.addInitScript(() => {
    const fixed = new Date("2026-09-05T09:00:00+03:00").valueOf();
    window.Date = new Proxy(Date, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [fixed]); },
      get(target, property) { return property === "now" ? () => fixed : Reflect.get(target, property); },
    });
  });
}

async function enterMember(page: Page, persona = "Lina Haddad") {
  await page.goto("/login/member");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByRole("button", { name: new RegExp(`Continue as ${persona.split(" ")[0]}`, "i") }).click();
  await page.waitForURL(/\/customer\//);
  await page.request.post("/__nextjs_disable_dev_indicator");
}

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error/)).toHaveCount(0);
}

async function capture(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(name, { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.04 });
}

for (const width of [360, 390, 768, 820, 1280, 1440]) {
  test(`member surfaces remain usable at ${width}px`, async ({ page }) => {
    test.setTimeout(150_000);
    const shoot = width === 390 || width === 1440;
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await fixClock(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    // Signed-out member routes.
    await page.goto("/login/member");
    await expect(page.getByRole("heading", { name: "Gym member" })).toBeVisible();
    await fits(page);
    if (shoot) await capture(page, `pass-4-login-member-${width}.png`);
    await page.goto("/login/member/create");
    await expect(page.getByRole("heading", { name: "Create a member account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open member preview" })).toBeVisible();
    await fits(page);
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "Reconnect to open RIVET" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
    await fits(page);

    await enterMember(page);
    for (const [route, heading, slug] of [
      ["/customer/my-gyms", "Hi, Lina", "home"],
      [MEMBERSHIP, "Forge Fitness Club", "membership"],
      ["/customer/finance", "Payments and receipts", "finance"],
      ["/customer/profile", "Profile", "profile"],
      ["/customer/getting-started", "Welcome to RIVET", "getting-started"],
      ["/customer/discover", "Find a gym", "discover"],
      ["/customer/gyms/forge-fitness", "Forge Fitness Club", "gym"],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1, name: heading }), route).toBeVisible();
      if (slug === "membership") await expect(page.getByRole("heading", { name: "6-Month All Access" })).toBeVisible();
      if (slug === "finance") await expect(page.getByRole("region", { name: "Financial summary" })).toBeVisible();
      if (slug === "getting-started") await expect(page.getByRole("heading", { name: "Install and notifications" })).toBeVisible();
      if (slug === "discover" || slug === "gym") {
        // Public routes paint before the member session and the live directory
        // are restored; capture the settled, signed-in state only.
        await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Pulse Lab" })).toHaveCount(0);
      }
      if (slug === "gym") {
        await expect(page.getByRole("button", { name: "Send trial request" })).toBeVisible();
        await expect(page.getByLabel("Full name")).toHaveValue("Lina Haddad");
      }
      await fits(page);
      if (shoot) await capture(page, `pass-4-${slug}-${width}.png`);
      if (slug === "membership") {
        await page.getByRole("button", { name: "Show entry QR" }).click();
        const dialog = page.getByRole("dialog", { name: "Entry QR" });
        await expect(dialog.getByLabel("Membership entry QR code")).toBeVisible();
        await expect(dialog.getByText(/Expires at/)).toBeVisible();
        if (shoot) await expect(dialog).toHaveScreenshot(`pass-4-entry-qr-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.04 });
        await dialog.getByRole("button", { name: "Close dialog" }).click();
        await expect(dialog).toBeHidden();
        await page.getByRole("tab", { name: "Classes" }).click();
        await expect(page.getByRole("tablist", { name: "Classes views" })).toBeVisible();
        await fits(page);
        if (shoot) await capture(page, `pass-4-membership-classes-${width}.png`);
        await page.getByRole("tab", { name: "PT" }).click();
        await expect(page.getByRole("tabpanel", { name: "Personal training" })).toBeVisible();
        await fits(page);
      }
    }
    await page.goto("/customer/receipts/not-a-receipt");
    await expect(page.getByRole("heading", { name: "Receipt not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to payments" })).toHaveAttribute("href", "/customer/finance");
    await fits(page);
    expect(errors).toEqual([]);
  });
}

test("the phone dock clears the home indicator, yields to the keyboard and keeps one window", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await enterMember(page);
  await page.goto("/customer/my-gyms");
  const dock = page.locator("nav.member-bottom-nav");
  await expect(dock).toBeVisible();
  const layout = await dock.evaluate((element) => {
    const items = element.firstElementChild?.getBoundingClientRect();
    const shell = document.querySelector(".member-app-shell");
    return {
      dockPaddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
      shellPaddingBottom: shell ? Number.parseFloat(getComputedStyle(shell).paddingBottom) : 0,
      homeIndicatorClearance: items ? window.innerHeight - items.bottom : 0,
      viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
      manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? "",
    };
  });
  expect(layout.manifest).toBe("/manifest.webmanifest");
  expect(layout.viewport).toContain("viewport-fit=cover");
  expect(layout.dockPaddingBottom).toBeGreaterThanOrEqual(16);
  expect(layout.shellPaddingBottom).toBeGreaterThanOrEqual(80);
  expect(layout.homeIndicatorClearance).toBeGreaterThanOrEqual(16);

  // Every dock target is a real link inside this window, at least 44px tall.
  for (const name of ["Home", "Payments", "Explore"]) {
    const link = dock.getByRole("link", { name });
    await expect(link).not.toHaveAttribute("target", "_blank");
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  // A focused text field hands the bottom of the screen to the keyboard.
  await page.goto("/customer/discover");
  await page.getByRole("searchbox", { name: "Search gyms" }).focus();
  await expect.poll(() => dock.evaluate((element) => getComputedStyle(element).display)).toBe("none");
  await page.getByRole("searchbox", { name: "Search gyms" }).blur();
  await expect(dock).toBeVisible();

  const pages = context.pages().length;
  await dock.getByRole("link", { name: "Payments" }).tap();
  await expect(page).toHaveURL(/\/customer\/finance$/);
  expect(context.pages()).toHaveLength(pages);
  await context.close();
});

test("the account menu reaches communication settings and signs out from the dock", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await enterMember(page);
  await page.goto("/customer/my-gyms");
  // Touch all the way through: a mouse click after a touch tap is a test
  // artifact no phone produces, and Radix treats mixed pointer types as a
  // dismissed selection.
  await page.getByRole("button", { name: "Open account menu" }).tap();
  await page.getByRole("menuitem", { name: "Communication settings" }).tap();
  await expect(page).toHaveURL(/\/customer\/profile#communication$/);
  await expect(page.getByRole("heading", { name: "Communication updates" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Receive marketing updates" })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).tap();
  await page.getByRole("menuitem", { name: "Sign out" }).tap();
  await expect(page).toHaveURL(/\/login$/);
  await context.close();
});

test("membership sections are shareable, keyboard operable and reachable from installed-app shortcuts", async ({ page }) => {
  await fixClock(page);
  await enterMember(page);
  await page.goto(MEMBERSHIP);
  await page.getByRole("tab", { name: "Classes" }).click();
  await expect(page).toHaveURL(/section=classes/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Classes" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tablist", { name: "Classes views" })).toBeVisible();
  await page.getByRole("tab", { name: "Classes" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "PT" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "PT" })).toBeFocused();
  await expect(page).toHaveURL(/section=pt/);

  await page.goto("/customer/my-gyms?section=pt");
  await expect(page).toHaveURL(new RegExp(`${MEMBERSHIP.replace(/\//g, "\\/")}\\?section=pt$`));
  await expect(page.getByRole("tabpanel", { name: "Personal training" })).toBeVisible();

  await page.goto("/customer/my-gyms?entry=1");
  const dialog = page.getByRole("dialog", { name: "Entry QR" });
  await expect(dialog.getByLabel("Membership entry QR code")).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/customer\/my-gyms$/);
  await expect(page.locator("svg[aria-label*='QR']")).toHaveCount(0);
});

test("finance filters and discovery search survive a refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterMember(page);
  await page.goto("/customer/finance?type=payment&from=2026-08-01");
  const toggle = page.getByRole("button", { name: /Filters/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toContainText("2");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("p", { hasText: "Filtered by" })).toContainText("Payment · From 1 Aug 2026");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/finance$/);
  await fits(page);

  await page.goto("/customer/discover?q=forge");
  await expect(page.getByRole("searchbox", { name: "Search gyms" })).toHaveValue("forge");
  await expect(page.getByRole("link", { name: "Forge Fitness Club" })).toBeVisible();
  await page.goto("/customer/discover?q=nothing-here");
  await expect(page.getByRole("heading", { name: "No gyms match" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/customer\/discover$/);
  await expect(page.getByRole("link", { name: "Forge Fitness Club" })).toBeVisible();
});

test("a visitor books a trial from a phone with the booking panel one tap away", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await enterMember(page, "Yousef Nasser");
  await expect(page).toHaveURL(/\/customer\/discover/);
  await page.getByRole("link", { name: /View gym/i }).first().tap();
  await expect(page).toHaveURL(/\/customer\/gyms\/forge-fitness/);
  await page.getByRole("link", { name: "Book a free trial" }).tap();
  await expect(page.getByRole("heading", { name: /Book a trial at/ })).toBeInViewport();
  await page.getByLabel("Branch", { exact: true }).selectOption({ label: "Forge — Abdoun" });
  await expect(page.getByLabel("Time")).toBeEnabled();
  await expect(page.getByLabel("Phone")).toHaveAttribute("type", "tel");
  await page.getByRole("button", { name: /Send trial request/i }).tap();
  await expect(page.getByRole("heading", { name: /Your free trial request is recorded/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open My Gyms/i })).toBeVisible();
  await fits(page);
  await context.close();
});

test("the freeze request dialog stays reachable at keyboard height", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 520 });
  await fixClock(page);
  await enterMember(page);
  await page.goto(MEMBERSHIP);
  await page.getByRole("button", { name: "Request a freeze" }).click();
  const dialog = page.getByRole("dialog", { name: "Request a freeze" });
  await expect(dialog).toBeVisible();
  const send = dialog.getByRole("button", { name: "Send request" });
  await send.scrollIntoViewIfNeeded();
  await expect(send).toBeInViewport();
  await expect(send).toBeDisabled();
  await dialog.getByLabel("From").fill("2026-09-10");
  await dialog.getByLabel("Why do you need the break?").fill("Travelling for two weeks.");
  await expect(send).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await fits(page);
});
