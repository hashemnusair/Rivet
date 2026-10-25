// @vitest-environment node
import { describe, expect, it } from "vitest";
import { accessScope, modelCacheKey, type ModelCacheKeyParts } from "./model-cache";

const base: ModelCacheKeyParts = { organizationId: "org-a", task: "extract_contact_note", promptVersion: "note.v1", protocol: "anthropic_messages", model: "claude-sonnet-5-5", subjectType: "member", subjectId: "m-1", subjectVersion: 10, scope: "sales|selected|b1|members.write", locale: "en", input: "no answer call tomorrow" };

describe("model-output cache keys", () => {
  it("changes with every part the answer depends on or must not leak across", async () => {
    const key = await modelCacheKey(base);
    expect(await modelCacheKey({ ...base })).toBe(key);
    const variants: Array<Partial<ModelCacheKeyParts>> = [
      { organizationId: "org-b" }, { promptVersion: "note.v2" }, { protocol: "openai_chat_json" }, { model: "claude-opus-5-5" },
      { subjectType: "lead" }, { subjectId: "m-2" }, { subjectVersion: 11 }, { scope: "owner|all||" }, { locale: "ar" }, { input: "no answer call on monday" },
    ];
    const keys = await Promise.all(variants.map((change) => modelCacheKey({ ...base, ...change })));
    expect(new Set([key, ...keys]).size).toBe(variants.length + 1);
  });

  it("cannot be made equal by moving text between parts", async () => {
    expect(await modelCacheKey({ ...base, subjectId: "m-1|x", input: "y" })).not.toBe(await modelCacheKey({ ...base, subjectId: "m-1", input: "x|y" }));
  });

  it("describes the same access the same way, whatever order it was listed in", () => {
    expect(accessScope({ role: "sales", branchScope: "selected", branchIds: ["b2", "b1"], permissions: ["crm.write", "members.write"] }))
      .toBe(accessScope({ role: "sales", branchScope: "selected", branchIds: ["b1", "b2"], permissions: ["members.write", "crm.write"] }));
    expect(accessScope({ role: "sales", branchScope: "selected", branchIds: ["b1"], permissions: ["members.write"] }))
      .not.toBe(accessScope({ role: "sales", branchScope: "all", branchIds: ["b1"], permissions: ["members.write"] }));
  });
});
