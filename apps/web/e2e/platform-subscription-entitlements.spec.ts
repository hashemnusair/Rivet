import { expect, test, type Page } from "@playwright/test";

type SubscriptionPlan = "Basic" | "Pro";

/**
 * Gyms change their own plan, and the plan takes effect when RIVET confirms
 * the payment. The mock preview starts the demo gym on the plan a test names
 * (sessionStorage "rivet.demo.plan"), so each tier is checked from a fresh
 * workspace; the confirmation itself is covered by the Convex tests.
 */
async function openOnPlan(page: Page, plan: SubscriptionPlan, options: { signIn?: boolean } = {}) {
  // Init scripts run in order on every load, so the latest plan wins.
  await page.addInitScript((value) => window.sessionStorage.setItem("rivet.demo.plan", value), plan);
  if (options.signIn) {
    await page.goto("/login/gym");
    await page.getByRole("button", { name: /Sign in as Omar/i }).click();
  } else {
    await page.goto("/dashboard");
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectRestrictedWorkspace(page: Page, plan: "Basic") {
  const primaryNav = page.locator('aside[aria-label="Primary navigation"]');
  await expect(primaryNav).toBeVisible();
  if (plan === "Basic") {
    await expect(primaryNav.getByRole("link", { name: "Stock & purchasing", exact: true })).toHaveCount(0);
  } else {
    await expect(primaryNav.getByRole("link", { name: "Stock & purchasing", exact: true })).toBeVisible();
  }
  await expect(primaryNav.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Statements", exact: true })).toHaveCount(0);

  // Reports is a primary Finance destination. The Payments switcher stays
  // focused on payment work, while Statements remains a separate,
  // reporting-entitled workspace that Basic must not advertise.
  await primaryNav.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/payments$/);
  const financeNav = page.getByRole("navigation", { name: "Finance views" });
  await expect(financeNav.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  await expect(financeNav.getByRole("link", { name: "Management statements", exact: true })).toHaveCount(0);

  // Direct `/reports/statements` access is independently covered by the
  // management-statements component and Convex module-boundary regressions;
  // this live-session journey intentionally stays in-app so it can preserve
  // the just-committed mock tenant state across tier mutations.
}

async function expectPremiumWorkspace(page: Page) {
  const primaryNav = page.locator('aside[aria-label="Primary navigation"]');
  await expect(primaryNav).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Stock & purchasing", exact: true })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Statements", exact: true })).toBeVisible();

  await primaryNav.getByRole("link", { name: "Stock & purchasing", exact: true }).click();
  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByTestId("operations-command-center")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Statements", exact: true }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await expect(page.getByTestId("management-ledger-home")).toBeVisible();

  await page.getByTestId("statement-card-income").click();
  await expect(page).toHaveURL(/\/finance\/income-statement/);
  await expect(page.getByTestId("income-statement")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Statements", exact: true }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await page.getByTestId("statement-card-balance").click();
  await expect(page).toHaveURL(/\/finance\/balance-sheet/);
  await expect(page.getByTestId("balance-sheet")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Statements", exact: true }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await page.getByTestId("statement-card-cashflow").click();
  await expect(page).toHaveURL(/\/finance\/cash-flow/);
  await expect(page.getByTestId("cashflow-statement")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/payments$/);
  const financeNav = page.getByRole("navigation", { name: "Finance views" });
  await expect(financeNav.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  await expect(financeNav.getByRole("link", { name: "Management statements", exact: true })).toHaveCount(0);
}

test.describe("RIVET plan entitlements", () => {
  test("shows each tier's modules and navigation", async ({ page }) => {
    await openOnPlan(page, "Basic", { signIn: true });
    await expectRestrictedWorkspace(page, "Basic");


    await openOnPlan(page, "Pro");
    await expectPremiumWorkspace(page);

  });

  test("a gym upgrades itself and follows the payment until RIVET confirms it", async ({ page }) => {
    await openOnPlan(page, "Basic", { signIn: true });
    await page.goto("/settings?section=subscription");
    const summary = page.getByTestId("subscription-summary");
    await expect(summary.getByText("Basic", { exact: true })).toBeVisible();
    await summary.getByRole("button", { name: "Change plan" }).click();

    const dialog = page.getByRole("dialog", { name: "Change your plan" });
    await expect(dialog.getByText("Current plan")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Pro/ })).toBeChecked();
    await expect(dialog.getByText("Pay today")).toBeVisible();
    await dialog.getByRole("button", { name: "Continue to payment" }).click();

    await expect(page).toHaveURL(/\/billing$/);
    await expect(page.getByRole("heading", { level: 1, name: "Upgrade to Pro" })).toBeVisible();
    await page.getByRole("radio", { name: "CliQ" }).click();
    await page.getByLabel("Reference number").fill("CLIQ-778");
    await page.getByLabel("Name on the paying account").fill("Omar Al-Khatib");
    await page.getByRole("button", { name: "Send payment details" }).click();

    await expect(page.getByRole("heading", { name: "We are checking your payment" })).toBeVisible();
    const progress = page.getByTestId("payment-progress");
    await expect(progress).toContainText("Payment sent");
    await expect(progress).toContainText("RIVET confirms the payment");
    await expect(progress).toContainText("Plan changes to Pro");

    await page.getByRole("link", { name: "See it in Support" }).click();
    await expect(page).toHaveURL(/\/support\?case=/);
    await expect(page.getByRole("heading", { level: 2, name: "Upgrade to Pro" })).toBeVisible();
    await expect(page.getByTestId("payment-progress")).toContainText("Plan changes to Pro");
  });
});
