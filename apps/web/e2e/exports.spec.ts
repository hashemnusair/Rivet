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
    expect(content).not.toContain("RIVET member ID");
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

  test("downloads a concise member CSV that opens in spreadsheet apps", async ({ page }) => {
    await signInMember(page);
    await page.goto("/customer/finance");
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data (CSV)" }).click();
    const download = await pending;
    const content = await downloadedText(download);

    expect(download.suggestedFilename()).toMatch(/^rivet-my-data-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(content.startsWith("\uFEFFRIVET export,My RIVET data\r\n")).toBe(true);
    expect(content).toContain("Category,Gym,Branch,Date,Record,Details,Amount,Currency,Status");
    expect(content).toContain("Profile,,,,Full name,Lina Haddad");
    expect(content).toContain("Membership,");
    expect(content).toContain("Check-in,");
    expect(content).not.toContain("data_json");
    expect(content).not.toContain("{\"");
    expect(content).not.toContain("retail-sale-");
    expect(content.split("\r\n").length).toBeGreaterThan(8);
  });
});
