import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { JevJudgeResult, JevStatusView } from "./jevRegistry";
import { resolveSupportClaimReading, resolveSupportUnansweredReading, type SupportReviewContext } from "./supportAssist";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const ORG_A = "sup-org-a";
const ORG_B = "sup-org-b";
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string | undefined, extra?: Extra) => ({ ...(organizationId ? { organizationId } : {}), correlationId: `cor-sup-${organizationId ?? "platform"}`, ...(extra ?? ({} as Extra)) });
const ask = (question: string, subject: Record<string, unknown>) => scoped(undefined, { questionKey: question, subject });
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-sup-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const offered = (result: JevJudgeResult): string[] => (result.status === "ready" && result.judgment.kind === "choice" ? Object.keys(result.judgment.probabilities) : []);
const choice = (result: JevJudgeResult): string | undefined => (result.status === "ready" && result.judgment.kind === "choice" ? result.judgment.choice : undefined);
const ready = (result: JevJudgeResult) => result as Extract<JevJudgeResult, { status: "ready" }>;

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const iso = new Date(now).toISOString();
    const orgA = await ctx.db.insert("organizations", { publicId: ORG_A, name: "Support Gym A", slug: "support-gym-a", status: "active", subscriptionPlan: "Growth", billingInterval: "monthly", currentPeriodEndsAt: now + 20 * 86_400_000, timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const orgB = await ctx.db.insert("organizations", { publicId: ORG_B, name: "Support Gym B", slug: "support-gym-b", status: "active", subscriptionPlan: "Starter", billingInterval: "monthly", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "sup-branch-a", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("branches", { organizationId: orgA, publicId: "sup-branch-a2", name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: orgB, publicId: "sup-branch-b", name: "Main", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, platformAdmin = false) => ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName: publicId, platformAdmin, status: "active", createdAt: now, updatedAt: now });
    const ownerA = await user("sup-owner-a");
    const receptionA = await user("sup-reception-a");
    const ownerB = await user("sup-owner-b");
    await user("sup-admin", true);
    await user("sup-admin-2", true);
    await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId: ownerA, role: "owner", branchIds: [branchA], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId: receptionA, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: orgB, userId: ownerB, role: "owner", branchIds: [branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const listing = (organizationId: typeof orgA, publicId: string, name: string) => ctx.db.insert("domainRecords", { organizationId, entityType: "marketplaceGym", publicId, createdAt: now, updatedAt: now, data: { id: publicId, targetOrganizationId: publicId, name, shortName: name.slice(0, 12), tagline: "Tagline", description: "Description", city: "Amman", areas: ["Abdoun"], category: "Gym", audience: "All members", memberCount: 10, branchCount: 1, fromPriceMinor: 45_000, amenities: [], accent: "#15140f", featured: false, subscriptionStatus: "active", rivetPlan: "Growth", joinedAt: iso.slice(0, 10), lastActiveAt: iso, monthlyRevenueMinor: 0, isPublic: true, profilePublished: true, profileVersion: 1, branches: [] } });
    await listing(orgA, ORG_A, "Support Gym A");
    await listing(orgB, ORG_B, "Support Gym B");
    await ctx.db.insert("domainRecords", { organizationId: orgA, entityType: "gymProfileDraft", publicId: "current", createdAt: now, updatedAt: now, data: { version: 2, status: "draft", shortName: "Gym A", taglineEn: "Draft tagline", descriptionEn: "Draft description", category: "Gym", audience: "All members", amenities: [], accentColor: "#15140f", galleryAssetIds: [], updatedAt: iso } });
    const invoice = (publicId: string, status: string, issuedAt: string, extra: Record<string, unknown> = {}) => ctx.db.insert("domainRecords", { organizationId: orgA, entityType: "platformInvoice", publicId, createdAt: now, updatedAt: now, data: { id: publicId, gymId: ORG_A, gym: "Support Gym A", amountMinor: 149_000, amount: "JOD 149.000", currency: "JOD", date: issuedAt, issuedAt, dueAt: issuedAt, periodStart: issuedAt, periodEnd: issuedAt, billingInterval: "monthly", status, createdAt: issuedAt, updatedAt: issuedAt, ...extra } });
    await invoice("INV-1000", "paid", "2026-07-31T00:00:00.000Z", { paidAt: "2026-08-02T00:00:00.000Z" });
    await invoice("INV-1001", "open", "2026-08-31T00:00:00.000Z");
  });
}

type CaseResult = { id: string; status: string; messages: Array<{ id: string; authorType: string; body: string }> };

async function harness() {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t);
  const ownerA = t.withIdentity({ subject: "clerk-sup-owner-a" });
  const receptionA = t.withIdentity({ subject: "clerk-sup-reception-a" });
  const ownerB = t.withIdentity({ subject: "clerk-sup-owner-b" });
  const admin = t.withIdentity({ subject: "clerk-sup-admin" });
  const admin2 = t.withIdentity({ subject: "clerk-sup-admin-2" });
  await ownerA.mutation(api.jev.updateTenantPreference, scoped(ORG_A, { enabled: true }));
  const created = await ownerA.mutation(api.domain.mutate, operation("support.create", {
    email: "owner@gym-a.example",
    subject: "Invoice INV-1001 charged twice",
    body: "Invoice INV-1001 was charged twice on 3 September. Please refund the duplicate. Can you also move our billing date to the 1st of each month?",
    priority: "normal",
  })) as CaseResult;
  await admin.mutation(api.domain.mutate, operation("platform.support.reply", { caseId: created.id, body: "Thanks for flagging this. We have marked INV-1001 as paid and moved you to the Pro plan." }));
  const other = await ownerB.mutation(api.domain.mutate, operation("support.create", { email: "owner@gym-b.example", subject: "Scanner offline", body: "The reception scanner does not work since yesterday. Please fix it.", priority: "urgent" })) as CaseResult;
  return { t, ownerA, receptionA, ownerB, admin, admin2, caseId: created.id, otherCaseId: other.id };
}

