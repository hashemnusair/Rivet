import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { OrganizationRole } from "./security";

interface NotificationInput {
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  organizationId?: Id<"organizations">;
  branchId?: Id<"branches">;
}

async function insertOnce(ctx: MutationCtx, recipientUserId: Id<"users">, input: NotificationInput) {
  const existing = await ctx.db
    .query("operationalNotifications")
    .withIndex("by_recipient_dedupe", (q) => q.eq("recipientUserId", recipientUserId).eq("dedupeKey", input.dedupeKey))
    .unique();
  if (existing) return;
  await ctx.db.insert("operationalNotifications", {
    publicId: `NOT-${crypto.randomUUID()}`,
    recipientUserId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    dedupeKey: input.dedupeKey,
    createdAt: Date.now(),
  });
}

export async function notifyPlatformAdmins(ctx: MutationCtx, input: NotificationInput) {
  const users = (await ctx.db.query("users").collect()).filter((user) => user.platformAdmin && user.status !== "deactivated");
  await Promise.all(users.map((user) => insertOnce(ctx, user._id, input)));
}

export async function notifyOrganizationSupervisors(ctx: MutationCtx, input: NotificationInput & { organizationId: Id<"organizations">; roles?: OrganizationRole[] }) {
  const roles = input.roles ?? ["owner", "manager"];
  const memberships = (await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", input.organizationId)).collect())
    .filter((membership) => membership.active && (roles as string[]).includes(membership.role))
    .filter((membership) => !input.branchId || membership.branchScope === "all" || membership.branchIds.includes(input.branchId));
  await Promise.all(memberships.map(async (membership) => {
    const user = await ctx.db.get(membership.userId);
    if (!user || user.status === "deactivated") return;
    await insertOnce(ctx, user._id, input);
  }));
}
