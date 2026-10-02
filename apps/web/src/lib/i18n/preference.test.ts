import { describe, expect, it } from "vitest";
import { encodeUiPreference, localeCookieSuffix, parseUiPreference, resolveUiPreference, type UiLocalePreference } from "./preference";
const ar: UiLocalePreference = { version: 1, locale: "ar", owner: "account-a" };
describe("UI preference ownership and first render", () => {
  it("uses an explicit pending choice before the saved preference", () => {
    expect(resolveUiPreference({ owner: "account-a", savedLocale: "en", cookie: { ...ar, pending: "choice" } })).toMatchObject({ locale: "ar", pending: "choice" });
  });
  it("uses the authenticated preference ahead of a stale cookie", () => {
    expect(resolveUiPreference({ owner: "account-a", savedLocale: "en", cookie: ar }).locale).toBe("en");
  });
  it("never transfers an account's cookie or pending choice to another account or sign-out", () => {
    for (const owner of ["account-b", null]) {
      expect(resolveUiPreference({ owner, cookie: { ...ar, pending: "late" }, legacyLocale: "ar" })).toEqual({ version: 1, locale: "en", owner });
    }
  });
  it("carries an explicit anonymous language choice through sign-in", () => {
    expect(resolveUiPreference({ owner: "account-b", savedLocale: "en", cookie: { ...ar, owner: null, pending: "login-choice" } })).toMatchObject({ owner: "account-b", locale: "ar", pending: "login-choice" });
  });
  it("rejects malformed preferences and unsupported locales", () => {
    expect(parseUiPreference(encodeUiPreference(ar))).toEqual(ar);
    for (const value of ["%", "{}", JSON.stringify({ ...ar, locale: "fr" }), JSON.stringify({ ...ar, version: 2 }), JSON.stringify({ ...ar, owner: "" })]) expect(parseUiPreference(value)).toBeUndefined();
  });
  it("shares only the presentation cookie across known production hosts", () => {
    for (const host of ["rivetjo.com", "www.rivetjo.com", "dashboard.rivetjo.com", "app.rivetjo.com", "platform.rivetjo.com"]) expect(localeCookieSuffix(host, true)).toContain("; domain=rivetjo.com; secure");
    for (const host of ["localhost", "preview.vercel.app", "rivetjo.com.example.org", "unknown.rivetjo.com"]) expect(localeCookieSuffix(host, false)).not.toContain("domain=");
  });
});
