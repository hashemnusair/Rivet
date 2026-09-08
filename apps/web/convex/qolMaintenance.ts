import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const BATCH_SIZE = 100;
const CUSTOMER_MEMBERSHIP_INDEX_STATE_KEY = "customer_membership_identity_v2";

/**
 * Removes expired downloadable CSV bodies while retaining export metadata for
 * the operator's history. The body is the sensitive and potentially large
 * portion; the audit-safe status, filters, counts and filename remain.
 */
export const purgeExpiredExports = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("domainRecords")
      .withIndex("by_type_export_expiry", (q) => q.eq("entityType", "exportJob").gt("exportExpiresAt", undefined).lte("exportExpiresAt", now))
      .take(BATCH_SIZE);
    let purged = 0;
    for (const row of rows) {
      const value = row.data as Record<string, unknown>;
      if (typeof value.content === "string") {
        const { content: _content, ...metadata } = value;
        await ctx.db.patch(row._id, { data: { ...metadata, contentPurgedAt: new Date(now).toISOString() }, exportExpiresAt: undefined, updatedAt: now });
        purged += 1;
      } else {
        await ctx.db.patch(row._id, { exportExpiresAt: undefined, updatedAt: now });
      }
    }
    return purged;
  },
});

/** Backfills identity keys used by authenticated member reads in bounded runs. */
export const backfillCustomerMembershipIdentity = internalMutation({
  args: {},
  returns: v.object({ processed: v.number(), completed: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const state = await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", CUSTOMER_MEMBERSHIP_INDEX_STATE_KEY)).unique();
    if (state?.status === "completed") return { processed: 0, completed: true };
    // Walk a stable index: projecting identity fields must not move rows across
    // the cursor, and an unresolvable row must not block the next batch.
    const page = await ctx.db.query("domainRecords")
      .withIndex("by_entity_type", (q) => q.eq("entityType", "customerMembership"))
      .paginate({ cursor: state?.cursor ?? null, numItems: BATCH_SIZE });
    let processed = 0;
    let skipped = 0;
    for (const row of page.page) {
      const data = row.data as Record<string, unknown>;
      const userId = row.customerUserPublicId ?? (typeof data.customerUserId === "string" && data.customerUserId.trim() ? data.customerUserId : undefined);
      const profileId = row.customerProfilePublicId ?? (typeof data.customerId === "string" && data.customerId.trim() ? data.customerId : undefined);
      await ctx.db.patch(row._id, {
        customerUserPublicId: userId,
        customerProfilePublicId: profileId,
        customerIdentityBackfillIssue: userId ? undefined : profileId ? "profile_only" : "missing_identity",
      });
      if (userId || profileId) processed += 1;
      if (!userId) skipped += 1;
    }
    const completed = page.isDone;
    const value = {
      status: completed ? "completed" as const : "pending" as const,
      cursor: page.continueCursor,
      processedCount: (state?.processedCount ?? 0) + processed,
      skippedCount: (state?.skippedCount ?? 0) + skipped,
      updatedAt: now,
      completedAt: completed ? now : undefined,
    };
    if (state) await ctx.db.patch(state._id, value);
    else await ctx.db.insert("maintenanceState", { key: CUSTOMER_MEMBERSHIP_INDEX_STATE_KEY, ...value });
    return { processed, completed };
  },
});
