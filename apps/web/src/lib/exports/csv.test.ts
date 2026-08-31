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
});
