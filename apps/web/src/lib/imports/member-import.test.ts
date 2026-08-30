import { describe, expect, it } from "vitest";
import { inferMemberImportMapping, mappedMemberCsv, parseCsvMatrix, rejectedMemberRowsCsv } from "./member-import";

describe("member import mapping", () => {
  it("recognizes common English and Arabic spreadsheet headers", () => {
    expect(inferMemberImportMapping(["Customer Name", "Mobile Number", "Email Address"])).toEqual({ fullName: 0, phone: 1, email: 2 });
    expect(inferMemberImportMapping(["رقم الهاتف", "اسم العضو"])).toEqual({ fullName: 1, phone: 0 });
  });

  it("converts arbitrary mapped columns into the canonical server contract", () => {
    const matrix = parseCsvMatrix('Notes,Mobile,Name\n"Likes, mornings",0790000001,Rana Odeh');
    expect(mappedMemberCsv(matrix, { fullName: 2, phone: 1 })).toBe("full_name,phone,email\r\nRana Odeh,0790000001,");
  });

  it("creates a portable rejection report", () => {
    expect(rejectedMemberRowsCsv([{ rowNumber: 2, fullName: "Rana", phone: "079", status: "invalid", errors: ["Enter a valid phone number"], duplicateMemberIds: [] }])).toContain("Enter a valid phone number");
  });
});
