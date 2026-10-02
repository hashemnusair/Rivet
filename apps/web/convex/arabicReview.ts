import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { domainError } from "./security";
import { enforcePublicRateLimit } from "./publicAbuse";
import {
  ARABIC_REVIEWERS,
  ARABIC_REVIEW_CARDS,
  ARABIC_REVIEW_VERSION,
  reviewComplete,
  exportReview,
} from "./arabicReviewModel";

const reviewer = v.union(v.literal("elias"), v.literal("hashem"));

async function state(ctx: QueryCtx | MutationCtx, me: string) {
  const [votes, room, presence] = await Promise.all([
    ctx.db
      .query("arabicReviewVotes")
      .withIndex("by_version", (q) => q.eq("version", ARABIC_REVIEW_VERSION))
      .collect(),
    ctx.db
      .query("arabicReviewRooms")
      .withIndex("by_version", (q) => q.eq("version", ARABIC_REVIEW_VERSION))
      .unique(),
    ctx.db.query("arabicReviewPresence").collect(),
  ]);
  const reviewers = ARABIC_REVIEWERS.map((person) => ({ ...person }));
  const rosterMatches =
    room?.approvedRoster.length === reviewers.length &&
    reviewers.every((reviewer) => room.approvedRoster.includes(reviewer.id));
  const approvals = rosterMatches ? (room?.approvals ?? []) : [];
  const activeVotes = votes
    .filter((vote) => reviewers.some((reviewer) => reviewer.id === vote.userId))
    .map(({ cardId, userId, choice, customText, note, updatedAt }) => ({
      cardId,
      userId,
      choice,
      customText,
      note,
      updatedAt,
    }));
  return {
    version: ARABIC_REVIEW_VERSION,
    revision: room?.revision ?? 0,
    me,
    reviewers,
    votes: activeVotes,
    approvals,
    ready:
      reviewComplete(activeVotes, reviewers) &&
      reviewers.every((reviewer) => approvals.includes(reviewer.id)),
    presence: presence
      .filter((row) => reviewers.some((reviewer) => reviewer.id === row.userId))
      .map(({ userId, cardId, seenAt }) => ({ userId, cardId, seenAt })),
  };
}
export const snapshot = query({
  args: { reviewer },
  handler: async (ctx, args) => {
    return state(ctx, args.reviewer);
  },
});
export const saveVote = mutation({
  args: {
    reviewer,
    version: v.string(),
    cardId: v.string(),
    choice: v.string(),
    customText: v.string(),
    note: v.string(),
    expectedUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await enforcePublicRateLimit(ctx, {
      scope: "arabic-review-write",
      fingerprint: args.reviewer,
      maxRequests: 120,
      windowMs: 60_000,
    });
    if (args.version !== ARABIC_REVIEW_VERSION)
      domainError("CONFLICT", "The questions changed. Refresh before saving.");
    const card = ARABIC_REVIEW_CARDS.find((item) => item.id === args.cardId);
    if (
      !card ||
      ![
        ...card.options.map((option) => option.id),
        "custom",
        "reject",
      ].includes(args.choice)
    )
      domainError("VALIDATION_ERROR", "Choose an available answer.");
    const customText = args.choice === "custom" ? args.customText.trim() : "";
    const note = args.note.trim();
    if (
      (args.choice === "custom" && !customText) ||
      customText.length > 1000 ||
      note.length > 2000
    )
      domainError(
        "VALIDATION_ERROR",
        "Add your wording (up to 1,000 characters), and keep comments under 2,000 characters.",
      );
    const prior = await ctx.db
      .query("arabicReviewVotes")
      .withIndex("by_vote", (q) =>
        q
          .eq("version", args.version)
          .eq("cardId", args.cardId)
          .eq("userId", args.reviewer),
      )
      .unique();
    if ((prior?.updatedAt ?? 0) !== args.expectedUpdatedAt)
      domainError(
        "CONFLICT",
        "Your answer changed in another tab. Reload this answer before saving.",
      );
    if (
      prior &&
      prior.choice === args.choice &&
      prior.customText === customText &&
      prior.note === note
    )
      return prior.updatedAt;
    const data = {
      version: args.version,
      cardId: args.cardId,
      userId: args.reviewer,
      choice: args.choice,
      customText,
      note,
      updatedAt: Math.max(Date.now(), (prior?.updatedAt ?? 0) + 1),
    };
    if (prior) await ctx.db.patch(prior._id, data);
    else await ctx.db.insert("arabicReviewVotes", data);
    await ctx.db.insert("arabicReviewHistory", data);
    const room = await ctx.db
      .query("arabicReviewRooms")
      .withIndex("by_version", (q) => q.eq("version", args.version))
      .unique();
    const next = {
      version: args.version,
      revision: (room?.revision ?? 0) + 1,
      approvals: [],
      approvedRoster: [],
      updatedAt: Date.now(),
    };
    if (room) await ctx.db.patch(room._id, next);
    else await ctx.db.insert("arabicReviewRooms", next);
    return data.updatedAt;
  },
});
export const approve = mutation({
  args: { reviewer, version: v.string(), revision: v.number() },
  handler: async (ctx, args) => {
    await enforcePublicRateLimit(ctx, {
      scope: "arabic-review-write",
      fingerprint: args.reviewer,
      maxRequests: 120,
      windowMs: 60_000,
    });
    const current = await state(ctx, args.reviewer);
    if (args.version !== current.version || args.revision !== current.revision)
      domainError(
        "CONFLICT",
        "Answers changed. Review the latest choices before approving.",
      );
    if (!reviewComplete(current.votes, current.reviewers))
      domainError(
        "VALIDATION_ERROR",
        "Every question needs an agreed answer from all reviewers before approval.",
      );
    const room = await ctx.db
      .query("arabicReviewRooms")
      .withIndex("by_version", (q) => q.eq("version", current.version))
      .unique();
    if (!room) domainError("VALIDATION_ERROR", "Save your answers first.");
    await ctx.db.patch(room._id, {
      approvals: [...new Set([...current.approvals, args.reviewer])],
      approvedRoster: current.reviewers.map((reviewer) => reviewer.id),
      updatedAt: Date.now(),
    });
  },
});
export const history = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("arabicReviewHistory")
      .withIndex("by_card", (q) =>
        q.eq("version", ARABIC_REVIEW_VERSION).eq("cardId", args.cardId),
      )
      .order("desc")
      .take(30);
  },
});
export const present = mutation({
  args: { reviewer, cardId: v.string() },
  handler: async (ctx, args) => {
    await enforcePublicRateLimit(ctx, {
      scope: "arabic-review-presence",
      fingerprint: args.reviewer,
      maxRequests: 60,
      windowMs: 60_000,
    });
    if (!ARABIC_REVIEW_CARDS.some((card) => card.id === args.cardId))
      domainError("VALIDATION_ERROR", "Unknown question.");
    const old = await ctx.db
      .query("arabicReviewPresence")
      .withIndex("by_user", (q) => q.eq("userId", args.reviewer))
      .unique();
    const data = {
      userId: args.reviewer,
      cardId: args.cardId,
      seenAt: Date.now(),
    };
    if (old) await ctx.db.patch(old._id, data);
    else await ctx.db.insert("arabicReviewPresence", data);
  },
});
// Read-only CLI handoff for the later implementation agent. Internal functions
// require deployment credentials and cannot be invoked from the browser API.
export const exportForImplementation = internalQuery({
  args: {},
  handler: async (ctx) => exportReview(await state(ctx, "agent-export")),
});

