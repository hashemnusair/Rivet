import { expect, test, type Page } from "@playwright/test";

/**
 * Browser-level happy path required by docs/02:
 *   member lookup → renewal / payment → updated timeline
 *
 * Everything runs against the in-memory MockGymOSApi, so no backend, database
 * or secret is involved. Each test starts from a fresh page (and therefore a
 * freshly seeded demo tenant).
 */

async function signIn(page: Page, persona: "Owner" | "Manager" | "Sales" | "Reception") {
  // Every sign-in starts at /login; the gym team has its own portal beneath it.
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByRole("button", { name: /^Open .+ workspace$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectVerdictRegionsDoNotOverlap(page: Page) {
  const identityBox = await page.getByTestId("checkin-identity").boundingBox();
  const factsBox = await page.getByTestId("checkin-facts").boundingBox();
  if (!identityBox || !factsBox) throw new Error("reception verdict regions did not render");

  const overlap =
    identityBox.x < factsBox.x + factsBox.width &&
    factsBox.x < identityBox.x + identityBox.width &&
    identityBox.y < factsBox.y + factsBox.height &&
    factsBox.y < identityBox.y + identityBox.height;
  expect(overlap, "member identity and membership facts must never overlap").toBe(false);
}

test.describe("member lookup → renewal → payment → timeline", () => {
  test("a salesperson renews an expiring member and the record agrees everywhere", async ({ page }) => {
    await signIn(page, "Sales");

    // ---- Work the expiring-members queue ----------------------------------
    await page.goto("/crm/queues");
    await page.getByRole("button", { name: /Expiring/ }).click();

    const firstRow = page.locator("li > button").filter({ has: page.locator("span") }).first();
    await expect(firstRow).toBeVisible();
    const memberName = (await firstRow.locator("span.font-medium").first().innerText()).trim();

    // Selecting a row opens the work panel for that member.
    await firstRow.click();
    const panel = page.getByTestId("queue-work-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(memberName);

    // ---- Open the member record (client-side nav keeps the mock tenant) ----
    await panel.getByRole("link", { name: /^Open$/ }).click();
    await expect(page).toHaveURL(/\/members\//);

    // ---- Renew -------------------------------------------------------------
    await page.getByTestId("renew-membership").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The sale surface states the money before anything is committed.
    await expect(dialog).toContainText(/JOD/);
    await dialog.getByRole("button", { name: /confirm|renew|complete|sell/i }).last().click();
    await expect(dialog).toBeHidden();

    // ---- The chronological record reflects it ------------------------------
    await expect(page.getByText(/renewed|membership sold/i).first()).toBeVisible();
  });

  test("changes an expiring member's plan with an explicit successor term", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/crm/queues");
    await page.getByRole("button", { name: /Expiring/ }).click();
    const firstRow = page.locator("li > button").filter({ has: page.locator("span") }).first();
    await firstRow.click();
    await page.getByTestId("queue-work-panel").getByRole("link", { name: /^Open$/ }).click();
    await expect(page).toHaveURL(/\/members\//);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Change plan/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/no proration/i);
    await dialog.getByLabel("New membership plan").click();
    await page.getByRole("option").first().click();
    await dialog.getByPlaceholder("e.g. Member moving to unlimited access at next renewal").fill("Member selected a different tier at renewal.");
    await dialog.getByRole("button", { name: "Change plan" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/successor term created/i)).toBeVisible();
  });

  test("reception collects an outstanding balance and the receipt is reachable", async ({ page }) => {
    await signIn(page, "Reception");

    // Find a member who owes money.
    await page.goto("/members");
    await page.getByLabel("Membership status filter").click();
    await page.getByRole("option", { name: /has balance due/i }).click();

    const row = page.getByTestId("member-row").first();
    await expect(row).toBeVisible();
    await row.click();

    // Collect the balance from the member header.
    await page.getByTestId("collect-outstanding").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/outstanding balance/i);
    await dialog.getByTestId("confirm-payment").click();
    await expect(dialog).toBeHidden();

    // The balance is settled and the timeline records the payment.
    await expect(page.getByText(/payment collected/i).first()).toBeVisible();

    // The receipt opens from the timeline and is a real printable document.
    await page.getByRole("link", { name: /^receipt$/i }).first().click();
    await expect(page).toHaveURL(/\/payments\/receipts\//);
    const receipt = page.locator("#receipt-print");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(/RECEIPT/);
    await expect(receipt).toContainText(/R-\d+/);
  });
});

test.describe("reception check-in", () => {
  test("looks a member up, checks them in, and updates today's attendance log", async ({ page }) => {
    await signIn(page, "Reception");
    // Reception signs straight into the console, not the dashboard.
    await expect(page.getByTestId("reception-search")).toBeVisible();
    await expect(page).toHaveURL(/\/reception/);
    await expect(page.getByTestId("reception-search")).toBeFocused();

    // Grab a real member number from the members table first.
    await page.goto("/members");
    const memberRow = page.getByTestId("member-row").first();
    const memberName = await memberRow.locator("p.font-medium").innerText();
    const number = await memberRow.locator("p.font-mono").first().innerText();

    await page.goto("/reception");
    await page.getByTestId("reception-search").fill(number.trim());

    const verdict = page.getByTestId("checkin-verdict");
    await expect(verdict).toBeVisible();
    await expect(verdict).toHaveAttribute("data-decision", /allowed|warning|blocked/);

    // The identity/facts regions must remain readable at both the desktop
    // console width and a narrow tablet width. This catches the old flex-item
    // collision when a long member name squeezes the facts grid.
    await expectVerdictRegionsDoNotOverlap(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(verdict).toBeVisible();
    await expectVerdictRegionsDoNotOverlap(page);

    const decision = await verdict.getAttribute("data-decision");
    if (decision !== "blocked") {
      await page.getByTestId("confirm-checkin").click();
      await expect(page.getByText(/checked in ·/i)).toBeVisible();
      await expect(page.getByTestId("next-member")).toBeVisible();
      const activity = page.getByRole("complementary", { name: "Branch activity" });
      await expect(activity.getByText("Today's check-in log")).toBeVisible();
      await expect(activity).toContainText(memberName.trim());
    } else {
      // A blocked member offers a remedy instead of entry.
      await expect(page.getByTestId("confirm-checkin")).toBeHidden();
      await expect(page.getByTestId("quick-renew")).toBeVisible();
    }
  });

  test("blocks an unknown scan without leaving the lane", async ({ page }) => {
    await signIn(page, "Reception");
    await expect(page.getByTestId("reception-search")).toBeVisible();
    await page.getByTestId("reception-search").fill("no-such-member-xyz");
    await expect(page.getByText(/no member matches/i)).toBeVisible();
    await expect(page.getByTestId("checkin-verdict")).toBeHidden();
  });
});

test.describe("role restrictions", () => {
  test("describes the actual dashboard branch scope", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/dashboard");
    await expect(page.getByText("All 2 branches, consolidated.")).toBeVisible();
  });

  test("hides finance and system areas from reception", async ({ page }) => {
    await signIn(page, "Reception");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: /^Transactions$/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /^Audit log$/ })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: /^Settings$/ })).toHaveCount(0);
  });

  test("refuses the transaction ledger by URL, not just by hiding the link", async ({ page }) => {
    await signIn(page, "Reception");
    await page.goto("/payments");
    await expect(page.getByText(/not allowed for this role/i)).toBeVisible();
  });

  test("gives the owner finance, audit and settings", async ({ page }) => {
    await signIn(page, "Owner");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: /^Transactions$/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Audit log$/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Settings$/ })).toBeVisible();
  });
});

