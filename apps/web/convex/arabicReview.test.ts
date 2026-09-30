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
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const ids = [];
    for (const name of ["Hashem", "Elias", "Owner", "Inactive"])
      ids.push(
        await ctx.db.insert("users", {
          authSubject: name,
          email: `${name.toLowerCase()}@example.com`,
          fullName: name,
          platformAdmin: name !== "Owner",
          status: name === "Inactive" ? "deactivated" : "active",
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    return ids;
  });
  return {
    t,
    ids,
    hashem: t.withIdentity({ subject: "Hashem" }),
    elias: t.withIdentity({ subject: "Elias" }),
  };
}
const answer = {
  version,
  cardId: "membership",
  choice: "a",
  customText: "",
  note: "Use everyday gym language",
  expectedUpdatedAt: 0,
};
describe("Arabic review persistence and access", () => {
  it("rejects anonymous, ordinary gym accounts and deactivated admins at every public boundary", async () => {
    const { t } = await setup();
    for (const actor of [
      t,
      t.withIdentity({ subject: "Owner" }),
      t.withIdentity({ subject: "Inactive" }),
    ]) {
      await expect(
        actor.query(api.arabicReview.snapshot, {}),
      ).rejects.toThrow();
      await expect(
        actor.query(api.arabicReview.history, { cardId: "membership" }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.arabicReview.saveVote, answer),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.arabicReview.approve, { version, revision: 0 }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.arabicReview.present, { cardId: "membership" }),
      ).rejects.toThrow();
    }
  });
  it("stores independent answers, exposes both on a fresh read and preserves change history", async () => {
    const { hashem, elias, t } = await setup();
    const time = await hashem.mutation(api.arabicReview.saveVote, answer);
    await elias.mutation(api.arabicReview.saveVote, { ...answer, choice: "b" });
    let snapshot = await hashem.query(api.arabicReview.snapshot, {});
    expect(snapshot.votes).toHaveLength(2);
    expect(
      cardStatus(
        cards.find((card) => card.id === answer.cardId)!,
        snapshot.votes,
        snapshot.reviewers,
      ),
    ).toBe("different");
    await hashem.mutation(api.arabicReview.saveVote, {
      ...answer,
      choice: "b",
      expectedUpdatedAt: time,
    });
    snapshot = await elias.query(api.arabicReview.snapshot, {});
    expect(
      cardStatus(
        cards.find((card) => card.id === answer.cardId)!,
        snapshot.votes,
        snapshot.reviewers,
      ),
    ).toBe("agreed");
    expect(
      await elias.query(api.arabicReview.history, { cardId: answer.cardId }),
    ).toHaveLength(3);
    const exported = await t.query(
      internal.arabicReview.exportForImplementation,
      {},
    );
    expect(exported.readyForImplementation).toBe(false);
    expect(
      exported.decisions.find((card) => card.id === answer.cardId)?.agreedText,
    ).toBe("عضوية");
  });
  it("rejects stale tabs, stale catalogs and invalid options without overwriting saved answers", async () => {
    const { hashem } = await setup();
    await hashem.mutation(api.arabicReview.saveVote, answer);
    await expect(
      hashem.mutation(api.arabicReview.saveVote, { ...answer, choice: "b" }),
    ).rejects.toThrow(/another tab/);
    await expect(
      hashem.mutation(api.arabicReview.saveVote, { ...answer, version: "old" }),
    ).rejects.toThrow(/changed/);
    await expect(
      hashem.mutation(api.arabicReview.saveVote, {
        ...answer,
        cardId: "unknown",
      }),
    ).rejects.toThrow(/available answer/);
    await expect(
      hashem.mutation(api.arabicReview.saveVote, {
        ...answer,
        choice: "injected",
      }),
    ).rejects.toThrow(/available answer/);
    await expect(
      hashem.mutation(api.arabicReview.saveVote, {
        ...answer,
        choice: "custom",
        customText: " ",
      }),
    ).rejects.toThrow();
    expect(
      (await hashem.query(api.arabicReview.snapshot, {})).votes[0]?.choice,
    ).toBe("a");
  });
  it("never treats two rejections as agreement, and accepts identical custom wording", async () => {
    const { hashem, elias } = await setup();
    const a = await hashem.mutation(api.arabicReview.saveVote, {
      ...answer,
      choice: "reject",
    });
    const b = await elias.mutation(api.arabicReview.saveVote, {
      ...answer,
      choice: "reject",
    });
    let s = await hashem.query(api.arabicReview.snapshot, {});
    expect(
      cardStatus(
        cards.find((card) => card.id === answer.cardId)!,
        s.votes,
        s.reviewers,
      ),
    ).toBe("different");
    for (const [actor, timestamp] of [
      [hashem, a],
      [elias, b],
    ] as const)
      await actor.mutation(api.arabicReview.saveVote, {
        ...answer,
        choice: "custom",
        customText: "اشتراك النادي",
        expectedUpdatedAt: timestamp,
      });
    s = await hashem.query(api.arabicReview.snapshot, {});
    expect(
      cardStatus(
        cards.find((card) => card.id === answer.cardId)!,
        s.votes,
        s.reviewers,
      ),
    ).toBe("agreed");
  });
  it("requires complete agreement plus both approvals, invalidates approval after edits, and rejects stale approval", async () => {
    const { t, hashem, elias, ids } = await setup();
    await expect(
      hashem.mutation(api.arabicReview.approve, { version, revision: 0 }),
    ).rejects.toThrow(/Every question/);
    await t.run(async (ctx) => {
      for (const card of cards)
        for (const userId of ids.slice(0, 2))
          await ctx.db.insert("arabicReviewVotes", {
            version,
            cardId: card.id,
            userId: userId!,
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
    await hashem.mutation(api.arabicReview.approve, { version, revision: 494 });
    expect((await hashem.query(api.arabicReview.snapshot, {})).ready).toBe(
      false,
    );
    await elias.mutation(api.arabicReview.approve, { version, revision: 494 });
    expect(
      (await t.query(internal.arabicReview.exportForImplementation, {}))
        .readyForImplementation,
    ).toBe(true);
    await hashem.mutation(api.arabicReview.saveVote, {
      ...answer,
      expectedUpdatedAt: 1,
      note: "Clarified scope",
    });
    const after = await elias.query(api.arabicReview.snapshot, {});
    expect(after.ready).toBe(false);
    expect(after.approvals).toEqual([]);
    await expect(
      elias.mutation(api.arabicReview.approve, { version, revision: 494 }),
    ).rejects.toThrow(/Answers changed/);
  });
  it("invalidates approvals when the authorized reviewer roster changes", async () => {
    const { t, hashem, ids } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("arabicReviewRooms", {
        version,
        revision: 1,
        approvals: ids.slice(0, 2) as typeof ids,
        approvedRoster: ids.slice(0, 2) as typeof ids,
        updatedAt: 1,
      });
      await ctx.db.patch(ids[2]!, { platformAdmin: true });
    });
    expect(
      (await hashem.query(api.arabicReview.snapshot, {})).approvals,
    ).toEqual([]);
  });
  it("updates presence without changing answers or approvals", async () => {
    const { hashem, elias } = await setup();
    await hashem.mutation(api.arabicReview.present, { cardId: "membership" });
    await hashem.mutation(api.arabicReview.present, { cardId: "renew" });
    const s = await elias.query(api.arabicReview.snapshot, {});
    expect(s.presence).toHaveLength(1);
    expect(s.presence[0]?.cardId).toBe("renew");
    expect(s.revision).toBe(0);
    expect(s.votes).toEqual([]);
  });
  it("has unique stable card IDs and meaningful multiple-choice alternatives", () => {
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    for (const card of cards) {
      expect(card.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(card.options.map((option) => option.text)).size).toBe(
        card.options.length,
      );
      expect(card.context.length).toBeGreaterThan(10);
    }
  });
});