afterEach(() => vi.unstubAllEnvs());

describe("the support review context", () => {
  it("is read by platform administrators only, with the gym's recorded facts beside its passages", async () => {
    const { admin, ownerA, ownerB, caseId } = await harness();
    const context = await admin.query(api.domain.query, operation("platform.support.review", { caseId })) as SupportReviewContext;
    expect(context).toMatchObject({ caseId, gymId: ORG_A, gymName: "Support Gym A", status: "waiting", messageCount: 2 });
    expect(context.passages.map((passage) => [passage.authorType, passage.text])).toEqual([
      ["gym", "Invoice INV-1001 was charged twice on 3 September."],
      ["gym", "Please refund the duplicate."],
      ["gym", "Can you also move our billing date to the 1st of each month?"],
      ["platform", "Thanks for flagging this."],
      ["platform", "We have marked INV-1001 as paid and moved you to the Pro plan."],
    ]);
    expect(context.facts).toMatchObject({ plan: "Growth", billingInterval: "monthly", branchCount: 2, publicPage: { publishedVersion: 1, draftVersion: 2, draftAwaitingReview: true } });
    expect(context.facts.invoices.map((invoice) => [invoice.id, invoice.status])).toEqual([["INV-1001", "open"], ["INV-1000", "paid"]]);
    expect(context.categories.find((category) => category.id === "billing_schedule")?.destination.href).toBe(`/platform/billing?bill=${ORG_A}&case=${caseId}`);
    // Requesters see their case without any review projection, and no other tenant sees it at all.
    await expectCode(ownerA.query(api.domain.query, operation("platform.support.review", { caseId })), "FORBIDDEN");
    await expectCode(ownerB.query(api.domain.query, operation("platform.support.review", { caseId })), "FORBIDDEN");
    await expectCode(admin.query(api.domain.query, operation("platform.support.review", { caseId: "SUP-missing" })), "NOT_FOUND");
  });

  it("reads one gym's Jev status for the platform team without letting the console change it", async () => {
    const { admin, ownerA } = await harness();
    const status = await admin.query(api.jev.platformStatus, { organizationId: ORG_A, correlationId: "cor-status" }) as JevStatusView;
    expect(status.tenant.enabled).toBe(true);
    expect(status.canManage).toBe(false);
    expect(status.features.find((feature) => feature.key === "support")?.questions.map((question) => question.scope)).toEqual(["platform", "platform", "platform", "platform", "platform"]);
    await expectCode(ownerA.query(api.jev.platformStatus, { organizationId: ORG_A, correlationId: "cor-status" }), "FORBIDDEN");
    await expectCode(admin.query(api.jev.platformStatus, { organizationId: "missing", correlationId: "cor-status" }), "NOT_FOUND");
  });
});

