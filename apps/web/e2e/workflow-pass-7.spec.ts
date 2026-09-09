import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce", colorScheme: "light" });

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

/**
 * The dev server can hold the document's load event open for a long time
 * while it compiles for another session, so navigations wait for the DOM only
 * and every visit proves readiness with a locator instead.
 */
async function go(page: Page, path: string) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      // A Fast Refresh full reload aborts in-flight navigations; two retries
      // absorb that, and anything else is a real failure.
      if (attempt >= 2 || !/net::ERR_ABORTED/.test(String(error))) throw error;
      await page.waitForTimeout(1_000);
    }
  }
}

async function resetSession(page: Page) {
  await go(page, "/login");
  await page.evaluate(() => window.sessionStorage.clear());
  await page.request.post("/__nextjs_disable_dev_indicator");
}

async function signInOwner(page: Page) {
  await resetSession(page);
  await go(page, "/login/gym");
  await page.getByRole("radio", { name: /Owner/i }).click();
  await page.getByTestId("sign-in-button").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 60_000 });
}

async function signInAdmin(page: Page) {
  await resetSession(page);
  await go(page, "/login/admin");
  await page.getByRole("button", { name: /Open platform console/i }).click();
  await page.waitForURL(/\/platform$/, { waitUntil: "commit", timeout: 60_000 });
}

/**
 * Full-page visits in the dev server occasionally coincide with a forced
 * Fast Refresh reload, which can leave a shell on its loading gate. One reload
 * recovers it; anything else is a real failure.
 */
async function visit(page: Page, path: string, ready: (page: Page) => Locator) {
  await go(page, path);
  try {
    await expect(ready(page)).toBeVisible({ timeout: 45_000 });
  } catch (error) {
    const gate = page.getByRole("status", { name: /Loading workspace|Checking access|Checking sign-in|Verifying your invitation/ });
    if (!(await gate.isVisible())) throw error;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(ready(page)).toBeVisible({ timeout: 60_000 });
  }
}

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error/)).toHaveCount(0);
}

// Linux Chromium rasterizes the text-dense 390px pages differently enough
// from macOS to cross the shared 4% ceiling, so those captures keep inspected
// Linux references at the same tolerance, as the Pass 3, 4 and 5 captures do.
function reference(name: string, width: number) {
  return width === 390 && process.platform === "linux" ? name.replace(/\.png$/, "-linux.png") : name;
}

async function capture(page: Page, name: string, width: number) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(reference(name, width), { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.04 });
}

const h1 = (name: RegExp | string) => (page: Page) => page.getByRole("heading", { level: 1, name });

type Route = { path: string; slug: string; ready: (page: Page) => Locator; shoot?: boolean };

const SIGN_IN_ROUTES: Route[] = [
  { path: "/login", slug: "login", ready: (page) => page.getByRole("link", { name: "Platform admin preview" }), shoot: true },
  { path: "/login/gym", slug: "login-gym", ready: (page) => page.getByRole("radiogroup", { name: "Staff role" }), shoot: true },
  { path: "/login/gym?preview=unavailable-gym", slug: "login-gym-unavailable", ready: (page) => page.getByText("Your gym workspace is unavailable") },
  { path: "/login/admin", slug: "login-admin", ready: (page) => page.getByRole("button", { name: /Open platform console/i }), shoot: true },
  { path: "/login/accept-invitation", slug: "invitation-invalid", ready: (page) => page.getByText("Invitation link not recognized") },
  { path: "/login/accept-invitation?__clerk_status=expired&__clerk_ticket=demo", slug: "invitation-expired", ready: (page) => page.getByText("Invitation expired") },
  { path: "/login/accept-invitation?__clerk_status=complete&__clerk_ticket=demo", slug: "invitation-complete", ready: (page) => page.getByText("This invitation was already accepted"), shoot: true },
  // With a Convex URL (local, Preview) the owner form renders; CI's mock run has no backend and shows the truthful notice.
  { path: "/login/accept-invitation?__clerk_status=sign_up&__clerk_ticket=demo", slug: "invitation-signup", ready: (page) => page.getByText(/Create your owner account|Invitations need the connected RIVET backend/) },
];

