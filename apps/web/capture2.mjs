import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/var/folders/nf/_fn0sn_d6z9f26pxk439nm2r0000gn/T/opencode/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", String(e).slice(0, 300)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("radio", { name: /Hala/ }).click();
await page.getByTestId("sign-in-button").click();
await page.waitForURL(/reception/, { timeout: 20000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/recep-console.png` });

// Find an active member via the members page first
await page.goto(`${BASE}/members`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const firstNumber = await page.locator("tbody tr td p.font-mono").first().textContent();
console.log("member number:", firstNumber);
await page.goto(`${BASE}/reception`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.getByTestId("reception-search").fill(firstNumber.trim());
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/recep-result.png` });
const confirm = page.getByTestId("confirm-checkin");
if (await confirm.count()) {
  await confirm.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/recep-checked.png` });
}
await browser.close();
console.log("done");
