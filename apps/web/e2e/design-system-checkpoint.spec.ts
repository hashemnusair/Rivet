import { expect, test, type Page } from "@playwright/test";

test.use({
  colorScheme: "light",
  locale: "en-US",
  reducedMotion: "reduce",
  timezoneId: "Asia/Amman",
});

async function signIn(page: Page, persona: "Owner" | "Reception") {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByRole("button", { name: /^Open .+ workspace$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    .toBe(true);
}

test.describe("product UI checkpoint", () => {
  test("the local gallery renders real primitives without narrow-screen overflow", async ({ page }) => {
    for (const width of [360, 390, 768, 820, 1280, 1440]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      await page.goto("/dev/design-system");
      await expect(page.getByRole("heading", { name: "RIVET product system" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Feedback states" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("owner records use one quiet navigation state and readable table labels", async ({ page }) => {
    await signIn(page, "Owner");
    await page.goto("/members");

    const current = page.locator('[aria-label="Primary navigation"] [aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Members");
    await expect(page.locator("[data-rivet-table-head]").first()).toHaveCSS("font-family", /Manrope/i);
    await expectNoHorizontalOverflow(page);
  });

  test("reception retains the focused night workspace at tablet width", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await signIn(page, "Reception");

    await expect(page.getByTestId("reception-search")).toBeFocused();
    await expect(page.getByText(/Front desk ·/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
