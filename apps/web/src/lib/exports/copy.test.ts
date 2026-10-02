import { describe, expect, it } from "vitest";
import { buildCsvDocument, buildSectionedCsvDocument, csvCell } from "./csv";
import { exportLocale, makeExportCopy } from "./copy";

describe("export content language", () => {
  it("localizes only known labels and codes, keeping unknown values intact", () => {
    const ar = makeExportCopy("ar");
    expect(ar.label("Member directory")).toBe("قائمة الأعضاء");
    expect(ar.status("cash")).toBe("كاش");
    expect(ar.status("ar")).toBe("العربية");
    expect(ar.status("new_vendor_status")).toBe("new_vendor_status");
    expect(ar.label("=Authored plan")).toBe("=Authored plan");
    expect(makeExportCopy("en").status("bank_transfer")).toBe("Bank transfer");
    expect(exportLocale(undefined)).toBe("en");
    expect(exportLocale("unknown")).toBe("en");
  });

  it("formats calendar days independently of time zones and preserves invalid dates", () => {
    const ar = makeExportCopy("ar");
    expect(ar.date("2026-10-03")).toBe("3 تشرين الأول 2026");
    expect(ar.dateTime("2026-10-03", "America/Los_Angeles")).toBe("3 تشرين الأول 2026");
    expect(ar.dateTime("2026-10-03T21:00:45Z", "Asia/Amman")).toBe("4 تشرين الأول 2026 12:00:45 ص");
    expect(ar.clock("00:05")).toBe("12:05 ص");
    expect(ar.date("2026-02-31")).toBe("2026-02-31");
    expect(ar.date("recorded as written")).toBe("recorded as written");
    expect(makeExportCopy("en").date("2026-10-03")).toBe("2026-10-03");
  });

  it("localizes filter headings and scopes without translating search/name data", () => {
    const ar = makeExportCopy("ar");
    expect(ar.scope("all accessible branches")).toBe("جميع الفروع المتاحة");
    expect(ar.scope("2 assigned branches")).toBe("فرعان معيّنان");
    expect(ar.scope("branch:uuid-1", "North Gym")).toBe("الفرع: North Gym");
    expect(ar.scope("legacy authored scope")).toBe("legacy authored scope");
    expect(ar.filters({ search: "Active", from: "2026-10-03" })).toBe("البحث: Active; من: 3 تشرين الأول 2026");
  });

  it("presents system descriptors while keeping historical and authored text intact", () => {
    const ar = makeExportCopy("ar");
    const message = { key: "communicationCompletion.timeline.paymentVoided", params: { receipt: "R-200" } };
    expect(ar.systemText("Payment voided — R-200", message, "Asia/Amman")).toContain("R-200");
    expect(ar.systemText("Payment voided — R-200", message, "Asia/Amman")).not.toContain("Payment voided");
    expect(ar.systemText("Authored reason", undefined, "Asia/Amman")).toBe("Authored reason");
    expect(makeExportCopy("en").systemText("Original event", message, "Asia/Amman")).toBe("Original event");
  });

  it("localizes boolean cells in both CSV builders while preserving formula escaping", () => {
    expect(csvCell(true, "ar")).toBe("نعم");
    expect(csvCell(false, "ar")).toBe("لا");
    expect(csvCell("=SUM(1)", "ar")).toBe("'=SUM(1)");
    for (const content of [
      buildCsvDocument({ locale: "ar", title: "ملف", headers: ["القيمة"], rows: [[true], [false], ["=2+2"]] }),
      buildSectionedCsvDocument({ locale: "ar", title: "ملف", sections: [{ title: "القسم", headers: ["القيمة"], rows: [[true], [false], ["=2+2"]] }] }),
    ]) {
      expect(content).toContain("\r\nنعم\r\nلا\r\n'=2+2\r\n");
      expect(content).not.toContain("Yes");
    }
  });
});
