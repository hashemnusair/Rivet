import { expect, test, type Page } from "@playwright/test";

test.use({ contextOptions: { reducedMotion: "no-preference" } });

async function settled(page: Page) {
  await expect(page.locator("[data-page-sheet]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-page-covered", "");
  await expect(page.locator("html")).not.toHaveAttribute("data-sheet-docking", "");
}

for (const width of [1440, 390]) {
  test(`public transitions keep navigation and the machine working at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await settled(page);
    await page.locator("[data-landing-header]").getByRole("link", { name: "Sign in", exact: true }).press("Enter");
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await settled(page);
    await expect(page.getByRole("heading", { name: "Sign in to RIVET" })).toBeVisible();
    if (width >= 1024) {
      const machine = page.locator('[data-sheet-dock="account"] > svg');
      await expect(machine).toBeVisible();
      await machine.locator('[data-plate="0"]').click();
      await expect(machine).toHaveAttribute("data-rope", "sunk");
      await machine.locator('[data-plate="4"]').click();
      await expect(machine).toHaveAttribute("data-rope", "raised");
    }
    await page.getByRole("link", { name: "Gym team preview" }).click();
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await expect(page).toHaveURL(/\/login\/gym$/);
    await settled(page);
    await expect(page.getByTestId("sign-in-button")).toBeVisible();
    await page.getByRole("link", { name: "RIVET home", exact: true }).filter({ visible: true }).click();
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await settled(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("mobile sign-in doors and home animate across real host boundaries", async ({ page, context, baseURL }) => {
  test.skip(process.env.PLAYWRIGHT_SERVER_MODE !== "start", "Production hosts need the built bundle; Next dev restricts cross-origin assets.");
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`${page.url()}: ${error.message}`));
  // Serve production-shaped hosts from the isolated local mock server. The
  // browser performs genuine cross-origin document navigations, without using
  // production accounts, providers or data.
  // Speculative document loads bypass Playwright routing. Disable that browser
  // optimization so every production-shaped URL stays on the local fixture.
  await context.addInitScript(() => {
    const supports = HTMLScriptElement.supports?.bind(HTMLScriptElement);
    HTMLScriptElement.supports = (type: string) => type !== "speculationrules" && Boolean(supports?.(type));
  });
  await context.route(/^https:\/\/(www|dashboard|app)\.rivetjo\.com\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const response = await route.fetch({
      url: `${baseURL}${url.pathname}${url.search}`,
      headers: { ...request.headers(), host: new URL(baseURL!).host, "x-forwarded-host": url.hostname },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });

  for (const [name, host, path] of [
    ["Gym team preview", "dashboard.rivetjo.com", "/login/gym"],
    ["Member preview", "app.rivetjo.com", "/login/member"],
  ]) {
    await page.goto("https://www.rivetjo.com/login");
    await expect(page.locator("body")).toHaveAttribute("data-demo-auth", "true");
    await settled(page);
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await expect(page).toHaveURL(`https://${host}${path}`);
    await expect(page.locator("body")).toHaveAttribute("data-demo-auth", "true");
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await settled(page);
    await expect(page.getByTestId(path === "/login/gym" ? "sign-in-button" : "member-continue")).toBeVisible();

    await page.getByRole("link", { name: "RIVET home", exact: true }).filter({ visible: true }).click();
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await expect(page).toHaveURL("https://www.rivetjo.com/");
    await expect(page.locator("[data-page-sheet]")).toBeVisible();
    await settled(page);
    await expect(page.locator("[data-landing-header]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("landing arrival plays on a full load and browser Back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-page-sheet]")).toBeVisible();
  await settled(page);
  await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await settled(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-page-sheet]")).toBeVisible();
  await settled(page);
});

test("fresh sign-in documents hydrate cleanly under their arrival sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const path of ["/login", "/login/gym", "/login/member"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    if (path === "/login") await expect(page.getByRole("link", { name: "Gym team preview", exact: true })).toBeVisible();
    else await expect(page.getByTestId(path === "/login/gym" ? "sign-in-button" : "member-continue")).toBeVisible();
    await settled(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the pricing link keeps the chosen plan and cadence on the night application", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // A click that lands before the page has hydrated only focuses the tab; try again until it takes.
  const annual = page.getByRole("tab", { name: /Annual/ });
  await expect(async () => {
    await annual.click();
    await expect(annual).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
  await page.locator('a[href="/signup?plan=Growth&interval=annual"]').click();
  await expect(page).toHaveURL(/\/signup\?plan=Growth&interval=annual$/);
  await settled(page);
  await expect(page.locator('[data-landing-header] img')).toHaveAttribute("src", /rivet-lockup-rev/);
  await expect(page.getByRole("button", { name: /Send gym application/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await settled(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/signup\?plan=Growth&interval=annual$/);
  await settled(page);
});

test.describe("reduced motion", () => {
  // reducedMotion is a BrowserContext option, not a top-level test fixture.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("reaches the door and workspace without an animated cover", async ({ page }) => {
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("[data-landing-header]").getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await settled(page);
    await expect(page.getByRole("heading", { name: "Sign in to RIVET" })).toBeVisible();
    for (const route of ["/login", "/login/member"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const content = page.locator("main > * > *");
      await expect(content.first()).toBeVisible();
      for (const child of await content.all()) {
        await expect(child).toHaveCSS("animation-name", "none");
        await expect(child).toHaveCSS("opacity", "1");
        await expect(child).toHaveCSS("transform", "none");
      }
    }
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page.getByRole("heading", { name: /Omar/ })).toBeVisible();
    await expect(page.getByTestId("workspace-curtain")).toHaveCount(0);
  });
});

test("Back cancels a sheet before it can overwrite the history destination", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await settled(page);
  await page.locator("[data-landing-header]").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.locator('[data-page-sheet="rack"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForTimeout(1_000); // Cross the cancelled navigation's 568ms timer.
  await expect(page).toHaveURL(/\/$/);
  await settled(page);
});
