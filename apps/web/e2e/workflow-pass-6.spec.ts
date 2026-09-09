import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce", colorScheme: "light" });

async function fixClock(page: Page) {
  // Fix date-dependent seed content while keeping native browser timers.
  await page.addInitScript(() => {
    const fixed = new Date("2026-09-06T09:00:00+03:00").valueOf();
    window.Date = new Proxy(Date, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [fixed]); },
      get(target, property) { return property === "now" ? () => fixed : Reflect.get(target, property); },
    });
  });
}

async function signIn(page: Page, role: "Owner" | "Manager" = "Owner") {
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
async function visit(page: Page, path: string, heading: RegExp | string, level: 1 | 2 = 1) {
  await page.goto(path);
  const title = page.getByRole("heading", { level, name: heading, exact: typeof heading === "string" });
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
// Linux references at the same tolerance, as the Pass 3 to 5 captures do.
function reference(name: string, width: number) {
  return width === 390 && process.platform === "linux" ? name.replace(/\.png$/, "-linux.png") : name;
}

async function capture(page: Page, name: string, width: number) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(reference(name, width), { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.04 });
}

type Section = { id: string; label: string; ready: (page: Page) => Promise<void> };

const SECTIONS: Section[] = [
  { id: "organization", label: "Organization", ready: async (page) => { await expect(page.getByLabel("Organization name")).toHaveValue(/./); } },
  { id: "brand", label: "Brand Kit", ready: async (page) => { await expect(page.getByRole("radiogroup", { name: "Workspace palette" })).toBeVisible(); } },
  { id: "profile", label: "Public profile", ready: async (page) => { await expect(page.getByLabel(/Short name/)).toHaveValue(/./); await expect(page.getByRole("heading", { name: "Version history", exact: true })).toBeVisible(); } },
  { id: "branches", label: "Branches", ready: async (page) => { await expect(page.getByText("Forge — Abdoun", { exact: true }).locator("visible=true").first()).toBeVisible(); } },
  { id: "spaces", label: "Gym spaces", ready: async (page) => { await expect(page.getByRole("heading", { name: /^Spaces in / })).toBeVisible(); } },
  { id: "agreement", label: "Agreement", ready: async (page) => { await expect(page.getByTestId("agreement-record")).toBeVisible(); } },
  { id: "subscription", label: "Subscription & invoices", ready: async (page) => { await expect(page.getByTestId("subscription-summary")).toBeVisible(); await expect(page.getByRole("heading", { name: "Invoices", exact: true })).toBeVisible(); } },
  { id: "users", label: "Users", ready: async (page) => { await expect(page.getByRole("button", { name: "Invite user", exact: true })).toBeVisible(); await expect(page.locator("main").getByText("Omar Al-Khatib", { exact: true }).locator("visible=true").first()).toBeVisible(); } },
  { id: "roles", label: "Roles & permissions", ready: async (page) => { await expect(page.getByRole("switch").first()).toBeVisible(); } },
  { id: "payments", label: "Payments", ready: async (page) => { await expect(page.getByRole("switch", { name: "Cash" })).toBeVisible(); await expect(page.getByLabel("Manager discount limit")).toHaveValue(/./); } },
  { id: "receipts", label: "Receipts & tax", ready: async (page) => { await expect(page.getByLabel("Receipt prefix")).toHaveValue(/./); } },
  { id: "notifications", label: "Notifications", ready: async (page) => { await expect(page.getByRole("switch", { name: "Renewal recovery" })).toBeVisible(); await expect(page.getByTestId("messaging-status")).toBeVisible(); } },
  { id: "email", label: "Operational email", ready: async (page) => { await expect(page.getByTestId("email-delivery-mode")).toBeVisible(); await expect(page.getByRole("checkbox", { name: "Payment receipt" })).toBeVisible(); } },
  { id: "operations", label: "Operational rules", ready: async (page) => { await expect(page.getByRole("spinbutton", { name: "Expiry warning, days" })).toHaveValue(/./); } },
  { id: "hours", label: "Hours & trials", ready: async (page) => { await expect(page.getByRole("checkbox", { name: "Sunday open" })).toBeVisible(); } },
  { id: "checklists", label: "Daily checklists", ready: async (page) => { await expect(page.getByRole("heading", { name: /^Checklists/ })).toBeVisible(); await expect(page.getByRole("list", { name: "Checklists" }).getByRole("listitem").first()).toBeVisible(); } },
];

for (const width of [360, 390, 768, 820, 1280, 1440]) {
  test(`every Settings section remains usable at ${width}px`, async ({ page }) => {
    // Sixteen full-page visits; CI's cold dev server needs the headroom.
    test.setTimeout(300_000);
    const shoot = width === 390 || width === 1440;
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await fixClock(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      // A stack-less "Invalid or unexpected token" is the dev server handing a
      // rebuilt chunk to a page that loaded before the rebuild (another editor
      // saving in the same tree); the build, typecheck and lint gates catch a
      // real syntax error. Everything else is a product failure.
      if (error.message === "Invalid or unexpected token" && !(error.stack ?? "").trim()) return;
      errors.push(`${error.message} @ ${(error.stack ?? "").split("\n").slice(0, 3).join(" | ")}`);
    });

    await signIn(page);
    for (const section of SECTIONS) {
      await visit(page, `/settings?section=${section.id}`, section.label, 2);
      await section.ready(page);
      // The rail (desktop) or the picker (phones and tablets) names the same section.
      if (width >= 1024) await expect(page.getByRole("tab", { name: section.label, exact: true })).toHaveAttribute("aria-selected", "true");
      else await expect(page.getByRole("combobox", { name: "Settings section" })).toContainText(section.label);
      await fits(page);
      if (shoot) await capture(page, `pass-6-${section.id}-${width}.png`, width);
    }

    expect(errors).toEqual([]);
  });
}

