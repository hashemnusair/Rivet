import { expect, test, type Page } from "@playwright/test";

type SubscriptionPlan = "Starter" | "Growth" | "Pro" | "Enterprise";

function isoDateFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function openGymSubscriptionEditor(page: Page, plan: SubscriptionPlan, reason: string, options: { assertDateRequired?: boolean } = {}) {
  await expect(page).toHaveURL(/\/platform\/gyms\/forge-fitness$/);
  await page.getByLabel("Gym plan").click();
  await page.getByRole("option", { name: plan, exact: true }).click();
  await page.getByLabel("Reason for this change").fill(reason);
  if (options.assertDateRequired) {
    await page.getByLabel("Membership end date").fill("");
    await expect(page.getByRole("button", { name: "Save controls", exact: true })).toBeDisabled();
  }
  await page.getByLabel("Membership end date").fill(isoDateFromToday(45));
  await expect(page.getByRole("button", { name: "Save controls", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save controls", exact: true }).click();
  await expect(page.getByText("Gym subscription controls saved and audited.", { exact: true }).last()).toBeVisible();
  await expect(page.getByLabel("Gym plan")).toContainText(plan);
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
  await expect(page).toHaveURL(/\/finance\/income-statement$/);
  await expect(page.getByTestId("income-statement")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Statements", exact: true }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await page.getByTestId("statement-card-balance").click();
  await expect(page).toHaveURL(/\/finance\/balance-sheet$/);
  await expect(page.getByTestId("balance-sheet")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Statements", exact: true }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await page.getByTestId("statement-card-cashflow").click();
  await expect(page).toHaveURL(/\/finance\/cash-flow$/);
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
    await page.goto("/platform/gyms/forge-fitness");
    await expect(page.getByRole("heading", { name: "Forge Fitness Club", exact: true })).toBeVisible();

    await openGymSubscriptionEditor(page, "Starter", "Confirm Starter access boundary for live entitlement coverage.", { assertDateRequired: true });

    // The platform mutation response is consumed by the active gym session
    // without a logout or page reload. The navigation and route gate must
    // reflect Starter immediately.
    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectRestrictedWorkspace(page, "Starter");

    // Return through the client-side history created by the in-app links. A
    // full navigation would intentionally recreate the mock adapter and hide
    // the realtime persistence contract this test is proving.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/gyms\/forge-fitness$/);
    await openGymSubscriptionEditor(page, "Growth", "Verify Growth operations access boundary.");

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectRestrictedWorkspace(page, "Growth");

    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/gyms\/forge-fitness$/);

    await openGymSubscriptionEditor(page, "Pro", "Restore Pro access and verify immediate module unlocks.");

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectPremiumWorkspace(page);

    // Pro and Enterprise both expose the complete five-pillar workspace. The
    // second transition proves the fourth tier does not accidentally lose the
    // reporting link while the catalog expands.
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/gyms\/forge-fitness$/);

    await openGymSubscriptionEditor(page, "Enterprise", "Verify Enterprise retains every workspace module.");

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectPremiumWorkspace(page);
  });
});
