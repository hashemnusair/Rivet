import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Not an assertion suite — a capture pass. It walks the workspace in Arabic and
 * writes a full-page screenshot per screen so the mirrored layouts can be
 * reviewed, and fails only on the two things that are unambiguously broken
 * regardless of taste: a page that scrolls sideways, and text that overflows
 * its own container.
 *
 * Run with: pnpm exec playwright test e2e/rtl-audit.spec.ts
 */
const OUT = process.env.RTL_SHOTS ?? "rtl-shots";

const SCREENS: Array<{ name: string; path: string; persona: Persona }> = [
  { name: "dashboard-owner", path: "/dashboard", persona: "Owner" },
  { name: "members", path: "/members", persona: "Owner" },
  { name: "payments", path: "/payments", persona: "Owner" },
  { name: "shifts", path: "/payments/shifts", persona: "Owner" },
  { name: "classes", path: "/classes", persona: "Owner" },
  { name: "memberships", path: "/memberships", persona: "Owner" },
  { name: "plans", path: "/plans", persona: "Owner" },
  { name: "checkout", path: "/checkout", persona: "Owner" },
  { name: "operations", path: "/operations", persona: "Owner" },
  { name: "operations-payables", path: "/operations/payables", persona: "Owner" },
  { name: "maintenance", path: "/maintenance", persona: "Owner" },
  { name: "finance-ledger", path: "/finance", persona: "Owner" },
  { name: "finance-controls", path: "/finance/controls", persona: "Owner" },
  { name: "finance-balance-sheet", path: "/finance/balance-sheet", persona: "Owner" },
  { name: "finance-cash-flow", path: "/finance/cash-flow", persona: "Owner" },
  { name: "finance-income-statement", path: "/finance/income-statement", persona: "Owner" },
  { name: "reports", path: "/reports", persona: "Owner" },
  { name: "reports-statements", path: "/reports/statements", persona: "Owner" },
  { name: "members-import", path: "/members/import", persona: "Owner" },
  { name: "members-duplicates", path: "/members/duplicates", persona: "Owner" },
  { name: "crm-pipeline", path: "/crm/pipeline", persona: "Sales" },
  { name: "crm-queues", path: "/crm/queues", persona: "Sales" },
  { name: "audit", path: "/audit", persona: "Owner" },
  { name: "checklists", path: "/checklists", persona: "Owner" },
  { name: "automations", path: "/automations", persona: "Owner" },
  { name: "support", path: "/support", persona: "Owner" },
  { name: "exports", path: "/exports", persona: "Owner" },
  { name: "settings", path: "/settings", persona: "Owner" },
  { name: "pt", path: "/pt", persona: "Owner" },
  { name: "reception", path: "/reception", persona: "Reception" },
  { name: "dashboard-reception", path: "/dashboard", persona: "Reception" },
];

type Persona = "Owner" | "Manager" | "Sales" | "Reception";

async function signIn(page: Page, persona: Persona) {
  // Clerk's demo browser script may keep the `load` event open while the
  // mock persona chooser is already usable, so wait for the DOM commit and
  // then for the actual control we interact with.
  await page.goto("/login/gym", { waitUntil: "commit" });
  await expect(page.getByRole("radio").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const roleIndex: Record<Persona, number> = { Owner: 0, Manager: 1, Sales: 2, Reception: 3 };
  await page.getByRole("radio").nth(roleIndex[persona]).click();
  await page.getByTestId("sign-in-button").click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Seed a pending user choice before navigation so the server renders RTL on first paint. */
async function useArabic(page: Page) {
  const preference = encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: null, pending: "rtl-audit-ar" }));
  await page.context().addCookies([
    { name: "rivet_locale", value: "ar", domain: "localhost", path: "/" },
    { name: "rivet_ui_locale_v1", value: preference, domain: "localhost", path: "/" },
  ]);
}

test.describe("Arabic layout audit", () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  for (const screen of SCREENS) {
    test(`${screen.name} in Arabic`, async ({ page }) => {
      await useArabic(page);
      await signIn(page, screen.persona);
      await page.goto(screen.path);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      // Let charts, queries and reveal transitions settle before capturing.
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(900);

      await page.screenshot({ path: `${OUT}/${screen.name}.png`, fullPage: true });

      // A mirrored layout must not push the document sideways.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
      });
      expect(
        overflow.scrollWidth,
        `${screen.name}: page scrolls horizontally in RTL`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // Elements whose text spills outside their own box — the usual symptom of
      // a hardcoded left/right padding that did not mirror.
      const clipped = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("main *"))) {
          if (el.children.length > 0 || !el.textContent?.trim()) continue;
          const style = getComputedStyle(el);
          if (style.overflow !== "visible" || style.position === "absolute") continue;
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
            bad.push(`${el.tagName}.${el.className}`.slice(0, 90));
          }
        }
        return bad.slice(0, 10);
      });
      expect(clipped, `${screen.name}: text overflows its container`).toEqual([]);
    });
  }
});
