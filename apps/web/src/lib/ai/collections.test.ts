import { describe, expect, it } from "vitest";
import { prepareCollectionItem, rankCollections, type CollectionMemberFacts } from "./collections";

const context = { today: "2026-10-22", now: "2026-10-22T08:30:00.000Z", gymName: "Forge", currency: "JOD" };
const base: CollectionMemberFacts = { memberId: "m-1", memberName: "Lina Haddad", phone: "+962790000000", preferredLanguage: "en", charges: [{ id: "c-1", dueDate: "2026-10-22", outstandingMinor: 25_000 }], optedOut: false };

describe("collection calls", () => {
  it("offers the approved reminder only when its words are true", () => {
    expect(prepareCollectionItem(base, context)?.draft).toMatchObject({ template: "payment_due_today", language: "en" });
    expect(prepareCollectionItem(base, context)?.draft?.text).toContain("is due today");
    const threeDays = prepareCollectionItem({ ...base, charges: [{ id: "c-1", dueDate: "2026-10-19", outstandingMinor: 25_000 }] }, context);
    expect(threeDays?.draft?.template).toBe("payment_overdue_3d");
    const tenDays = prepareCollectionItem({ ...base, charges: [{ id: "c-1", dueDate: "2026-10-12", outstandingMinor: 25_000 }] }, context);
    expect(tenDays).toMatchObject({ daysOverdue: 10, noDraftReason: "no_matching_template" });
    expect(tenDays?.draft).toBeUndefined();
    const twoBills = prepareCollectionItem({ ...base, charges: [...base.charges, { id: "c-2", dueDate: "2026-10-22", outstandingMinor: 5_000 }] }, context);
    expect(twoBills).toMatchObject({ outstandingMinor: 30_000, chargeCount: 2, noDraftReason: "no_matching_template" });
  });

  it("never drafts for someone who opted out or has no phone, and writes Arabic for Arabic readers", () => {
    expect(prepareCollectionItem({ ...base, optedOut: true }, context)).toMatchObject({ noDraftReason: "opted_out" });
    expect(prepareCollectionItem({ ...base, phone: "" }, context)).toMatchObject({ noDraftReason: "no_phone" });
    expect(prepareCollectionItem({ ...base, preferredLanguage: "ar" }, context)?.draft).toMatchObject({ language: "ar" });
  });

  it("ignores bills not yet due and lists people contacted recently last", () => {
    expect(prepareCollectionItem({ ...base, charges: [{ id: "c-1", dueDate: "2026-10-30", outstandingMinor: 25_000 }] }, context)).toBeUndefined();
    const old = prepareCollectionItem({ ...base, memberId: "m-old", charges: [{ id: "c", dueDate: "2026-09-01", outstandingMinor: 1_000 }] }, context)!;
    const big = prepareCollectionItem({ ...base, memberId: "m-big", charges: [{ id: "c", dueDate: "2026-10-01", outstandingMinor: 90_000 }] }, context)!;
    const called = prepareCollectionItem({ ...base, memberId: "m-called", charges: [{ id: "c", dueDate: "2026-08-01", outstandingMinor: 1_000 }], lastContactAt: "2026-10-21T08:00:00.000Z" }, context)!;
    expect(rankCollections([big, called, old]).map((item) => item.memberId)).toEqual(["m-old", "m-big", "m-called"]);
  });
});
