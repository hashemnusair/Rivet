import { expect, test } from "@playwright/test";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  console.log(`[preview-failure] ${testInfo.title} · ${page.url()}`);
  console.log(`[preview-failure] body: ${(await page.locator("body").innerText()).slice(0, 2000)}`);
});

test.describe("RIVET member experience", () => {
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
    await page.getByRole("button", { name: /Book free trial/i }).click();
    await expect(page.getByRole("heading", { name: /Your free trial is booked/i })).toBeVisible();

    await page.getByRole("link", { name: /Open My Gyms/i }).click();
    await expect(page.getByText("Trial requested")).toBeVisible();
    await expect(page.getByText("Forge Fitness Club").first()).toBeVisible();

    // Use client-side navigation so the frontend mock and its newly created
    // lead remain alive while switching from member to staff mode.
    await page.getByRole("link", { name: "RIVET for gyms" }).click();
    // /login only chooses a portal; the gym team signs in one level down.
    await page.getByRole("link", { name: "Sign in", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("link", { name: /Gym team/i }).click();
    await expect(page).toHaveURL(/\/login\/gym$/);
    // The label uses a typographic apostrophe, so match either form.
    await page.getByRole("button", { name: /Open Omar.s workspace/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.getByRole("link", { name: "Pipeline", exact: true }).first().click();
    await expect(page.getByRole("article", { name: /Yousef Nasser, trial_booked/i })).toBeVisible();
  });

  test("does not promise My Gyms persistence for an unauthenticated trial request", async ({ page }) => {
    await page.goto("/customer/gyms/forge-fitness");

    await page.getByLabel("Full name").fill("Unauthenticated QA");
    await page.getByLabel("Phone").fill("+962 79 321 4456");
    await page.getByLabel("Email").fill("unauthenticated.qa@example.com");
    await page.getByLabel("What are you looking for?").fill("Test the public request confirmation");
    await page.getByRole("button", { name: /Book free trial/i }).click();

    await expect(page.getByRole("heading", { name: /Your free trial is booked/i })).toBeVisible();
    await expect(page.getByText(/Sign in or create a member account to keep future bookings under your name/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in to RIVET/i })).toHaveAttribute("href", "/login");
  });

  test("labels the local QR as preview-only", async ({ page }) => {
    await page.goto("/login/member");
    await page.getByRole("radio", { name: /Lina Haddad/i }).click();
    await page.getByRole("button", { name: /Continue as Lina/i }).click();
    await page.goto("/customer/my-gyms/membership-lina-forge");

    await expect(page.getByText(/Preview code for the local demo/i)).toBeVisible();
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
});
