import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce", colorScheme: "light" });
const branch = "10000000-0000-4a00-8a00-000000000002";
async function enter(page: Page, role = "Owner") {
  await page.clock.setFixedTime(new Date("2026-09-05T09:00:00+03:00"));
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(role, "i") }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.request.post("/__nextjs_disable_dev_indicator");
}
async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
const routes = [
  ["checklists", `/checklists?branch=${branch}`, "Opening walkthrough"],
  ["inventory", `/operations?branch=${branch}`, "Creatine monohydrate"],
  ["orders", `/operations?tab=orders&branch=${branch}`, "Purchase orders"],
  ["suppliers", `/operations?tab=suppliers&branch=${branch}`, "Jordan Sports Supply"],
  ["equipment", `/operations?tab=equipment&branch=${branch}`, "Treadmill"],
  ["payables", `/operations/payables?branch=${branch}`, "Outstanding"],
  ["maintenance", `/maintenance?branch=${branch}`, "Main floor inspection"],
] as const;
for (const width of [360, 390, 768, 820, 1280, 1440]) {
  test(`branch operations remain usable at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await enter(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, route, ready] of routes) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }), route).toBeVisible();
      await expect(page.locator("main").getByText(ready, { exact: false }).first()).toBeVisible();
      if (name === "orders") await expect(page.getByTestId("operations-orders")).toBeVisible();
      if (name === "equipment") await expect(page.getByRole("heading", { name: "Machine register" })).toBeVisible();
      await fits(page);
      if (width === 390 || width === 1440) {
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`pass-3-${name}-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.04 });
      }
    }
    expect(errors).toEqual([]);
  });
}

test("stock tabs, branch and filters survive refresh", async ({ page }) => {
  await enter(page);
  await page.goto(`/operations?branch=${branch}`);
  await page.getByRole("button", { name: "Needs replenishing", exact: true }).click();
  await expect(page).toHaveURL(/stock=attention/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Needs replenishing", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Purchase orders", exact: true }).click();
  await expect(page).toHaveURL(/tab=orders/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Purchase orders", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("combobox", { name: "Operations branch" })).toHaveText("Forge — Abdoun");
  await page.getByRole("button", { name: "Received", exact: true }).click();
  await expect(page).toHaveURL(/orders=received/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Received", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByPlaceholder("Approval reason (optional)")).toHaveCount(0);
});

test("phone checklist failure opens its maintenance task", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, "Manager");
  await page.goto(`/checklists?branch=${branch}`);
  const row = page.getByRole("button", { name: 'Mark "Check changing rooms are clean" done' }).locator("..");
  await row.getByRole("button", { name: "Problem?", exact: true }).click();
  const problem = page.getByRole("dialog", { name: "Report a problem" });
  await expect(problem.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await problem.getByLabel(/Why\?/).fill("Shower drain is blocked.");
  await problem.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Create maintenance task", exact: true }).click();
  const task = page.getByRole("dialog", { name: "Create maintenance task" });
  await expect(task.getByText(/starts unassigned/)).toBeVisible();
  await task.getByRole("button", { name: "Create task", exact: true }).click();
  await page.getByRole("link", { name: "Open maintenance task" }).click();
  await expect(page).toHaveURL(/\/maintenance\?branch=.+&task=/);
  await expect(page.getByRole("article", { name: /Check changing rooms are clean/ })).toBeVisible();
  await fits(page);
});

test("payables filters and maintenance history survive refresh", async ({ page }) => {
  await enter(page);
  await page.goto(`/operations/payables?branch=${branch}`);
  await page.getByRole("combobox", { name: "Payables status" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await expect(page).toHaveURL(/status=paid/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Payables status" })).toHaveText("Paid");
  await page.goto(`/maintenance?branch=${branch}`);
  await page.getByRole("button", { name: "Show history" }).click();
  await expect(page).toHaveURL(/history=1/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide history" })).toBeVisible();
});

test("branch work dialogs fit a short phone viewport", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 600 });
  await enter(page);
  for (const [route, button, title, action] of [
    [`/operations?branch=${branch}`, "Add item", "Add stock item", "Save item"],
    [`/operations?branch=${branch}&tab=orders`, "New purchase order", "Create purchase order", "Save draft"],
    [`/operations?branch=${branch}&tab=suppliers`, "Add supplier", "Add supplier", "Save supplier"],
    [`/operations/payables?branch=${branch}`, "Record payment", "Record supplier payment", "Record payment"],
    [`/maintenance?branch=${branch}`, "New task", "Add maintenance task", "Add to work list"],
  ]) {
    await page.goto(route!);
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    const submit = dialog.getByRole("button", { name: action, exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
    await fits(page);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  }
});

test("supplier payment confirmation keeps amount, posting and reversal distinct", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.goto(`/operations/payables?branch=${branch}`);
  await page.getByRole("button", { name: /^Pay Jordan Sports Supply for/ }).click();
  const dialog = page.getByRole("dialog", { name: "Record supplier payment" });
  await dialog.getByRole("textbox", { name: "Amount paid" }).fill("650");
  await expect(dialog.getByRole("textbox", { name: /Allocate to Purchase order/ })).toHaveValue("650.000");
  await dialog.getByTestId("confirm-supplier-payment").click();
  await expect(page).toHaveURL(/\/operations\/payables\/payments\//);
  await expect(page.getByTestId("supplier-payment-confirmation")).toBeVisible();
  await expect(page.getByText("Not posted to ledger yet", { exact: true }).first()).toBeVisible();
  await fits(page);
  await page.getByTestId("reverse-supplier-payment").click();
  const reversal = page.getByRole("dialog", { name: "Reverse supplier payment" });
  await expect(reversal.getByTestId("confirm-reverse-supplier-payment")).toBeDisabled();
  await reversal.getByRole("button", { name: "Cancel", exact: true }).click();
});