test("the selected section survives search, refresh, leaving and coming back", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings", "Settings");
  await expect(page.getByRole("tab", { name: "Organization" })).toHaveAttribute("aria-selected", "true");
  await expect(page).not.toHaveURL(/section=/);

  await page.getByRole("tab", { name: "Users" }).click();
  await expect(page).toHaveURL(/section=users/);
  await expect(page.getByRole("heading", { level: 2, name: "Users" })).toBeVisible();

  // Searching narrows the rail without losing the open section.
  const search = page.getByRole("textbox", { name: "Search settings" });
  await search.fill("freeze");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Operational rules" })).toHaveAttribute("aria-selected", "false");
  await expect(page.getByText("Showing Users. Choose a match to change section.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Users" })).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.getByRole("tab", { name: "Users" })).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: "Users" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("tab", { name: "Users" })).toHaveAttribute("aria-selected", "true");

  // Leave through the sidebar and come back with the browser.
  await page.getByRole("navigation").first().getByRole("link", { name: /^Dashboard$/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goBack();
  await expect(page).toHaveURL(/section=users/);
  await expect(page.getByRole("heading", { level: 2, name: "Users" })).toBeVisible({ timeout: 60_000 });
});

test("the rail is operable from the keyboard", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings?section=organization", "Organization", 2);

  const active = page.getByRole("tab", { name: "Organization" });
  await active.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Brand Kit" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Daily checklists" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Organization" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("tab", { name: "Hours & trials" })).toBeFocused();
  // Browsing never changes the section; choosing does.
  await expect(page.getByRole("tab", { name: "Organization" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/section=hours/);
  await expect(page.getByRole("heading", { level: 2, name: "Hours & trials" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Hours & trials" })).toHaveAttribute("aria-selected", "true");
});

test("edits are protected, saved from the shared bar and discarded cleanly", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings?section=organization", "Organization", 2);

  const name = page.getByLabel("Organization name");
  await expect(page.getByTestId("settings-save-bar")).toHaveCount(0);
  await name.fill("Forge Fitness Club Amman");
  const bar = page.getByTestId("settings-save-bar");
  await expect(bar).toContainText("Unsaved changes");

  // Changing section is guarded; Stay keeps the edit.
  await page.getByRole("tab", { name: "Receipts & tax" }).click();
  const guard = page.getByRole("dialog", { name: "Unsaved settings changes" });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Stay" }).click();
  await expect(guard).toBeHidden();
  await expect(name).toHaveValue("Forge Fitness Club Amman");
  await expect(page.getByRole("tab", { name: "Organization" })).toHaveAttribute("aria-selected", "true");

  // An empty required field disables saving and says why.
  await name.fill("");
  await expect(bar.getByRole("button", { name: "Save organization" })).toBeDisabled();
  await expect(bar).toContainText("Enter the gym's name before saving.");
  await name.fill("Forge Fitness Club Amman");

  // The keyboard shortcut saves; the bar reports success and clears.
  await name.press("ControlOrMeta+s");
  await expect(page.getByText("Organization settings saved — audited.")).toBeVisible();
  await expect(bar).toContainText("Changes saved");
  await expect(bar.getByRole("button", { name: "Save organization" })).toHaveCount(0);

  // Discard restores the saved value without a round trip.
  await name.fill("Scratch");
  await expect(bar).toContainText("Unsaved changes");
  await bar.getByRole("button", { name: "Discard" }).click();
  await expect(name).toHaveValue("Forge Fitness Club Amman");
  await expect(page.getByTestId("settings-save-bar")).toHaveCount(0);
});

test("payment methods and discount limits save as one draft", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings?section=payments", "Payments", 2);

  const other = page.getByRole("switch", { name: "Other / adjustment" });
  await expect(other).toHaveAttribute("data-state", "unchecked");
  await other.click();
  await expect(other).toHaveAttribute("data-state", "checked");
  const sales = page.getByLabel("Sales discount limit");
  await sales.fill("15");
  const bar = page.getByTestId("settings-save-bar");
  await expect(bar).toContainText("Unsaved changes");

  // A bad limit is explained, then corrected.
  await sales.fill("-1");
  await expect(bar.getByRole("button", { name: "Save payment settings" })).toBeDisabled();
  await expect(bar).toContainText("Enter a discount limit of 0 or more for every role.");
  await sales.fill("15");

  await bar.getByRole("button", { name: "Save payment settings" }).click();
  await expect(page.getByText("Payment settings saved — audited.")).toBeVisible();
  await expect(bar).toContainText("Changes saved");
  await expect(other).toHaveAttribute("data-state", "checked");
  await expect(sales).toHaveValue("15.000");
});

test("notifications and quiet hours save together and discard together", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings?section=notifications", "Notifications", 2);

  const renewal = page.getByRole("switch", { name: "Renewal recovery" });
  await expect(renewal).toHaveAttribute("data-state", "unchecked");
  await renewal.click();
  await page.getByLabel("Quiet hours from").fill("21:30");
  const bar = page.getByTestId("settings-save-bar");
  await expect(bar).toContainText("Unsaved changes");
  await bar.getByRole("button", { name: "Discard" }).click();
  await expect(renewal).toHaveAttribute("data-state", "unchecked");
  await expect(page.getByLabel("Quiet hours from")).toHaveValue("22:00");
  await expect(page.getByTestId("settings-save-bar")).toHaveCount(0);

  await renewal.click();
  await bar.getByRole("button", { name: "Save notifications" }).click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  await expect(renewal).toHaveAttribute("data-state", "checked");
});

test("the permission matrix works cell by cell with the keyboard", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings?section=roles", "Roles & permissions", 2);

  const cell = page.getByRole("switch", { name: "Sales — Archive members" });
  await expect(cell).toHaveAttribute("aria-checked", "false");
  await cell.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Permissions updated — audited.")).toBeVisible();
  await expect(cell).toHaveAttribute("aria-checked", "true");
});

