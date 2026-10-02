import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const evidence = "../../docs/ui-evidence/attendance";
test("member occupancy and visit planning work on desktop, mobile, offline and RTL", async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto("/login/member");
  await page.getByRole("radio", { name: /Lina Haddad/i }).click();
  await page.getByRole("button", { name: /Continue as Lina/i }).click();
  await page.goto("/customer/my-gyms");
  await expect(page.getByText(/~\d+ people/).first()).toBeVisible();
  await page.getByRole("link", { name: "Membership", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Daily occupancy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usual rhythm" })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expect(page.getByText(/~\d+ people/)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${evidence}/member-${width}.png`, fullPage: true });
  }
  await page.getByText("View daily values as a table").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table", { name: "Daily occupancy in branch local time" })).toBeVisible();
  await page.evaluate(() => document.documentElement.dir = "rtl");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `${evidence}/member-rtl-390.png`, fullPage: true });
  await page.context().setOffline(true);
  await expect(page.getByText("Live estimate unavailable")).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText(/~\d+ people/)).toBeVisible();
});
test("staff occupancy analytics and authorized publication settings", async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/reports?view=peak-hours");
  const select = page.getByLabel("Attendance branch");
  await expect(select).toBeVisible();
  await select.selectOption({ index: 1 });
  await expect(page.getByText(/~\d+ people/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entry volume" })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${evidence}/staff-${width}.png`, fullPage: true });
  }
  await page.goto("/settings?section=attendance");
  await expect(page.getByLabel("Estimated visit length (minutes)")).toBeVisible();
  await page.getByLabel("Estimated visit length (minutes)").fill("75");
  await page.getByLabel("Publish aggregate occupancy on the gym’s website").check();
  await page.getByRole("button", { name: "Save attendance settings" }).click();
  await expect(page.getByText("Attendance settings saved.", { exact: true })).toBeVisible();
  await expect(page.getByText("Attendance settings saved.", { exact: true })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}/settings-390.png`, fullPage: true });
});
