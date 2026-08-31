import { describe, expect, it } from "vitest";
import { buildPersonalDataHtmlReport } from "./personal-report";

describe("personal data report", () => {
  it("renders recorded values, skips blank profile fields, and escapes markup", () => {
    const report = buildPersonalDataHtmlReport({
      memberName: "Lina <Haddad>",
      generatedAt: "2026-08-31 23:30:00",
      account: "lina@example.com",
      includedGyms: "Forge",
      profile: [
        { label: "Phone", value: "+962 79 000 0000" },
        { label: "Blank", value: "" },
      ],
      sections: [{ title: "Payments", headers: ["Amount", "Note"], rows: [["40.000 JOD", "<paid>"]] }],
    });

    expect(report).toContain("Lina &lt;Haddad&gt;");
    expect(report).toContain("+962 79 000 0000");
    expect(report).toContain("40.000 JOD");
    expect(report).toContain("&lt;paid&gt;");
    expect(report).not.toContain(">Blank<");
    expect(report).not.toContain("<paid>");
  });
});
