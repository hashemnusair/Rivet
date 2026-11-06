import { beforeEach, describe, expect, it } from "vitest";
import { ERR, isApiError } from "@/lib/api/errors";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { UpdateMemberInput, UpdatePlanInput } from "./types";
import { MEMBER_UPDATE_FIELDS, PLAN_UPDATE_FIELDS, pickFields } from "./update-fields";

// The lists are the edit contracts: every listed field is part of the input
// type, and every input field is listed (the referrer deliberately is not).
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const memberFieldsMatch: Exactly<(typeof MEMBER_UPDATE_FIELDS)[number], Exclude<keyof UpdateMemberInput, "referredByMemberId">> = true;
const planFieldsMatch: Exactly<(typeof PLAN_UPDATE_FIELDS)[number], keyof UpdatePlanInput> = true;

describe("edit allowlists", () => {
  it("match the edit input types", () => {
    expect([memberFieldsMatch, planFieldsMatch]).toEqual([true, true]);
  });

  it("keep only listed fields that are present", () => {
    expect(pickFields({ name: "Monthly", status: "archived", activeSubscribers: 9, organizationId: "x" }, PLAN_UPDATE_FIELDS)).toEqual({ name: "Monthly", status: "archived" });
    expect(pickFields({ city: undefined }, MEMBER_UPDATE_FIELDS)).toEqual({ city: undefined });
    expect(pickFields({}, MEMBER_UPDATE_FIELDS)).toEqual({});
  });
});

describe("the preview adapter applies the same edit contract", () => {
  let api: MockGymOSApi;
  beforeEach(async () => {
    api = new MockGymOSApi();
    api.setBehavior({ latencyMs: 0 });
    await api.switchDemoRole("owner");
  });

  const rejects = async (request: Promise<unknown>) => {
    const error = await request.then(() => undefined, (caught: unknown) => caught);
    expect(isApiError(error) && error.code === ERR.VALIDATION).toBe(true);
  };

  it("ignores a member's status and number and refuses values a member cannot hold", async () => {
    const session = await api.getSession();
    const { member } = await api.createMember({ fullName: "Allowlist Test", phone: "+962 79 900 0177", homeBranchId: session.branches[0]!.id, preferredLanguage: "en", gender: "female" });
    const updated = await api.updateMember(member.id, { city: "Amman", status: "archived", memberNumber: "X-1" } as UpdateMemberInput);
    expect(updated).toMatchObject({ city: "Amman", status: member.status, memberNumber: member.memberNumber });
    for (const input of [{ gender: "other" }, { preferredLanguage: "fr" }, { dateOfBirth: "12/03/1994" }, { tags: "vip" }]) {
      await rejects(api.updateMember(member.id, input as unknown as UpdateMemberInput));
    }
  });

  it("ignores a plan's subscriber count and refuses values a plan cannot hold", async () => {
    const [plan] = (await api.listPlans({ pageSize: 5 })).items;
    const updated = await api.updatePlan(plan!.id, { code: " mon2 ", activeSubscribers: 999 } as UpdatePlanInput);
    expect(updated).toMatchObject({ code: "MON2", activeSubscribers: plan!.activeSubscribers });
    for (const input of [{ status: "deleted" }, { kind: "class" }, { branchAccess: "some" }, { basePrice: { amount: -1, currency: "JOD" } }]) {
      await rejects(api.updatePlan(plan!.id, input as unknown as UpdatePlanInput));
    }
  });
});
