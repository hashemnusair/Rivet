import { expect, test, type Page } from "@playwright/test";

type SubscriptionPlan = "Starter" | "Growth" | "Pro" | "Enterprise";

/**
 * Return to the billing subscription controls between tier rounds. History
 * unwinding is unreliable here: the workspace tours coalesce client-side
 * entries and a back-restored document re-enters the console at its root.
 * Reloading billing mirrors the test's opening navigation instead. Each tier
 * round stays reload-free between the platform save and the gym-workspace
 * observation, which is the realtime entitlement contract this suite proves.
 */
async function returnToBilling(page: Page) {
  await page.goto("/platform/billing");
  await expect(page.getByRole("heading", { name: "Gym subscriptions", exact: true })).toBeVisible();
}

async function changeSubscriptionFromBilling(page: Page, plan: SubscriptionPlan, reason: string, options: { assertBillingPreview?: boolean; cadence?: "Monthly" | "Annual" } = {}) {
  await expect(page).toHaveURL(/\/platform\/billing$/);
  // Subscription work lives on the billing page; gym pages are informational.
  // Scope to the subscriptions section: after a save, the invoice ledger
  // below also contains rows naming the gym.
  const subscriptions = page.locator('section[aria-labelledby="gym-subscriptions-heading"]');
  const row = subscriptions.getByRole("row", { name: /Forge Fitness Club/ });
  await row.getByRole("button", { name: /Change plan|Reactivate & bill/ }).click();
  const dialog = page.getByRole("dialog", { name: "Bill a gym" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: new RegExp(`^${plan} `) }).click();
  if (options.cadence) {
    // The demo tenant reseeds on a full navigation, so a round that targets
    // the seeded tier flips the cadence to stay a real, billable save.
    await dialog.getByRole("radio", { name: new RegExp(options.cadence) }).click();
  }
  await dialog.getByRole("button", { name: /Review/ }).click();
  if (options.assertBillingPreview) {
    await expect(dialog.getByText("What happens when you save", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/An invoice for JOD .* is issued today\./)).toBeVisible();
  }
  await dialog.getByLabel("Reason for this change").fill(reason);
  await dialog.getByRole("button", { name: /Confirm & bill/ }).click();
  await expect(page.getByText("Subscription saved. The term invoice is now in the ledger below.", { exact: true }).last()).toBeVisible();
  await expect(row).toContainText(plan);
}

async function expectRestrictedWorkspace(page: Page, plan: "Starter" | "Growth") {
  const primaryNav = page.locator('aside[aria-label="Primary navigation"]');
  await expect(primaryNav).toBeVisible();
  if (plan === "Starter") {
    await expect(primaryNav.getByRole("link", { name: "Operations", exact: true })).toHaveCount(0);
  } else {
    await expect(primaryNav.getByRole("link", { name: "Operations", exact: true })).toBeVisible();
  }
  await expect(primaryNav.getByRole("link", { name: "Statements", exact: true })).toHaveCount(0);

  // Payments remains a foundation surface and exposes the secondary finance
  // switcher. Statements are a separate, reporting-entitled workspace and
  // must not be advertised for Starter/Growth.
  await primaryNav.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/payments$/);
  const financeNav = page.getByRole("navigation", { name: "Finance views" });
  await expect(financeNav.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
  await expect(financeNav.getByRole("link", { name: "Management statements", exact: true })).toHaveCount(0);

  // Direct `/reports/statements` access is independently covered by the
  // management-statements component and Convex module-boundary regressions;
  // this live-session journey intentionally stays in-app so it can preserve
  // the just-committed mock tenant state across tier mutations.
}

async function expectPremiumWorkspace(page: Page) {
  const primaryNav = page.locator('aside[aria-label="Primary navigation"]');
  await expect(primaryNav).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Operations", exact: true })).toBeVisible();
  await expect(primaryNav.getByRole("link", { name: "Statements", exact: true })).toBeVisible();

  await primaryNav.getByRole("link", { name: "Operations", exact: true }).click();
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
  await expect(financeNav.getByRole("link", { name: "Management statements", exact: true })).toHaveCount(0);
}

test.describe("RIVET platform subscription entitlements", () => {
  test("updates Forge workspace modules and navigation live across all four tiers", async ({ page }) => {
    // Keep a real gym workspace session alive while the platform operator
    // changes the tenant subscription in the same browser/runtime. This is
    // the path that previously required a reload or a fresh login to observe.
    await page.goto("/login/gym");
    await page.getByRole("button", { name: /Open Omar.s workspace/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Operations", exact: true })).toBeVisible();

    await page.goto("/login/admin");
    await page.getByRole("button", { name: /Open platform console/i }).click();
    await returnToBilling(page);

    await changeSubscriptionFromBilling(page, "Starter", "Confirm Starter access boundary for live entitlement coverage.", { assertBillingPreview: true });

    // The platform mutation response is consumed by the active gym session
    // without a logout or page reload. The navigation and route gate must
    // reflect Starter immediately.
    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectRestrictedWorkspace(page, "Starter");

    await returnToBilling(page);
    await changeSubscriptionFromBilling(page, "Growth", "Verify Growth operations access boundary.");

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectRestrictedWorkspace(page, "Growth");

    await returnToBilling(page);

    await changeSubscriptionFromBilling(page, "Pro", "Restore Pro access and verify immediate module unlocks.", { cadence: "Annual" });

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectPremiumWorkspace(page);

    // Pro and Enterprise both expose the complete five-pillar workspace. The
    // second transition proves the fourth tier does not accidentally lose the
    // reporting link while the catalog expands.
    await returnToBilling(page);

    await changeSubscriptionFromBilling(page, "Enterprise", "Verify Enterprise retains every workspace module.");

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectPremiumWorkspace(page);
  });
});