test.describe("settings navigation", () => {
  test("keeps the full settings tab row reachable by keyboard at tablet width", async ({ page }) => {
    await signIn(page, "Owner");
    await page.setViewportSize({ width: 900, height: 900 });
    await page.goto("/settings");
    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    const dimensions = await tabs.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
    await page.getByRole("tab", { name: "Organization" }).focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Rules & hours" })).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText(/rules|hours|operating/i);
  });
});

test.describe("CRM lead capture", () => {
  test("captures an optional email and exposes an explicit unassigned owner", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/crm/pipeline");
    await page.getByRole("button", { name: /New lead/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Email")).toBeVisible();
    await dialog.getByLabel("Email").fill("prospect@example.com");
    await dialog.getByLabel("Owner").click();
    await page.getByRole("option", { name: "Unassigned" }).click();
    await expect(dialog.getByLabel("Owner")).toContainText("Unassigned");
  });

  test("shows the simplified trial-to-membership workflow without offer or member-only conversion controls", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/crm/pipeline");
    await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Trial" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Membership sale" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Successful \d+$/, exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^Not successful \d+$/, exact: true })).toHaveCount(0);
    const view = page.getByRole("group", { name: "Lead view" });
    await expect(view.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
    await view.getByRole("button", { name: "List" }).click();
    await expect(view.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    const leadLink = page.locator('a[href^="/crm/leads/"]').first();
    await expect(leadLink).toBeVisible();
    await leadLink.click();
    await expect(page).toHaveURL(/\/crm\/leads\//);
    await expect(page.getByRole("list", { name: "Simple sales progress" })).toContainText("Trial");
    await expect(page.getByRole("list", { name: "Simple sales progress" })).toContainText("Membership sale");
    await expect(page.getByRole("button", { name: "Create offer" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Convert to member/i })).toHaveCount(0);
  });
});

