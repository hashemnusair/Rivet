import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = "/var/folders/nf/_fn0sn_d6z9f26pxk439nm2r0000gn/T/opencode/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", String(e).slice(0, 300)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("radio", { name: /Layla/ }).click();
await page.getByTestId("sign-in-button").click();
await page.waitForURL(/dashboard/, { timeout: 20000 });
await page.waitForTimeout(1500);

// member detail
await page.goto(`${BASE}/members`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.locator("tbody tr").first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/mgr-member-360.png` });
await page.getByTestId("tab-timeline").click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mgr-member-timeline.png` });

// queues
await page.goto(`${BASE}/crm/queues`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/mgr-queues.png` });
// open first queue item
const row = page.locator("section ul li button").first();
if (await row.count()) { await row.click(); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/mgr-queue-work.png` }); }

// lead detail
await page.goto(`${BASE}/crm/pipeline`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator("article").first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/mgr-lead.png` });

// audit
await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/mgr-audit.png` });
const exp = page.locator("ol li button").first();
if (await exp.count()) { await exp.click(); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/mgr-audit-expanded.png` }); }

// automations + rule
await page.goto(`${BASE}/automations`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/mgr-automations.png` });
await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/mgr-settings.png` });

await browser.close();
console.log("done");
