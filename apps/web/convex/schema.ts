import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const organizationStatus = v.union(
  v.literal("trial"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("suspended"),
  v.literal("cancelled"),
);

const accountStatus = v.union(v.literal("active"), v.literal("invited"), v.literal("deactivated"));

const gymApplicationStatus = v.union(
  v.literal("pending"),
  v.literal("under_review"),
  v.literal("approved"),
  v.literal("rejected"),
);

const gymApplicationNotificationStatus = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("not_configured"),
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
    publicId: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    status: organizationStatus,
    subscriptionPlan: v.optional(v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"))),
    subscriptionStartedAt: v.optional(v.number()),
    clerkOrganizationId: v.optional(v.string()),
    timezone: v.string(),
    currency: v.string(),
    locale: v.optional(v.string()),
    defaultLanguage: v.optional(v.union(v.literal("en"), v.literal("ar"))),
    taxRatePercent: v.optional(v.number()),
    receiptPrefix: v.optional(v.string()),
    nextReceiptNumber: v.optional(v.number()),
    receiptFooter: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_public_id", ["publicId"]),

  branches: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.optional(v.string()),
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    capacity: v.optional(v.number()),
    active: v.boolean(),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_code", ["organizationId", "code"])
    .index("by_organization_public_id", ["organizationId", "publicId"]),

  users: defineTable({
    publicId: v.optional(v.string()),
    authSubject: v.string(),
    email: v.string(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    platformAdmin: v.boolean(),
    status: v.optional(accountStatus),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_subject", ["authSubject"])
    .index("by_email", ["email"])
    .index("by_public_id", ["publicId"]),

  // Consumer profiles are global authenticated identities, not tenant-owned
  // staff/member records. Gym memberships and trial bookings may reference
  // this public ID, but the profile itself must not belong to one gym.
  customerProfiles: defineTable({
    publicId: v.string(),
    userId: v.string(),
    name: v.string(),
    nameAr: v.string(),
    email: v.string(),
    phone: v.string(),
    initials: v.string(),
    context: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_public_id", ["publicId"]),

  // Public gym applications remain outside a tenant until RIVET approves and
  // provisions the gym. Only platform-admin workflows may read or change them.
  gymApplications: defineTable({
    publicId: v.string(),
    applicationKey: v.string(),
    gymName: v.string(),
    ownerName: v.string(),
    email: v.string(),
    contactNumber: v.string(),
    plan: v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro")),
    status: gymApplicationStatus,
    notificationStatus: gymApplicationNotificationStatus,
    notificationError: v.optional(v.string()),
    reviewNotificationStatus: v.optional(gymApplicationNotificationStatus),
    reviewNotificationError: v.optional(v.string()),
    submittedAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.string()),
    reviewNotes: v.optional(v.string()),
    provisioningStatus: v.optional(v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("completed"), v.literal("failed"))),
    provisioningStartedAt: v.optional(v.number()),
    provisioningError: v.optional(v.string()),
    provisionedAt: v.optional(v.number()),
    provisionedOrganizationId: v.optional(v.string()),
    provisionedBranchId: v.optional(v.string()),
    clerkOrganizationId: v.optional(v.string()),
    clerkInvitationId: v.optional(v.string()),
  })
    .index("by_application_key", ["applicationKey"])
    .index("by_status", ["status"])
    .index("by_email", ["email"])
    .index("by_public_id", ["publicId"]),

  // Platform decisions sit outside a tenant, so they use their own immutable
  // audit stream rather than being attached to a gym's organization audit log.
  platformAuditEvents: defineTable({
    publicId: v.string(),
    actorUserId: v.id("users"),
    actorPublicId: v.string(),
    actorName: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityPublicId: v.string(),
    entityLabel: v.string(),
    summary: v.string(),
    reason: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    correlationId: v.string(),
    occurredAt: v.number(),
  })
    .index("by_occurred", ["occurredAt"])
    .index("by_entity", ["entityType", "entityPublicId"]),

  organizationMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: organizationRole,
    branchIds: v.array(v.id("branches")),
    active: v.boolean(),
    branchScope: v.optional(v.union(v.literal("all"), v.literal("selected"))),
    invitationStatus: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"))),
    invitedAt: v.optional(v.number()),
    clerkInvitationId: v.optional(v.string()),
    invitationSentAt: v.optional(v.number()),
    invitationLastAttemptAt: v.optional(v.number()),
    invitationError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_organization_user", ["organizationId", "userId"]),

  roleDefinitions: defineTable({
    organizationId: v.id("organizations"),
    role: organizationRole,
    label: v.string(),
    description: v.string(),
    permissions: v.array(v.string()),
    discountLimitMinor: v.number(),
    isSystem: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_role", ["organizationId", "role"]),

  domainRecords: defineTable({
    organizationId: v.id("organizations"),
    entityType: v.string(),
    publicId: v.string(),
    branchId: v.optional(v.id("branches")),
    memberPublicId: v.optional(v.string()),
    leadPublicId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    data: v.any(),
  })
    .index("by_entity_type", ["entityType"])
    .index("by_organization_type", ["organizationId", "entityType"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_type_public_id", ["organizationId", "entityType", "publicId"])
    .index("by_organization_branch_type", ["organizationId", "branchId", "entityType"])
    .index("by_organization_member_type", ["organizationId", "memberPublicId", "entityType"])
    .index("by_organization_lead_type", ["organizationId", "leadPublicId", "entityType"]),

  auditEvents: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.optional(v.id("branches")),
    actorUserId: v.id("users"),
    actorPublicId: v.string(),
    actorName: v.string(),
    actorRole: organizationRole,
    category: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityPublicId: v.string(),
    entityLabel: v.string(),
    summary: v.string(),
    reason: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    details: v.optional(v.any()),
    approvalStatus: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
    correlationId: v.string(),
    occurredAt: v.number(),
  })
    .index("by_organization_occurred", ["organizationId", "occurredAt"])
    .index("by_organization_category", ["organizationId", "category"])
    .index("by_organization_entity", ["organizationId", "entityPublicId"])
    .index("by_organization_branch", ["organizationId", "branchId"]),

  idempotencyRecords: defineTable({
    organizationId: v.id("organizations"),
    operation: v.string(),
    key: v.string(),
    requestHash: v.string(),
    result: v.any(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  }).index("by_organization_operation_key", ["organizationId", "operation", "key"]),

  entryPasses: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    membershipPublicId: v.string(),
    customerUserId: v.id("users"),
    branchId: v.optional(v.id("branches")),
    expiresAt: v.number(),
    issuedAt: v.number(),
    lastValidatedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_membership", ["organizationId", "membershipPublicId"])
    .index("by_customer", ["customerUserId"]),

  sequenceCounters: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    nextValue: v.number(),
    updatedAt: v.number(),
  }).index("by_organization_key", ["organizationId", "key"]),
});
