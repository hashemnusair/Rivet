import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const organizationStatus = v.union(
  v.literal("trial"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("suspended"),
  v.literal("cancelled"),
);

export const organizationRole = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("sales"),
  v.literal("receptionist"),
  v.literal("trainer"),
  v.literal("auditor"),
);

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    status: organizationStatus,
    timezone: v.string(),
    currency: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  branches: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_code", ["organizationId", "code"]),

  users: defineTable({
    authSubject: v.string(),
    email: v.string(),
    fullName: v.string(),
    platformAdmin: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_subject", ["authSubject"])
    .index("by_email", ["email"]),

  organizationMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: organizationRole,
    branchIds: v.array(v.id("branches")),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_organization_user", ["organizationId", "userId"]),
});
