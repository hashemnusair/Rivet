import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const currentUrl = new URL(page.url());
  console.log(`[preview-failure] ${testInfo.title} · ${currentUrl.origin}${currentUrl.pathname}`);
});

test.describe("RIVET member experience", () => {
  test("keeps standalone mobile navigation in one app and clear of the home indicator", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/login/member");
    await page.getByRole("radio", { name: /Lina Haddad/i }).click();
    await page.getByRole("button", { name: /Continue as Lina/i }).click();
    await page.goto("/customer/my-gyms");

    const dock = page.locator("nav.member-bottom-nav");
    await expect(dock).toBeVisible();

    const standaloneState = await dock.evaluate((element) => {
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

    expect(standaloneState).toMatchObject({
      manifest: "/manifest.webmanifest",
    });
    expect(standaloneState.viewport).toContain("viewport-fit=cover");
    expect(standaloneState.dockPaddingBottom).toBeGreaterThanOrEqual(16);
    expect(standaloneState.shellPaddingBottom).toBeGreaterThanOrEqual(80);
    expect(standaloneState.homeIndicatorClearance).toBeGreaterThanOrEqual(16);

    const pageCount = page.context().pages().length;
    const explore = dock.getByRole("link", { name: "Explore" });
    await expect(explore).not.toHaveAttribute("target", "_blank");
    await explore.click();
    await expect(page).toHaveURL(/\/customer\/discover$/);
    expect(page.context().pages()).toHaveLength(pageCount);
  });

  test("routes preview signup to the seeded member entry point instead of faking an account", async ({ page }) => {
    // Member signup always runs through Clerk in real deployments. The
    // preview deliberately refuses to imitate account creation or collect a
    // password, and points at the seeded member personas instead.
    await page.goto("/customer/signup");

    await expect(page.getByRole("heading", { name: /Member signup runs through Clerk/i })).toBeVisible();
    await expect(page.getByText(/does not create accounts or store passwords/i)).toBeVisible();
    await page.getByRole("link", { name: /Open member preview/i }).click();
    await expect(page).toHaveURL(/\/login\/member/);
    await expect(page.getByRole("radio", { name: /Yousef Nasser/i })).toBeVisible();
  });

  test("sends a member trial request into the selected gym CRM", async ({ page }) => {
    await page.goto("/login/member");
    await page.getByRole("radio", { name: /Yousef Nasser/i }).click();
    await page.getByRole("button", { name: /Continue as Yousef/i }).click();
    await expect(page).toHaveURL(/\/customer\/discover/);

    await page.getByRole("link", { name: /View & book/i }).first().click();
    await expect(page).toHaveURL(/\/customer\/gyms\/forge-fitness/);
    // Trial requests are scheduled: choosing a branch unlocks that branch's
    // bookable window and pre-fills the opening time.
    await page.getByLabel("Branch").selectOption({ label: "Forge — Abdoun" });
    await expect(page.getByLabel("Time")).toBeEnabled();
    const sendAuthenticatedTrial = page.getByRole("button", { name: /Send trial request/i });
    await expect(sendAuthenticatedTrial).toBeEnabled();
    await sendAuthenticatedTrial.click();
    await expect(page.getByRole("heading", { name: /Your free trial request is recorded/i })).toBeVisible();
    await expect(page.getByText(/request is now in the gym/i)).toBeVisible();

    await page.getByRole("link", { name: /Open My Gyms/i }).click();
    await expect(page.getByRole("region", { name: "Subscribed gyms" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subscribed gyms" })).toBeVisible();
    await expect(page.getByText("0 gyms")).toBeVisible();
    await expect(page.getByRole("region", { name: "Free trials" })).toHaveCount(0);

    // Use the consolidated account control to leave the member session. The
    // frontend mock and its newly created lead remain alive while switching
    // to staff mode.
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    // /login only chooses a portal; the gym team signs in one level down.
    await page.getByRole("link", { name: /Gym team/i }).click();
    await expect(page).toHaveURL(/\/login\/gym$/);
    // The label uses a typographic apostrophe, so match either form.
    await page.getByRole("button", { name: /Open Omar.s workspace/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("link", { name: /^(Follow-ups|Leads)$/ }).first().click();
    await expect(page.getByRole("link", { name: /Yousef Nasser, Trial/i })).toBeVisible();
  });

  test("does not promise My Gyms persistence for an unauthenticated trial request", async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.removeItem("rivet.demo.customer"));
    await page.goto("/customer/gyms/forge-fitness");

    await page.getByLabel("Full name").fill("Unauthenticated QA");
    await page.getByLabel("Phone").fill("+962 79 321 4456");
    await page.getByLabel("Email").fill("unauthenticated.qa@example.com");
    await page.getByLabel("Branch").selectOption({ label: "Forge — Abdoun" });
    await expect(page.getByLabel("Time")).toBeEnabled();
    await page.getByLabel("What are you looking for?").fill("Test the public request confirmation");
    const sendPublicTrial = page.getByRole("button", { name: /Send trial request/i });
    await expect(sendPublicTrial).toBeEnabled();
    await sendPublicTrial.click();

    await expect(page.getByRole("heading", { name: /Your free trial request is recorded/i })).toBeVisible();
    await expect(page.getByText(/request is now in the gym/i)).toBeVisible();
    await expect(page.getByText(/Sign in or create a member account to keep future bookings under your name/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in to RIVET/i })).toHaveAttribute("href", "/login");
  });

  test("keeps entry QR hidden until requested and closes the short-lived pass", async ({ page }) => {
    await page.goto("/login/member");
    await page.getByRole("radio", { name: /Lina Haddad/i }).click();
    await page.getByRole("button", { name: /Continue as Lina/i }).click();
    await page.goto("/customer/my-gyms/membership-lina-forge");

    await expect(page.getByRole("button", { name: "Show entry QR" })).toBeVisible();
    await expect(page.locator("svg[aria-label*='QR']")).toHaveCount(0);
    await page.getByRole("button", { name: "Show entry QR" }).click();
    const dialog = page.getByRole("dialog", { name: /entry QR/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("svg[aria-label*='QR']")).toBeVisible();
    await expect(dialog.getByText(/Expires /)).toBeVisible();
    await dialog.getByRole("button", { name: /Close dialog|Close/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("svg[aria-label*='QR']")).toHaveCount(0);
  });
});

test.describe("RIVET gym applications", () => {
  test("shows four tiers, annual savings, and carries pricing selection into the application", async ({ page }) => {
    await page.goto("/#pricing");
    const pricing = page.locator("#pricing");
    await pricing.scrollIntoViewIfNeeded();

    await expect(pricing.getByText("Enterprise", { exact: true })).toBeVisible();
    await expect(pricing.getByText("JD 500.000", { exact: true })).toBeVisible();
    await expect(pricing.getByRole("tab", { name: "Monthly" })).toHaveAttribute("aria-selected", "true");

    await pricing.getByRole("tab", { name: /Annual/ }).click();
    await expect(pricing.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "true");
    await expect(pricing.getByText("Save 20%", { exact: true }).first()).toBeVisible();
    await expect(pricing.getByText("JD 63.200", { exact: true })).toBeVisible();
    await expect(pricing.getByText("JD 758.400 billed annually", { exact: false }).first()).toBeVisible();

    // The carrying contract lives in the link itself: the Starter card must
    // encode the selected plan and billing interval before any navigation.
    const starterApplication = pricing.getByRole("link", { name: "Send gym application" }).first();
    await expect(starterApplication).toHaveAttribute("href", "/signup?plan=Starter&interval=annual");
    await starterApplication.click();
    await expect(page).toHaveURL(/\/signup\?plan=Starter&interval=annual$/);
    await expect(page.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("radio", { name: /Starter/ })).toHaveAttribute("aria-checked", "true");
  });

  test("stores a gym application and shows the receipt", async ({ page }) => {
    await page.goto("/signup");

    await page.getByLabel("Owner name").fill("Omar QA");
    await page.getByLabel("Email address").fill("omar.qa@example.com");
    await page.getByLabel("Contact number").fill("+962 79 555 0101");
    await page.getByLabel("Gym name").fill("Northstar QA Fitness");
    await page.getByRole("button", { name: /Send gym application/i }).click();

    await expect(page.getByRole("heading", { name: /We’ll be in touch soon/i })).toBeVisible();
    await expect(page.getByText("omar.qa@example.com")).toBeVisible();
  });
});

test.describe("RIVET platform administration", () => {
  test("guards the console and restores an authenticated admin reload", async ({ page }) => {
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to RIVET" })).toBeVisible();
    await page.getByRole("link", { name: /Platform admin preview/i }).click();
    await expect(page.getByRole("heading", { name: "Platform administration" })).toBeVisible();

    await page.getByRole("button", { name: /Open platform console/i }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  });

  test("reviews a gym application before provisioning access", async ({ page }) => {
    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();
    await page.getByRole("link", { name: "Applications", exact: true }).click();
    await expect(page).toHaveURL(/\/platform\/applications$/);
    await expect(page.getByRole("heading", { name: "Gym applications" })).toBeVisible();
    await expect(page.getByText("Northline Strength").first()).toBeVisible();

    await page.getByRole("button", { name: /Northline Strength/i }).click();
    await page.getByLabel("Review notes").fill("Verified the owner and branch address.");
    await page.getByRole("button", { name: /Approve application/i }).click();
    await expect(page.getByText(/Application approved\./)).toBeVisible();
    await page.getByLabel("Review notes").fill("Follow up before the first billing cycle.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByRole("status")).toContainText("Review note saved.");
  });

  test("shows only scoped gym detail facts and explicit unavailable states", async ({ page }) => {
    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();
    await page.goto("/platform/gyms/forge-fitness");

    await expect(page.getByRole("heading", { name: "Forge Fitness Club", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Omar Al-Khatib", exact: true })).toBeVisible();
    await expect(page.getByText("Not configured").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Dana Al-Khatib");
    await expect(page.locator("body")).not.toContainText("Visa");
    await expect(page.locator("body")).not.toContainText("4041");
    await expect(page.locator("body")).not.toContainText("RV-1041");
    await expect(page.locator("body")).not.toContainText("Last active today");
  });

  test("never suspends without a reasoned confirmation and leaves gym pages informational", async ({ page }) => {
    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();

    // The gym page is informational: no subscription editing controls exist,
    // only the deep link into the billing subscription home.
    await page.goto("/platform/gyms/forge-fitness");
    await expect(page.getByRole("heading", { name: "Forge Fitness Club", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Save controls/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Manage subscription", exact: true })).toHaveAttribute("href", "/platform/billing?bill=forge-fitness");

    // On billing, suspension demands a reason and dismissing the dialog
    // writes nothing.
    await page.goto("/platform/billing");
    const forgeRow = page.locator('section[aria-labelledby="gym-subscriptions-heading"]').getByRole("row", { name: /Forge Fitness Club/ });
    await forgeRow.getByRole("button", { name: "Suspend", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /Suspend Forge Fitness Club\?/ });
    await expect(dialog.getByRole("button", { name: "Suspend gym", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Keep as is", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(forgeRow).toContainText("active");
  });

  test("suppresses a suspended gym from public surfaces while retaining the authorized platform record", async ({ page }) => {
    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();
    // Subscription actions live on the billing page; gym pages stay
    // informational.
    await page.goto("/platform/billing");

    const forgeRow = page.locator('section[aria-labelledby="gym-subscriptions-heading"]').getByRole("row", { name: /Forge Fitness Club/ });
    await forgeRow.getByRole("button", { name: "Suspend", exact: true }).click();
    const suspendDialog = page.getByRole("dialog", { name: /Suspend Forge Fitness Club\?/ });
    await suspendDialog.getByLabel("Reason for this change").fill("Temporarily suspended for marketplace visibility regression coverage.");
    await suspendDialog.getByRole("button", { name: "Suspend gym", exact: true }).click();

    await expect(page.getByText("Subscription status saved and audited.", { exact: true }).last()).toBeVisible();
    await expect(forgeRow.getByRole("button", { name: /Reactivate & bill/ })).toBeVisible();

    // The gym's informational record reflects the audited mutation live in
    // the same session: the timeline gains the audit entry and the facts card
    // flips to suspended.
    await forgeRow.getByRole("link", { name: "Forge Fitness Club", exact: true }).click();
    await expect(page).toHaveURL(/\/platform\/gyms\/forge-fitness$/);
    await expect(page.getByText(/Updated Forge Fitness Club subscription: active → suspended/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage subscription", exact: true })).toBeVisible();

    // The authorized platform directory retains the tenant for audit and
    // restoration, even though its public listing is now suppressed.
    // Keep this as an in-app navigation: the mock adapter intentionally holds
    // the audited mutation in its browser session, just like the realtime
    // Convex client holds it in its live query cache.
    await page.getByRole("link", { name: "All gyms", exact: true }).click();
    await expect(page).toHaveURL(/\/platform\/gyms$/);
    // The directory intentionally defaults to active tenants. Select the
    // suspended view explicitly so this audit-retained record remains
    // observable after the subscription mutation.
    await page.getByRole("button", { name: /^Suspended \d+$/ }).click();
    const suspendedCard = page.locator("article").filter({ hasText: "Forge Fitness Club" });
    await expect(suspendedCard).toBeVisible();
    await expect(suspendedCard.getByLabel("Subscription status: Suspended")).toBeVisible();

    // Public discovery and the landing-page network section must both consume
    // the filtered marketplace projection, never the platform tenant array.
    await page.getByRole("link", { name: /Public site/i }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("link", { name: "Find a gym", exact: true }).first().click();
    await expect(page).toHaveURL(/\/customer\/discover$/);
    await expect(page.getByRole("heading", { name: "Find a gym", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Forge Fitness Club/i })).toHaveCount(0);

    await page.locator('a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /Forge Fitness Club/i })).toHaveCount(0);
  });
});
