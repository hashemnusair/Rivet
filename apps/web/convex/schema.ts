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

const customerMarketingPreferenceSource = v.union(v.literal("system_default"), v.literal("member_selected"));
const customerMarketingPreferenceStatus = v.union(v.literal("explicit_opt_in"), v.literal("explicit_opt_out"), v.literal("unknown"));

export const organizationRole = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("sales"),
  v.literal("receptionist"),
  v.literal("trainer"),
  v.literal("auditor"),
);

const auditActorRole = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("sales"),
  v.literal("receptionist"),
  v.literal("trainer"),
  v.literal("auditor"),
  v.literal("member"),
);

export default defineSchema({
  organizations: defineTable({
    publicId: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    status: organizationStatus,
    subscriptionPlan: v.optional(v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"))),
    subscriptionStartedAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    subscriptionStatusReason: v.optional(v.string()),
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

  operationalNotifications: defineTable({
    publicId: v.string(),
    recipientUserId: v.id("users"),
    organizationId: v.optional(v.id("organizations")),
    branchId: v.optional(v.id("branches")),
    kind: v.string(),
    title: v.string(),
    body: v.string(),
    href: v.string(),
    dedupeKey: v.string(),
    readAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_recipient_created", ["recipientUserId", "createdAt"])
    .index("by_recipient_dedupe", ["recipientUserId", "dedupeKey"]),

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
    marketingOptIn: v.optional(v.boolean()),
    marketingPreferenceStatus: v.optional(customerMarketingPreferenceStatus),
    marketingPreferenceSource: v.optional(customerMarketingPreferenceSource),
    marketingPreferenceChangedAt: v.optional(v.number()),
    marketingPreferenceWordingVersion: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_public_id", ["publicId"]),

  // Global, append-only member preference history. A consumer profile is not
  // tenant-owned, so this intentionally has no organizationId.
  customerMarketingPreferenceEvents: defineTable({
    userId: v.string(),
    customerProfileId: v.string(),
    optedIn: v.boolean(),
    status: v.optional(customerMarketingPreferenceStatus),
    source: customerMarketingPreferenceSource,
    wordingVersion: v.string(),
    changedAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_profile", ["customerProfileId"]),

  // Durable outbound-message queue. Live delivery is separately gated by a
  // global kill switch and tenant/message-type settings. Applications may be
  // queued before a tenant exists, hence the optional organization reference.
  operationalEmailDeliveries: defineTable({
    publicId: v.string(),
    organizationId: v.optional(v.id("organizations")),
    branchId: v.optional(v.id("branches")),
    kind: v.string(),
    messageClass: v.union(v.literal("service"), v.literal("marketing")),
    templateVersion: v.string(),
    language: v.union(v.literal("en"), v.literal("ar")),
    recipientReference: v.string(),
    recipientEmail: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityPublicId: v.optional(v.string()),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    dedupeKey: v.string(),
    providerId: v.optional(v.string()),
    providerEventAt: v.optional(v.number()),
    attempts: v.array(v.object({ attemptedAt: v.number(), outcome: v.union(v.literal("accepted"), v.literal("retryable_failure"), v.literal("terminal_failure")), statusCode: v.optional(v.number()), errorCode: v.optional(v.string()) })),
    status: v.union(v.literal("queued"), v.literal("leased"), v.literal("provider_accepted"), v.literal("delivered"), v.literal("retrying"), v.literal("failed"), v.literal("suppressed")),
    suppressionReason: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_status_next_attempt", ["status", "nextAttemptAt"])
    .index("by_provider_id", ["providerId"])
    .index("by_related_entity", ["relatedEntityType", "relatedEntityPublicId"])
    .index("by_organization_created", ["organizationId", "createdAt"]),

  operationalEmailSettings: defineTable({
    organizationId: v.id("organizations"),
    enabledKinds: v.array(v.string()),
    updatedByUserId: v.id("users"),
    reason: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  operationalEmailWebhookEvents: defineTable({
    webhookId: v.string(),
    providerId: v.optional(v.string()),
    eventType: v.string(),
    occurredAt: v.number(),
    receivedAt: v.number(),
  }).index("by_webhook_id", ["webhookId"]),

  marketingPreferenceMigrations: defineTable({
    publicId: v.string(),
    status: v.union(v.literal("previewed"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    previewCount: v.number(),
    processedCount: v.number(),
    failedCount: v.number(),
    cursor: v.optional(v.string()),
    startedByUserId: v.id("users"),
    correlationId: v.string(),
    reason: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_created", ["createdAt"]),

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

  ptTrainerProfiles: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    userId: v.id("users"),
    displayName: v.string(),
    bioEn: v.optional(v.string()),
    bioAr: v.optional(v.string()),
    specialties: v.array(v.string()),
    languages: v.array(v.union(v.literal("en"), v.literal("ar"))),
    branchIds: v.array(v.id("branches")),
    photoAssetId: v.optional(v.string()),
    photoAlt: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_user", ["organizationId", "userId"]),

  ptAvailabilityRules: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    trainerProfileId: v.id("ptTrainerProfiles"),
    branchId: v.id("branches"),
    weekday: v.union(v.literal("sun"), v.literal("mon"), v.literal("tue"), v.literal("wed"), v.literal("thu"), v.literal("fri"), v.literal("sat")),
    startMinute: v.number(),
    endMinute: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_trainer", ["trainerProfileId"])
    .index("by_trainer_weekday", ["trainerProfileId", "weekday"])
    .index("by_branch_weekday", ["branchId", "weekday"]),

  ptAvailabilityExceptions: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    trainerProfileId: v.id("ptTrainerProfiles"),
    branchId: v.id("branches"),
    date: v.string(),
    startMinute: v.optional(v.number()),
    endMinute: v.optional(v.number()),
    reason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_trainer_date", ["trainerProfileId", "date"])
    .index("by_branch_date", ["branchId", "date"]),

  ptPackages: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    name: v.string(),
    sessionCount: v.union(v.literal(12), v.literal(20), v.literal(30)),
    totalPriceMinor: v.number(),
    currency: v.string(),
    validityDays: v.number(),
    branchAccess: v.union(v.literal("all"), v.literal("selected")),
    branchIds: v.array(v.id("branches")),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_status", ["organizationId", "status"]),

  ptPackageOrders: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    memberPublicId: v.string(),
    membershipPublicId: v.string(),
    packageId: v.id("ptPackages"),
    chargePublicId: v.string(),
    status: v.union(v.literal("pending_payment"), v.literal("active"), v.literal("partially_refunded"), v.literal("refunded"), v.literal("cancelled")),
    entitlementId: v.optional(v.id("ptEntitlements")),
    paidAt: v.optional(v.number()),
    refundedSessions: v.optional(v.number()),
    refundedMinor: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_member", ["organizationId", "memberPublicId"])
    .index("by_charge", ["organizationId", "chargePublicId"]),

  ptEntitlements: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    memberPublicId: v.string(),
    source: v.union(v.literal("included"), v.literal("package"), v.literal("manual")),
    grantKind: v.optional(v.union(v.literal("introductory"), v.literal("manual_adjustment"))),
    membershipPublicId: v.optional(v.string()),
    packageOrderId: v.optional(v.id("ptPackageOrders")),
    granted: v.number(),
    reserved: v.number(),
    consumed: v.number(),
    revoked: v.number(),
    startsAt: v.optional(v.number()),
    expiresAt: v.number(),
    status: v.union(v.literal("active"), v.literal("expired"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_member", ["organizationId", "memberPublicId"])
    .index("by_membership", ["organizationId", "membershipPublicId"])
    .index("by_expiry", ["organizationId", "status", "expiresAt"]),

  ptCreditLedger: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    entitlementId: v.id("ptEntitlements"),
    memberPublicId: v.string(),
    bookingPublicId: v.optional(v.string()),
    type: v.union(v.literal("grant"), v.literal("reserve"), v.literal("release"), v.literal("consume"), v.literal("expire"), v.literal("refund_revoke"), v.literal("adjustment")),
    quantity: v.number(),
    reason: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    occurredAt: v.number(),
  })
    .index("by_entitlement", ["entitlementId", "occurredAt"])
    .index("by_organization_member", ["organizationId", "memberPublicId", "occurredAt"])
    .index("by_booking", ["organizationId", "bookingPublicId"]),

  ptBookings: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    memberPublicId: v.string(),
    membershipPublicId: v.string(),
    trainerProfileId: v.id("ptTrainerProfiles"),
    branchId: v.id("branches"),
    entitlementId: v.id("ptEntitlements"),
    startsAt: v.number(),
    endsAt: v.number(),
    status: v.union(v.literal("reserved"), v.literal("confirmed"), v.literal("completed"), v.literal("cancelled"), v.literal("late_cancelled"), v.literal("no_show"), v.literal("gym_cancelled")),
    cancellationReason: v.optional(v.string()),
    outcomeReason: v.optional(v.string()),
    bookedByUserId: v.optional(v.id("users")),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_trainer_start", ["trainerProfileId", "startsAt"])
    .index("by_member_start", ["organizationId", "memberPublicId", "startsAt"])
    .index("by_branch_start", ["branchId", "startsAt"])
    .index("by_status_start", ["status", "startsAt"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_idempotency", ["organizationId", "idempotencyKey"]),

  mediaAssets: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    ownerType: v.union(v.literal("gym_logo"), v.literal("gym_cover"), v.literal("gym_gallery"), v.literal("trainer_photo"), v.literal("member_photo")),
    ownerPublicId: v.string(),
    storageId: v.id("_storage"),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp")),
    sizeBytes: v.number(),
    altText: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("private")),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("replaced"), v.literal("scheduled_for_deletion")),
    deleteAfter: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_owner", ["organizationId", "ownerType", "ownerPublicId"])
    .index("by_cleanup", ["status", "deleteAfter"]),

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
    actorRole: auditActorRole,
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
