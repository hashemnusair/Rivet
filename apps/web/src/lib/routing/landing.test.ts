import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/config", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/i18n/config")>()), ARABIC_ENABLED: true }));
const { landingLanguagePrePaintScript, landingLocale } = await import("./landing");

const jar = (values: Record<string, string>) => ({ get: (name: string) => (name in values ? { value: values[name]! } : undefined) });
const pref = (locale: string, owner: string | null) => encodeURIComponent(JSON.stringify({ version: 1, locale, owner }));

describe("landing language", () => {
  it("follows the visitor's own choice, then the older cookie, never an earlier account's", () => {
    expect(landingLocale(jar({}))).toBe("en");
    expect(landingLocale(jar({ rivet_ui_locale_v1: pref("ar", null) }))).toBe("ar");
    expect(landingLocale(jar({ rivet_locale: "ar" }))).toBe("ar");
    expect(landingLocale(jar({ rivet_ui_locale_v1: pref("ar", "user_1") }))).toBe("en");
  });

  it("moves an Arabic reader off the English page before it paints, and never the other way", () => {
    const run = (cookie: string, pathname: string, lang: string) => {
      const location = { pathname, search: "?a=1", hash: "", replace: vi.fn() };
      new Function("location", "document", landingLanguagePrePaintScript())(location, { cookie, documentElement: { lang } });
      return location.replace;
    };
    expect(run(`rivet_ui_locale_v1=${pref("ar", null)}`, "/", "en")).toHaveBeenCalledWith("/ar?a=1");
    expect(run(`rivet_ui_locale_v1=${pref("ar", "user_1")}`, "/", "en")).not.toHaveBeenCalled();
    expect(run("", "/", "en")).not.toHaveBeenCalled();
    expect(run(`rivet_ui_locale_v1=${pref("en", null)}`, "/ar", "ar")).not.toHaveBeenCalled();
  });
});
