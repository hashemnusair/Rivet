import { expect, test, type Page } from "@playwright/test";

type SubscriptionPlan = "Starter" | "Growth" | "Pro" | "Enterprise";

async function openGymSubscriptionEditor(page: Page, plan: SubscriptionPlan, reason: string) {
  const forgeRow = page.locator("tbody tr").filter({ hasText: "Forge Fitness Club" });
  await expect(forgeRow).toBeVisible();
  await forgeRow.getByRole("button", { name: "Manage", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: /Manage Forge Fitness Club/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("RIVET plan").click();
  await page.getByRole("option", { name: new RegExp(`^${plan} ·`) }).click();
  await dialog.getByLabel("Reason for this change").fill(reason);
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();

  const confirmation = page.getByRole("dialog", { name: "Confirm subscription change" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(plan);
  await confirmation.getByRole("button", { name: "Confirm changes", exact: true }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(forgeRow.getByText(plan, { exact: true })).toBeVisible();
  return forgeRow;
}

async function expectRestrictedWorkspace(page: Page, plan: "Starter" | "Growth") {
  const primaryNav = page.locator('aside[aria-label="Primary navigation"]');
  await expect(primaryNav).toBeVisible();
  if (plan === "Starter") {
    await expect(primaryNav.getByRole("link", { name: "Operations", exact: true })).toHaveCount(0);
  } else {
    await expect(primaryNav.getByRole("link", { name: "Operations", exact: true })).toBeVisible();
  }
  await expect(primaryNav.getByRole("link", { name: "Management ledger", exact: true })).toHaveCount(0);

  // Payments remains a foundation surface and exposes the secondary finance
  // switcher. The premium Management statements link must not be advertised
  // for Starter/Growth, even when the actor has financial role permissions.
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
  await expect(primaryNav.getByRole("link", { name: "Management ledger", exact: true })).toBeVisible();

  await primaryNav.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(page).toHaveURL(/\/operations$/);
  await expect(page.getByTestId("operations-command-center")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Management ledger", exact: true }).click();
  await expect(page).toHaveURL(/\/finance$/);
  await expect(page.getByTestId("management-ledger-workspace")).toBeVisible();

  await page.locator('aside[aria-label="Primary navigation"]').getByRole("link", { name: "Payments", exact: true }).click();
  await expect(page).toHaveURL(/\/payments$/);
  const financeNav = page.getByRole("navigation", { name: "Finance views" });
  await expect(financeNav.getByRole("link", { name: "Management statements", exact: true })).toBeVisible();
  await financeNav.getByRole("link", { name: "Management statements", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\/statements$/);
  await expect(page.getByTestId("management-statements-workspace")).toBeVisible();
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
    await page.goto("/platform/subscriptions");
    await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();

    const starterRow = await openGymSubscriptionEditor(page, "Starter", "Confirm Starter access boundary for live entitlement coverage.");
    await expect(starterRow.getByText("Gym foundation · Revenue protection", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Workspace access: Gym foundation · Revenue protection")).toBeVisible();

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
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/subscriptions$/);
    await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();
    const growthRow = await openGymSubscriptionEditor(page, "Growth", "Verify Growth operations access boundary.");
    await expect(growthRow.getByText("Gym foundation · Revenue protection · Daily operations", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Workspace access: Gym foundation · Revenue protection · Daily operations")).toBeVisible();

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectRestrictedWorkspace(page, "Growth");

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/subscriptions$/);
    await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();

    const proRow = await openGymSubscriptionEditor(page, "Pro", "Restore Pro access and verify immediate module unlocks.");
    await expect(proRow.getByText("Gym foundation · Revenue protection · Daily operations · Financial operating system · Management reporting", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Workspace access: Gym foundation · Revenue protection · Daily operations · Financial operating system · Management reporting")).toBeVisible();

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectPremiumWorkspace(page);

    // Pro and Enterprise both expose the complete five-pillar workspace. The
    // second transition proves the fourth tier does not accidentally lose the
    // reporting link while the catalog expands.
    await page.goBack();
    await expect(page).toHaveURL(/\/payments$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/finance$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/operations$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/platform\/subscriptions$/);
    await expect(page.getByRole("heading", { name: "Subscriptions", exact: true })).toBeVisible();

    const enterpriseRow = await openGymSubscriptionEditor(page, "Enterprise", "Verify Enterprise retains every workspace module.");
    await expect(enterpriseRow.getByText("Gym foundation · Revenue protection · Daily operations · Financial operating system · Management reporting", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Workspace access: Gym foundation · Revenue protection · Daily operations · Financial operating system · Management reporting")).toBeVisible();

    await page.getByRole("link", { name: "Gym workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectPremiumWorkspace(page);
  });
});
