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
  { name: "crm-pipeline", path: "/crm/pipeline", persona: "Sales" },
  { name: "crm-queues", path: "/crm/queues", persona: "Sales" },
  { name: "audit", path: "/audit", persona: "Owner" },
  { name: "settings", path: "/settings", persona: "Owner" },
  { name: "pt", path: "/pt", persona: "Owner" },
  { name: "reception", path: "/reception", persona: "Reception" },
  { name: "dashboard-reception", path: "/dashboard", persona: "Reception" },
];

type Persona = "Owner" | "Manager" | "Sales" | "Reception";

async function signIn(page: Page, persona: Persona) {
  await page.goto("/login/gym");
  await page.getByRole("radio", { name: new RegExp(persona, "i") }).click();
  await page.getByRole("button", { name: /^Open .+ workspace$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Set the language the same way the switcher does, before the app paints. */
async function useArabic(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("rivet.locale", "ar");
    document.cookie = "rivet_locale=ar; path=/; max-age=31536000; samesite=lax";
  });
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
