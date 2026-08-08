import { describe, expect, it, vi } from "vitest";
import { ConvexGymOSApi, type ConvexTransport, dataMode } from "./ConvexGymOSApi";
import { ApiError, ERR } from "./errors";
import type { Session } from "@/lib/domain/types";

const session: Session = {
  user: { id: "10000000-0000-4a00-8a00-000000000010", name: "Omar Al-Khatib", email: "omar@example.com" },
  organization: { id: "10000000-0000-4a00-8a00-000000000001", name: "Forge Fitness", currency: "JOD", timezone: "Asia/Amman", locale: "en-JO" },
  branches: [{ id: "10000000-0000-4a00-8a00-000000000002", name: "Forge — Abdoun", code: "ABD" }],
  activeBranchId: "10000000-0000-4a00-8a00-000000000002",
  roles: ["owner"],
  permissions: ["members.read", "payments.collect"],
};

function transportFor(responses: { query?: unknown; mutation?: unknown; action?: unknown } = {}, onCall?: (kind: string, args: Record<string, unknown>) => void): ConvexTransport {
  return {
    query: async (_reference, args) => {
      onCall?.("query", args as unknown as Record<string, unknown>);
      if (responses.query instanceof Error) throw responses.query;
      return responses.query;
    },
    mutation: async (_reference, args) => {
      onCall?.("mutation", args as unknown as Record<string, unknown>);
      if (responses.mutation instanceof Error) throw responses.mutation;
      return responses.mutation;
    },
    action: async (_reference, args) => {
      onCall?.("action", args as unknown as Record<string, unknown>);
      if (responses.action instanceof Error) throw responses.action;
      return responses.action;
    },
  };
}

describe("ConvexGymOSApi contract boundary", () => {
  it("maps session calls and carries the selected tenant and branch", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi(transportFor({ query: session }, (_kind, args) => calls.push(args)));

    await expect(api.getSession()).resolves.toEqual(session);
    await api.listMembers({ page: 1, pageSize: 20 });

    expect(calls[0]).toMatchObject({ operation: "session", correlationId: expect.any(String) });
    expect(calls[1]).toMatchObject({ operation: "members.list", organizationId: session.organization.id, activeBranchId: session.activeBranchId });
  });

  it("keeps idempotency keys inside the payment mutation boundary", async () => {
    let mutationArgs: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: {} }, (_kind, args) => { mutationArgs = args; }));

    await api.createPayment({ memberId: session.user.id, amount: { amount: 12_500, currency: "JOD" }, method: "card" }, "payment-key-1");

    expect(mutationArgs).toMatchObject({ operation: "payments.create", input: { idempotencyKey: "payment-key-1" } });
  });

  it("keeps platform application review behind the platform query/action boundary", async () => {
    const application = {
      id: "20000000-0000-4a00-8a00-000000000001",
      gymName: "Northline Strength",
      ownerName: "Karim Haddad",
      email: "karim@northline.example",
      contactNumber: "+962 79 555 0144",
      plan: "Growth" as const,
      status: "approved" as const,
      notificationStatus: "sent" as const,
      reviewNotificationStatus: "sent" as const,
      submittedAt: "2026-08-06T08:42:00.000Z",
      updatedAt: "2026-08-06T09:00:00.000Z",
    };
    const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
    const api = new ConvexGymOSApi(transportFor({ query: [], action: application }, (kind, args) => calls.push({ kind, args })));

    await expect(api.listGymApplications({ status: "pending" })).resolves.toEqual([]);
    await expect(api.reviewGymApplication({ applicationId: application.id, decision: "approved", note: "Verified." })).resolves.toEqual(application);
    expect(calls[0]).toMatchObject({ kind: "query", args: { operation: "platform.applications", input: { status: "pending" } } });
    expect(calls[1]).toMatchObject({ kind: "action", args: { applicationId: application.id, decision: "approved", note: "Verified.", correlationId: expect.any(String) } });
  });

  it("keeps gym provisioning behind the protected action boundary", async () => {
    const result = {
      applicationId: "20000000-0000-4a00-8a00-000000000001",
      status: "completed" as const,
      organizationId: "30000000-0000-4a00-8a00-000000000001",
      organizationName: "Northline Strength",
      branchId: "40000000-0000-4a00-8a00-000000000001",
      branchName: "Northline Strength — Main branch",
      plan: "Growth" as const,
      ownerName: "Karim Haddad",
      ownerEmail: "karim@northline.example",
      clerkOrganizationId: "org_clerk_1",
      clerkInvitationId: "inv_clerk_1",
    };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ action: result }, (_kind, args) => { call = args; }));

    await expect(api.provisionGym({ applicationId: result.applicationId })).resolves.toEqual(result);
    expect(call).toMatchObject({ applicationId: result.applicationId, correlationId: expect.any(String) });
  });

  it("converts structured Convex errors into stable ApiErrors", async () => {
    const error = Object.assign(new Error("wrapped failure"), { data: { code: ERR.FORBIDDEN, message: "Branch access denied.", requestId: "cor-test-1" } });
    const api = new ConvexGymOSApi(transportFor({ query: error }));

    await expect(api.getSession()).rejects.toSatisfy((value: unknown) => value instanceof ApiError && value.code === ERR.FORBIDDEN && value.requestId === "cor-test-1");
  });

  it("selects mock or Convex only through explicit mode configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "convex");
    expect(dataMode()).toBe("convex");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    expect(dataMode()).toBe("mock");
    vi.unstubAllEnvs();
  });

  it("honors an explicit mock mode in a production-mode Preview build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");

    expect(dataMode()).toBe("mock");

    vi.unstubAllEnvs();
  });
});