const PUBLIC_ROUTES: Route[] = [
  { path: "/signup", slug: "signup", ready: (page) => page.getByRole("button", { name: /Send gym application/i }), shoot: true },
  { path: "/offers/unavailable-preview-link", slug: "offer-unavailable", ready: h1("This link cannot be opened."), shoot: true },
  { path: "/privacy", slug: "privacy", ready: h1("Privacy policy") },
  { path: "/terms", slug: "terms", ready: h1("Terms of service") },
  { path: "/offline", slug: "offline", ready: h1("Reconnect to open RIVET") },
  { path: "/this-route-does-not-exist", slug: "not-found", ready: h1(/not on the floor plan/), shoot: true },
];

const OWNER_ROUTES: Route[] = [
  { path: "/getting-started", slug: "getting-started", ready: h1("Open your gym with confidence"), shoot: true },
  { path: "/onboarding/agreement", slug: "onboarding-agreement", ready: h1("Your subscription agreement"), shoot: true },
];

const CONSOLE_RECORD_ROUTES: Route[] = [
  { path: "/platform", slug: "platform", ready: h1("Platform overview"), shoot: true },
  { path: "/platform/gyms", slug: "platform-gyms", ready: h1("Gym organizations"), shoot: true },
  { path: "/platform/gyms/forge-fitness", slug: "platform-gym", ready: h1("Forge Fitness Club"), shoot: true },
  { path: "/platform/gyms/pulse-lab", slug: "platform-gym-unprovisioned", ready: (page) => page.getByText("Cleanup-only record") },
  { path: "/platform/applications", slug: "platform-applications", ready: (page) => page.getByRole("heading", { level: 2, name: "Northline Strength" }), shoot: true },
];

const CONSOLE_LEDGER_ROUTES: Route[] = [
  { path: "/platform/billing", slug: "platform-billing", ready: (page) => page.getByRole("row", { name: /Forge Fitness Club/ }), shoot: true },
  { path: "/platform/subscriptions", slug: "platform-subscriptions", ready: (page) => page.getByRole("button", { name: "Edit Starter plan" }), shoot: true },
  { path: "/platform/agreements", slug: "platform-agreements", ready: (page) => page.getByRole("button", { name: /Open agreement RVT-20260815-FORGE/ }), shoot: true },
  { path: "/platform/email-log", slug: "platform-email-log", ready: (page) => page.getByText("1 of 2 sent"), shoot: true },
  { path: "/platform/support?case=SUP-218", slug: "platform-support", ready: (page) => page.getByRole("heading", { level: 2, name: "Payment retry failed" }), shoot: true },
];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${error.message} @ ${(error.stack ?? "").split("\n").slice(0, 3).join(" | ")}`));
  return errors;
}

async function checkRoutes(page: Page, routes: Route[], width: number) {
  const shoot = width === 390 || width === 1440;
  for (const route of routes) {
    await visit(page, route.path, route.ready);
    if (route.slug === "signup") await expect(page.getByRole("button", { name: /Send gym application/i })).toBeEnabled({ timeout: 60_000 });
    await fits(page);
    if (shoot && route.shoot) await capture(page, `pass-7-${route.slug}-${width}.png`, width);
  }
}

async function prepare(page: Page, width: number) {
  // Seven or eight visits per test, several of them cold compiles on CI.
  test.setTimeout(300_000);
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  await fixClock(page);
  return trackErrors(page);
}

for (const width of [360, 390, 768, 820, 1280, 1440]) {
  test(`sign-in portals and invitation states remain usable at ${width}px`, async ({ page }) => {
    const errors = await prepare(page, width);
    await resetSession(page);
    await checkRoutes(page, SIGN_IN_ROUTES, width);
    expect(errors).toEqual([]);
  });

  test(`public product states and owner onboarding remain usable at ${width}px`, async ({ page }) => {
    const errors = await prepare(page, width);
    await resetSession(page);
    await checkRoutes(page, PUBLIC_ROUTES, width);
    await signInOwner(page);
    await checkRoutes(page, OWNER_ROUTES, width);
    expect(errors).toEqual([]);
  });

  test(`the console's tenant records remain usable at ${width}px`, async ({ page }) => {
    const errors = await prepare(page, width);
    await signInAdmin(page);
    await checkRoutes(page, CONSOLE_RECORD_ROUTES, width);
    expect(errors).toEqual([]);
  });

  test(`the console's money, legal and support records remain usable at ${width}px`, async ({ page }) => {
    const errors = await prepare(page, width);
    await signInAdmin(page);
    await checkRoutes(page, CONSOLE_LEDGER_ROUTES, width);

    if (width < 1024) {
      // The console drawer is a labelled dialog that Escape closes.
      await page.getByRole("button", { name: "Open navigation" }).click();
      const drawer = page.getByRole("dialog", { name: "Platform navigation" });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Billing" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
    }

    expect(errors).toEqual([]);
  });
}

