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

  test("creates a member account and restores it after reload", async ({ page }) => {
    await page.goto("/customer/signup");

    await page.getByLabel("Full name").fill("Nour QA");
    await page.getByLabel("Email").fill("nour.qa@example.com");
    await page.getByLabel("Mobile number").fill("+962 79 321 4455");
    await page.locator("#signup-password").fill("preview-pass");
    await page.locator("#signup-confirm").fill("preview-pass");
    const createAccount = page.getByRole("button", { name: /create account/i });
    await expect(createAccount).toBeEnabled();
    await createAccount.click();

    await expect(page).toHaveURL(/\/customer\/discover/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Nour QA");

    await page.reload();
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Nour QA");
  });

  test("sends a member trial request into the selected gym CRM", async ({ page }) => {
    await page.goto("/login/member");
    await page.getByRole("radio", { name: /Yousef Nasser/i }).click();
    await page.getByRole("button", { name: /Continue as Yousef/i }).click();
    await expect(page).toHaveURL(/\/customer\/discover/);

    await page.getByRole("link", { name: /View & book/i }).first().click();
    await expect(page).toHaveURL(/\/customer\/gyms\/forge-fitness/);
    await page.getByRole("button", { name: /Send trial request/i }).click();
    await expect(page.getByRole("heading", { name: /Your free trial request is recorded/i })).toBeVisible();
    await expect(page.getByText(/request is now in the gym/i)).toBeVisible();

    await page.getByRole("link", { name: /Open My Gyms/i }).click();
    await expect(page.getByRole("region", { name: "Trial bookings" }).getByText(/requested/i)).toBeVisible();
    await expect(page.getByText("Forge Fitness Club").first()).toBeVisible();

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
    await expect(page.getByRole("link", { name: /Yousef Nasser, trial_booked/i })).toBeVisible();
  });

  test("does not promise My Gyms persistence for an unauthenticated trial request", async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.removeItem("rivet.demo.customer"));
    await page.goto("/customer/gyms/forge-fitness");

    await page.getByLabel("Full name").fill("Unauthenticated QA");
    await page.getByLabel("Phone").fill("+962 79 321 4456");
    await page.getByLabel("Email").fill("unauthenticated.qa@example.com");
    await page.getByLabel("What are you looking for?").fill("Test the public request confirmation");
    await page.getByRole("button", { name: /Send trial request/i }).click();

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

    await expect(page.getByRole("heading", { name: "Forge Fitness Club" })).toBeVisible();
    await expect(page.getByText("Omar Al-Khatib")).toBeVisible();
    await expect(page.getByText("Not configured").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Dana Al-Khatib");
    await expect(page.locator("body")).not.toContainText("Visa");
    await expect(page.locator("body")).not.toContainText("4041");
    await expect(page.locator("body")).not.toContainText("RV-1041");
    await expect(page.locator("body")).not.toContainText("Last active today");
  });

  test("keeps subscription shortcuts as an unsaved draft until an audited save", async ({ page }) => {
    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();
    await page.goto("/platform/gyms/forge-fitness");

    const suspend = page.getByRole("button", { name: "Suspend", exact: true });
    await expect(suspend).toBeVisible();
    await suspend.click();

    await expect(page.getByRole("status")).toContainText("Unsaved changes");
    await expect(page.getByLabel("Subscription status")).toContainText("Suspended");
    await expect(suspend).toBeVisible();
    await expect(page.getByRole("button", { name: /Save controls/i })).toBeDisabled();

    await page.getByRole("button", { name: /Cancel changes/i }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByLabel("Subscription status")).toContainText("Active");
  });
});
