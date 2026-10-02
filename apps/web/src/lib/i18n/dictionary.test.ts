import { afterEach, describe, expect, it, vi } from "vitest";
import { interpolate, plural, translate, type MessageTree } from "./dictionary";

const en: MessageTree = {
  hello: "Hello {name}",
  members: plural({ one: "{count} member", other: "{count} members" }),
  onlyEnglish: "Only English",
  group: { other: "Other", leaf: "Leaf" },
};
const ar: MessageTree = {
  hello: "مرحبًا {name}",
  members: plural({ zero: "لا أعضاء", one: "عضو واحد", two: "عضوان", few: "{count} أعضاء", many: "{count} عضوًا", other: "{count} عضو" }),
  group: { other: "أخرى", leaf: "ورقة" },
};

const t = (locale: "en" | "ar", key: string, vars?: Record<string, string | number>) =>
  translate({ messages: locale === "ar" ? ar : en, fallback: en, locale }, key, vars);

afterEach(() => vi.restoreAllMocks());

describe("translate", () => {
  it("interpolates {params} and leaves unknown ones visible", () => {
    expect(t("en", "hello", { name: "Omar" })).toBe("Hello Omar");
    expect(interpolate("Hi {a} {b}", { a: "x" })).toBe("Hi x {b}");
  });

  it("selects Arabic plural categories for 0, 1, 2, 3, 11 and 100", () => {
    const words = [0, 1, 2, 3, 11, 100].map((count) => t("ar", "members", { count }));
    expect(words).toEqual(["لا أعضاء", "عضو واحد", "عضوان", "3 أعضاء", "11 عضوًا", "100 عضو"]);
  });

  it("requires variables and a finite plural count instead of displaying a false zero", () => {
    expect(() => t("ar", "hello")).toThrow("requires: name");
    expect(() => t("ar", "members")).toThrow("finite count");
    expect(() => t("ar", "members", { count: Number.NaN })).toThrow("finite count");
    expect(t("ar", "members", { count: 1.5 })).toBe("1.5 عضو");
    expect(t("ar", "members", { count: -3 })).toBe("-3 أعضاء");
  });

  it("selects English plurals", () => {
    expect([1, 2].map((count) => t("en", "members", { count }))).toEqual(["1 member", "2 members"]);
  });

  it("treats a normal branch with an `other` child as vocabulary, not a plural", () => {
    expect(t("ar", "group.other")).toBe("أخرى");
  });

  it("falls back to English for a key missing from Arabic and warns in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("ar", "onlyEnglish")).toBe("Only English");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing "ar" message "onlyEnglish"'));
  });

  it("returns the key for an unknown message so it is visible in review", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(t("en", "nope.nothing")).toBe("nope.nothing");
  });
});
