import { Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Browser bundles get the empty stand-in for the bundled Arabic catalogue
// (next.config.mjs). These tests run the browser path: Arabic arrives only
// through the root-layout loader or loadCatalogue().
vi.mock("./arabic-catalogue", () => ({ bundledArabic: undefined }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

// Approved `save` wording (docs/arabic/DECISIONS.md).
const SAVE_AR = "حفظ التغييرات";
// Loading Arabic means transforming every namespace in Vitest.
const LOADED = { timeout: 10_000 };

async function freshModules() {
  vi.resetModules();
  const core = await import("./core");
  const provider = await import("./provider");
  const switcher = await import("@/components/shared/language-switch");
  return { core, provider, LanguageButton: switcher.LanguageButton };
}

beforeEach(() => toastError.mockReset());
afterEach(() => {
  vi.doUnmock("./messages/ar");
  document.cookie = "rivet_locale=; path=/; max-age=0";
  document.cookie = "rivet_ui_locale_v1=; path=/; max-age=0";
  localStorage.clear();
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.documentElement.classList.remove("rtl-font");
});

describe("Arabic catalogue in browser bundles", () => {
  it("starts with English only and refuses to translate Arabic before it loads, never falling back to English", async () => {
    const { core } = await freshModules();
    expect(core.hasCatalogue("en")).toBe(true);
    expect(core.hasCatalogue("ar")).toBe(false);
    expect(core.createTranslator("en")("common.action.save")).toBe("Save");
    expect(() => core.createTranslator("ar")).toThrow(/"ar" catalogue is not loaded/);
    expect(() => core.arabicMessages()).toThrow(/"ar" catalogue is not loaded/);
  });

  it("loads Arabic once on demand, sharing one pending promise", async () => {
    const { core } = await freshModules();
    const first = core.loadCatalogue("ar");
    expect(core.loadCatalogue("ar")).toBe(first);
    await first;
    expect(core.hasCatalogue("ar")).toBe(true);
    expect(core.createTranslator("ar")("common.action.save")).toBe(SAVE_AR);
    expect(core.arabicMessages().common.action.save).toBe(SAVE_AR);
  });

  it("registers Arabic when the root layout renders its Arabic loader", async () => {
    const { core } = await freshModules();
    const { ArabicCatalogue } = await import("./arabic-catalogue-loader");
    expect(core.hasCatalogue("ar")).toBe(false);
    await act(async () => { render(<ArabicCatalogue />); });
    await waitFor(() => expect(core.hasCatalogue("ar")).toBe(true), LOADED);
    expect(core.createTranslator("ar")("common.action.save")).toBe(SAVE_AR);
  });

  it("keeps the page in English until Arabic arrives, then switches language, direction and cookie together", async () => {
    const { provider, LanguageButton } = await freshModules();
    const seen: string[] = [];
    function Probe() {
      const { locale, dir, t } = provider.useLocale();
      const value = `${locale}|${dir}|${t("common.action.save")}`;
      seen.push(value);
      return <p data-testid="probe">{value}</p>;
    }
    render(<provider.LocaleProvider initialLocale="en"><Probe /><LanguageButton /></provider.LocaleProvider>);
    await act(async () => { await userEvent.click(screen.getByRole("button", { name: "Switch to Arabic" })); });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(`ar|rtl|${SAVE_AR}`), LOADED);
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.classList.contains("rtl-font")).toBe(true);
    expect(document.cookie).toContain("rivet_locale=ar");
    // Every paint was wholly English or wholly Arabic.
    expect(seen.every((value) => value === "en|ltr|Save" || value === `ar|rtl|${SAVE_AR}`)).toBe(true);
  });

  it("says so and stays in English when Arabic cannot be downloaded, and the next press tries again", async () => {
    vi.resetModules();
    vi.doMock("./messages/ar", () => { throw new Error("offline"); });
    const { provider, LanguageButton } = await freshModules();
    function Probe() {
      const { locale, dir, t } = provider.useLocale();
      return <p data-testid="probe">{`${locale}|${dir}|${t("common.action.save")}`}</p>;
    }
    render(<provider.LocaleProvider initialLocale="en"><Probe /><LanguageButton /></provider.LocaleProvider>);
    await act(async () => { await userEvent.click(screen.getByRole("button", { name: "Switch to Arabic" })); });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Arabic could not be loaded. Check your connection and try again."));
    expect(screen.getByTestId("probe")).toHaveTextContent("en|ltr|Save");
    expect(document.documentElement.dir).toBe("ltr");

    vi.doUnmock("./messages/ar");
    await act(async () => { await userEvent.click(screen.getByRole("button", { name: "Switch to Arabic" })); });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(`ar|rtl|${SAVE_AR}`), LOADED);
  });

  it("waits for Arabic instead of painting English when an Arabic page hydrates before its catalogue arrives", async () => {
    const { core, provider } = await freshModules();
    const seen: string[] = [];
    function Probe() {
      const { t } = provider.useLocale();
      seen.push(t("common.action.save"));
      return <p data-testid="probe">{t("common.action.save")}</p>;
    }
    // React retries a suspended render inside an awaited act() under test.
    await act(async () => { render(<Suspense fallback={<p>waiting</p>}><provider.LocaleProvider initialLocale="ar"><Probe /></provider.LocaleProvider></Suspense>); });
    expect(screen.getByText("waiting")).toBeInTheDocument();
    await act(async () => { await core.loadCatalogue("ar"); });
    expect(screen.getByTestId("probe")).toHaveTextContent(SAVE_AR);
    expect(seen).not.toContain("Save");
  });

  it("suspends a recipient-language translator until Arabic arrives", async () => {
    const { core, provider } = await freshModules();
    function Draft() {
      const t = provider.useTranslatorFor("ar");
      return <p data-testid="draft">{t("common.action.save")}</p>;
    }
    await act(async () => { render(<provider.LocaleProvider initialLocale="en"><Suspense fallback={<p data-testid="draft">waiting</p>}><Draft /></Suspense></provider.LocaleProvider>); });
    expect(screen.getByTestId("draft")).toHaveTextContent("waiting");
    await act(async () => { await core.loadCatalogue("ar"); });
    expect(screen.getByTestId("draft")).toHaveTextContent(SAVE_AR);
  });
});

