import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requirePlatformAdmin, domainError } from "./security";
import {
  ARABIC_REVIEW_CARDS,
  ARABIC_REVIEW_VERSION,
  reviewComplete,
  exportReview,
} from "./arabicReviewModel";

async function state(ctx: QueryCtx | MutationCtx, me: string) {
  const [users, votes, room, presence] = await Promise.all([
    ctx.db.query("users").withIndex("by_platform_admin", (q) => q.eq("platformAdmin", true)).collect(),
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
  const reviewers = users
    .filter(
      (user) =>
        user.platformAdmin &&
        user.status !== "deactivated" &&
        user.status !== "invited",
    )
    .map((user) => ({ id: user._id, name: user.fullName }))
    .sort((a, b) => a.id.localeCompare(b.id));
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
  args: {},
  handler: async (ctx) => {
    const { user } = await requirePlatformAdmin(ctx);
    return state(ctx, user._id);
  },
});
export const saveVote = mutation({
  args: {
    version: v.string(),
    cardId: v.string(),
    choice: v.string(),
    customText: v.string(),
    note: v.string(),
    expectedUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requirePlatformAdmin(ctx);
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
          .eq("userId", user._id),
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
      userId: user._id,
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
  args: { version: v.string(), revision: v.number() },
  handler: async (ctx, args) => {
    const { user } = await requirePlatformAdmin(ctx);
    const current = await state(ctx, user._id);
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
      approvals: [...new Set([...current.approvals, user._id])],
      approvedRoster: current.reviewers.map((reviewer) => reviewer.id),
      updatedAt: Date.now(),
    });
  },
});
export const history = query({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx);
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
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await requirePlatformAdmin(ctx);
    if (!ARABIC_REVIEW_CARDS.some((card) => card.id === args.cardId))
      domainError("VALIDATION_ERROR", "Unknown question.");
    const old = await ctx.db
      .query("arabicReviewPresence")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const data = { userId: user._id, cardId: args.cardId, seenAt: Date.now() };
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
