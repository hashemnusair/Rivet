import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Credentialed realtime verification. These write journeys are deliberately
 * opt-in and refuse to run anywhere except an explicitly classified staging
 * target. The contexts have independent Convex watches and browser caches.
 */
test.describe("staged Convex two-browser realtime", () => {
  test("publishes a member created in browser A to browser B", async ({ browser }) => {
    skipUnlessStagingWriteJourney();

    const contextA = await browser.newContext({ storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE });
    const contextB = await browser.newContext({ storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const memberUrls: string[] = [];

    try {
      const initialCount = await openDashboardAndReadNewMemberCount(pageB);
      memberUrls.push(await createDisposableMember(pageA, "Realtime propagation"));
      await expectNewMemberCount(pageB, initialCount + 1);
    } finally {
      await cleanupAndClose(pageA, contextA, contextB, memberUrls);
    }
  });

  test("keeps browser B's last dashboard snapshot offline and resumes one live stream after reconnect", async ({ browser }) => {
    skipUnlessStagingWriteJourney();

    const contextA = await browser.newContext({ storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE });
    const contextB = await browser.newContext({ storageState: process.env.PLAYWRIGHT_CLERK_STORAGE_STATE });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const memberUrls: string[] = [];

    try {
      const initialCount = await openDashboardAndReadNewMemberCount(pageB);
      memberUrls.push(await createDisposableMember(pageA, "Realtime before offline"));
      await expectNewMemberCount(pageB, initialCount + 1);

      const navigationCount = await pageB.evaluate(() => performance.getEntriesByType("navigation").length);
      await contextB.setOffline(true);
      await expect(pageB.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
      await expectNewMemberCount(pageB, initialCount + 1);

      memberUrls.push(await createDisposableMember(pageA, "Realtime while offline"));
      await expectNewMemberCount(pageB, initialCount + 1);
      await expect(pageB.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);

      await contextB.setOffline(false);
      await expectNewMemberCount(pageB, initialCount + 2);
      await expect(pageB.getByRole("status", { name: "Loading workspace" })).toHaveCount(0);
      await expect.poll(() => pageB.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);

      // A third change after reconnect must arrive once in the same document.
      // The exact KPI value catches a duplicate listener/render as well as a
      // stale reconnect snapshot without relying on fixture names or reloads.
      memberUrls.push(await createDisposableMember(pageA, "Realtime after reconnect"));
      await expectNewMemberCount(pageB, initialCount + 3);
      await expect.poll(() => pageB.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);
    } finally {
      await cleanupAndClose(pageA, contextA, contextB, memberUrls);
    }
  });
});

function skipUnlessStagingWriteJourney() {
  test.skip(
    process.env.PLAYWRIGHT_CONVEX_REALTIME !== "1" ||
      process.env.PLAYWRIGHT_CONVEX_SMOKE !== "1" ||
      process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging" ||
      !process.env.PLAYWRIGHT_CLERK_STORAGE_STATE,
    "Set the realtime/smoke switches, staging classification, and trusted Clerk storage state for this write test.",
  );
}

async function openDashboardAndReadNewMemberCount(page: Page): Promise<number> {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByLabel("Key numbers")).toBeVisible();
  return readNewMemberCount(page);
}

async function createDisposableMember(page: Page, label: string): Promise<string> {
  const marker = `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const phone = `+96279${String(Date.now()).slice(-7)}`;
  await page.goto("/members/new", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login/);
  await page.getByTestId("member-name").fill(marker);
  await page.getByTestId("member-phone").fill(phone);
  await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL(/\/members\/[0-9a-f-]+$/);
  return page.url();
}

async function readNewMemberCount(page: Page): Promise<number> {
  const value = page.getByText("New members", { exact: true }).locator("xpath=following-sibling::div[1]");
  await expect(value).toBeVisible();
  await expect(value).not.toHaveClass(/animate-pulse/);
  const parsed = Number((await value.innerText()).replace(/[^0-9-]/g, ""));
  expect(Number.isFinite(parsed)).toBe(true);
  return parsed;
}

async function expectNewMemberCount(page: Page, expected: number) {
  await expect.poll(() => readNewMemberCount(page)).toBe(expected);
}

async function archiveDisposableMember(page: Page, memberUrl: string) {
  await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Archive member/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("Disposable two-browser realtime verification member");
  await dialog.getByRole("button", { name: "Archive member" }).click();
  await expect(dialog).toBeHidden();
}

async function cleanupAndClose(pageA: Page, contextA: BrowserContext, contextB: BrowserContext, memberUrls: string[]) {
  const cleanupFailures: Error[] = [];
  for (const memberUrl of memberUrls.reverse()) {
    try {
      await archiveDisposableMember(pageA, memberUrl);
    } catch (error) {
      cleanupFailures.push(error instanceof Error ? error : new Error("Disposable member cleanup failed."));
    }
  }

  await contextA.close();
  await contextB.close();

  if (cleanupFailures.length > 0) {
    throw new AggregateError(cleanupFailures, "One or more disposable staging members could not be archived.");
  }
}
