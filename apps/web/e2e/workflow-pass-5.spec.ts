import { expect, test, type Page } from "@playwright/test";

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

async function signIn(page: Page, role: "Owner" | "Manager") {
  await page.goto("/login/gym");
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(role, "i") }).click();
  await page.getByTestId("sign-in-button").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.request.post("/__nextjs_disable_dev_indicator");
}

/**
 * Full-page visits in the dev server occasionally coincide with a forced
 * Fast Refresh reload, which can leave the preview session gate on
 * "Loading workspace". One reload recovers it; anything else is a real failure.
 */
async function visit(page: Page, path: string, heading: RegExp | string) {
  await page.goto(path);
  const title = page.getByRole("heading", { level: 1, name: heading });
  try {
    await expect(title).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    if (!(await page.getByRole("status", { name: "Loading workspace" }).isVisible())) throw error;
    await page.reload();
    await expect(title).toBeVisible({ timeout: 60_000 });
  }
}

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error/)).toHaveCount(0);
}

// Linux Chromium rasterizes the text-dense 390px pages differently enough
// from macOS to cross the shared 4% ceiling, so those captures keep inspected
// Linux references at the same tolerance, as the Pass 3 and 4 captures do.
function reference(name: string, width: number) {
  return width === 390 && process.platform === "linux" ? name.replace(/\.png$/, "-linux.png") : name;
}

async function capture(page: Page, name: string, width: number) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(reference(name, width), { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.04 });
}

type Route = { path: string; slug: string; heading: RegExp; ready: (page: Page) => Promise<void> };

const OWNER_ROUTES: Route[] = [
  { path: "/dashboard", slug: "dashboard", heading: /^Good morning, Omar$/, ready: async (page) => { await expect(page.getByRole("region", { name: "Today" }).getByText("Next priority")).toBeVisible(); await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible(); } },
  { path: "/reports", slug: "reports", heading: /^Reports$/, ready: async (page) => { await expect(page.getByRole("region", { name: "Report totals" })).toBeVisible(); await expect(page.getByRole("region", { name: "Transactions in range" }).getByRole("row").nth(1)).toBeVisible(); } },
  { path: "/reports?view=collections", slug: "reports-collections", heading: /^Reports$/, ready: async (page) => { await expect(page.getByRole("heading", { name: "Collection efficiency" })).toBeVisible(); } },
  { path: "/finance", slug: "finance", heading: /^Management ledger$/, ready: async (page) => { await expect(page.getByTestId("management-ledger-home")).toBeVisible(); } },
  { path: "/finance/income-statement", slug: "income-statement", heading: /^Income statement$/, ready: async (page) => { await expect(page.getByTestId("income-statement")).toBeVisible(); } },
  { path: "/finance/cash-flow", slug: "cash-flow", heading: /^Cash flow statement$/, ready: async (page) => { await expect(page.getByTestId("cashflow-statement")).toBeVisible(); } },
  { path: "/finance/controls?tab=journals", slug: "finance-controls", heading: /^Management ledger$/, ready: async (page) => { await expect(page.getByRole("tab", { name: /journals/i })).toHaveAttribute("aria-selected", "true"); await expect(page.getByRole("heading", { name: "Journal entries" })).toBeVisible(); await expect(page.getByRole("region", { name: "Chart of accounts" })).toHaveCount(0); } },
  { path: "/audit", slug: "audit", heading: /^Audit log$/, ready: async (page) => { await expect(page.getByRole("button", { name: /Voided JOD 40\.000/ })).toBeVisible(); } },
  { path: "/exports", slug: "exports", heading: /^Data exports$/, ready: async (page) => { await expect(page.getByRole("heading", { name: "Generate a CSV" })).toBeVisible(); await expect(page.getByText("No exports yet")).toBeVisible(); } },
  { path: "/automations", slug: "automations", heading: /^Automation monitoring$/, ready: async (page) => { await expect(page.getByRole("region", { name: "Provider readiness" }).locator("article")).toHaveCount(3); await expect(page.getByRole("link", { name: /Renewal reminder/ }).first()).toBeVisible(); await expect(page.getByRole("region", { name: "Recent executions" }).getByText(/1–15 of/)).toBeVisible(); } },
  { path: "/support", slug: "support", heading: /^RIVET support$/, ready: async (page) => { await expect(page.getByRole("heading", { name: "Payment retry failed", level: 2 })).toBeVisible(); } },
];