test("phones get one role at a time, record lists and stacked dialogs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixClock(page);
  await signIn(page);

  // Roles: a role picker and one permission per row.
  await visit(page, "/settings?section=roles", "Roles & permissions", 2);
  await expect(page.getByRole("heading", { name: "Permissions by role", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Permission matrix", exact: true })).toBeHidden();
  await page.getByRole("combobox", { name: "Role to edit" }).click();
  await page.getByRole("option", { name: "Sales" }).click();
  const archive = page.getByRole("switch", { name: "Archive members" });
  await expect(archive).toHaveAttribute("data-state", "unchecked");
  await archive.click();
  await expect(page.getByText("Permissions updated — audited.")).toBeVisible();
  await expect(archive).toHaveAttribute("data-state", "checked");
  await fits(page);

  // Users: a list instead of a squeezed table; the invite dialog stacks its fields.
  await visit(page, "/settings?section=users", "Users", 2);
  await expect(page.getByRole("list", { name: "Staff" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite user" });
  await expect(dialog).toBeVisible();
  const role = await dialog.getByRole("combobox", { name: "Role" }).boundingBox();
  const scope = await dialog.getByRole("combobox", { name: "Branch scope" }).boundingBox();
  expect(role && scope && scope.y > role.y + role.height - 1).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await fits(page);

  // Branches and invoices read as lists too.
  await visit(page, "/settings?section=branches", "Branches", 2);
  await expect(page.getByRole("list", { name: "Branches" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  await visit(page, "/settings?section=subscription", "Subscription & invoices", 2);
  await expect(page.getByRole("list", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  await fits(page);
});

test("the public profile keeps its draft, publication and preview apart", async ({ page }) => {
  await fixClock(page);
  await signIn(page);
  await visit(page, "/settings?section=profile", "Public profile", 2);

  const review = page.getByRole("button", { name: "Send to RIVET for review" });
  await expect(review).toBeDisabled();
  await expect(page.getByTestId("settings-save-bar")).toHaveCount(0);
  const shortName = page.getByLabel(/Short name/);
  await shortName.fill("FORGE Amman");
  await expect(page.getByRole("heading", { name: "Preview", exact: true }).locator("xpath=ancestor::section[1]").getByText("FORGE Amman")).toBeVisible();
  const bar = page.getByTestId("settings-save-bar");
  await expect(bar).toContainText("Unsaved changes");
  await expect(review).toBeDisabled();
  await expect(review).toHaveAttribute("title", "Save or discard the unsaved edits first.");
  await bar.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Public profile draft saved and audited.")).toBeVisible();
  await expect(review).toBeEnabled();
  await expect(page.getByText(/Draft · v/)).toBeVisible();
});
