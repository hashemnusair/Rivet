import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import { PERMISSION_CATALOG_VERSION } from "./permissions";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string, extra?: Extra) => ({ organizationId, correlationId: `cor-nav-${organizationId}`, ...(extra ?? ({} as Extra)) });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const ask = (question: string, subject: Record<string, unknown>) => scoped("org-a", { questionKey: question, subject });

async function seed(t: TestConvex<typeof schema>, plan: "Starter" | "Pro") {
  await t.run(async (ctx) => {
    const now = Date.now();
    const orgA = await ctx.db.insert("organizations", { publicId: "org-a", name: "Gym A", slug: "gym-a", status: "active", subscriptionPlan: plan, timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, subject: string) => await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const ownerA = await user("owner-a", "clerk-owner-a");
    const receptionA = await user("reception-a", "clerk-reception-a");
    await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId: ownerA, role: "owner", branchIds: [branchA], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId: receptionA, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
}

async function harness(plan: "Starter" | "Pro" = "Pro") {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t, plan);
  const owner = t.withIdentity({ subject: "clerk-owner-a" });
  const reception = t.withIdentity({ subject: "clerk-reception-a" });
  await owner.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
  return { t, owner, reception };
}

function offered(result: JevJudgeResult): string[] {
  return result.status === "ready" && result.judgment.kind === "choice" ? Object.keys(result.judgment.probabilities) : [];
}

afterEach(() => vi.unstubAllEnvs());

describe("intent-aware navigation on the server", () => {
  it("offers each actor only what they may open, so the same request resolves differently by role", async () => {
    const { owner, reception } = await harness();
    const asOwner = await owner.action(api.jevInference.judge, ask("navigation.intent", { query: "Where do I change who can refund?", path: "/dashboard" })) as JevJudgeResult;
    expect(asOwner).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "settings.roles" } });
    expect(offered(asOwner)).toEqual(expect.arrayContaining(["settings.roles", "page.audit", "clarify.payment", "no_match"]));
    const asReception = await reception.action(api.jevInference.judge, ask("navigation.intent", { query: "Where do I change who can refund?", path: "/reception" })) as JevJudgeResult;
    expect(asReception.status).toBe("ready");
    expect(offered(asReception)).not.toContain("settings.roles");
    expect(offered(asReception)).not.toContain("page.audit");
    expect(offered(asReception)).not.toContain("clarify.payment");
    if (asReception.status === "ready" && asReception.judgment.kind === "choice") expect(asReception.judgment.choice).not.toBe("settings.roles");
  });

  it("drops destinations behind a workspace module the gym does not have, and offers them again when the plan changes", async () => {
    const { t, owner } = await harness("Starter");
    const starter = await owner.action(api.jevInference.judge, ask("navigation.intent", { query: "retail sale at the desk" })) as JevJudgeResult;
    expect(offered(starter)).not.toContain("page.checkout");
    expect(offered(starter)).not.toContain("form.supplier.payment");
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      await ctx.db.patch(organization._id, { subscriptionPlan: "Pro" });
    });
    const pro = await owner.action(api.jevInference.judge, ask("navigation.intent", { query: "retail sale at the desk" })) as JevJudgeResult;
    expect(pro).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "page.checkout" } });
  });

  it("follows a permission change immediately instead of serving the old answer from cache", async () => {
    const { t, reception } = await harness();
    const before = await reception.action(api.jevInference.judge, ask("navigation.intent", { query: "who can refund" })) as JevJudgeResult;
    expect(offered(before)).not.toContain("settings.roles");
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      await ctx.db.insert("roleDefinitions", { organizationId: organization._id, role: "receptionist", label: "Reception", description: "Desk with staff rights", isSystem: false, permissions: ["members.read", "payments.collect", "users.manage"], discountLimitMinor: 0, catalogVersion: PERMISSION_CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now() });
    });
    const after = await reception.action(api.jevInference.judge, ask("navigation.intent", { query: "who can refund" })) as JevJudgeResult;
    expect(after).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "settings.roles" } });
    // Cached answers are keyed by the offered candidates, so a narrowed role never sees the wider answer.
    const again = await reception.action(api.jevInference.judge, ask("navigation.intent", { query: "who can refund" })) as JevJudgeResult;
    expect(again).toMatchObject({ status: "ready", source: "cache" });
  });

  it("answers an unknown request with no-match, refuses an empty one, and never sends a permission list", async () => {
    const { owner } = await harness();
    expect(await owner.action(api.jevInference.judge, ask("navigation.intent", { query: "what is the capital of france" }))).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "no_match" } });
    await expectCode(owner.action(api.jevInference.judge, ask("navigation.intent", { query: " " })), "VALIDATION_ERROR");
    expect(await owner.action(api.jevInference.judge, ask("navigation.intent", { query: "Record a payment" }))).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "clarify.payment" } });
  });

  it("finds a report only for people who may read reports, and picks the next setup step from the actor's own checklist", async () => {
    const { owner, reception } = await harness();
    await expectCode(reception.action(api.jevInference.judge, ask("navigation.report_view", { question: "how busy are mornings?" })), "FORBIDDEN");
    const report = await owner.action(api.jevInference.judge, ask("navigation.report_view", { question: "how busy are mornings?" })) as JevJudgeResult;
    expect(report).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "report.peak_hours" } });
    expect(offered(report).every((id) => id.startsWith("report.") || id === "no_match")).toBe(true);
    const ownerStep = await owner.action(api.jevInference.judge, ask("navigation.next_step", { audience: "owner" })) as JevJudgeResult;
    expect(ownerStep.status).toBe("ready");
    if (ownerStep.status === "ready" && ownerStep.judgment.kind === "choice") expect(ownerStep.judgment.choice).toMatch(/^owner_/);
    await expectCode(reception.action(api.jevInference.judge, ask("navigation.next_step", { audience: "owner" })), "FORBIDDEN");
    const staffStep = await reception.action(api.jevInference.judge, ask("navigation.next_step", { audience: "staff" })) as JevJudgeResult;
    expect(staffStep).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "staff_role" } });
  });
});
