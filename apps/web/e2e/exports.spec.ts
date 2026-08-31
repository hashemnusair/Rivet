import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";

async function downloadedText(download: Download): Promise<string> {
  const path = await download.path();
  if (!path) throw new Error(`Playwright did not retain ${download.suggestedFilename()}`);
  return await readFile(path, "utf8");
}

async function signInOwner(page: Page) {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: /owner/i }).click();
  await page.getByRole("button", { name: /^Open .+ workspace$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function signInMember(page: Page) {
  await page.goto("/login/member");
  await page.getByRole("radio", { name: /Lina Haddad/i }).click();
  await page.getByRole("button", { name: /Continue as Lina/i }).click();
  await expect(page).toHaveURL(/\/customer\/my-gyms$/);
}

test.describe("downloaded export files", () => {
  test("downloads a readable member directory from the staff export center", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/exports");
    const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Members", exact: true }) });
    const pending = page.waitForEvent("download");
    await card.getByRole("button", { name: "Generate CSV" }).click();
    const download = await pending;
    const content = await downloadedText(download);

    expect(download.suggestedFilename()).toMatch(/^rivet-members-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(content.startsWith("\uFEFFRIVET export,Member directory\r\n")).toBe(true);
    expect(content).toContain("Member number,Full name,Arabic name,Phone");
    expect(content).toContain("Forge");
    expect(content).not.toContain("data_json");
    expect(content).not.toContain("[object Object]");
  });

  test("downloads the complete finance range rather than the visible table page", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/reports");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export all transactions" }).click();
    const content = await downloadedText(await pending);

    expect(content).toContain("Finance overview and transaction ledger");
    expect(content).toContain("Overview\r\nMetric,Value");
    expect(content).toContain("Transactions\r\nWhen,Member,Member number,Branch");
    expect(content).not.toContain("data_json");
  });

  test("downloads a member archive as labelled sections", async ({ page }) => {
    await signInMember(page);
    await page.goto("/customer/finance");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export my data" }).click();
    const content = await downloadedText(await pending);

    expect(content.startsWith("\uFEFFRIVET export,My RIVET data\r\n")).toBe(true);
    expect(content).toContain("Profile\r\nField,Value");
    expect(content).toContain("Memberships\r\nGym,Branch,Member number,Plan");
    expect(content).toContain("Payments and refunds");
    expect(content).toContain("Check-ins");
    expect(content).not.toContain("data_json");
    expect(content).not.toContain("{\"");
  });
});
