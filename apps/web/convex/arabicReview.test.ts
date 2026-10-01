import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  ARABIC_REVIEW_CARDS as cards,
  ARABIC_REVIEW_VERSION as version,
  cardStatus,
} from "./arabicReviewModel";
const modules = import.meta.glob("./**/*.ts");
const answer = {
  reviewer: "hashem" as const,
  version,
  cardId: "membership",
  choice: "a",
  customText: "",
  note: "Use everyday gym language",
  expectedUpdatedAt: 0,
};
const membership = cards.find((card) => card.id === "membership")!;
describe("public Arabic review", () => {
  it("opens without an account and only accepts the two explicit reviewer names", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.arabicReview.snapshot, {
      reviewer: "hashem",
    });
    expect(result.reviewers).toEqual([
      { id: "elias", name: "Elias" },
      { id: "hashem", name: "Hashem" },
    ]);
    expect(result.me).toBe("hashem");
    await expect(
      t.query(api.arabicReview.snapshot, { reviewer: "owner" as never }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.arabicReview.saveVote, {
        ...answer,
        reviewer: "owner" as never,
      }),
    ).rejects.toThrow();
    await expect(
      t.query(api.domain.query, {
        operation: "platform.snapshot",
        input: {},
        correlationId: "public-review-test",
      }),
    ).rejects.toThrow();
  });
  it("stores separate named answers, exposes both on fresh reads, and keeps history", async () => {
    const t = convexTest(schema, modules);
    const time = await t.mutation(api.arabicReview.saveVote, answer);
    await t.mutation(api.arabicReview.saveVote, {
      ...answer,
      reviewer: "elias",
      choice: "b",
    });
    let s = await t.query(api.arabicReview.snapshot, { reviewer: "hashem" });
    expect(s.votes).toHaveLength(2);
    expect(cardStatus(membership, s.votes, s.reviewers)).toBe("different");
    await t.mutation(api.arabicReview.saveVote, {
      ...answer,
      choice: "b",
      expectedUpdatedAt: time,
    });
    s = await t.query(api.arabicReview.snapshot, { reviewer: "elias" });
    expect(cardStatus(membership, s.votes, s.reviewers)).toBe("agreed");
    expect(
      await t.query(api.arabicReview.history, { cardId: "membership" }),
    ).toHaveLength(3);
    const exported = await t.query(
      internal.arabicReview.exportForImplementation,
      {},
    );
    expect(exported.readyForImplementation).toBe(false);
    expect(
      exported.decisions.find((card) => card.id === "membership")?.agreedText,
    ).toBe("عضوية");
    expect(exported.identityMode).toContain("Self-selected");
  });
  it("rejects stale tabs, stale catalogs and invalid answers without overwriting", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.arabicReview.saveVote, answer);
    await expect(
      t.mutation(api.arabicReview.saveVote, { ...answer, choice: "b" }),
    ).rejects.toThrow(/another tab/);
    await expect(
      t.mutation(api.arabicReview.saveVote, { ...answer, version: "old" }),
    ).rejects.toThrow(/changed/);
    await expect(
      t.mutation(api.arabicReview.saveVote, { ...answer, cardId: "unknown" }),
    ).rejects.toThrow(/available answer/);
    await expect(
      t.mutation(api.arabicReview.saveVote, { ...answer, choice: "injected" }),
    ).rejects.toThrow(/available answer/);
    await expect(
      t.mutation(api.arabicReview.saveVote, {
        ...answer,
        choice: "custom",
        customText: " ",
      }),
    ).rejects.toThrow();
    expect(
      (await t.query(api.arabicReview.snapshot, { reviewer: "hashem" }))
        .votes[0]?.choice,
    ).toBe("a");
  });
  it("never agrees two rejections and accepts matching custom wording", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(api.arabicReview.saveVote, {
      ...answer,
      choice: "reject",
    });
    const b = await t.mutation(api.arabicReview.saveVote, {
      ...answer,
      reviewer: "elias",
      choice: "reject",
    });
    let s = await t.query(api.arabicReview.snapshot, { reviewer: "hashem" });
    expect(cardStatus(membership, s.votes, s.reviewers)).toBe("different");
    for (const [reviewer, timestamp] of [
      ["hashem", a],
      ["elias", b],
    ] as const)
      await t.mutation(api.arabicReview.saveVote, {
        ...answer,
        reviewer,
        choice: "custom",
        customText: "اشتراك النادي",
        expectedUpdatedAt: timestamp,
      });
    s = await t.query(api.arabicReview.snapshot, { reviewer: "hashem" });
    expect(cardStatus(membership, s.votes, s.reviewers)).toBe("agreed");
  });
  it("requires complete agreement and both approvals and clears approval after edits", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.arabicReview.approve, {
        reviewer: "hashem",
        version,
        revision: 0,
      }),
    ).rejects.toThrow(/Every question/);
    await t.run(async (ctx) => {
      for (const card of cards)
        for (const userId of ["elias", "hashem"])
          await ctx.db.insert("arabicReviewVotes", {
            version,
            cardId: card.id,
            userId,
            choice: "a",
            customText: "",
            note: "",
            updatedAt: 1,
          });
      await ctx.db.insert("arabicReviewRooms", {
        version,
        revision: 494,
        approvals: [],
        approvedRoster: [],
        updatedAt: 1,
      });
    });
    await t.mutation(api.arabicReview.approve, {
      reviewer: "hashem",
      version,
      revision: 494,
    });
    expect(
      (await t.query(api.arabicReview.snapshot, { reviewer: "elias" })).ready,
    ).toBe(false);
    await t.mutation(api.arabicReview.approve, {
      reviewer: "elias",
      version,
      revision: 494,
    });
    expect(
      (await t.query(internal.arabicReview.exportForImplementation, {}))
        .readyForImplementation,
    ).toBe(true);
    await t.mutation(api.arabicReview.saveVote, {
      ...answer,
      expectedUpdatedAt: 1,
      note: "Clarified scope",
    });
    const after = await t.query(api.arabicReview.snapshot, {
      reviewer: "elias",
    });
    expect(after.ready).toBe(false);
    expect(after.approvals).toEqual([]);
    await expect(
      t.mutation(api.arabicReview.approve, {
        reviewer: "elias",
        version,
        revision: 494,
      }),
    ).rejects.toThrow(/Answers changed/);
  });
  it("migrates existing answers, comments, history and approvals without losing content; rerunning is safe", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const make = (name: string) =>
        ctx.db.insert("users", {
          authSubject: name,
          email: `${name}@example.com`,
          fullName: name,
          platformAdmin: true,
          createdAt: 1,
          updatedAt: 1,
        });
      const hashemUserId = await make("Hashem");
      const eliasUserId = await make("Elias");
      const vote = {
        version,
        cardId: "membership",
        userId: hashemUserId,
        choice: "custom",
        customText: "اشتراك النادي",
        note: "Keep this comment",
        updatedAt: 10,
      };
      await ctx.db.insert("arabicReviewVotes", vote);
      await ctx.db.insert("arabicReviewHistory", vote);
      await ctx.db.insert("arabicReviewRooms", {
        version,
        revision: 1,
        approvals: [hashemUserId],
        approvedRoster: [hashemUserId, eliasUserId],
        updatedAt: 1,
      });
      return { hashemUserId, eliasUserId };
    });
    expect(
      (await t.mutation(internal.arabicReview.migrateNamedReviewers, ids))
        .migratedAnswersAndHistory,
    ).toBe(2);
    expect(
      (await t.mutation(internal.arabicReview.migrateNamedReviewers, ids))
        .migratedAnswersAndHistory,
    ).toBe(0);
    const s = await t.query(api.arabicReview.snapshot, { reviewer: "hashem" });
    expect(s.votes[0]).toMatchObject({
      userId: "hashem",
      customText: "اشتراك النادي",
      note: "Keep this comment",
      updatedAt: 10,
    });
    expect(s.approvals).toEqual(["hashem"]);
    expect(
      (await t.query(api.arabicReview.history, { cardId: "membership" }))[0]
        ?.userId,
    ).toBe("hashem");
  });
  it("updates live presence without changing answers and bounds public write traffic", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.arabicReview.present, {
      reviewer: "hashem",
      cardId: "membership",
    });
    await t.mutation(api.arabicReview.present, {
      reviewer: "hashem",
      cardId: "renew",
    });
    const s = await t.query(api.arabicReview.snapshot, { reviewer: "elias" });
    expect(s.presence).toHaveLength(1);
    expect(s.presence[0]?.cardId).toBe("renew");
    expect(s.revision).toBe(0);
    await t.run(async (ctx) => {
      await ctx.db.insert("publicRequestGuards", {
        scope: "arabic-review-write",
        fingerprint: "hashem",
        requestCount: 120,
        windowStartedAt: Date.now(),
        lastRequestAt: Date.now(),
      });
    });
    await expect(t.mutation(api.arabicReview.saveVote, answer)).rejects.toThrow(
      /Too many requests/,
    );
    await t.mutation(api.arabicReview.saveVote, {
      ...answer,
      reviewer: "elias",
    });
  });
});
