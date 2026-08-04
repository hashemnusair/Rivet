import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { assertBranchAccess, domainError, requirePermission, requireReason, type ActorContext } from "./security";

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

describe("Convex security kernel", () => {
  it("rejects a missing server permission", () => {
    expect(() => requirePermission(actor(), "payments.refund")).toThrow(/refund permission/i);
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
});
