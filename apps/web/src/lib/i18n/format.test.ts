import { describe, expect, it } from "vitest";
import { ARABIC_ENABLED, arabicEnabledFor, dirFor, resolveLocale } from "./config";
import { makeFormatters, JORDANIAN_MONTHS } from "./formatters";
import { isolate, isolateLtr } from "./bidi";
import { formatMoney } from "@/lib/utils/money";

const money = { amount: 40_000, currency: "JOD" };

describe("formatters", () => {
  const en = makeFormatters("en", "just now");
  const ar = makeFormatters("ar", "الآن");

  it("keeps English output exactly as before", () => {
    expect(en.date("2026-10-18")).toBe("18 Oct 2026");
    expect(en.time("2026-10-18T12:00:00Z")).toBe("15:00");
    expect(en.money(money)).toBe(formatMoney(money));
    expect(en.money(money).replace(/\s/g, " ")).toBe("JOD 40.000");
    expect(en.relativeDays(3)).toBe("in 3 days");
    expect(en.relativeDays(-3)).toBe("3 days ago");
  });

  it("writes Arabic dates with Arabic month names and Latin digits (Gregorian)", () => {
    expect(ar.date("2026-10-18")).toBe("18 تشرين الأول 2026");
    expect(ar.time("2026-10-18T12:00:00Z")).toBe("3:00 م");
    expect(ar.date("2026-10-18")).not.toMatch(/[٠-٩]/);
  });

  it("uses the approved amount-then-currency JOD expression", () => {
    expect(ar.money(money)).toBe("40.000 د.أ");
    expect(ar.money({ amount: 1_234_500, currency: "JOD" }).replace(/\s/g, " ")).toBe("1,234.500 د.أ");
  });

  it("pins all Jordanian months and treats date-only values independently of the timezone", () => {
    for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Asia/Amman"]) {
      const format = makeFormatters("ar", "الآن", zone);
      JORDANIAN_MONTHS.forEach((month, index) => expect(format.date(`2026-${String(index + 1).padStart(2, "0")}-01`)).toBe(`1 ${month} 2026`));
    }
    expect(makeFormatters("ar", "الآن", "America/New_York").date("2026-10-01T00:30:00Z")).toBe("30 أيلول 2026");
  });

  it("handles noon, midnight, negative amounts, zero and other currency precision", () => {
    expect(ar.time("2026-10-01T21:00:00Z")).toBe("12:00 ص");
    expect(ar.time("2026-10-01T09:00:00Z")).toBe("12:00 م");
    expect(ar.money({ amount: -25_001, currency: "JOD" })).toBe("-25.001 د.أ");
    expect(ar.money({ amount: 0, currency: "JOD" }, { signDisplay: "exceptZero" })).toBe("0.000 د.أ");
    expect(ar.money({ amount: 1234, currency: "USD" })).toBe("12.34 USD");
    expect(ar.date("invalid")).toBe("—");
  });

  it("uses Arabic relative wording with the right dual and plural", () => {
    expect(ar.relativeDays(-3)).toBe("قبل 3 أيام");
    expect(ar.relativeDays(2)).toBe("بعد الغد");
    expect(ar.relativeDays(11)).toBe("خلال 11 يومًا");
  });
});

describe("locale gate and direction", () => {
  it("is enabled by the flag, demo auth, or the mock preview, and hidden otherwise", () => {
    expect(arabicEnabledFor({ flag: "1", demoAuthBypass: false, convexUrl: "https://x.convex.cloud" })).toBe(true);
    expect(arabicEnabledFor({ flag: undefined, demoAuthBypass: true, convexUrl: "https://x.convex.cloud" })).toBe(true);
    expect(arabicEnabledFor({ flag: undefined, demoAuthBypass: false, convexUrl: undefined })).toBe(true);
    expect(arabicEnabledFor({ flag: undefined, demoAuthBypass: false, convexUrl: "https://x.convex.cloud" })).toBe(false);
    expect(arabicEnabledFor({ flag: "0", demoAuthBypass: false, convexUrl: "https://x.convex.cloud" })).toBe(false);
  });

  it("ignores the cookie while Arabic is hidden, and ignores junk values", () => {
    expect(resolveLocale("ar", false)).toBe("en");
    expect(resolveLocale("ar", true)).toBe("ar");
    expect(resolveLocale("fr", true)).toBe("en");
    expect(resolveLocale(undefined, true)).toBe("en");
    expect(typeof ARABIC_ENABLED).toBe("boolean");
  });

  it("maps locales to direction", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
  });

  it("isolates values with Unicode isolates", () => {
    expect(isolateLtr("+962 79 000 0000")).toBe("⁦+962 79 000 0000⁩");
    expect(isolate("عمر")).toBe("⁨عمر⁩");
  });
});
