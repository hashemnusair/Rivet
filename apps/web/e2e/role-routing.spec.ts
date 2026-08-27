import { expect, test, type Page } from "@playwright/test";

const DEMO_PERSONA_KEY = "rivet.demo.persona";

type VisibleStaffRole = "owner" | "manager" | "salesperson" | "receptionist";
type HiddenStaffRole = "trainer" | "auditor";

const VISIBLE_ROLE_LABELS: Record<VisibleStaffRole, RegExp> = {
  owner: /Owner Omar Al-Khatib/i,
  manager: /Manager Layla Haddad/i,
  salesperson: /Sales Sara Abuhamdan/i,
  receptionist: /Reception Hala Qasem/i,
};

async function enterVisibleStaff(page: Page, role: VisibleStaffRole) {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: VISIBLE_ROLE_LABELS[role] }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function enterHiddenStaff(page: Page, role: HiddenStaffRole, destination: "/dashboard" | "/reports") {
  // Trainer and auditor are supported seeded personas, but are intentionally
  // not account-chooser shortcuts. The preview's existing sessionStorage seam
  // lets this matrix exercise their real route guards without introducing a
  // second auth path or a Production bypass.
  await page.goto("/login/gym");
  await page.evaluate(({ key, value }) => window.sessionStorage.setItem(key, value), { key: DEMO_PERSONA_KEY, value: role });
  await page.reload();
  await expect(page.getByRole("button", { name: /Open Omar.s workspace/i })).toBeVisible();
  await page.goto(destination);
  await expect(page).toHaveURL(new RegExp(`${destination.replace("/", "\\/")}$`));
}

async function expectGymWorkspace(page: Page, destination: "/dashboard" | "/reception" | "/reports") {
  await expect(page).toHaveURL(new RegExp(`${destination.replace("/", "\\/")}$`));
  await expect(page.locator('aside[aria-label="Primary navigation"]')).toBeVisible();
}

async function enterMember(page: Page) {
  await page.goto("/login/member");
  await page.getByRole("radio", { name: /Lina Haddad/i }).click();
  await page.getByRole("button", { name: /Continue as Lina/i }).click();
  await expect(page).toHaveURL(/\/customer\/my-gyms$/);
  await expect(page.getByRole("heading", { name: "Subscribed gyms" })).toBeVisible();
}

async function enterPlatformAdmin(page: Page) {
  await page.goto("/login/admin");
  await page.getByRole("button", { name: /Open platform console/i }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
}

test.describe("credential-free role routing", () => {
  test("routes member, owner, manager, sales, reception, trainer, and auditor to their workspaces", async ({ page }) => {
    await enterMember(page);
    await expect(page.getByRole("heading", { name: "Subscribed gyms" })).toBeVisible();

    await enterVisibleStaff(page, "owner");
    await expectGymWorkspace(page, "/dashboard");

    await enterVisibleStaff(page, "manager");
    await expectGymWorkspace(page, "/dashboard");

    await enterVisibleStaff(page, "salesperson");
    await expectGymWorkspace(page, "/dashboard");

    await enterVisibleStaff(page, "receptionist");
    await expectGymWorkspace(page, "/reception");

    await enterHiddenStaff(page, "trainer", "/dashboard");
    await expectGymWorkspace(page, "/dashboard");

    await enterHiddenStaff(page, "auditor", "/reports");
    await expectGymWorkspace(page, "/reports");
  });

  test("opens the platform console only for the platform administrator", async ({ page }) => {
    await enterPlatformAdmin(page);
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), DEMO_PERSONA_KEY)).toBeNull();
    expect(await page.evaluate(() => window.sessionStorage.getItem("rivet.demo.customer"))).toBeNull();
    await expect(page.getByRole("navigation", { name: "Member navigation" })).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to RIVET" })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Platform overview" })).toHaveCount(0);
  });

  test("redirects gym staff away from the platform console", async ({ page }) => {
    await enterVisibleStaff(page, "owner");
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Platform overview" })).toHaveCount(0);
  });

  test("keeps members out of gym and platform routes", async ({ page }) => {
    await enterMember(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/customer\/my-gyms$/);
    await expect(page.getByRole("heading", { name: "Subscribed gyms" })).toBeVisible();

    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Platform overview" })).toHaveCount(0);
  });

  test("denies reception finance access by direct URL", async ({ page }) => {
    await enterVisibleStaff(page, "receptionist");
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Not allowed for this role" })).toBeVisible();
    await expect(page.getByText(/financial reporting access/i)).toBeVisible();
  });

  test("shows the recovery state for unavailable gym access", async ({ page }) => {
    // Convex-only identity states cannot be fabricated safely in the mock
    // adapter. This explicit preview fixture renders the same recovery
    // component while remaining unavailable to Production builds.
    await page.goto("/login/gym?preview=unavailable-gym");
    await expect(page.getByText("Your gym workspace is unavailable")).toBeVisible();
    await expect(page.getByText(/platform administrator to restore the gym's subscription/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Sign out and use another account/i })).toBeVisible();
  });

  test("keeps valid transitions free of wrong-role flashes and restores the destination on cold refresh", async ({ page }) => {
    const wrongRoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /role could not be loaded|not allowed for this role/i.test(message.text())) wrongRoleErrors.push(message.text());
    });

    await enterVisibleStaff(page, "owner");
    await expectGymWorkspace(page, "/dashboard");
    await expect(page.getByText("Your role could not be loaded")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Not allowed for this role" })).toHaveCount(0);
    await page.reload();
    await expectGymWorkspace(page, "/dashboard");

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out of demo" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await enterMember(page);
    await page.reload();
    await expect(page).toHaveURL(/\/customer\/my-gyms$/);
    await expect(page.getByRole("heading", { name: "Subscribed gyms" })).toBeVisible();
    expect(wrongRoleErrors).toEqual([]);
  });
});