test.describe("sensitive actions are audited", () => {
  test("a manager override appears in the audit log with its reason", async ({ page }) => {
    await signIn(page, "Manager");

    // Find an expired member so the check-in is blocked.
    await page.goto("/members");
    await page.getByLabel("Membership status filter").click();
    await page.getByRole("option", { name: /^Expired$/ }).click();
    const number = await page.getByTestId("member-row").first().locator("p.font-mono").first().innerText();

    await page.goto("/reception");
    await page.getByTestId("reception-search").fill(number.trim());
    await expect(page.getByTestId("checkin-verdict")).toHaveAttribute("data-decision", "blocked");

    await page.getByTestId("override-checkin").click();
    const reason = "Renewing at the desk right now";
    await page.getByTestId("override-reason").fill(reason);
    await page.getByTestId("confirm-override").click();
    await expect(page.getByText(/checked in ·/i)).toBeVisible();

    // Navigate in-app: the mock tenant lives in memory for the page's lifetime,
    // so a full reload would re-seed it and discard the override we just made.
    await page.getByRole("link", { name: /^Audit log$/ }).click();
    await expect(page).toHaveURL(/\/audit/);
    await page.getByLabel("Category filter").click();
    await page.getByRole("option", { name: /check-?ins/i }).click();

    // Rows are expandable buttons; target this member's override specifically
    // because the seed contains other overrides.
    const row = page
      .getByRole("button", { expanded: false })
      .filter({ hasText: /override/i })
      .filter({ hasText: number.trim() })
      .first();
    await expect(row).toBeVisible();
    await row.click();

    // The expanded detail carries the reason and says the trail is append-only.
    await expect(page.getByText(reason)).toBeVisible();
    await expect(page.getByText(/append-only/i)).toBeVisible();
  });
});

test.describe("internationalization", () => {
  test("flips the whole shell to right-to-left", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/members");

    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.getByRole("button", { name: /right-to-left/i }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // The table still renders and the sidebar has moved to the right edge.
    await expect(page.getByTestId("member-row").first()).toBeVisible();
    const sidebar = page.getByRole("navigation").first();
    const box = await sidebar.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThan(viewport.width / 2);

    // And back again.
    await page.getByRole("button", { name: /left-to-right|right-to-left/i }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });
});

test.describe("demo state controls", () => {
  test("resets the tenant back to the canonical seed", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/members");
    await expect(page.getByTestId("member-row").first()).toBeVisible();
    const before = await page.getByTestId("member-row").count();
    expect(before).toBeGreaterThan(0);

    await page.getByRole("button", { name: /demo controls/i }).click();
    const reset = page.getByRole("button", { name: /reset demo data/i });
    await expect(reset).toBeVisible();
    await reset.click();

    await page.goto("/members");
    await expect(page.getByTestId("member-row").first()).toBeVisible();
    expect(await page.getByTestId("member-row").count()).toBe(before);
  });
});
