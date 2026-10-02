import { describe, expect, it } from "vitest";
import type { MembershipSummary } from "@/lib/domain/types";
import { createTranslator } from "@/lib/i18n/core";
import { checkInMessage, lookupMessage } from "./checkin-copy";
import { checkInReasonLabel } from "./reason-codes";

const t = createTranslator("ar");
const preserve = (value: string | number) => String(value);

describe("Arabic reception presentation copy", () => {
  it("translates canonical reason codes and leaves unknown historical values unchanged", () => {
    expect(checkInReasonLabel("MEMBERSHIP_EXPIRED", t)).toBe("انتهى الاشتراك");
    expect(checkInReasonLabel("FUTURE_REASON_FROM_HISTORY", t)).toBe("FUTURE_REASON_FROM_HISTORY");
  });

  it("rebuilds only an exact generated warning while retaining six-category plural wording", () => {
    const membership = { endDate: "2026-10-05" } as MembershipSummary;
    const exact = "Allowed with notice — membership expires in 2 days; outstanding balance due.";
    const localized = checkInMessage({
      message: exact,
      reasonCodes: ["EXPIRES_SOON", "OUTSTANDING_BALANCE"],
      decision: "warning",
      locale: "ar",
      t,
      isolate: preserve,
      today: "2026-10-03",
      formatDate: (date) => date,
      membership,
    });

    expect(localized).toContain("الدخول مسموح مع تنبيه");
    expect(localized).toContain("ينتهي الاشتراك بعد يومين");
    expect(localized).toContain("يوجد مبلغ متبقٍ");
    expect(localized).not.toContain(".. ");

    const ambiguous = "Membership expires in 2 days.";
    expect(checkInMessage({
      message: ambiguous,
      reasonCodes: ["EXPIRES_SOON"],
      decision: "warning",
      locale: "ar",
      t,
      isolate: preserve,
      today: "2026-10-03",
      formatDate: (date) => date,
      membership,
    })).toBe(ambiguous);
  });

  it("translates only the exact normal allowed result with the sole OK reason", () => {
    const generated = "Membership valid. Welcome in.";
    const present = (overrides: { message?: string; reasonCodes?: string[]; decision?: string } = {}) => checkInMessage({
      message: overrides.message ?? generated,
      reasonCodes: overrides.reasonCodes ?? ["OK"],
      decision: overrides.decision ?? "allowed",
      locale: "ar",
      t,
      isolate: preserve,
      today: "2026-10-03",
      formatDate: (date) => date,
    });

    expect(present()).toBe("الاشتراك فعّال. أهلًا بك في النادي.");
    expect(present({ decision: "warning" })).toBe(generated);
    expect(present({ reasonCodes: ["OK", "EXPIRES_SOON"] })).toBe(generated);
    expect(present({ message: "Custom welcome from the server." })).toBe("Custom welcome from the server.");
  });

  it("translates a generated override wrapper but preserves the authored reason", () => {
    const authoredReason = "Paid at Abdoun this morning, receipt shown";
    const result = checkInMessage({
      message: `Overridden by Dana Manager: ${authoredReason}`,
      reasonCodes: ["MANUAL_OVERRIDE"],
      decision: "overridden",
      locale: "ar",
      t,
      isolate: preserve,
      today: "2026-10-03",
      formatDate: (date) => date,
      actorName: "Dana Manager",
    });

    expect(result).toContain("تم السماح بالدخول استثنائيًا بواسطة Dana Manager");
    expect(result).toContain(authoredReason);
  });

  it("keeps the exact lookup value and leaves unfamiliar server copy untouched", () => {
    const query = "RF-0042";
    expect(lookupMessage({
      message: `No member matches “${query}”.`,
      query,
      locale: "ar",
      t,
      isolate: preserve,
    })).toBe(`لا يوجد مشترك يطابق ${query}.`);

    const historical = "A custom server message that may contain member-authored data.";
    expect(lookupMessage({ message: historical, query, locale: "ar", t, isolate: preserve })).toBe(historical);
  });
});
