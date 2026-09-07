import { describe, expect, it } from "vitest";
import { resolveMemberLookup } from "./lookup";

const people = [
  { id: "m1", memberNumber: "ABD-1001", fullName: "Ahmad Saleh", phone: "+962 79 111 2233", status: "active" },
  { id: "m2", memberNumber: "ABD-1002", fullName: "Ahmad Salem", phone: "+962 79 111 9988", status: "active" },
  { id: "m3", memberNumber: "SWF-2001", fullName: "Lina Qasem", phone: "+962 77 555 0101", status: "active" },
  { id: "m4", memberNumber: "SWF-2002", fullName: "Lina Qasem", phone: "+962 77 555 0101", status: "archived" },
];

describe("resolveMemberLookup", () => {
  it("lists everyone a name fragment could mean instead of picking the first", () => {
    const result = resolveMemberLookup(people, "Ahmad");
    expect(result.member).toBeUndefined();
    expect(result.candidates.map((c) => c.id)).toEqual(["m1", "m2"]);
    expect(result.exact).toBe(false);
  });

  it("resolves a fragment that only one person matches", () => {
    const result = resolveMemberLookup(people, "salem");
    expect(result.member?.id).toBe("m2");
  });

  it("treats a complete member number as an identity, even when it is also a prefix of another", () => {
    const withPrefix = [...people, { id: "m5", memberNumber: "ABD-10011", fullName: "Someone Else", phone: "+962 79 000 0000", status: "active" }];
    const result = resolveMemberLookup(withPrefix, "abd 1001");
    expect(result.member?.id).toBe("m1");
    expect(result.exact).toBe(true);
  });

  it("matches a complete phone in any local or international spelling", () => {
    for (const query of ["0791112233", "079 111 2233", "+962791112233", "00962 79 111 2233"]) {
      const result = resolveMemberLookup(people, query, "962");
      expect(result.member?.id, query).toBe("m1");
      expect(result.exact, query).toBe(true);
    }
  });

  it("does not decide between two profiles that share one phone", () => {
    const result = resolveMemberLookup(people, "0775550101", "962");
    expect(result.member).toBeUndefined();
    // Active profiles are offered first; the archived duplicate is still visible.
    expect(result.candidates.map((c) => c.id)).toEqual(["m3", "m4"]);
  });

  it("keeps short digit runs as partial searches rather than phone identities", () => {
    const result = resolveMemberLookup(people, "9988", "962");
    expect(result.member?.id).toBe("m2");
    expect(result.exact).toBe(false);
  });

  it("returns nobody for a query nothing matches", () => {
    const result = resolveMemberLookup(people, "zzzz");
    expect(result.member).toBeUndefined();
    expect(result.candidates).toEqual([]);
  });
});
