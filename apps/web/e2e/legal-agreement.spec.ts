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

  test("blocks an unsigned owner with an uncloseable modal, unlocks agreement at the end of the text, then signs in three steps", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.evaluate(({ personaKey, agreementKey }) => {
      window.sessionStorage.setItem(personaKey, "owner");
      window.sessionStorage.setItem(agreementKey, "required");
    }, { personaKey: DEMO_PERSONA_KEY, agreementKey: DEMO_AGREEMENT_KEY });
    // A cold dev-route compile can take a while on a loaded machine; the
    // modal opens as soon as the workspace session is ready.
    await page.goto("/members");
    const modal = page.getByTestId("agreement-modal");
    await expect(modal).toBeVisible({ timeout: 45_000 });
    await expect(page).toHaveURL(/\/members$/);
    await expect(modal.getByTestId("agreement-text")).toContainText("Electronic signature");
    await expect(modal.getByRole("button", { name: "Close dialog" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();

    // Step 1: the agree button waits for the end of the text.
    const agree = modal.getByTestId("agree-continue");
    await expect(agree).toBeDisabled();
    await modal.getByTestId("agreement-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(agree).toBeEnabled();
    await agree.click();

    // Step 2: only the essentials.
    await expect(modal.getByLabel(/Registered name of the gym or company/)).toHaveValue("Forge Fitness Club");
    await expect(modal.getByLabel(/Trade name/)).toHaveCount(0);
    await expect(modal.getByLabel(/Phone/)).toHaveCount(0);
    await modal.getByLabel(/Gym address/).fill("Abdoun Circle, Amman");
    await modal.getByLabel(/ID number/).fill("9871234567");
    await modal.getByTestId("details-continue").click();

    // Step 3: signature and two declarations.
    await expect(modal.getByTestId("signing-summary")).toContainText("••••••4567");
    await modal.getByRole("radio", { name: "Type my name" }).click();
    await modal.getByLabel("Type your full name as your signature").fill("Omar Al-Khatib");
    for (const box of await modal.getByRole("checkbox").all()) await box.click();
    await expect(modal.getByTestId("sign-agreement")).toBeEnabled();
    await modal.getByTestId("sign-agreement").click();

    const done = modal.getByTestId("agreement-signed");
    await expect(done).toBeVisible();
    await expect(done).toContainText("omar@forgefitness.jo");
    await expect(done).toContainText("elias@rivetjo.com");
    await expect(done).toContainText("hashem@rivetjo.com");
    await done.getByTestId("agreement-continue").click();
    await expect(modal).toBeHidden();
    await expect(page).toHaveURL(/\/members$/);

    // A full reload resets the in-memory mock to its seeded (countersigned)
    // agreement; what matters is that the "required" flag was cleared by the
    // signing, so the gate does not reopen and the record page renders.
    await page.goto("/settings?section=agreement");
    await expect(page.getByTestId("agreement-record")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("agreement-modal")).toHaveCount(0);
  });
});
