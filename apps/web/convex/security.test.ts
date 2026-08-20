import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { rolePermissions } from "./permissions";
import { assertBranchAccess, domainError, requireMember, requirePermission, requirePlatformAdmin, requireReason, type ActorContext } from "./security";

const organizationId = "org-test" as Id<"organizations">;
const branchA = "branch-a" as Id<"branches">;
const branchB = "branch-b" as Id<"branches">;

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    user: {} as ActorContext["user"],
    organization: { _id: organizationId } as ActorContext["organization"],
    membership: {} as ActorContext["membership"],
    role: "receptionist",
    permissions: ["members.read"],
    branchIds: [branchA],
    branchScope: "selected",
    correlationId: "cor-security-1",
    ...overrides,
  };
}

function memberContext({
  identity,
  user,
  memberships = [],
}: {
  identity?: { subject: string };
  user?: Record<string, unknown> | null;
  memberships?: Array<Record<string, unknown>>;
}) {
  const users = user !== null ? [{ _id: "user-1", authSubject: "clerk-user-1", status: "active", ...(user ?? {}) }] : [];
  const rows: Record<string, Array<Record<string, unknown>>> = { users, organizationMemberships: memberships };
  const query = (table: string) => ({
    withIndex: (_index: string, build: (q: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      const filters: Array<[string, unknown]> = [];
      const q = { eq: (field: string, value: unknown) => { filters.push([field, value]); return q; } };
      build(q);
      const matches = (rows[table] ?? []).filter((row) => filters.every(([field, value]) => row[field] === value));
      return { unique: async () => matches[0] ?? null, collect: async () => matches };
    },
  });
  return {
    auth: { getUserIdentity: async () => identity ?? { subject: "clerk-user-1" } },
    db: { query },
  } as never;
}

describe("Convex security kernel", () => {
  it("rejects a missing server permission", () => {
    expect(() => requirePermission(actor(), "payments.refund")).toThrow(/refund permission/i);
  });

  it("keeps commercial and override permissions role-owned", () => {
    expect(rolePermissions("owner")).toEqual(expect.arrayContaining(["memberships.sell", "payments.collect", "payments.refund", "checkins.override"]));
    expect(rolePermissions("sales")).toEqual(expect.arrayContaining(["memberships.sell", "payments.collect"]));
    expect(rolePermissions("sales")).not.toContain("payments.refund");
    expect(rolePermissions("receptionist")).not.toContain("checkins.override");
  });

  it("prevents cross-tenant branch access and selected-branch escape", () => {
    expect(() => assertBranchAccess(actor(), { _id: branchB, organizationId, active: true } as never)).toThrow(/branch/i);
    expect(() => assertBranchAccess(actor(), { _id: branchA, organizationId: "other-org" as Id<"organizations">, active: true } as never)).toThrow(/branch/i);
  });

  it("requires reasons at the server boundary", () => {
    expect(() => requireReason("  ", "cor-reason-1")).toThrow();
    expect(() => requireReason("Manager approved", "cor-reason-2")).not.toThrow();
  });

  it("emits stable structured domain errors", () => {
    try {
      domainError("FORBIDDEN", "Not allowed.", { correlationId: "cor-error-1", details: { scope: "branch" } });
    } catch (error) {
      expect((error as { data?: unknown }).data).toMatchObject({ code: "FORBIDDEN", requestId: "cor-error-1", details: { scope: "branch" } });
    }
  });

  it("keeps platform administrators out of member-only operations", async () => {
    await expect(requireMember(memberContext({ user: { platformAdmin: true } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });

  it("keeps active gym team accounts out of member-only operations", async () => {
    await expect(
      requireMember(
        memberContext({
          memberships: [{ _id: "membership-1", userId: "user-1", active: true }],
        }),
      ),
    ).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });

  it("allows an authenticated member identity with no active gym membership", async () => {
    await expect(requireMember(memberContext({}))).resolves.toMatchObject({ user: expect.objectContaining({ authSubject: "clerk-user-1" }) });
  });

  it("fails closed for deactivated or unknown identities", async () => {
    await expect(requireMember(memberContext({ user: { status: "deactivated" } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
    await expect(requireMember(memberContext({ user: { status: "invited" } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
    await expect(requireMember(memberContext({ identity: { subject: "unknown-clerk-user" } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
    await expect(requireMember(memberContext({ user: null }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
  });

  it("requires an active platform-admin account for platform operations", async () => {
    await expect(requirePlatformAdmin(memberContext({ user: { platformAdmin: false } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    await expect(requirePlatformAdmin(memberContext({ user: { platformAdmin: true, status: "invited" } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
    await expect(requirePlatformAdmin(memberContext({ user: { platformAdmin: true, status: "deactivated" } }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
    await expect(requirePlatformAdmin(memberContext({ user: { platformAdmin: true } }))).resolves.toMatchObject({ user: expect.objectContaining({ platformAdmin: true }) });
  });
});
