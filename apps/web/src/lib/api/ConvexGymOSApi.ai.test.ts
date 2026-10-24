import { describe, expect, it } from "vitest";
import { ConvexGymOSApi, type ConvexTransport } from "./ConvexGymOSApi";
import type { Session } from "@/lib/domain/types";

const session: Session = {
  user: { id: "10000000-0000-4a00-8a00-000000000010", name: "Omar Al-Khatib", email: "omar@example.com" },
  organization: { id: "10000000-0000-4a00-8a00-000000000001", name: "Forge Fitness", currency: "JOD", timezone: "Asia/Amman", locale: "en-JO" },
  branches: [{ id: "10000000-0000-4a00-8a00-000000000002", name: "Forge — Abdoun", code: "ABD" }],
  activeBranchId: "10000000-0000-4a00-8a00-000000000002",
  roles: ["owner"],
  permissions: ["members.read"],
};

function recordingTransport(calls: Array<{ kind: string; args: Record<string, unknown> }>): ConvexTransport {
  return {
    query: async (_reference, args) => { calls.push({ kind: "query", args: args as unknown as Record<string, unknown> }); return (args as { operation?: string }).operation === "session" ? session : {}; },
    mutation: async (_reference, args) => { calls.push({ kind: "mutation", args: args as unknown as Record<string, unknown> }); return {}; },
    action: async (_reference, args) => { calls.push({ kind: "action", args: args as unknown as Record<string, unknown> }); return { ok: false, reason: "ai_off" }; },
  };
}

describe("ConvexGymOSApi assistance contract", () => {
  it("uses the domain transport for reads and writes with the selected gym and branch", async () => {
    const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
    const api = new ConvexGymOSApi(recordingTransport(calls));
    await api.getSession();
    await api.getMemberBrief("member-1");
    await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0001" });
    await api.updateStandingInstruction({ standingId: "standing-1", action: "revoke", reason: "No longer needed" });
    await api.recordMemberMemory({ memberId: "member-1", topic: "travel", effectiveUntil: "2026-10-26" });
    expect(calls.slice(1).map((call) => [call.kind, call.args.operation])).toEqual([
      ["query", "ai.member.brief"],
      ["mutation", "ai.run.start"],
      ["mutation", "ai.standing.revoke"],
      ["mutation", "ai.memory.record"],
    ]);
    expect(calls[1]!.args).toMatchObject({ organizationId: session.organization.id, activeBranchId: session.activeBranchId, input: { memberId: "member-1" } });
    expect(calls[3]!.args.input).toEqual({ standingId: "standing-1", reason: "No longer needed", branchId: session.activeBranchId });
    expect(calls[4]!.args.input).toMatchObject({ subjectId: "member-1", topic: "travel", effectiveUntil: "2026-10-26" });
  });

  it("sends model-backed preparation through the server action, never from the browser", async () => {
    const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
    const api = new ConvexGymOSApi(recordingTransport(calls));
    await api.getSession();
    await expect(api.extractContactNote({ memberId: "member-1", note: "call tomorrow evening" })).resolves.toEqual({ ok: false, reason: "ai_off" });
    expect(calls[1]).toMatchObject({ kind: "action", args: { operation: "extract_note", input: { memberId: "member-1", note: "call tomorrow evening" }, organizationId: session.organization.id, activeBranchId: session.activeBranchId } });
  });
});
