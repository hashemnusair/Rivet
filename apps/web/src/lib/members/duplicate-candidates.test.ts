import { describe, expect, it } from "vitest";
import { buildDuplicateCandidatePairs } from "./duplicate-candidates";

describe("buildDuplicateCandidatePairs", () => {
  it("handles a realistic member volume and matches normalized Jordanian numbers", () => {
    const members = Array.from({ length: 10_000 }, (_, index) => ({
      id: `member-${index}`,
      fullName: `Member ${index}`,
      phone: `+96278${String(index).padStart(7, "0")}`,
      email: `member-${index}@example.com`,
      memberNumber: `M-${index}`,
      status: "active",
      createdAt: index,
      updatedAt: index,
    }));
    members.push({ ...members[42]!, id: "duplicate", phone: "0780000042", updatedAt: 20_000 });

    const pairs = buildDuplicateCandidatePairs(members, "+962");

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      candidateId: "duplicate",
      reasons: expect.arrayContaining(["phone", "email", "member_number", "name_and_contact"]),
      confidence: "strong",
    });
  });

  it("excludes archived and merged records", () => {
    const members = ["active", "archived", "merged"].map((status, index) => ({ id: status, fullName: "Same Person", phone: "0791234567", status, createdAt: index, updatedAt: index }));
    expect(buildDuplicateCandidatePairs(members, "+962")).toEqual([]);
  });
});