for (const width of [360, 390, 768, 820, 1280, 1440]) {
  test(`owner and manager oversight surfaces remain usable at ${width}px`, async ({ page }) => {
    // Fourteen full-page visits; CI's cold dev server needs the headroom.
    test.setTimeout(240_000);
    const shoot = width === 390 || width === 1440;
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await fixClock(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${error.message} @ ${(error.stack ?? "").split("\n").slice(0, 3).join(" | ")}`));

    await signIn(page, "Owner");
    for (const route of OWNER_ROUTES) {
      await visit(page, route.path, route.heading);
      await route.ready(page);
      await fits(page);
      if (shoot) await capture(page, `pass-5-${route.slug}-${width}.png`, width);
    }

    // Owner oversight of a branch drawer: reconciliation totals and the variance queue.
    await visit(page, "/payments/shifts", "Shifts & cash");
    await page.getByRole("combobox", { name: "Branch", exact: true }).click();
    await page.getByRole("option", { name: /Abdoun/ }).click();
    await expect(page.getByRole("heading", { name: "Daily reconciliation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shift history" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve( variance)?$/ }).first()).toBeVisible();
    await fits(page);
    if (shoot) await capture(page, `pass-5-shifts-oversight-${width}.png`, width);

    // A saved rule, read-only, with its own history.
    await visit(page, "/automations", /^Automation monitoring$/);
    await page.getByRole("link", { name: /Renewal reminder/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: /Renewal reminder/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("region", { name: "Executions for this rule" }).getByText(/recorded|need attention/)).toBeVisible();
    await fits(page);
    if (shoot) await capture(page, `pass-5-automation-rule-${width}.png`, width);

    await signIn(page, "Manager");
    await visit(page, "/dashboard", /^Operations, Layla$/);
    await expect(page.getByRole("region", { name: "Today" }).getByText("Next priority")).toBeVisible();
    await fits(page);
    if (shoot) await capture(page, `pass-5-dashboard-manager-${width}.png`, width);

    expect(errors).toEqual([]);
  });
}

test("report views and scope live in the URL and survive a refresh", async ({ page }) => {
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/reports", /^Reports$/);
  await expect(page.getByRole("region", { name: "Report totals" })).toBeVisible();
  await page.getByRole("group", { name: "Date range" }).getByRole("button", { name: "90 days" }).click();
  await expect(page).toHaveURL(/range=90/);
  await expect(page.getByText(/8 Jun 2026 – 5 Sept 2026/)).toBeVisible();
  await page.getByRole("navigation", { name: "Report views" }).getByRole("link", { name: "Collections" }).click();
  await expect(page).toHaveURL(/view=collections/);
  await expect(page).toHaveURL(/range=90/);
  await expect(page.getByRole("heading", { name: "Collection efficiency" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Collections" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("End date").fill("2026-08-31");
  await expect(page).toHaveURL(/to=2026-08-31/);
  await expect(page.getByText(/3 Jun 2026 – 31 Aug 2026/)).toBeVisible();
  // Back on the overview the unresolved money comes first and traces to the ledger.
  await page.getByRole("navigation", { name: "Report views" }).getByRole("link", { name: "Overview" }).click();
  await page.getByRole("button", { name: "30 days" }).click();
  await page.getByLabel("End date").fill("2026-09-05");
  const totals = page.getByRole("region", { name: "Report totals" });
  await expect(totals.locator("p.context-label").first()).toHaveText("Outstanding now");
  await expect(totals.getByRole("link", { name: /Outstanding now/ })).toHaveAttribute("href", "/payments?range=30&type=payment");
  await expect(page.getByRole("region", { name: "By payment method" }).getByRole("link").first()).toHaveAttribute("href", /\/payments\?range=30&method=/);
});

test("statements and ledger controls share one scope and trace to the journals", async ({ page }) => {
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/finance/income-statement", /^Income statement$/);
  await expect(page.getByTestId("income-statement")).toBeVisible();
  await page.getByRole("group", { name: "Quick date ranges" }).getByRole("button", { name: "This month" }).click();
  await expect(page).toHaveURL(/from=2026-09-01/);
  await expect(page.getByRole("button", { name: "This month" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: /All statements/ })).toHaveAttribute("href", /\/finance\?from=2026-09-01/);
  await page.getByRole("combobox", { name: "Statement branch scope" }).click();
  await page.getByRole("option", { name: /Abdoun/ }).click();
  await expect(page).toHaveURL(/branchId=/);
  // Ledger controls opens in the same branch, and its tab is part of the URL.
  await page.getByRole("link", { name: "Ledger controls" }).click();
  await expect(page).toHaveURL(/\/finance\/controls\?branchId=/);
  await expect(page.getByRole("heading", { level: 1, name: "Management ledger" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("combobox", { name: "Ledger branch scope" })).toContainText("Abdoun");
  await expect(page.getByRole("tab", { name: /trial balance/i })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /source queue/i }).click();
  await expect(page).toHaveURL(/tab=sources/);
  await expect(page).toHaveURL(/branchId=/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /source queue/i })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Source postings" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Ledger branch scope" })).toContainText("Abdoun");
  await visit(page, "/finance/controls?tab=journals", /^Management ledger$/);
  await expect(page.getByRole("tab", { name: /journals/i })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Journal entries" })).toBeVisible();
});

test("audit questions are shareable and every row opens its evidence", async ({ page }) => {
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/audit?category=payments&approval=pending", /^Audit log$/);
  await expect(page.getByRole("combobox", { name: "Category filter" })).toContainText("Payments");
  await expect(page.getByRole("combobox", { name: "Approval filter" })).toContainText("Pending approval");
  const row = page.getByRole("button", { name: /Refunded JOD 40\.000/ });
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: /Voided JOD 40\.000/ })).toHaveCount(0);
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Reason", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Correlation/)).toBeVisible();
  await page.getByRole("searchbox", { name: "Search audit log" }).or(page.getByLabel("Search audit log")).fill("override");
  await expect(page).toHaveURL(/q=override/);
  await page.getByRole("combobox", { name: "Approval filter" }).click();
  await page.getByRole("option", { name: "Any approval state" }).click();
  await expect(page).toHaveURL(/q=override&category=payments$/);
});

test("exports read as one list and each request is recorded with its state", async ({ page }) => {
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/exports", /^Data exports$/);
  const members = page.locator("article").filter({ has: page.getByRole("heading", { name: "Members", exact: true }) });
  const pending = page.waitForEvent("download");
  await members.getByRole("button", { name: "Generate CSV" }).click();
  await pending;
  const recent = page.getByRole("region", { name: "Recent exports" });
  await expect(recent.getByText("Completed")).toBeVisible();
  await expect(recent.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  await expect(recent.getByText(/rows · /)).toBeVisible();
});

test("automations read on a phone as lists that keep every state", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce" });
  const page = await context.newPage();
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/automations", /^Automation monitoring$/);
  await expect(page.getByRole("list", { name: "Automation rules" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Automation rules" }).getByRole("table")).toBeHidden();
  await expect(page.getByRole("list", { name: "Recent executions" }).getByText("completed").first()).toBeVisible();
  await expect(page.getByText("enabled · held").first()).toBeVisible();
  await expect(page.getByText("paused", { exact: true }).first()).toBeVisible();
  await fits(page);
  await page.getByRole("list", { name: "Automation rules" }).getByRole("link", { name: /Outstanding payment/ }).tap();
  await expect(page.getByRole("heading", { level: 1, name: /Outstanding payment/ })).toBeVisible();
  await expect(page.getByText("Paused in saved configuration")).toBeVisible();
  await expect(page.getByRole("list", { name: "Executions for this rule" })).toBeVisible();
  await fits(page);
  await context.close();
});

test("support keeps the case, its state and the reply together", async ({ page }) => {
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/support", /^RIVET support$/);
  await page.getByRole("button", { name: /Member import formatting/ }).click();
  const thread = page.getByRole("article", { name: "Member import formatting" });
  await expect(thread.getByText("Waiting")).toBeVisible();
  await expect(thread.getByText(/^(Created |Creation time not recorded)/)).toBeVisible();
  await expect(thread.getByText("No replies yet").or(thread.locator("time").first())).toBeVisible();
  await expect(thread.getByLabel("Reply to support")).toBeVisible();
  await page.getByRole("button", { name: "Request plan upgrade" }).click();
  await expect(page.getByRole("dialog", { name: "Request a plan upgrade" })).toBeVisible();
  await expect(page.getByLabel("Requested plan")).toBeVisible();
  await expect(page.getByLabel("Billing cadence")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("an owner reviews a cash variance from the shifts oversight view", async ({ page }) => {
  await fixClock(page);
  await signIn(page, "Owner");
  await visit(page, "/payments/shifts", "Shifts & cash");
  await page.getByRole("combobox", { name: "Branch", exact: true }).click();
  await page.getByRole("option", { name: /Abdoun/ }).click();
  await expect(page.getByRole("heading", { name: "Daily reconciliation" })).toBeVisible();
  await expect(page.getByText("Cash variance", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve variance" }).first().click();
  await expect(page.getByRole("dialog", { name: "Approve cash variance" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
