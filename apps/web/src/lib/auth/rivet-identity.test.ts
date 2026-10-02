import { describe, expect, it, vi } from "vitest";
import { DEMO_IDENTITY, destinationFor, ensureCurrentUserWithInvitationRecovery, isInvitationBootstrapError, type RivetIdentity } from "./rivet-identity";

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
  ] as const)("routes %s accounts to %s", (role, href) => {
    expect(destinationFor({ ...baseIdentity, memberships: [{ organizationId: "org-1", organizationName: "Forge", organizationSlug: "forge", role, branches: [] }] })).toEqual({ area: "gym", href, role });
  });

  it("uses the member dashboard only when the account has no elevated role", () => {
    expect(destinationFor(baseIdentity)).toEqual({ area: "member", href: "/customer/my-gyms" });
  });

  it("does not misclassify a gym account with unavailable access as a member", () => {
    expect(destinationFor({ ...baseIdentity, gymAccessUnavailable: true })).toEqual({ area: "unavailable", href: "/login" });
  });

  it("never chooses the first workspace when multiple memberships are available", () => {
    expect(destinationFor({
      ...baseIdentity,
      memberships: [
        { organizationId: "org-b", organizationName: "B Gym", organizationSlug: "b", role: "owner", branches: [] },
        { organizationId: "org-a", organizationName: "A Gym", organizationSlug: "a", role: "manager", branches: [] },
      ],
    })).toEqual({ area: "organization-selection", href: "/login?reason=organization-selection" });
  });
});

describe("invitation bootstrap recovery", () => {
  it("retries account synchronization after a verified claim without a reload", async () => {
    const ensureCurrentUser = vi.fn()
      .mockRejectedValueOnce(new Error("INVITATION_NOT_ACCEPTED"))
      .mockResolvedValueOnce(undefined);
    const claimInvitation = vi.fn().mockResolvedValue({ claimed: true });

    await ensureCurrentUserWithInvitationRecovery({ ensureCurrentUser, claimInvitation });

    expect(claimInvitation).toHaveBeenCalledTimes(1);
    expect(ensureCurrentUser).toHaveBeenCalledTimes(2);
  });

  it("does not retry or claim for unrelated synchronization failures", async () => {
    const ensureCurrentUser = vi.fn().mockRejectedValue(new Error("CONFIGURATION_ERROR"));
    const claimInvitation = vi.fn();

    await expect(ensureCurrentUserWithInvitationRecovery({ ensureCurrentUser, claimInvitation })).rejects.toThrow("CONFIGURATION_ERROR");
    expect(claimInvitation).not.toHaveBeenCalled();
    expect(ensureCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("stays closed when the provider cannot prove the invitation", async () => {
    const ensureCurrentUser = vi.fn().mockRejectedValue(new Error("INVITATION_NOT_ACCEPTED"));
    const claimInvitation = vi.fn().mockResolvedValue({ claimed: false });

    await expect(ensureCurrentUserWithInvitationRecovery({ ensureCurrentUser, claimInvitation })).rejects.toThrow("INVITATION_NOT_ACCEPTED");
    expect(ensureCurrentUser).toHaveBeenCalledTimes(1);
    expect(claimInvitation).toHaveBeenCalledTimes(1);
  });

  it("recognizes Convex invitation errors without treating all failures as recoverable", () => {
    expect(isInvitationBootstrapError({ data: { code: "INVITATION_NOT_ACCEPTED" } })).toBe(true);
    expect(isInvitationBootstrapError(new Error("This workspace invitation has not been accepted."))).toBe(true);
    expect(isInvitationBootstrapError(new Error("FORBIDDEN"))).toBe(false);
  });
});