test("the overview's attention links land on shareable console filters", async ({ page }) => {
  test.setTimeout(180_000);
  await fixClock(page);
  await signInAdmin(page);
  await visit(page, "/platform", h1("Platform overview"));
  await page.getByRole("region", { name: "Needs attention" }).getByRole("link", { name: /applications awaiting review/ }).click();
  await expect(page).toHaveURL(/\/platform\/applications\?status=pending$/);
  await expect(page.getByRole("button", { name: /^Pending 1$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 2, name: "Northline Strength" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mosaic Women/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Pending 1$/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^All 2$/ }).click();
  await expect(page).toHaveURL(/\/platform\/applications$/);
  await expect(page.getByRole("button", { name: /Mosaic Women/ })).toBeVisible();

  // The gym directory reads its status and search from the URL as well.
  await go(page, "/platform/gyms?status=suspended&q=district");
  await expect(page.getByRole("heading", { level: 1, name: "Gym organizations" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Suspended \d+$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Search gym organizations" })).toHaveValue("district");
  await expect(page.getByText("1 gym shown with the current filters.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "District Strength" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/platform\/gyms$/);
  await expect(page.getByRole("button", { name: /^Active gyms 1$/ })).toHaveAttribute("aria-pressed", "true");
});

test("platform search reaches a gym record by keyboard and billing opens on that tenant", async ({ page }) => {
  test.setTimeout(180_000);
  await fixClock(page);
  await signInAdmin(page);
  await visit(page, "/platform", h1("Platform overview"));
  const search = page.getByRole("combobox", { name: "Search platform records" });
  await search.fill("forge");
  const gymOption = page.getByRole("option").filter({ hasText: "Gym · active" });
  await expect(gymOption).toBeVisible();
  await expect(gymOption).toHaveAttribute("aria-selected", "true");
  // The first result is already active, so Enter opens it; the invoice result sits behind it.
  await search.press("Enter");
  await expect(page).toHaveURL(/\/platform\/gyms\/forge-fitness$/);
  await expect(page.getByRole("heading", { level: 1, name: "Forge Fitness Club" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage in Billing" })).toHaveAttribute("href", "/platform/billing?bill=forge-fitness");

  // Reason-gated listing and archive controls stay disabled until a reason is typed.
  await page.getByRole("switch", { name: "Public directory listing" }).click();
  const saveListing = page.getByRole("button", { name: "Save listing" });
  await expect(saveListing).toBeDisabled();
  await page.getByLabel("Reason for this change").fill("Hide during the rebrand.");
  await expect(saveListing).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(saveListing).toHaveCount(0);
  await page.getByRole("button", { name: "Archive gym" }).click();
  const archive = page.getByRole("dialog", { name: /Archive Forge Fitness Club\?/ });
  await expect(archive.getByRole("button", { name: "Archive gym" })).toBeDisabled();
  await archive.getByRole("button", { name: "Cancel" }).click();
  await expect(archive).toBeHidden();

  await page.getByRole("link", { name: /Manage subscription/ }).click();
  await expect(page).toHaveURL(/\/platform\/billing\?bill=forge-fitness$/);
  const wizard = page.getByRole("dialog", { name: "Bill a gym" });
  await expect(wizard.getByText(/Forge Fitness Club is currently active on Pro/)).toBeVisible();
  await wizard.getByRole("button", { name: "Cancel" }).click();
  await expect(wizard).toBeHidden();
  await expect(page.getByRole("heading", { name: "Gym subscriptions" })).toBeVisible();
});

test("a support case can be answered and resolved from its deep link", async ({ page }) => {
  test.setTimeout(180_000);
  await fixClock(page);
  await signInAdmin(page);
  await visit(page, "/platform/support?case=SUP-217", (current) => current.getByRole("heading", { level: 2, name: "New staff permission question" }));
  await expect(page.getByRole("button", { name: /New staff permission question/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("textbox", { name: "Support reply" }).fill("Managers can grant that permission from Settings › Users.");
  await page.getByRole("button", { name: "Send reply" }).click();
  await expect(page.getByText("Reply recorded on the support case.").last()).toBeVisible();
  await expect(page.getByText("Managers can grant that permission from Settings › Users.")).toBeVisible();
  await page.getByRole("button", { name: "Resolve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Resolve support case" });
  await expect(dialog.getByRole("button", { name: "Resolve case" })).toBeDisabled();
  await dialog.getByLabel("Resolution summary").fill("Explained the permission flow; the owner confirmed access.");
  await dialog.getByRole("button", { name: "Resolve case" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(page.getByText("This case is resolved. Reopen it to continue the conversation.")).toBeVisible();
});

test("the gym application validates before sending and ends on a receipt", async ({ page }) => {
  test.setTimeout(180_000);
  await fixClock(page);
  await resetSession(page);
  await visit(page, "/signup", (current) => current.getByRole("button", { name: /Send gym application/i }));
  const submit = page.getByRole("button", { name: /Send gym application/i });
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await submit.click();
  await expect(page.getByText("Enter the owner name.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await page.getByLabel("Owner name").fill("Omar QA");
  await page.getByLabel("Email address").fill("omar.qa@example.com");
  await page.getByLabel("Contact number").fill("+962 79 555 0101");
  await page.getByLabel("Gym name").fill("Northstar QA Fitness");
  await page.getByRole("tab", { name: /Annual/ }).click();
  await page.getByRole("radio", { name: /Starter/ }).click();
  await expect(page.getByText(/JD 758\.400 billed annually/)).toBeVisible();
  await submit.click();
  await expect(page.getByRole("heading", { level: 1, name: /be in touch soon/ })).toBeVisible();
  await expect(page.getByText("omar.qa@example.com")).toBeVisible();
  await expect(page.getByRole("status").getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login/gym");
});

test("the not-found page keeps the visitor's place and offers a role-safe way in", async ({ page }) => {
  test.setTimeout(180_000);
  await fixClock(page);
  await resetSession(page);
  await go(page, "/login/gym");
  await expect(page.getByRole("heading", { level: 1, name: "Gym team" })).toBeVisible();
  await go(page, "/records/this-does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: /not on the floor plan/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open RIVET" })).toHaveAttribute("href", "/login");
  // The dev server paints the page before it hydrates, so a click can land on an inert button; keep clicking until history moves.
  await expect.poll(async () => {
    if (/\/records\//.test(page.url())) await page.getByRole("button", { name: "Go back" }).click({ timeout: 5_000 }).catch(() => undefined);
    return page.url();
  }, { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }).toMatch(/\/login\/gym$/);

  // The legacy gym sign-up and onboarding routes still land on the application form.
  await go(page, "/login/gym/create");
  await expect(page).toHaveURL(/\/signup$/);
  await go(page, "/onboarding/gym");
  await expect(page).toHaveURL(/\/signup$/);
});
