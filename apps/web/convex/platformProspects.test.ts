import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import type { PlatformProspect, PlatformProspectHistoryEntry, PlatformProspectsView } from "../src/lib/platform/prospects";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");
const request = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: `cor-prospects-${operation}` });

async function expectCode(requestPromise: Promise<unknown>, code: string, fieldErrors?: Record<string, string[]>) {
  await expect(requestPromise).rejects.toMatchObject({ data: expect.objectContaining({ code, ...(fieldErrors ? { fieldErrors } : {}) }) });
}

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const users = [
      { publicId: "user-hashem", authSubject: "clerk-hashem", email: "hashem@rivet.example", fullName: "Hashem Nusair", platformAdmin: true },
      { publicId: "user-elias", authSubject: "clerk-elias", email: "elias@rivet.example", fullName: "Elias Hreish", platformAdmin: true },
      { publicId: "user-owner", authSubject: "clerk-gym-owner", email: "owner@gym.example", fullName: "Gym Owner", platformAdmin: false },
    ];
    for (const user of users) await ctx.db.insert("users", { ...user, status: "active", createdAt: now, updatedAt: now });
  });
  return { hashem: t.withIdentity({ subject: "clerk-hashem" }), elias: t.withIdentity({ subject: "clerk-elias" }), owner: t.withIdentity({ subject: "clerk-gym-owner" }) };
}