describe("support questions on the server", () => {
  it("answers the platform team only, keeps categories apart, and routes to an existing invoice", async () => {
    const { admin, ownerA, ownerB, caseId } = await harness();
    const category = await admin.action(api.jevInference.judge, ask("support.category", { caseId })) as JevJudgeResult;
    expect(category).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "invoice_dispute" } });
    expect([...offered(category)].sort()).toEqual(["account_access", "billing_schedule", "feature_upgrade", "invoice_dispute", "other", "public_page", "technical_issue"]);
    // The requester and any other gym are refused before anything is loaded.
    await expectCode(ownerA.action(api.jevInference.judge, scoped(ORG_A, { questionKey: "support.category", subject: { caseId } })), "FORBIDDEN");
    await expectCode(ownerB.action(api.jevInference.judge, scoped(ORG_B, { questionKey: "support.category", subject: { caseId } })), "FORBIDDEN");
    await expectCode(admin.action(api.jevInference.judge, ask("support.category", { caseId: "SUP-missing" })), "NOT_FOUND");
    const invoice = await admin.action(api.jevInference.judge, ask("support.invoice_match", { caseId })) as JevJudgeResult;
    expect(choice(invoice)).toBe("INV-1001");
    expect([...offered(invoice)].sort()).toEqual(["INV-1000", "INV-1001", "none"]);
    const clarification = await admin.action(api.jevInference.judge, ask("support.clarification", { caseId, category: "invoice_dispute" })) as JevJudgeResult;
    expect(choice(clarification)).toBe("none");
    expect(offered(clarification)).toEqual(["invoice_reference", "none"]);
    // A second read of the same case is served from the cache under that gym.
    expect(await admin.action(api.jevInference.judge, ask("support.category", { caseId }))).toMatchObject({ status: "ready", source: "cache" });
  });

  it("flags the unanswered schedule request and the unsupported claims, then clears once a real answer lands", async () => {
    const { admin, caseId } = await harness();
    const context = await admin.query(api.domain.query, operation("platform.support.review", { caseId })) as SupportReviewContext;
    const unanswered = await admin.action(api.jevInference.judge, ask("support.unanswered", { caseId, summary: "" })) as JevJudgeResult;
    expect(unanswered.status).toBe("ready");
    const requests = resolveSupportUnansweredReading((unanswered as Extract<JevJudgeResult, { status: "ready" }>).judgment, context);
    expect(requests.findings.map((finding) => finding.passage.text)).toEqual(["Please refund the duplicate.", "Can you also move our billing date to the 1st of each month?"]);
    const claims = await admin.action(api.jevInference.judge, ask("support.claim_check", { caseId })) as JevJudgeResult;
    const claimReading = resolveSupportClaimReading((claims as Extract<JevJudgeResult, { status: "ready" }>).judgment, context);
    expect(claimReading.findings.map((finding) => [finding.passage.text, finding.evidence])).toEqual([
      ["We have marked INV-1001 as paid and moved you to the Pro plan.", "Ledger: invoice INV-1001 is recorded as open."],
    ]);
    // The closing summary being written counts as an answer.
    const withSummary = await admin.action(api.jevInference.judge, ask("support.unanswered", { caseId, summary: "Refunded the duplicate; billing date moved to the 1st from October." })) as JevJudgeResult;
    expect(choice(withSummary)).toBe("all_answered");
    // A real reply answers one request only; the other stays flagged, and the changed case misses the cache.
    await admin.mutation(api.domain.mutate, operation("platform.support.reply", { caseId, body: "We moved your billing date to the 1st of each month starting next term." }));
    const after = await admin.action(api.jevInference.judge, ask("support.unanswered", { caseId, summary: "" })) as JevJudgeResult;
    expect(after).toMatchObject({ status: "ready", source: "fixture" });
    const afterContext = await admin.query(api.domain.query, operation("platform.support.review", { caseId })) as SupportReviewContext;
    expect(resolveSupportUnansweredReading(ready(after).judgment, afterContext).findings.map((finding) => finding.passage.text)).toEqual(["Please refund the duplicate."]);
    const settled = await admin.action(api.jevInference.judge, ask("support.unanswered", { caseId, summary: "Duplicate refunded to the card on file." })) as JevJudgeResult;
    expect(choice(settled)).toBe("all_answered");
  });

  it("refuses closure checks on a resolved case, a gym with no invoices to match, and a gym that keeps Jev off", async () => {
    const { admin, ownerB, caseId, otherCaseId } = await harness();
    // Gym B never switched Jev on: the platform team cannot send its case anywhere.
    const blocked = await admin.action(api.jevInference.judge, ask("support.category", { caseId: otherCaseId })) as JevJudgeResult;
    expect(blocked).toMatchObject({ status: "blocked", reason: "tenant_off" });
    await ownerB.mutation(api.jev.updateTenantPreference, scoped(ORG_B, { enabled: true }));
    expect(choice(await admin.action(api.jevInference.judge, ask("support.category", { caseId: otherCaseId })) as JevJudgeResult)).toBe("technical_issue");
    await expectCode(admin.action(api.jevInference.judge, ask("support.invoice_match", { caseId: otherCaseId })), "VALIDATION_ERROR");
    await admin.mutation(api.domain.mutate, operation("platform.support.resolve", { caseId, resolutionSummary: "Refunded and rescheduled." }));
    await expectCode(admin.action(api.jevInference.judge, ask("support.unanswered", { caseId, summary: "" })), "VALIDATION_ERROR");
    await expectCode(admin.action(api.jevInference.judge, ask("support.claim_check", { caseId })), "VALIDATION_ERROR");
    await expectCode(admin.action(api.jevInference.judge, ask("support.clarification", { caseId })), "VALIDATION_ERROR");
  });

  it("treats a case edited while the model was answering as stale, and never lets a requester complete a platform request", async () => {
    const { t, admin, admin2, ownerA, caseId } = await harness();
    const requestId = await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === ORG_A)!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "sup-admin")!;
      return await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "lease", status: "pending", mode: "fixture", requestedByUserId: user._id, correlationId: "cor-stale", startedAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 });
    });
    const complete = { requestId, correlationId: "cor-stale", questionKey: "support.category", subject: { caseId }, stateHash: "0".repeat(64), source: "fixture" as const, judgment: { kind: "choice", choice: "invoice_dispute", probabilities: { invoice_dispute: 1 } }, modelId: "typesafe-ai/jev", latencyMs: 12, warnings: [] };
    await expectCode(ownerA.mutation(internal.jev.complete, { ...complete, organizationId: ORG_A }), "FORBIDDEN");
    await expectCode(admin2.mutation(internal.jev.complete, complete), "NOT_FOUND");
    const result = await admin.mutation(internal.jev.complete, complete) as JevJudgeResult;
    expect(result).toMatchObject({ status: "stale" });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(requestId))?.status).toBe("stale");
      expect(await ctx.db.query("jevJudgments").collect()).toEqual([]);
    });
  });
});
