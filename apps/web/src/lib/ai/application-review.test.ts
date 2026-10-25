import { describe, expect, it } from "vitest";
import { applicationReviewBrief, type ReviewableApplication } from "./application-review";

const base: ReviewableApplication = { id: "a", gymName: "Northline Strength", gymAddress: "Amman", email: "owner@northline.example", contactNumber: "0791234567", plan: "Pro", status: "pending" };

describe("application review brief", () => {
  it("points at earlier applications sharing an email, a phone or a gym name", () => {
    const others: ReviewableApplication[] = [
      { ...base, id: "b", gymName: "Other Gym", contactNumber: "0780000000", status: "rejected" },
      { ...base, id: "c", gymName: "Different", email: "x@y.example", contactNumber: "+962 79 123 4567", status: "approved" },
      { ...base, id: "d", gymName: "Northline Strength Gym", email: "z@y.example", contactNumber: "0770000000", status: "pending" },
      { ...base, id: "e", gymName: "Unrelated", email: "u@y.example", contactNumber: "0760000000" },
    ];
    expect(applicationReviewBrief(base, [base, ...others])).toEqual([
      { kind: "duplicate", field: "email", otherId: "b", otherName: "Other Gym", otherStatus: "rejected" },
      { kind: "duplicate", field: "phone", otherId: "c", otherName: "Different", otherStatus: "approved" },
      { kind: "duplicate", field: "name", otherId: "d", otherName: "Northline Strength Gym", otherStatus: "pending" },
    ]);
  });

  it("names missing details and decisions the operator must record", () => {
    expect(applicationReviewBrief({ ...base, gymAddress: "", plan: "Enterprise", notificationStatus: "failed", promoCode: "LAUNCH" }, [])).toEqual([
      { kind: "missing_address" }, { kind: "enterprise_quote" }, { kind: "confirmation_failed" }, { kind: "promo", code: "LAUNCH" },
    ]);
    expect(applicationReviewBrief(base, [base])).toEqual([]);
  });
});
