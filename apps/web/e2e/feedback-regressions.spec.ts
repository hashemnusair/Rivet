import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "en-US", timezoneId: "Asia/Amman", reducedMotion: "reduce", colorScheme: "light" });
test.describe.configure({ timeout: 120_000 });

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error/)).toHaveCount(0);
}

async function signInGym(page: Page, role: "Owner" | "Manager" = "Manager") {
  await page.goto("/login/gym", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("/login/gym", { waitUntil: "domcontentloaded" });
  await page.getByRole("radio", { name: new RegExp(role, "i") }).click();
  await page.getByTestId("sign-in-button").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function signInPlatform(page: Page) {
  await page.goto("/login/admin", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.sessionStorage.clear());
  await page.goto("/login/admin", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open platform console/i }).click();
  await page.waitForURL(/\/platform$/, { timeout: 60_000 });
}

test("the public application requires a gym address and uses an explicit phone prompt", async ({ page }) => {
  await page.goto("/signup", { waitUntil: "domcontentloaded" });
  const submit = page.getByRole("button", { name: /Send gym application/i });
  await expect(submit).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByLabel("Gym address")).toBeVisible();
  await expect(page.getByLabel("Contact number")).toHaveAttribute("placeholder", "Enter a reachable number");
  await submit.click();
  await expect(page.getByText("Enter the gym's physical address.")).toBeVisible();
});

test("staff can open personal settings and the getting-started role anchor", async ({ page }) => {
  await signInGym(page, "Manager");
  await page.goto("/settings?section=my-profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 2, name: "My profile" })).toBeVisible();
  const name = page.getByLabel("Display name");
  await expect(name).toBeVisible();
  await expect(page.getByLabel("Phone")).toBeVisible();
  const updatedName = `${await name.inputValue()} QA`;
  await name.fill(updatedName);
  const saveBar = page.getByTestId("settings-save-bar");
  await expect(saveBar).toContainText("Unsaved changes");
  await saveBar.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Your profile was updated.")).toBeVisible();
  await expect(name).toHaveValue(updatedName);

  await page.goto("/getting-started#role", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#role")).toBeVisible();
  await expect(page.getByRole("heading", { name: /You are signed in as Manager/i })).toBeVisible();
});

test("the platform gym record exposes staff and member directories", async ({ page }) => {
  await signInPlatform(page);
  await page.goto("/platform/gyms/forge-fitness", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Forge Fitness Club" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team directory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Member directory" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search team" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search members" })).toBeVisible();
});

test("a member record keeps the Resolve workspace visible", async ({ page }) => {
  await signInGym(page, "Manager");
  await page.goto("/members", { waitUntil: "domcontentloaded" });
  const firstMember = page.getByTestId("member-row").first();
  await expect(firstMember).toBeVisible();
  await firstMember.click();
  await page.waitForURL(/\/members\/[^/]+$/, { timeout: 60_000 });
  await expect(page.getByTestId("resolution-area")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resolve" })).toBeVisible();
});

test("changed feedback surfaces fit a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/signup", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Send gym application/i })).toBeEnabled({ timeout: 60_000 });
  await fits(page);

  await signInGym(page, "Manager");
  await page.goto("/settings?section=my-profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 2, name: "My profile" })).toBeVisible();
  await fits(page);

  await page.goto("/getting-started#role", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#role")).toBeVisible();
  await fits(page);

  await page.goto("/members", { waitUntil: "domcontentloaded" });
  const firstMember = page.getByTestId("member-card").first();
  await expect(firstMember).toBeVisible();
  await fits(page);
  await firstMember.getByRole("link").click();
  await page.waitForURL(/\/members\/[^/]+$/, { timeout: 60_000 });
  await expect(page.getByTestId("resolution-area")).toBeVisible();
  await fits(page);

  await signInPlatform(page);
  await page.goto("/platform/gyms/forge-fitness", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Team directory" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Member directory" })).toBeVisible();
  await fits(page);
});
