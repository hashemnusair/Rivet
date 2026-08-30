import { describe, expect, it } from "vitest";
import { inferMemberImportMapping, mappedMemberCsv, parseCsvMatrix, rejectedMemberRowsCsv, sourcePlanNames } from "./member-import";

describe("member import mapping", () => {
  it("recognizes common English and Arabic spreadsheet headers", () => {
    expect(inferMemberImportMapping(["Customer Name", "Mobile Number", "Email Address"])).toEqual({ fullName: 0, phone: 1, email: 2 });
    expect(inferMemberImportMapping(["رقم الهاتف", "اسم العضو"])).toEqual({ fullName: 1, phone: 0 });
  });

  it("converts arbitrary mapped columns into the canonical server contract", () => {
    const matrix = parseCsvMatrix('Notes,Mobile,Name\n"Likes, mornings",0790000001,Rana Odeh');
    expect(mappedMemberCsv(matrix, { fullName: 2, phone: 1 })).toBe("full_name,phone,email,source_plan_name,membership_start_date,membership_end_date,remaining_visits,freeze_start_date,freeze_end_date,opening_balance,historical_paid_total,historical_payment_date,historical_payment_reference\r\nRana Odeh,0790000001,,,,,,,,,,,");
  });

  it("recognizes migration fields and returns each source plan once", () => {
    const headers = ["Member", "Mobile", "Package Name", "Expiry Date", "Amount Due"];
    const mapping = inferMemberImportMapping(headers);
    expect(mapping).toMatchObject({ fullName: 0, phone: 1, sourcePlanName: 2, membershipEndDate: 3, openingBalance: 4 });
    expect(sourcePlanNames([headers, ["Rana", "079", "Monthly", "2027-01-01", "10"], ["Mira", "078", "Annual", "2027-02-01", "0"], ["Omar", "077", "Monthly", "2027-03-01", "5"]], mapping)).toEqual(["Annual", "Monthly"]);
  });

  it("creates a portable rejection report", () => {
    expect(rejectedMemberRowsCsv([{ rowNumber: 2, fullName: "Rana", phone: "079", status: "invalid", errors: ["Enter a valid phone number"], duplicateMemberIds: [] }])).toContain("Enter a valid phone number");
  });
});
