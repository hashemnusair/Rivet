import { expect, test } from "@playwright/test";

const DEMO_PERSONA_KEY = "rivet.demo.persona";
const DEMO_AGREEMENT_KEY = "rivet.demo.agreement";

test.describe("legal pages and the subscription agreement", () => {
  test("publishes the privacy policy and terms with RIVET's contact details in the footer", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
    await expect(page.getByRole("link", { name: "077 837 8608" }).first()).toHaveAttribute("href", "tel:+962778378608");
    await expect(page.getByRole("link", { name: "@rivet.jo" }).first()).toHaveAttribute("href", "https://instagram.com/rivet.jo");
    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of service" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /Data and the processing addendum/ })).toBeVisible();
    const footer = page.locator("footer").last();
    await expect(footer.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "WhatsApp RIVET" })).toHaveAttribute("href", "https://wa.me/962778378608");
  });

  test("gates an owner who has not signed, then records a typed signature and shows the signed copy", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.evaluate(({ personaKey, agreementKey }) => {
      window.sessionStorage.setItem(personaKey, "owner");
      window.sessionStorage.setItem(agreementKey, "required");
    }, { personaKey: DEMO_PERSONA_KEY, agreementKey: DEMO_AGREEMENT_KEY });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding\/agreement$/);
    await expect(page.getByRole("heading", { name: "Sign your RIVET agreement" })).toBeVisible();
    await expect(page.getByTestId("agreement-text")).toContainText("Electronic signature");

    await page.getByLabel(/Address/).fill("Abdoun Circle");
    await page.getByLabel(/ID number/).fill("9871234567");
    await page.getByRole("radio", { name: "Type my name" }).click();
    await page.getByLabel("Type your full name as your signature").fill("Omar Al-Khatib");
    for (const box of await page.getByRole("checkbox").all()) await box.click();
    await expect(page.getByTestId("sign-agreement")).toBeEnabled();
    await page.getByTestId("sign-agreement").click();

    await expect(page.getByTestId("agreement-record")).toBeVisible();
    await expect(page.getByText("Awaiting RIVET countersignature")).toBeVisible();
    await expect(page.getByText("••••••4567")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
