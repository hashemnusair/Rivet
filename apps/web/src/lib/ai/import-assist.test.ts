import { describe, expect, it } from "vitest";
import { labelAmount, suggestColumns, suggestPlans } from "./import-assist";

describe("import column suggestions", () => {
  it("reads values when headers did not settle the mapping, and never overrides a mapped field", () => {
    const matrix = [
      ["Col A", "Col B", "Col C", "Col D", "Col E", "Col F"],
      ["Lina Haddad", "0791234567", "أنثى", "lina@example.com", "01/09/2026", "01/12/2026"],
      ["Omar Khalil", "+962 78 555 0101", "ذكر", "omar@example.com", "15/08/2026", "15/11/2026"],
      ["Sara Nasser", "0777000111", "female", "sara@example.com", "2026-07-01", "2026-10-01"],
    ];
    expect(suggestColumns(matrix, {})).toEqual([
      { field: "email", index: 3, basis: "emails" },
      { field: "phone", index: 1, basis: "phone_numbers" },
      { field: "gender", index: 2, basis: "gender_words" },
      { field: "fullName", index: 0, basis: "names" },
      { field: "membershipStartDate", index: 4, basis: "earlier_dates" },
      { field: "membershipEndDate", index: 5, basis: "later_dates" },
    ]);
    expect(suggestColumns(matrix, { phone: 1, fullName: 0 }).map((item) => item.field)).toEqual(["email", "gender", "membershipStartDate", "membershipEndDate"]);
  });
});

describe("import plan suggestions", () => {
  const plans = [
    { id: "p-month", name: "Monthly Gold", kind: "time", durationDays: 30 },
    { id: "p-quarter", name: "Quarterly", kind: "time", durationDays: 90 },
    { id: "p-year", name: "Annual", kind: "time", durationDays: 365 },
    { id: "p-10", name: "10 visits", kind: "visits", visitAllowance: 10 },
  ];

  it("reads lengths and visit counts in English and Arabic", () => {
    expect(labelAmount("3 months")).toEqual({ days: 90 });
    expect(labelAmount("اشتراك شهري")).toEqual({ days: 30 });
    expect(labelAmount("سنوي")).toEqual({ days: 365 });
    expect(labelAmount("10 زيارات")).toEqual({ visits: 10 });
  });

  it("suggests only a clear winner and leaves existing choices alone", () => {
    expect(suggestPlans(["Annual", "3 months", "شهري", "10 زيارات", "VIP"], plans, {})).toEqual([
      { sourceName: "Annual", planId: "p-year", basis: "same_name" },
      { sourceName: "3 months", planId: "p-quarter", basis: "same_length" },
      { sourceName: "شهري", planId: "p-month", basis: "same_length" },
      { sourceName: "10 زيارات", planId: "p-10", basis: "same_visits" },
    ]);
    expect(suggestPlans(["Annual"], plans, { Annual: "p-month" })).toEqual([]);
  });
});
