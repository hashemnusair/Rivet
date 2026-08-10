import { expect, test } from "@playwright/test";

/**
 * Credentialed realtime verification. This test is deliberately opt-in and
 * refuses to write unless the caller explicitly classifies the deployment as
 * staging. Both contexts use the same trusted Clerk storage state, but keep
 * independent Convex watches and browser caches.
 */
test.describe("staged Convex two-browser realtime", () => {
  test("publishes a member created in browser A to browser B", async ({ browser }) => {
    test.skip(
      process.env.PLAYWRIGHT_CONVEX_REALTIME !== "1" ||
        process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1" ||
        process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging" ||
        !process.env.PLAYWRIGHT_CLERK_STORAGE_STATE,
      "Set the realtime/smoke switches, staging classification, and trusted Clerk storage state for this write test.",
    );
    expect(process.env.PLAYWRIGHT_TARGET_CLASSIFICATION).toBe("staging");

    const contextA = await browser.newContext({ storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE });
    const contextB = await browser.newContext({ storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const marker = `Realtime ${Date.now()}`;
    const phone = `+96279${String(Date.now()).slice(-7)}`;
    let memberUrl: string | undefined;

    try {
      await pageB.goto("/members", { waitUntil: "domcontentloaded" });
      await expect(pageB).not.toHaveURL(/\/login/);
      await pageA.goto("/members/new", { waitUntil: "domcontentloaded" });
      await pageA.getByTestId("member-name").fill(marker);
      await pageA.getByTestId("member-phone").fill(phone);
      await pageA.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
      await expect(pageA).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = pageA.url();

      await pageB.getByTestId("member-search").fill(marker);
      await expect(pageB.getByText(marker, { exact: false })).toBeVisible();
    } finally {
      if (memberUrl) {
        try {
          await pageA.goto(memberUrl, { waitUntil: "domcontentloaded" });
          await pageA.getByRole("button", { name: "More actions" }).click();
          await pageA.getByRole("menuitem", { name: /Archive member/i }).click();
          const dialog = pageA.getByRole("dialog");
          await dialog.getByRole("textbox").fill("Disposable two-browser realtime verification member");
          await dialog.getByRole("button", { name: "Archive member" }).click();
        } catch {
          // Preserve the realtime assertion; cleanup can be retried from the
          // captured member URL if a credential expires during the run.
        }
      }
      await contextA.close();
      await contextB.close();
    }
  });
});
