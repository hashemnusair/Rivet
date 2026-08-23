import { describe, expect, it } from "vitest";
import { DEMO_IDENTITY, destinationFor, type RivetIdentity } from "./rivet-identity";

const baseIdentity: RivetIdentity = {
  status: "ready",
  platformAdmin: false,
  gymAccessUnavailable: false,
  memberships: [],
};

describe("destinationFor", () => {
  it("exposes the seeded mock operator for explicit mock/preview workflows", () => {
    expect(DEMO_IDENTITY).toMatchObject({
      status: "demo",
      userId: "10000000-0000-4a00-8a00-000000000010",
      fullName: "Omar Al-Khatib",
      email: "omar@forgefitness.jo",
      platformAdmin: false,
      gymAccessUnavailable: false,
      memberships: [],
    });
  });

  it("keeps the demo operator in member routing scope rather than elevating it to platform", () => {
    expect(destinationFor(DEMO_IDENTITY)).toEqual({ area: "member", href: "/customer/my-gyms" });
  });

  it("routes platform administrators to the platform even when they also have a gym role", () => {
    expect(
      destinationFor({
        ...baseIdentity,
        platformAdmin: true,
        memberships: [
          {
            organizationId: "org-1",
            organizationName: "Forge",
            organizationSlug: "forge",
            role: "owner",
            branches: [],
          },
        ],
      }),
    ).toEqual({ area: "platform", href: "/platform" });
  });

  it("routes gym staff to their role-specific workspace", () => {
    expect(
      destinationFor({
        ...baseIdentity,
        memberships: [
          {
            organizationId: "org-1",
            organizationName: "Forge",
            organizationSlug: "forge",
            role: "receptionist",
            branches: [],
          },
        ],
      }),
    ).toEqual({ area: "gym", href: "/reception", role: "receptionist" });
  });

  it.each([
    ["owner", "/dashboard"],
    ["manager", "/dashboard"],
    ["salesperson", "/dashboard"],
    ["receptionist", "/reception"],
    ["trainer", "/dashboard"],
    ["auditor", "/reports"],
  ] as const)("routes %s accounts to %s", (role, href) => {
    expect(destinationFor({ ...baseIdentity, memberships: [{ organizationId: "org-1", organizationName: "Forge", organizationSlug: "forge", role, branches: [] }] })).toEqual({ area: "gym", href, role });
  });

  it("uses the member dashboard only when the account has no elevated role", () => {
    expect(destinationFor(baseIdentity)).toEqual({ area: "member", href: "/customer/my-gyms" });
  });

  it("does not misclassify a gym account with unavailable access as a member", () => {
    expect(destinationFor({ ...baseIdentity, gymAccessUnavailable: true })).toEqual({ area: "unavailable", href: "/login" });
  });
});
