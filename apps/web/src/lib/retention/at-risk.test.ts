import { describe, expect, it } from "vitest";
import { deriveRetentionRisks, type RetentionMemberFact, type RetentionMembershipFact } from "./at-risk";

const today = "2026-08-31";

function member(id: string, createdAt = "2026-01-01T08:00:00.000Z"): RetentionMemberFact {
  return { id, status: "active", homeBranchId: "branch-main", createdAt };
}

function membership(memberId: string, overrides: Partial<RetentionMembershipFact> = {}): RetentionMembershipFact {
  return {
    id: `membership-${memberId}`,
    memberId,
    homeBranchId: "branch-main",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    ...overrides,
  };
}

function derive(overrides: Partial<Parameters<typeof deriveRetentionRisks>[0]> = {}) {
  return deriveRetentionRisks({
    today,
    inactivityDays: 14,
    renewalWindowDays: 14,
    expiredWinBackDays: 90,
    members: [],
    memberships: [],
    checkIns: [],
    ...overrides,
  });
}

describe("retention risk derivation", () => {
  it("explains inactivity from the latest accepted visit and ignores blocked scans", () => {
    const risks = derive({
      members: [member("member-a")],
      memberships: [membership("member-a")],
      checkIns: [
        { memberId: "member-a", decision: "accepted", occurredAt: "2026-08-01T06:00:00.000Z" },
        { memberId: "member-a", decision: "blocked", occurredAt: "2026-08-30T06:00:00.000Z" },
      ],
    });

    expect(risks).toEqual([expect.objectContaining({
      memberId: "member-a",
      priority: "urgent",
      lastVisitAt: "2026-08-01T06:00:00.000Z",
      reasons: [{ kind: "inactive", label: "No visit in 30 days", daysInactive: 30 }],
    })]);
  });

  it("keeps new members and currently frozen memberships out of the inactivity queue", () => {
    expect(derive({
      members: [member("new", "2026-08-25T08:00:00.000Z"), member("frozen")],
      memberships: [
        membership("new", { startDate: "2026-08-25" }),
        membership("frozen", { activeFreeze: { status: "active", startDate: "2026-08-20", endDate: "2026-09-05" } }),
      ],
    })).toEqual([]);
  });

  it("does not treat a depleted visit pass as an active retention term", () => {
    expect(derive({
      members: [member("depleted")],
      memberships: [membership("depleted", { totalVisits: 10, remainingVisits: 0 })],
    })).toEqual([]);
  });

  it("combines expiring and inactive reasons for one member instead of duplicating rows", () => {
    const risks = derive({
      members: [member("member-b")],
      memberships: [membership("member-b", { endDate: "2026-09-04" })],
    });

    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({ memberId: "member-b", priority: "urgent" });
    expect(risks[0]?.reasons.map((reason) => reason.kind)).toEqual(["expiring", "inactive"]);
  });

  it("offers recently expired members for win-back but ignores superseded terms", () => {
    const old = membership("renewed", { id: "old-term", endDate: "2026-08-20" });
    const newTerm = membership("renewed", { id: "new-term", previousMembershipId: "old-term", startDate: "2026-08-21", endDate: "2026-12-31" });
    const risks = derive({
      members: [member("expired"), member("renewed", "2026-08-21T08:00:00.000Z")],
      memberships: [membership("expired", { endDate: "2026-08-21" }), old, newTerm],
    });

    expect(risks).toEqual([expect.objectContaining({
      memberId: "expired",
      priority: "urgent",
      reasons: [{ kind: "expired", label: "Expired 10 days ago", daysSinceExpiry: 10 }],
    })]);
  });

  it("honors snoozes through their selected date and can include them for audits", () => {
    const input = {
      members: [member("member-c")],
      memberships: [membership("member-c")],
      snoozes: [{ memberId: "member-c", snoozedUntil: today }],
    };

    expect(derive(input)).toEqual([]);
    expect(derive({ ...input, includeSnoozed: true })).toEqual([
      expect.objectContaining({ memberId: "member-c", snoozedUntil: today }),
    ]);
  });
});