describe("Arabic stays out of the startup code", () => {
  it("swaps the bundled catalogue for the stand-in in browser builds only", async () => {
    const { default: nextConfig } = await import("../../../next.config.mjs");
    class NormalModuleReplacementPlugin { constructor(public pattern: RegExp, public replacement: string) {} }
    const swaps = (isServer: boolean, dev: boolean) => {
      const config = nextConfig.webpack!({ plugins: [] }, { dev, isServer, webpack: { NormalModuleReplacementPlugin } } as never) as { plugins: NormalModuleReplacementPlugin[] };
      return config.plugins.filter((plugin) => plugin.pattern.test(resolve("src/lib/i18n/arabic-catalogue.ts")));
    };
    for (const dev of [true, false]) {
      const [swap] = swaps(false, dev);
      expect(swap?.replacement).toBe(resolve("src/lib/i18n/arabic-catalogue.browser.ts"));
      expect(existsSync(swap!.replacement)).toBe(true);
      expect(swaps(true, dev)).toHaveLength(0);
    }
  });

  it("reaches the Arabic catalogue only through the root-layout loader, loadCatalogue and the reviewed exceptions", () => {
    // Bilingual navigation search keeps the Arabic page names; the landing
    // page shows one Arabic heading to English readers.
    const allowed = new Set([
      "src/lib/i18n/arabic-catalogue.ts",
      "src/lib/i18n/arabic-catalogue-loader.tsx",
      "src/lib/i18n/core.ts",
      "src/lib/i18n/navigation.ts",
      "src/components/marketing/landing-story.tsx",
    ]);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { if (!["node_modules", "_generated"].includes(name)) walk(path); }
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(resolve("src"));
    walk(resolve("convex"));
    const arabic = resolve("src/lib/i18n/messages/ar");
    const index = resolve("src/lib/i18n/messages");
    const reachesArabic = (file: string, specifier: string) => {
      const target = specifier.startsWith("@/") ? resolve("src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(file), specifier) : undefined;
      return target !== undefined && (target === index || target === join(index, "index") || target === arabic || target.startsWith(`${arabic}/`));
    };
    const offenders = files
      .filter((file) => !file.startsWith(`${index}/`) && !allowed.has(relative(resolve("."), file)))
      .filter((file) => [...readFileSync(file, "utf8").matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].some((match) => reachesArabic(file, match[1]!)))
      .map((file) => relative(resolve("."), file));
    expect(offenders).toEqual([]);
  });
});
