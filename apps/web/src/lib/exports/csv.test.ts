import { describe, expect, it } from "vitest";
import { buildCsvDocument, buildSectionedCsvDocument, csvCell, formatExportDateTime, formatMinorUnits } from "./csv";

describe("human-readable CSV exports", () => {
  it("preserves Arabic, quotes commas, uses CRLF, and neutralizes spreadsheet formulas", () => {
    const content = buildCsvDocument({
      title: "Members",
      metadata: [{ label: "Timezone", value: "Asia/Amman" }],
      headers: ["Full name", "Arabic name", "Email"],
      rows: [["Doe, Jane", "جنى حداد", "=2+2"]],
    });

    expect(content.startsWith("\uFEFFRIVET export,Members\r\n")).toBe(true);
    expect(content).toContain('"Doe, Jane",جنى حداد,\'=2+2');
    expect(content).not.toContain("data_json");
    expect(content).not.toContain("[object Object]");
  });

  it("renders personal data as labelled sections instead of sparse JSON records", () => {
    const content = buildSectionedCsvDocument({
      title: "My RIVET data",
      sections: [
        { title: "Profile", headers: ["Field", "Value"], rows: [["Full name", "Lina Haddad"]] },
        { title: "Payments", headers: ["Receipt", "Amount", "Currency"], rows: [["R-100", "40.000", "JOD"]] },
      ],
    });

    expect(content).toContain("Profile\r\nField,Value\r\nFull name,Lina Haddad");
    expect(content).toContain("Payments\r\nReceipt,Amount,Currency\r\nR-100,40.000,JOD");
  });

  it("formats tenant-local timestamps and currency minor units predictably", () => {
    expect(formatExportDateTime("2026-08-31T12:30:45.000Z", "Asia/Amman")).toBe("2026-08-31 15:30:45");
    expect(formatMinorUnits(40_125, "JOD")).toBe("40.125");
    expect(formatMinorUnits(1_050, "USD")).toBe("10.50");
    expect(csvCell(false)).toBe("No");
  });

  it("formats Arabic export timestamps with Jordanian months, Latin digits, 12-hour clocks and seconds", () => {
    expect(formatExportDateTime("2026-08-31T12:30:45.000Z", "Asia/Amman", "ar")).toBe("31 آب 2026 3:30:45 م");
    expect(formatExportDateTime("2026-08-31T22:00:07.000Z", "Asia/Amman", "ar")).toBe("1 أيلول 2026 1:00:07 ص");
    expect(formatExportDateTime("2026-08-31T22:00:07.000Z", "America/New_York", "ar")).toBe("31 آب 2026 6:00:07 م");
    expect(formatExportDateTime("2026-08-31", "Asia/Amman", "ar")).toBe("2026-08-31");
  });

  it("preserves regional currency precision and blank unavailable amounts", () => {
    expect(formatMinorUnits(40_125, "IQD")).toBe("40.125");
    expect(formatMinorUnits(-40_125, "tnd")).toBe("-40.125");
    expect(formatMinorUnits(4_050, "GBP")).toBe("40.50");
    expect(formatMinorUnits(0, "USD")).toBe("0.00");
    expect(formatMinorUnits(undefined)).toBe("");
    expect(formatMinorUnits(Number.NaN)).toBe("");
    expect(formatMinorUnits(Number.POSITIVE_INFINITY)).toBe("");
  });

  it.each(["\n=2+2", "\r\n@SUM(1)", "\t\n+2+2", "\u00a0-2+2"])(
    "neutralizes formulas after leading whitespace: %j",
    (value) => {
      const escaped = `'${value}`;
      expect(csvCell(value)).toBe(/[\r\n]/.test(value) ? `"${escaped}"` : escaped);
    },
  );

  it("preserves ordinary multiline text and escapes formula quotes", () => {
    expect(csvCell("First line\nSecond line")).toBe('"First line\nSecond line"');
    expect(csvCell('\n="quoted"')).toBe('"\'\n=""quoted"""');
  });
});
