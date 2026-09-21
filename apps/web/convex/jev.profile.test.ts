import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import { resolveLanguageGapReading, resolveProfileClaimReading, type GymProfileReviewContext } from "./profileAssist";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const ORG = "prof-org";
const OTHER = "prof-org-b";
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string, extra?: Extra) => ({ organizationId, correlationId: `cor-prof-${organizationId}`, ...(extra ?? ({} as Extra)) });
const ask = (organizationId: string, question: string, subject: Record<string, unknown> = {}) => scoped(organizationId, { questionKey: question, subject });
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-prof-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const choice = (result: JevJudgeResult): string | undefined => (result.status === "ready" && result.judgment.kind === "choice" ? result.judgment.choice : undefined);
const ready = (result: JevJudgeResult) => result as Extract<JevJudgeResult, { status: "ready" }>;

const DRAFT = {
  shortName: "Profile Gym",
  taglineEn: "Strength and conditioning across six branches.",
  taglineAr: "قوة ولياقة في فرعين",
  descriptionEn: "Women only after 6pm. Freeze your membership any time you travel. Free parking at every branch.",
  descriptionAr: "للسيدات فقط بعد الساعة 6. جمّد اشتراكك في أي وقت تسافر فيه.",
  category: "Strength & conditioning",
  audience: "All members",
  amenities: ["Free weights", "Cardio"],
  accentColor: "#15140f",
  galleryAssetIds: [] as string[],
};

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const iso = new Date(now).toISOString();
    const organization = await ctx.db.insert("organizations", { publicId: ORG, name: "Profile Gym", slug: "profile-gym", status: "active", subscriptionPlan: "Growth", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const other = await ctx.db.insert("organizations", { publicId: OTHER, name: "Other Gym", slug: "other-gym", status: "active", subscriptionPlan: "Growth", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "prof-branch", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("branches", { organizationId: organization, publicId: "prof-branch-2", name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("branches", { organizationId: organization, publicId: "prof-branch-old", name: "Closed", code: "OLD", active: false, status: "inactive", createdAt: now, updatedAt: now });
    const otherBranch = await ctx.db.insert("branches", { organizationId: other, publicId: "prof-branch-b", name: "Main", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string) => ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const owner = await user("prof-owner");
    const reception = await user("prof-reception");
    const otherOwner = await user("prof-owner-b");
    const trainerUser = await user("prof-trainer");
    const draftTrainerUser = await user("prof-trainer-draft");
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: trainerUser, role: "trainer", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: draftTrainerUser, role: "trainer", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: other, userId: otherOwner, role: "owner", branchIds: [otherBranch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const listing = (organizationId: typeof organization, publicId: string, name: string) => ctx.db.insert("domainRecords", { organizationId, entityType: "marketplaceGym", publicId, createdAt: now, updatedAt: now, data: { id: publicId, targetOrganizationId: publicId, name, shortName: name.slice(0, 12), tagline: "Published tagline", description: "Published description", city: "Amman", areas: ["Abdoun"], category: "Gym", audience: "All members", memberCount: 10, branchCount: 1, fromPriceMinor: 45_000, amenities: [], accent: "#15140f", featured: false, subscriptionStatus: "active", rivetPlan: "Growth", joinedAt: iso.slice(0, 10), lastActiveAt: iso, monthlyRevenueMinor: 0, isPublic: true, profilePublished: true, profileVersion: 1, branches: [] } });
    await listing(organization, ORG, "Profile Gym");
    await listing(other, OTHER, "Other Gym");
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "plan", publicId: "prof-plan", createdAt: now, updatedAt: now, data: { id: "prof-plan", name: "Basic Monthly", code: "BM", kind: "time", durationDays: 30, basePrice: { amount: 45_000, currency: "JOD" }, branchAccess: "selected", branchIds: ["prof-branch"], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "plan", publicId: "prof-plan-old", createdAt: now, updatedAt: now, data: { id: "prof-plan-old", name: "Legacy Flex", code: "LF", kind: "time", durationDays: 30, basePrice: { amount: 60_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 30, includedPtSessions: 0, status: "archived" } });
    await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "prof-trainer-profile", userId: trainerUser, displayName: "Coach Lina", specialties: ["Strength"], languages: ["ar", "en"], branchIds: [branch], status: "published", createdAt: now, updatedAt: now });
    await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "prof-trainer-draft", userId: draftTrainerUser, displayName: "Coach Draft", specialties: [], languages: [], branchIds: [branch], status: "draft", createdAt: now, updatedAt: now });
    await ctx.db.insert("ptPackages", { organizationId: organization, publicId: "prof-pkg", name: "12 PT sessions", sessionCount: 12, totalPriceMinor: 240_000, currency: "JOD", validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("classSessions", { organizationId: organization, publicId: "prof-class", branchId: branch, name: "Morning HIIT", dayOfWeek: 0, startMinute: 7 * 60, durationMinutes: 60, capacity: 12, audience: "mixed", status: "scheduled", roster: [], createdAt: now, updatedAt: now });
  });
}

async function harness() {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t);
  const owner = t.withIdentity({ subject: "clerk-prof-owner" });
  const reception = t.withIdentity({ subject: "clerk-prof-reception" });
  const otherOwner = t.withIdentity({ subject: "clerk-prof-owner-b" });
  await owner.mutation(api.jev.updateTenantPreference, scoped(ORG, { enabled: true }));
  await otherOwner.mutation(api.jev.updateTenantPreference, scoped(OTHER, { enabled: true }));
  await owner.mutation(api.domain.mutate, operation("profiles.gym.save", DRAFT));
  return { t, owner, reception, otherOwner };
}

afterEach(() => vi.unstubAllEnvs());

describe("the public page review context", () => {
  it("cuts the saved draft into passages beside the recorded services, for profile managers only", async () => {
    const { owner, reception, otherOwner } = await harness();
    const context = await owner.query(api.domain.query, operation("profiles.gym.review")) as GymProfileReviewContext;
    expect(context).toMatchObject({ organizationId: ORG, status: "draft", hasArabic: true });
    expect(context.passages.map((passage) => passage.id)).toEqual(["en:taglineEn:0", "en:descriptionEn:0", "en:descriptionEn:1", "en:descriptionEn:2", "ar:taglineAr:0", "ar:descriptionAr:0", "ar:descriptionAr:1"]);
    // Inactive branches, archived plans and draft trainer profiles are not services the public page can rely on.
    expect(context.services).toMatchObject({
      branches: { count: 2, names: ["Abdoun", "Sweifieh"] },
      trainers: { publishedCount: 1, names: ["Coach Lina"], languages: ["ar", "en"] },
      ptPackages: { count: 1, names: ["12 PT sessions"] },
      plans: { count: 1, names: ["Basic Monthly"], freezeAvailable: false, multiBranchAccess: false, includedTraining: false },
      classes: { count: 1, names: ["Morning HIIT"] },
      amenities: ["Free weights", "Cardio"],
      audience: "All members",
    });
    await expectCode(reception.query(api.domain.query, operation("profiles.gym.review")), "FORBIDDEN");
    // Another gym reads its own published listing text, never this draft.
    const foreign = await otherOwner.query(api.domain.query, operation("profiles.gym.review")) as GymProfileReviewContext;
    expect(foreign.organizationId).toBe(OTHER);
    expect(foreign.passages.map((passage) => passage.text)).toEqual(["Published tagline", "Published description"]);
  });
});

describe("profile questions on the server", () => {
  it("flags only claims the records contradict, offers every passage, and refuses the receptionist", async () => {
    const { owner, reception } = await harness();
    const context = await owner.query(api.domain.query, operation("profiles.gym.review")) as GymProfileReviewContext;
    const result = await owner.action(api.jevInference.judge, ask(ORG, "profile.claim_check")) as JevJudgeResult;
    expect(result).toMatchObject({ status: "ready", source: "fixture" });
    expect(choice(result)).toBe("en:taglineEn:0");
    const judgment = ready(result).judgment;
    expect(Object.keys(judgment.kind === "choice" ? judgment.probabilities : {}).sort()).toEqual([...context.passages.map((passage) => passage.id), "none"].sort());
    const reading = resolveProfileClaimReading(ready(result).judgment, context);
    expect(reading.findings.map((finding) => [finding.passage.text, finding.evidence])).toEqual([
      ["Strength and conditioning across six branches.", "Recorded: 2 active branches (Abdoun, Sweifieh)."],
      ["Women only after 6pm.", "Recorded audience: All members."],
      ["Freeze your membership any time you travel.", "Recorded plans (Basic Monthly) allow no freeze days."],
      ["للسيدات فقط بعد الساعة 6.", "Recorded audience: All members."],
      ["جمّد اشتراكك في أي وقت تسافر فيه.", "Recorded plans (Basic Monthly) allow no freeze days."],
    ]);
    // "Free parking at every branch" is not contradicted: parking is unrecorded, and the every-branch rule needs a plan record to speak.
    expect(reading.findings.some((finding) => finding.passage.text.startsWith("Free parking"))).toBe(false);
    await expectCode(reception.action(api.jevInference.judge, ask(ORG, "profile.claim_check")), "FORBIDDEN");
  });

  it("flags the passage the other language does not state, not the paraphrase, and needs both languages", async () => {
    const { owner } = await harness();
    const context = await owner.query(api.domain.query, operation("profiles.gym.review")) as GymProfileReviewContext;
    const result = await owner.action(api.jevInference.judge, ask(ORG, "profile.language_gap")) as JevJudgeResult;
    const reading = resolveLanguageGapReading(ready(result).judgment, context);
    expect(reading.aligned).toBe(false);
    // "Six branches" has an Arabic counterpart ("في فرعين" also speaks of branches); parking at every branch has none.
    expect(reading.findings.map((finding) => finding.passage.text)).toEqual(["Free parking at every branch."]);
    expect(reading.findings.some((finding) => finding.passage.text.startsWith("Freeze"))).toBe(false);
    await owner.mutation(api.domain.mutate, operation("profiles.gym.save", { ...DRAFT, taglineAr: "", descriptionAr: "" }));
    await expectCode(owner.action(api.jevInference.judge, ask(ORG, "profile.language_gap")), "VALIDATION_ERROR");
  });

  it("serves a repeat from the cache, misses it after a new draft, and marks a draft edited during evaluation as stale", async () => {
    const { t, owner } = await harness();
    const first = await owner.action(api.jevInference.judge, ask(ORG, "profile.claim_check")) as JevJudgeResult;
    expect(first).toMatchObject({ status: "ready", source: "fixture" });
    expect(await owner.action(api.jevInference.judge, ask(ORG, "profile.claim_check"))).toMatchObject({ status: "ready", source: "cache" });
    await owner.mutation(api.domain.mutate, operation("profiles.gym.save", { ...DRAFT, taglineEn: "Strength and conditioning across two branches." }));
    const second = await owner.action(api.jevInference.judge, ask(ORG, "profile.claim_check")) as JevJudgeResult;
    expect(second).toMatchObject({ status: "ready", source: "fixture" });
    expect(choice(second)).toBe("en:descriptionEn:0");
    const requestId = await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === ORG)!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "prof-owner")!;
      return await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "lease", status: "pending", mode: "fixture", requestedByUserId: user._id, correlationId: "cor-stale", startedAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 });
    });
    const stale = await owner.mutation(internal.jev.complete, { ...scoped(ORG), requestId, questionKey: "profile.claim_check", subject: {}, stateHash: "0".repeat(64), source: "fixture", judgment: { kind: "choice", choice: "none", probabilities: { none: 1 } }, modelId: "typesafe-ai/jev", latencyMs: 5, warnings: [] }) as JevJudgeResult;
    expect(stale).toMatchObject({ status: "stale" });
  });
});