// One-time, idempotent ownership migration. Only a deployment operator can call
// this; public callers cannot read or modify RIVET account records.
export const migrateNamedReviewers = internalMutation({
  args: { hashemUserId: v.id("users"), eliasUserId: v.id("users") },
  handler: async (ctx, args) => {
    const hashem = await ctx.db.get(args.hashemUserId);
    const elias = await ctx.db.get(args.eliasUserId);
    if (
      !hashem?.platformAdmin ||
      !elias?.platformAdmin ||
      !/^hashem\b/i.test(hashem.fullName) ||
      !/^elias\b/i.test(elias.fullName)
    )
      domainError(
        "VALIDATION_ERROR",
        "The legacy reviewer accounts do not match.",
      );
    const rename = (id: string) =>
      id === args.hashemUserId
        ? "hashem"
        : id === args.eliasUserId
          ? "elias"
          : id;
    const votes = await ctx.db.query("arabicReviewVotes").take(5001);
    const history = await ctx.db.query("arabicReviewHistory").take(5001);
    const rooms = await ctx.db.query("arabicReviewRooms").take(5001);
    const presence = await ctx.db.query("arabicReviewPresence").take(5001);
    if ([votes, history, rooms, presence].some((rows) => rows.length > 5000))
      domainError("VALIDATION_ERROR", "Migration needs a paginated run.");
    const keys = new Set<string>();
    for (const vote of votes) {
      const key = JSON.stringify([
        vote.version,
        vote.cardId,
        rename(vote.userId),
      ]);
      if (keys.has(key))
        domainError(
          "CONFLICT",
          "Both legacy and named answers exist. Reconcile them before migrating.",
        );
      keys.add(key);
    }
    let moved = 0;
    for (const row of [...votes, ...history])
      if (rename(row.userId) !== row.userId) {
        await ctx.db.patch(row._id, { userId: rename(row.userId) });
        moved++;
      }
    for (const room of rooms)
      await ctx.db.patch(room._id, {
        approvals: room.approvals.map(rename),
        approvedRoster: room.approvedRoster.map(rename),
      });
    for (const row of presence)
      if (rename(row.userId) !== row.userId) {
        const existing = presence.find(
          (other) => other.userId === rename(row.userId),
        );
        if (existing) await ctx.db.delete(row._id);
        else await ctx.db.patch(row._id, { userId: rename(row.userId) });
      }
    return { migratedAnswersAndHistory: moved, rooms: rooms.length };
  },
});
