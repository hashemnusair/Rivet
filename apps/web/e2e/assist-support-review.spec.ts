import { expect, test } from "@playwright/test";

/**
 * Support and content review in the preview. An owner switches Jev on, saves
 * a public-page draft that overstates the gym, and reviews it (findings quote
 * the passage, nothing is rewritten or published); the same panel holds up at
 * phone width in the manual RTL layout. The platform team then triages the
 * seeded case, checks it before closing, and follows the suggested
 * destination into the billing ledger, which says which case sent them.
 */
test.describe("support and content review", () => {
  test("owner reviews a saved draft; the platform team triages and checks a case before closing", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    // Stay inside the running app: the settings rail switches sections client-side.
    await page.getByRole("navigation", { name: "Settings sections" }).getByRole("tab", { name: "Public profile" }).click();
    const description = page.getByLabel("English description");
    await expect(description).toBeVisible();
    await description.fill("Certified coaches, free weights and cardio across six branches. Free parking at every branch.");
    await page.getByRole("button", { name: "Save draft" }).click();
    const review = page.getByTestId("profile-review-run");
    await expect(review).toBeEnabled();
    await review.click();
    const findings = page.getByTestId("profile-claims-findings");
    await expect(findings).toBeVisible();
    await expect(findings).toContainText("six branches");
    await expect(findings).toContainText("Recorded:");
    await expect(page.getByTestId("profile-unchecked")).toContainText("parking");
    // The draft was not rewritten and the editor's own actions are untouched.
    await expect(description).toHaveValue("Certified coaches, free weights and cardio across six branches. Free parking at every branch.");
    await expect(page.getByRole("button", { name: "Send to RIVET for review" })).toBeVisible();

    // Manual RTL layout at phone width: the review panel still fits.
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("switch", { name: "Manual RTL layout" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("profile-draft-review")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 800 });

    // The platform console, entered through the preview's own session flag; the gym's switch survives the navigation.
    await page.evaluate(() => window.sessionStorage.setItem("rivet.demo.platformAdmin", "1"));
    await page.goto("/platform/support?case=SUP-219");
    await expect(page.getByRole("heading", { level: 2, name: "Charged twice for July and our billing date" })).toBeVisible();
    await page.getByTestId("support-triage-run").click();
    await expect(page.getByTestId("support-category-label")).toHaveText("Invoice dispute");
    await expect(page.getByTestId("support-destination")).toHaveAttribute("href", "/platform/billing?invoice=RV-1046&case=SUP-219");
    await expect(page.getByTestId("support-clarification-none")).toBeVisible();

    await page.getByRole("button", { name: "Resolve" }).click();
    await page.getByTestId("support-closure-run").click();
    await expect(page.getByTestId("support-unanswered-findings")).toContainText("move our billing date");
    await expect(page.getByTestId("support-claim-findings")).toContainText("Enterprise");
    await expect(page.getByTestId("support-claim-evidence")).toContainText("recorded plan is Pro, not Enterprise");
    // Resolving still needs the manual summary; the check changed nothing.
    await expect(page.getByRole("button", { name: "Resolve case" })).toBeDisabled();
    await page.getByRole("button", { name: "Show in conversation" }).first().click();
    await expect(page.getByTestId("support-passage-highlight").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Charged twice for July and our billing date" })).toBeVisible();

    // Phone width: the inbox with its triage panel does not overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    const inboxOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(inboxOverflow).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 800 });

    // The suggested destination is the existing ledger, which says which case sent the operator and offers the way back.
    await page.getByTestId("support-destination").click();
    await expect(page).toHaveURL(/\/platform\/billing\?invoice=RV-1046&case=SUP-219$/);
    await expect(page.getByTestId("billing-case-banner")).toContainText("SUP-219");
    await expect(page.getByTestId("billing-case-banner").getByRole("link", { name: "Back to the case" })).toHaveAttribute("href", "/platform/support?case=SUP-219");
  });
});
