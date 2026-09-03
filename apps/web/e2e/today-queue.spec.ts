import { expect, test, type Page } from "@playwright/test";


async function enterOwner(page: Page) {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Unified Today queue", () => {
  test("puts prioritized work first on a phone and completes a task in place", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enterOwner(page);

    const queue = page.getByRole("region", { name: "Today" });
    await expect(queue).toBeVisible();
    await expect(queue.getByText("Do this next")).toBeVisible();

    const layout = await page.evaluate(() => {
      const today = document.querySelector<HTMLElement>('[aria-labelledby="today-queue-title"]');
      const alerts = document.querySelector<HTMLElement>('[aria-label="Needs attention"]');
      return {
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        queueBeforeAlerts: Boolean(today && alerts && today.getBoundingClientRect().top < alerts.getBoundingClientRect().top),
      };
    });
    expect(layout).toEqual({ noHorizontalOverflow: true, queueBeforeAlerts: true });

    const before = Number(await queue.locator("header p.tabular").innerText());
    const complete = queue.locator('button[aria-label^="Complete "]').first();
    const actionName = await complete.getAttribute("aria-label");
    expect(actionName).toBeTruthy();
    await complete.click();

    await expect(queue.locator(`button[aria-label="${actionName}"]`)).toHaveCount(0);
    await expect(queue.locator("header p.tabular")).toHaveText(String(before - 1));
  });

  test("expands truthfully beyond the display limit", async ({ page }) => {
    await enterOwner(page);
    const ownerQueue = page.getByRole("region", { name: "Today" });
    await ownerQueue.getByRole("button", { name: /Show \d+ more/ }).click();
    await expect(ownerQueue.getByText(/Showing the top \d+ of \d+/)).toBeVisible();
  });
});
