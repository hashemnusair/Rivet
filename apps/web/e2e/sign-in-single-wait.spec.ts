import { expect, test, type Page } from "@playwright/test";

/**
 * Signing in shows one waiting screen, "Signing you in…", between the sign-in
 * page and the page the account lands on. Nothing else may appear in between:
 * no second loader with other words, no other page, and one change of address.
 *
 * These run on the seeded preview accounts. The same cover and the same
 * shells serve a real Clerk sign-in, whose own steps (password, code) cannot
 * run without credentials; see CURRENT_STATE.md, 25 November 2026. The unit
 * tests in `src/app/login/signing-in-flow.test.tsx` cover the real path's
 * waits (account check, gym session, workspace) with the same cover.
 */

type Frame = { path: string; statuses: string[]; cover: boolean; shellCover: boolean };

/** Records every address and every status shown, on each change to the page. */
async function recordScreens(page: Page) {
  await page.evaluate(() => {
    const frames: Frame[] = [];
    let last = "";
    const snapshot = () => {
      const frame: Frame = {
        path: window.location.pathname,
        statuses: [...document.querySelectorAll('[role="status"]')].map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? ""),
        cover: Boolean(document.querySelector('[data-testid="signing-in-cover"]:not([aria-hidden])')),
        shellCover: Boolean(document.querySelector('[data-testid="workspace-curtain"]')),
      };
      const key = JSON.stringify(frame);
      if (key === last) return;
      last = key;
      frames.push(frame);
    };
    type Frame = { path: string; statuses: string[]; cover: boolean; shellCover: boolean };
    new MutationObserver(snapshot).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    snapshot();
    (window as unknown as { __signInFrames: Frame[] }).__signInFrames = frames;
  });
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as { __signInFrames: Frame[] }).__signInFrames);

/** What the three shells call their own waits; none may show during a sign-in. */
const SHELL_WAITS = /Loading your gym|Checking access|Loading your account|Checking sign-in/;

test('gym team sign-in shows one "Signing you in…" screen and changes the address once', async ({ page }) => {
  const door = "/login/gym";
  const lands = "/dashboard";
  await page.goto(door);
  await expect(page.getByTestId("sign-in-button")).toBeVisible();
  await recordScreens(page);

  await page.getByTestId("sign-in-button").click();
  await expect(page.getByRole("heading", { name: /Omar/ })).toBeVisible();
  await expect(page.getByTestId("signing-in-cover")).toHaveCount(0);

  const frames = await recorded(page);
  // One change of address, straight to where the account belongs.
  expect([...new Set(frames.map((frame) => frame.path))]).toEqual([door, lands]);
  // The cover came down on the sign-in page and was still up when the address changed.
  expect(frames.some((frame) => frame.path === door && frame.cover)).toBe(true);
  expect(frames.find((frame) => frame.path === lands)?.cover).toBe(true);
  // While signing in, the only wait named on screen is that one: nothing
  // else on the sign-in page, and none of the shells' own waiting words after.
  const waiting = frames.filter((frame) => frame.cover);
  for (const frame of waiting) {
    if (frame.path === door) expect(frame.statuses).toEqual(["Signing you in…"]);
    else expect(frame.statuses).toContain("Signing you in…");
    expect(frame.statuses.join(" | ")).not.toMatch(SHELL_WAITS);
  }
  // The workspace never drew a cover of its own on top.
  expect(frames.some((frame) => frame.shellCover)).toBe(false);
});

// The member and platform preview accounts open at once (nothing loads), so
// there is no wait to cover. They still change the address exactly once.
for (const { name, door, button, lands, heading } of [
  { name: "gym member", door: "/login/member", button: "member-continue", lands: "/customer/my-gyms", heading: /Lina/ },
  { name: "platform", door: "/login/admin", button: "admin-continue", lands: "/platform", heading: "Platform overview" },
] as const) {
  test(`${name} preview sign-in changes the address once`, async ({ page }) => {
    await page.goto(door);
    await expect(page.getByTestId(button)).toBeVisible();
    await recordScreens(page);

    await page.getByTestId(button).click();
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();

    const frames = await recorded(page);
    expect([...new Set(frames.map((frame) => frame.path))]).toEqual([door, lands]);
    // Never two covers at once.
    expect(frames.some((frame) => frame.cover && frame.shellCover)).toBe(false);
  });
}