describe("platform prospects", () => {
  it("is closed to anyone who is not a platform administrator", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await seed(t);
    await expectCode(owner.query(api.domain.query, request("platform.prospects.list")), "FORBIDDEN");
    await expectCode(owner.query(api.domain.query, request("platform.prospect.history", { prospectId: "unknown" })), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, request("platform.prospects.import_amman")), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, request("platform.prospect.create", { fields: { gymName: "Test" } })), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: "unknown", changes: { stage: "contacted" } })), "FORBIDDEN");
  });

  it("loads the Amman pilot list once and never overwrites what people changed", async () => {
    const t = convexTest(schema, modules);
    const { hashem } = await seed(t);
    expect(await hashem.mutation(api.domain.mutate, request("platform.prospects.import_amman"))).toEqual({ added: 12, skipped: 0 });

    const view = await hashem.query(api.domain.query, request("platform.prospects.list")) as PlatformProspectsView;
    expect(view.prospects.map((prospect) => prospect.code)).toEqual(Array.from({ length: 12 }, (_, index) => `AMM-${String(index + 1).padStart(3, "0")}`));
    expect(view.owners.map((owner) => owner.name)).toEqual(["Elias Hreish", "Hashem Nusair"]);
    const bodyLife = view.prospects.find((prospect) => prospect.code === "AMM-003")!;
    expect(bodyLife).toMatchObject({ gymName: "Body Life Gym and Boxing", batch: "selected", stage: "not_contacted", phone: "+962 78 542 4553", whatsapp: "+962 78 177 3917", evidence: "official", draftStatus: "needs_review" });
    expect(bodyLife.openingMessage).toContain("Body Life");

    await hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: bodyLife.id, changes: { stage: "contacted" } }));
    expect(await hashem.mutation(api.domain.mutate, request("platform.prospects.import_amman"))).toEqual({ added: 0, skipped: 12 });
    const after = await hashem.query(api.domain.query, request("platform.prospects.list")) as PlatformProspectsView;
    expect(after.prospects).toHaveLength(12);
    expect(after.prospects.find((prospect) => prospect.code === "AMM-003")!.stage).toBe("contacted");
  });

  it("records who changed what, with owners by name", async () => {
    const t = convexTest(schema, modules);
    const { hashem, elias } = await seed(t);
    await hashem.mutation(api.domain.mutate, request("platform.prospects.import_amman"));
    const view = await hashem.query(api.domain.query, request("platform.prospects.list")) as PlatformProspectsView;
    const onyx = view.prospects.find((prospect) => prospect.code === "AMM-001")!;
    const eliasOwner = view.owners.find((owner) => owner.name === "Elias Hreish")!;

    const moved = await elias.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: onyx.id, changes: { stage: "contacted", ownerId: eliasOwner.id, followUpOn: "2026-10-20", nextAction: "  Call the manager  " } })) as PlatformProspect;
    expect(moved).toMatchObject({ stage: "contacted", owner: { name: "Elias Hreish" }, followUpOn: "2026-10-20", nextAction: "Call the manager", updatedBy: "Elias Hreish" });

    // Saving the same values again changes nothing and adds no history.
    await elias.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: onyx.id, changes: { stage: "contacted" } }));
    await hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: onyx.id, changes: { stage: "replied" } }));

    const history = await hashem.query(api.domain.query, request("platform.prospect.history", { prospectId: onyx.id })) as PlatformProspectHistoryEntry[];
    expect(history.map((entry) => [entry.action, entry.actorName])).toEqual([["updated", "Hashem Nusair"], ["updated", "Elias Hreish"], ["imported", "Hashem Nusair"]]);
    expect(history[0]!.changes).toEqual([{ field: "stage", from: "contacted", to: "replied" }]);
    expect(history[1]!.changes).toEqual(expect.arrayContaining([
      { field: "stage", from: "not_contacted", to: "contacted" },
      { field: "ownerId", to: "Elias Hreish" },
      { field: "followUpOn", to: "2026-10-20" },
    ]));

    const audit = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).map((event) => event.summary));
    expect(audit).toContain("Moved Onyx Gym (AMM-001) to Replied");
  });

  it("adds a gym by hand with the next reference and refuses duplicates and bad details", async () => {
    const t = convexTest(schema, modules);
    const { hashem } = await seed(t);
    await hashem.mutation(api.domain.mutate, request("platform.prospects.import_amman"));

    const created = await hashem.mutation(api.domain.mutate, request("platform.prospect.create", { fields: { gymName: "Iron Yard", area: "Abdoun", whatsapp: "0791234567", batch: "reserve" } })) as PlatformProspect;
    expect(created).toMatchObject({ code: "AMM-013", gymName: "Iron Yard", batch: "reserve", stage: "not_contacted", draftStatus: "needs_review" });
    const history = await hashem.query(api.domain.query, request("platform.prospect.history", { prospectId: created.id })) as PlatformProspectHistoryEntry[];
    expect(history.map((entry) => entry.action)).toEqual(["created"]);

    await expectCode(hashem.mutation(api.domain.mutate, request("platform.prospect.create", { fields: { gymName: "onyx  GYM" } })), "VALIDATION_ERROR", { gymName: ["duplicate"] });
    await expectCode(hashem.mutation(api.domain.mutate, request("platform.prospect.create", { fields: { gymName: " " } })), "VALIDATION_ERROR", { gymName: ["required"] });
    await expectCode(hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: created.id, changes: { stage: "signed", followUpOn: "2026-02-30", instagram: "not a link", sources: ["ftp://x"] } })), "VALIDATION_ERROR", { stage: ["invalidChoice"], followUpOn: ["invalidDate"], instagram: ["invalidUrl"], sources: ["invalidUrl"] });
    await expectCode(hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: created.id, changes: { ownerId: "user-owner" } })), "VALIDATION_ERROR", { ownerId: ["unknownOwner"] });
    await expectCode(hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: "missing", changes: { stage: "contacted" } })), "NOT_FOUND");

    const cleared = await hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: created.id, changes: { ownerId: "user-hashem" } })) as PlatformProspect;
    expect(cleared.owner).toEqual({ id: "user-hashem", name: "Hashem Nusair" });
    const unassigned = await hashem.mutation(api.domain.mutate, request("platform.prospect.update", { prospectId: created.id, changes: { ownerId: "" } })) as PlatformProspect;
    expect(unassigned.owner).toBeUndefined();
  });
});
