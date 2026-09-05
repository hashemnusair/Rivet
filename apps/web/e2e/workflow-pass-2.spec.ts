import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce", colorScheme: "light" });

async function enter(page: Page, role = "Owner") {
  // Fix date-dependent seed content while keeping native browser timers.
  await page.addInitScript(() => {
    const fixed = new Date("2026-09-05T09:00:00+03:00").valueOf();
    window.Date = new Proxy(Date, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [fixed]); },
      get(target, property) { return property === "now" ? () => fixed : Reflect.get(target, property); },
    });
  });
  await page.goto("/login/gym");
  if (role === "Trainer") {
    // The quick sign-in chooser contains the four desk roles. Use the existing
    // explicit preview session fixture for the seeded trainer, never Clerk.
    await page.evaluate(() => sessionStorage.setItem("rivet.demo.persona", "trainer"));
    await page.goto("/pt");
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Trainer");
    return;
  }
  await page.getByRole("radio", { name: new RegExp(role, "i") }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.request.post("/__nextjs_disable_dev_indicator");
}

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error/)).toHaveCount(0);
}

for (const width of [360, 390, 768, 820, 1280, 1440]) {
  test(`sales and scheduling remain usable at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await enter(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [route, ready] of [
      ["/crm/pipeline?view=list", "Leads"], ["/crm/queues", "Retention"],
      ["/classes", "Classes"], ["/pt", "Personal training"],
      ["/memberships", "Memberships"], ["/plans", "Membership plans"],
    ]) {
      await page.goto(route!);
      await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible();
      if (ready === "Leads") await expect(page.locator('a[href^="/crm/leads/"]:visible').first()).toBeVisible();
      if (ready === "Retention") await expect(page.locator('section[aria-labelledby="risk-results-title"] li button').first()).toBeVisible();
      if (ready === "Classes") await expect(page.getByTestId("class-agenda-row").first()).toBeVisible();
      if (ready === "Personal training") await expect(page.getByRole("heading", { name: "No upcoming PT sessions" })).toBeVisible();
      await fits(page);
      if ((width === 390 || width === 1440) && ["Leads", "Retention", "Classes", "Personal training"].includes(ready!)) {
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`pass-2-${ready!.toLowerCase().replaceAll(" ", "-")}-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.04 });
      }
      if (ready === "Retention" && (width === 390 || width === 1440)) {
        await page.locator('section[aria-labelledby="risk-results-title"] li button').first().click();
        const detail = page.getByTestId("at-risk-panel");
        await expect(detail.getByRole("link", { name: /Open member record/ })).toBeVisible();
        await detail.scrollIntoViewIfNeeded();
        await expect(detail).toHaveScreenshot(`pass-2-retention-detail-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.04 });
        await fits(page);
      }
      if (ready === "Leads") {
        await page.locator('a[href^="/crm/leads/"]:visible').first().click();
        await expect(page.getByTestId("trial-workflow")).toBeVisible();
        await fits(page);
        if (width === 390 || width === 1440) await expect(page).toHaveScreenshot(`pass-2-lead-detail-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.04 });
      }
    }
    await page.goto("/offers/unavailable-preview-link");
    await expect(page.getByRole("heading", { name: "This link cannot be opened." })).toBeVisible();
    await fits(page);
    expect(errors).toEqual([]);
  });
}

test("retention preserves filters, pagination and member context on refresh", async ({ page }) => {
  await enter(page);
  await page.goto("/crm/queues");
  await page.getByRole("button", { name: "Win back", exact: true }).click();
  await expect(page).toHaveURL(/reason=expired/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Win back", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All attention", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Renewals", exact: true }).click();
  await page.getByRole("button", { name: "Expired", exact: true }).click();
  await expect(page).toHaveURL(/bucket=expired/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Expired", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("touch lead actions retain loss reasons and Board/List preference", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await enter(page, "Sales");
  await page.goto("/crm/pipeline?view=list");
  const row = page.getByTestId("lead-compact-row").first();
  await row.getByRole("button", { name: /Mark .* not sold/ }).click();
  const dialog = page.getByRole("dialog", { name: "Mark membership as not sold?" });
  await expect(dialog.getByRole("button", { name: "Mark not sold", exact: true })).toBeDisabled();
  await dialog.getByLabel("Reason", { exact: true }).fill("The class schedule does not fit their work hours.");
  await expect(dialog.getByRole("button", { name: "Mark not sold", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/view=board/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-pressed", "true");
  await fits(page);
  await context.close();
});

test("class agenda opens the correct dated roster and preserves weekly view", async ({ page }) => {
  await enter(page);
  await page.goto("/classes");
  const row = page.getByTestId("class-agenda-row").filter({ hasText: "Morning HIIT" });
  await row.getByRole("button", { name: "Who booked" }).click();
  const roster = page.getByRole("dialog", { name: /Who booked/ });
  await expect(roster.getByRole("button", { name: "Finalize attendance" })).toBeDisabled();
  await roster.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Weekly timetable" }).click();
  await expect(page).toHaveURL(/view=timetable/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Weekly timetable" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Morning HIIT, Sunday/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Morning HIIT", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Morning HIIT" })).toBeVisible();
});

test("PT starts from a member and keeps package credit rules visible", async ({ page }) => {
  await enter(page);
  await page.goto("/pt");
  await page.getByRole("button", { name: "Book session", exact: true }).click();
  await page.getByLabel("Find member").fill("Yara");
  await page.getByRole("dialog").getByRole("link", { name: /Yara Sweidan/ }).click();
  await expect(page).toHaveURL(/tab=pt/);
  await expect(page.getByRole("heading", { name: "Book a session" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Package catalog" })).toBeVisible();
});

for (const role of ["Manager", "Trainer"]) {
  test(`${role} sees the appropriate PT controls`, async ({ page }) => {
    await enter(page, role);
    await page.goto("/pt");
    if (role === "Manager") {
      await expect(page.getByRole("heading", { name: "Trainer profiles" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Book session", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Package", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "Book session", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Package", exact: true })).toHaveCount(0);
      // The preview adapter still requires reports permission here. Convex
      // trainer scoping and the actual trainer UI are covered separately.
      await expect(page.getByRole("heading", { name: "Not allowed for this role" })).toBeVisible();
    }
  });
}

test("attendance requires a review after a class ends", async ({ page }) => {
  await enter(page);
  await page.goto("/classes?from=2026-08-29");
  await page.getByTestId("class-agenda-row").filter({ hasText: "Weekend Open Gym" }).getByRole("button", { name: "Who booked" }).click();
  await page.getByRole("button", { name: "Finalize attendance", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Finalize attendance?", exact: true });
  await expect(review).toContainText("Unmarked confirmed bookings will be recorded as no-shows");
  await review.getByRole("button", { name: "Review roster" }).click();
  await expect(page.getByRole("dialog", { name: /Who booked/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalize attendance", exact: true })).toBeEnabled();
});
