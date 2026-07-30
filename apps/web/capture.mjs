// Screenshot helper: signs in as a persona and captures routes.
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const OUT = "/var/folders/nf/_fn0sn_d6z9f26pxk439nm2r0000gn/T/opencode/shots";

const role = process.argv[2] || "owner";
const routes = process.argv.slice(3);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("PAGE ERROR:", String(e).slice(0, 300)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByRole("radio", { name: new RegExp(role === "owner" ? "Omar" : role === "manager" ? "Layla" : role === "salesperson" ? "Sara" : "Hala") }).click();
await page.getByTestId("sign-in-button").click();
await page.waitForURL(/dashboard|reception/, { timeout: 15000 });
await page.waitForTimeout(1500);

for (const route of routes) {
  const [path, name] = route.split("|");
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/${role}-${name}.png`, fullPage: false });
  console.log(`captured ${role}-${name}.png`);
}
await browser.close();
