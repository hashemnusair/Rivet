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

// Workspace keys are code-owned. Keeping the storage contract closed prevents
// an arbitrary database value from becoming a routable capability.
const workspaceModuleKey = v.union(
  v.literal("foundation"),
  v.literal("revenue"),
  v.literal("operations"),
  v.literal("finance"),
  v.literal("reporting"),
);

const brandPaletteKey = v.union(
  v.literal("rivet"),
  v.literal("gold"),
  v.literal("red"),
  v.literal("green"),
  v.literal("blue"),
  v.literal("violet"),
);

const zoneKind = v.union(
  v.literal("floor"),
  v.literal("studio"),
  v.literal("weights"),
  v.literal("cardio"),
  v.literal("functional"),
  v.literal("locker_room"),
  v.literal("bathroom"),
  v.literal("reception"),
  v.literal("storage"),
  v.literal("other"),
);

const operationsRecordStatus = v.union(v.literal("active"), v.literal("archived"));
const productUnit = v.union(v.literal("each"), v.literal("kg"), v.literal("liter"), v.literal("box"), v.literal("serving"));
const financialPostingStatus = v.union(v.literal("not_posted"), v.literal("pending"), v.literal("posted"), v.literal("failed"), v.literal("reversed"));
const stockMovementType = v.union(v.literal("receive"), v.literal("sale"), v.literal("consumption"), v.literal("adjustment"), v.literal("return"), v.literal("transfer_in"), v.literal("transfer_out"), v.literal("waste"));
const purchaseOrderStatus = v.union(v.literal("draft"), v.literal("approved"), v.literal("partially_received"), v.literal("received"), v.literal("cancelled"));
const facilityTaskKind = v.union(v.literal("cleaning"), v.literal("inspection"), v.literal("incident"));
const facilityTaskSeverity = v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"));
const facilityTaskStatus = v.union(v.literal("open"), v.literal("in_progress"), v.literal("blocked"), v.literal("completed"), v.literal("cancelled"));
const equipmentAssetStatus = v.union(v.literal("active"), v.literal("maintenance"), v.literal("retired"), v.literal("replaced"));
const equipmentIssueSeverity = v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical"));
const equipmentIssueStatus = v.union(v.literal("open"), v.literal("in_progress"), v.literal("resolved"), v.literal("cancelled"));
const equipmentWorkOrderStatus = v.union(v.literal("draft"), v.literal("approved"), v.literal("in_progress"), v.literal("completed"), v.literal("cancelled"));
const safetyStatus = v.union(v.literal("unknown"), v.literal("safe_to_operate"), v.literal("out_of_service"));

// Accounting is a management-accounting projection over authoritative
// operational facts. These unions are intentionally code-owned: an account
// or statement grouping cannot be invented by a tenant request.
const accountingAccountType = v.union(v.literal("asset"), v.literal("liability"), v.literal("equity"), v.literal("revenue"), v.literal("expense"));
const accountingStatementGroup = v.union(
  v.literal("asset_current"),
  v.literal("asset_noncurrent"),
  v.literal("liability_current"),
  v.literal("liability_noncurrent"),
  v.literal("equity"),
  v.literal("revenue"),
  v.literal("cost_of_sales"),
  v.literal("operating_expense"),
  v.literal("other_income"),
  v.literal("other_expense"),
);
const accountingCashflowGroup = v.union(v.literal("operating"), v.literal("investing"), v.literal("financing"), v.literal("non_cash"));
const accountingNormalBalance = v.union(v.literal("debit"), v.literal("credit"));
const accountingPeriodStatus = v.union(v.literal("open"), v.literal("closed"));
const accountingScope = v.union(v.literal("branch"), v.literal("consolidated"));
const accountingEntryStatus = v.union(v.literal("posted"), v.literal("reversed"));
const accountingPolicyStatus = v.union(v.literal("active"), v.literal("retired"));
const accountingSourceType = v.union(
  v.literal("payment"),
  v.literal("refund"),
  v.literal("void"),
  v.literal("membership_sale"),
  v.literal("membership_renewal"),
  v.literal("membership_revenue_recognition"),
  v.literal("purchase_order_receipt"),
  v.literal("stock_movement"),
  v.literal("facility_supplies"),
  v.literal("equipment_acquisition"),
  v.literal("equipment_depreciation"),
  v.literal("equipment_repair"),
);
const accountingSourceStatus = v.union(v.literal("pending"), v.literal("posted"), v.literal("unconfigured"), v.literal("excluded"), v.literal("failed"), v.literal("reversed"));
const accountingPostingDecisionStatus = v.union(v.literal("unconfigured"), v.literal("excluded"));

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
    subscriptionPlan: v.optional(v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"), v.literal("Enterprise"))),
    billingInterval: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
    subscriptionStartedAt: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    subscriptionStatusReason: v.optional(v.string()),
    // Platform archive markers are authoritative lifecycle facts. Archiving
    // suspends access but intentionally leaves all tenant records intact.
    archivedAt: v.optional(v.number()),
    archiveReason: v.optional(v.string()),
    archivedByUserId: v.optional(v.id("users")),
    clerkOrganizationId: v.optional(v.string()),
    timezone: v.string(),
    currency: v.string(),
    locale: v.optional(v.string()),
    phoneCountryCallingCode: v.optional(v.string()),
    defaultLanguage: v.optional(v.union(v.literal("en"), v.literal("ar"))),
    taxRatePercent: v.optional(v.number()),
    receiptPrefix: v.optional(v.string()),
    nextReceiptNumber: v.optional(v.number()),
    receiptFooter: v.optional(v.string()),
    // Tenant dashboard branding is deliberately separate from the public
    // profile's accent. Only server-validated values are stored here.
    brandLogoAssetId: v.optional(v.string()),
    brandPaletteKey: v.optional(brandPaletteKey),
    brandPrimaryColor: v.optional(v.string()),
    brandVersion: v.optional(v.number()),
    brandUpdatedAt: v.optional(v.number()),
    brandUpdatedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_public_id", ["publicId"]),

  // Entitlements are derived and written by server/platform subscription
  // workflows. Gym owners can never submit an entitled-module list.
  organizationEntitlements: defineTable({
    organizationId: v.id("organizations"),
    catalogVersion: v.number(),
    subscriptionPlan: v.optional(v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"), v.literal("Enterprise"))),
    entitledModules: v.array(workspaceModuleKey),
    source: v.union(v.literal("subscription_plan"), v.literal("legacy_default")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

  // Preferences are a separate tenant-owned record. They may only disable
  // modules the organization is entitled to, and only its owner may change
  // them. Historical records remain in this table; no route silently deletes
  // data when a module is disabled.
  workspaceModulePreferences: defineTable({
    organizationId: v.id("organizations"),
    catalogVersion: v.number(),
    enabledModules: v.array(workspaceModuleKey),
    updatedByUserId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organization", ["organizationId"]),

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

  zones: defineTable({
    organizationId: v.id("organizations"),
    branchId: v.id("branches"),
    publicId: v.string(),
    code: v.string(),
    name: v.string(),
    nameAr: v.optional(v.string()),
    kind: zoneKind,
    capacity: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch", ["organizationId", "branchId"])
    .index("by_branch_code", ["organizationId", "branchId", "code"])
    .index("by_public_id", ["organizationId", "publicId"]),

  // Typed daily-operations records. These are intentionally separate from
  // domainRecords so stock, facilities, equipment, and supplier history have
  // durable indexes and cannot be silently overwritten by a generic payload.
  products: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    unit: productUnit,
    reorderPoint: v.number(),
    // Deprecated migration-only fields. New writes never populate these;
    // keeping optional validators lets existing production documents pass
    // schema validation while normal product edits remove them gradually.
    targetLevel: v.optional(v.number()),
    supplierLeadTimeDays: v.optional(v.number()),
    defaultUnitCostMinor: v.optional(v.number()),
    defaultUnitCostCurrency: v.optional(v.string()),
    preferredSupplierId: v.optional(v.string()),
    // Customer-facing price used by checkout. Purchase-order line costs are
    // stored on the order itself and are never copied into the product master.
    retailPriceMinor: v.optional(v.number()),
    retailPriceCurrency: v.optional(v.string()),
    status: operationsRecordStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_sku", ["organizationId", "sku"])
    .index("by_public_id", ["organizationId", "publicId"]),

  // Permanent product-master deletion removes only the mutable catalog row.
  // This identity snapshot keeps old stock movements, purchase orders, and
  // retail-sale returns explainable while allowing the SKU to be reused.
  productTombstones: defineTable({
    organizationId: v.id("organizations"),
    productPublicId: v.string(),
    originalProductId: v.string(),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    unit: productUnit,
    // Deprecated migration-only fields retained for old tombstones. They are
    // never exposed or written by the active API.
    defaultUnitCostMinor: v.optional(v.number()),
    defaultUnitCostCurrency: v.optional(v.string()),
    retailPriceMinor: v.optional(v.number()),
    retailPriceCurrency: v.optional(v.string()),
    deletedAt: v.number(),
    deletedByUserId: v.id("users"),
    reason: v.string(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_public_id", ["organizationId", "productPublicId"])
    .index("by_organization_sku", ["organizationId", "sku"]),

  suppliers: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    name: v.string(),
    contactName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    terms: v.optional(v.string()),
    // Deprecated migration-only field; supplier delivery time is no longer a
    // supported setting and is never exposed or written by the active API.
    leadTimeDays: v.optional(v.number()),
    branchIds: v.array(v.id("branches")),
    preferredProductIds: v.array(v.string()),
    status: operationsRecordStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_public_id", ["organizationId", "publicId"]),

  inventoryBalances: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    productId: v.id("products"),
    quantityOnHand: v.number(),
    committedQuantity: v.number(),
    // Exact moving-average valuation for quantityOnHand. Optional for legacy
    // rows; new stock mutations materialize it when cost evidence exists.
    totalCostMinor: v.optional(v.number()),
    totalCostCurrency: v.optional(v.string()),
    // Normal balances are sellable by default for backwards compatibility
    // with rows written before this field existed. Balances created for a
    // deleted product are retained only as historical tombstone evidence and
    // explicitly set this to false so returned units can never be sold again.
    sellable: v.optional(v.boolean()),
    lastMovementAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch", ["organizationId", "branchId"])
    .index("by_branch_product", ["organizationId", "branchId", "productId"])
    .index("by_public_id", ["organizationId", "publicId"]),

  stockMovements: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    productId: v.id("products"),
    // Product identity is snapshotted on every new movement so the audit
    // trail stays readable after the catalog row is permanently removed.
    productSku: v.optional(v.string()),
    productName: v.optional(v.string()),
    productUnit: v.optional(productUnit),
    type: stockMovementType,
    quantityDelta: v.number(),
    quantity: v.number(),
    unitCostMinor: v.optional(v.number()),
    unitCostCurrency: v.optional(v.string()),
    // Unit cost can be fractional when an exact total is allocated across
    // whole units. Keep the exact integer total for reconciliation.
    totalCostMinor: v.optional(v.number()),
    totalCostCurrency: v.optional(v.string()),
    reason: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.string(),
    financialPostingStatus,
    financialSourceId: v.optional(v.string()),
    occurredAt: v.number(),
    createdAt: v.number(),
    createdByUserId: v.id("users"),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch_product_occurred", ["organizationId", "branchId", "productId", "occurredAt"])
    .index("by_product_occurred", ["organizationId", "productId", "occurredAt"])
    .index("by_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_public_id", ["organizationId", "publicId"]),

  inventoryTransfers: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    sourceBranchId: v.id("branches"),
    destinationBranchId: v.id("branches"),
    productId: v.id("products"),
    quantity: v.number(),
    reason: v.string(),
    status: v.literal("completed"),
    sourceMovementId: v.string(),
    destinationMovementId: v.string(),
    totalCostMinor: v.optional(v.number()),
    totalCostCurrency: v.optional(v.string()),
    sourceAvailableBefore: v.number(),
    destinationAvailableBefore: v.number(),
    sourceAvailableAfter: v.number(),
    destinationAvailableAfter: v.number(),
    idempotencyKey: v.string(),
    createdByUserId: v.id("users"),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_public_id", ["organizationId", "publicId"])
    .index("by_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_source_occurred", ["organizationId", "sourceBranchId", "occurredAt"])
    .index("by_destination_occurred", ["organizationId", "destinationBranchId", "occurredAt"]),

  // Retail sales are kept separate from membership payments. The line and
  // customer snapshots make a printed receipt explainable even if a product
  // is later archived or a guest never becomes a member.
  retailSales: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    receiptId: v.string(),
    receiptNumber: v.string(),
    memberId: v.optional(v.string()),
    customer: v.object({
      kind: v.union(v.literal("member"), v.literal("guest")),
      fullName: v.string(),
      phone: v.optional(v.string()),
      memberId: v.optional(v.string()),
      memberNumber: v.optional(v.string()),
    }),
    lines: v.array(v.object({
      productId: v.string(),
      sku: v.string(),
      productName: v.string(),
      quantity: v.number(),
      unitPriceMinor: v.number(),
      lineTotalMinor: v.number(),
      currency: v.string(),
      // Moving-average cost captured at checkout. This is an internal
      // accounting snapshot; it is intentionally independent from the
      // customer-facing retail price and product master.
      unitCostMinor: v.optional(v.number()),
      unitCostCurrency: v.optional(v.string()),
    })),
    subtotalMinor: v.number(),
    totalMinor: v.number(),
    currency: v.string(),
    status: v.union(v.literal("completed"), v.literal("partially_refunded"), v.literal("refunded"), v.literal("voided")),
    refundedMinor: v.optional(v.number()),
    returnedLines: v.optional(v.array(v.object({ productId: v.string(), quantity: v.number() }))),
    refundReason: v.optional(v.string()),
    voidReason: v.optional(v.string()),
    voidedAt: v.optional(v.number()),
    method: v.union(v.literal("cash"), v.literal("cliq"), v.literal("card")),
    externalReference: v.optional(v.string()),
    shiftId: v.optional(v.string()),
    idempotencyKey: v.string(),
    createdByUserId: v.id("users"),
    createdByPublicId: v.string(),
    createdByName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_public_id", ["organizationId", "publicId"])
    .index("by_receipt", ["organizationId", "receiptId"])
    .index("by_idempotency", ["organizationId", "idempotencyKey"]),

  inventoryAlerts: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    productId: v.id("products"),
    status: v.union(v.literal("open"), v.literal("dismissed")),
    dismissedAt: v.optional(v.number()),
    dismissedReason: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch_product", ["organizationId", "branchId", "productId"])
    .index("by_public_id", ["organizationId", "publicId"]),

  purchaseOrders: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    sourceType: v.optional(v.union(v.literal("supplier"), v.literal("private"))),
    supplierId: v.optional(v.id("suppliers")),
    supplierName: v.string(),
    lines: v.array(v.object({
      productId: v.id("products"),
      sku: v.string(),
      productName: v.string(),
      orderedQuantity: v.number(),
      receivedQuantity: v.number(),
      unitCostMinor: v.number(),
      unitCostCurrency: v.string(),
      lineTotalMinor: v.number(),
    })),
    status: purchaseOrderStatus,
    currency: v.string(),
    totalMinor: v.number(),
    supplierInvoiceReference: v.optional(v.string()),
    notes: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    approvedByUserId: v.optional(v.id("users")),
    receivedAt: v.optional(v.number()),
    // Accounting owns the posting state; operations can only expose the
    // current projection and never accept a client-supplied posted marker.
    financialPostingStatus: v.optional(financialPostingStatus),
    financialSourceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch_status", ["organizationId", "branchId", "status"])
    .index("by_public_id", ["organizationId", "publicId"]),

  classSessions: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    name: v.string(),
    coachUserId: v.optional(v.string()),
    coachName: v.optional(v.string()),
    /** Weekly template slot: 0 = Sunday … 6 = Saturday. Legacy rows carry a
     * dated startsAt instead and are normalized on read. */
    dayOfWeek: v.optional(v.number()),
    startMinute: v.optional(v.number()),
    audience: v.optional(v.union(v.literal("mixed"), v.literal("women"), v.literal("men"))),
    startsAt: v.optional(v.number()),
    durationMinutes: v.number(),
    capacity: v.number(),
    imageAssetId: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("scheduled"), v.literal("cancelled")),
    cancelReason: v.optional(v.string()),
    roster: v.array(v.object({ memberId: v.string(), name: v.string(), bookedAt: v.number(), attended: v.boolean() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch", ["organizationId", "branchId"])
    .index("by_branch_start", ["organizationId", "branchId", "startsAt"])
    .index("by_public_id", ["organizationId", "publicId"]),

  /** A dated snapshot of one weekly class template. Occurrences are created
   * lazily on the first booking or staff action so an empty timetable does
   * not generate unbounded records. */
  classOccurrences: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    templateId: v.id("classSessions"),
    templatePublicId: v.string(),
    branchId: v.id("branches"),
    date: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    name: v.string(),
    regularCoachId: v.optional(v.string()),
    regularCoachName: v.optional(v.string()),
    coachId: v.optional(v.string()),
    coachName: v.optional(v.string()),
    substitutionReason: v.optional(v.string()),
    capacity: v.number(),
    audience: v.union(v.literal("mixed"), v.literal("women"), v.literal("men")),
    imageAssetId: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.union(v.literal("scheduled"), v.literal("cancelled"), v.literal("completed")),
    cancelReason: v.optional(v.string()),
    attendanceFinalizedAt: v.optional(v.number()),
    attendanceFinalizedBy: v.optional(v.string()),
    payRateMinor: v.optional(v.number()),
    payCurrency: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_public_id", ["organizationId", "publicId"])
    .index("by_template_date", ["organizationId", "templateId", "date"])
    .index("by_branch_start", ["organizationId", "branchId", "startsAt"])
    .index("by_coach_start", ["organizationId", "coachId", "startsAt"]),

  classBookings: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    occurrenceId: v.id("classOccurrences"),
    occurrencePublicId: v.string(),
    templatePublicId: v.string(),
    branchId: v.id("branches"),
    memberPublicId: v.string(),
    membershipPublicId: v.string(),
    memberName: v.string(),
    startsAt: v.number(),
    status: v.union(v.literal("booked"), v.literal("waitlisted"), v.literal("cancelled"), v.literal("late_cancelled"), v.literal("attended"), v.literal("no_show")),
    bookedAt: v.number(),
    waitlistedAt: v.optional(v.number()),
    promotedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    fromWaitlist: v.boolean(),
    bookedBy: v.union(v.literal("member"), v.literal("staff")),
    bookedByUserPublicId: v.string(),
    overrideReason: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_public_id", ["organizationId", "publicId"])
    .index("by_occurrence", ["organizationId", "occurrenceId"])
    .index("by_occurrence_member", ["organizationId", "occurrenceId", "memberPublicId"])
    .index("by_branch_start", ["organizationId", "branchId", "startsAt"])
    .index("by_member_start", ["organizationId", "memberPublicId", "startsAt"])
    .index("by_membership_start", ["organizationId", "membershipPublicId", "startsAt"]),

  /** Small projection updated only when attendance is finalized. This keeps
   * the staff-visible member no-show count cheap without scanning booking
   * history for every roster row. */
  classMemberStats: defineTable({
    organizationId: v.id("organizations"),
    memberPublicId: v.string(),
    noShowCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_member", ["organizationId", "memberPublicId"]),

  facilityTasks: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    zoneId: v.id("zones"),
    kind: facilityTaskKind,
    severity: facilityTaskSeverity,
    status: facilityTaskStatus,
    title: v.string(),
    notes: v.optional(v.string()),
    assigneeId: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    trafficContext: v.optional(v.object({ checkInsLastHour: v.optional(v.number()), occupancyPercent: v.optional(v.number()), capturedAt: v.optional(v.number()) })),
    suppliesCostMinor: v.optional(v.number()),
    suppliesCostCurrency: v.optional(v.string()),
    financialPostingStatus,
    financialSourceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_branch_status", ["organizationId", "branchId", "status"])
    .index("by_zone", ["organizationId", "zoneId"])
    .index("by_public_id", ["organizationId", "publicId"]),

  equipmentAssets: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    zoneId: v.optional(v.id("zones")),
    code: v.string(),
    name: v.string(),
    manufacturer: v.optional(v.string()),
    model: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    installationDate: v.optional(v.string()),
    purchaseCostMinor: v.optional(v.number()),
    purchaseCostCurrency: v.optional(v.string()),
    warrantyEndDate: v.optional(v.string()),
    status: equipmentAssetStatus,
    expectedServiceIntervalDays: v.optional(v.number()),
    expectedUsefulLifeMonths: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_branch", ["organizationId", "branchId"])
    .index("by_branch_code", ["organizationId", "branchId", "code"])
    .index("by_public_id", ["organizationId", "publicId"]),

  equipmentIssues: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    assetId: v.id("equipmentAssets"),
    title: v.string(),
    description: v.optional(v.string()),
    severity: equipmentIssueSeverity,
    status: equipmentIssueStatus,
    reportedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    downtimeDays: v.optional(v.number()),
    safetyStatus,
    createdByUserId: v.id("users"),
  })
    .index("by_organization", ["organizationId"])
    .index("by_asset", ["organizationId", "assetId", "reportedAt"])
    .index("by_branch_status", ["organizationId", "branchId", "status"])
    .index("by_public_id", ["organizationId", "publicId"]),

  equipmentWorkOrders: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.id("branches"),
    assetId: v.id("equipmentAssets"),
    issueId: v.optional(v.id("equipmentIssues")),
    status: equipmentWorkOrderStatus,
    description: v.string(),
    assigneeId: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    partsCostMinor: v.optional(v.number()),
    laborCostMinor: v.optional(v.number()),
    totalCostMinor: v.optional(v.number()),
    replacementEstimateMinor: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
    financialPostingStatus,
    financialSourceId: v.optional(v.string()),
    openedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_asset", ["organizationId", "assetId", "openedAt"])
    .index("by_branch_status", ["organizationId", "branchId", "status"])
    .index("by_public_id", ["organizationId", "publicId"]),

  // Code-owned chart metadata. Account rows are seeded lazily for legacy
  // tenants and during provisioning for new tenants; no balance is ever
  // created as part of chart seeding.
  accountingAccounts: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    code: v.string(),
    name: v.string(),
    nameAr: v.optional(v.string()),
    accountType: accountingAccountType,
    statementGroup: accountingStatementGroup,
    cashflowGroup: accountingCashflowGroup,
    normalBalance: accountingNormalBalance,
    active: v.boolean(),
    isSystem: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_code", ["organizationId", "code"])
    .index("by_organization_public_id", ["organizationId", "publicId"]),

  accountingPeriods: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    status: accountingPeriodStatus,
    closedAt: v.optional(v.number()),
    closedByUserId: v.optional(v.id("users")),
    closeReason: v.optional(v.string()),
    reopenedAt: v.optional(v.number()),
    reopenedByUserId: v.optional(v.id("users")),
    reopenReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_start", ["organizationId", "periodStart"])
    .index("by_organization_public_id", ["organizationId", "publicId"]),

  accountingPostingPolicies: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    policyCode: v.string(),
    sourceType: accountingSourceType,
    version: v.number(),
    status: accountingPolicyStatus,
    debitAccountCode: v.string(),
    creditAccountCode: v.string(),
    recognition: v.union(v.literal("immediate"), v.literal("deferred"), v.literal("excluded")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_code", ["organizationId", "policyCode", "version"])
    .index("by_organization_source", ["organizationId", "sourceType", "status"]),

  accountingJournalEntries: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.optional(v.id("branches")),
    scope: accountingScope,
    currency: v.string(),
    postingDate: v.string(),
    accountingPeriodId: v.id("accountingPeriods"),
    status: accountingEntryStatus,
    memo: v.string(),
    reason: v.optional(v.string()),
    sourceType: v.optional(accountingSourceType),
    sourcePublicId: v.optional(v.string()),
    policyCode: v.optional(v.string()),
    policyVersion: v.optional(v.number()),
    idempotencyKey: v.string(),
    // Canonical request payload used to reject material idempotency-key reuse.
    requestFingerprint: v.optional(v.string()),
    reversalOfEntryPublicId: v.optional(v.string()),
    reversedByEntryPublicId: v.optional(v.string()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
    postedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_period", ["organizationId", "accountingPeriodId"])
    .index("by_organization_branch_date", ["organizationId", "branchId", "postingDate"])
    .index("by_organization_source", ["organizationId", "sourceType", "sourcePublicId"])
    .index("by_organization_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_organization_public_id", ["organizationId", "publicId"]),

  accountingJournalLines: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    journalEntryId: v.id("accountingJournalEntries"),
    branchId: v.optional(v.id("branches")),
    accountId: v.id("accountingAccounts"),
    accountCode: v.string(),
    accountName: v.string(),
    debitMinor: v.number(),
    creditMinor: v.number(),
    description: v.optional(v.string()),
    statementGroup: accountingStatementGroup,
    cashflowGroup: accountingCashflowGroup,
    createdAt: v.number(),
  })
    .index("by_entry", ["organizationId", "journalEntryId"])
    .index("by_organization_account", ["organizationId", "accountCode"])
    .index("by_organization_branch_account", ["organizationId", "branchId", "accountCode"]),

  // This is the source-of-truth projection for whether an operational fact
  // has an accounting treatment. Unsupported or incomplete facts remain
  // explicit rows; they are never silently treated as zero or posted.
  accountingSourcePostings: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    sourceType: accountingSourceType,
    sourcePublicId: v.string(),
    branchId: v.optional(v.id("branches")),
    status: accountingSourceStatus,
    amountMinor: v.optional(v.number()),
    currency: v.string(),
    policyCode: v.optional(v.string()),
    policyVersion: v.optional(v.number()),
    journalEntryPublicId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    reason: v.optional(v.string()),
    details: v.optional(v.any()),
    // Fingerprint of the authoritative source fact used to build this queue
    // row. It lets reports distinguish a current empty/complete scan from a
    // stale projection without mutating posted source decisions.
    projectionFingerprint: v.optional(v.string()),
    occurredAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_source", ["organizationId", "sourceType", "sourcePublicId"])
    .index("by_organization_status", ["organizationId", "status"])
    .index("by_organization_branch_status", ["organizationId", "branchId", "status"])
    .index("by_organization_idempotency", ["organizationId", "idempotencyKey"]),

  // A refresh is itself an auditable coverage fact. An empty run is retained
  // so a report can prove that no in-scope candidates existed at that scan.
  // The candidate digest is compared to current authoritative facts before a
  // report marks coverage proven.
  accountingSourceQueueRuns: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.optional(v.id("branches")),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
    sourceTypes: v.array(accountingSourceType),
    candidateDigest: v.string(),
    candidateCount: v.number(),
    scannedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_scope", ["organizationId", "branchId", "fromDate", "toDate"]),

  // Every failed/excluded source-posting request is retained independently
  // from the mutable per-source queue projection. This preserves replay
  // semantics when a later request for the same source succeeds.
  accountingPostingAttempts: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    sourceType: accountingSourceType,
    sourcePublicId: v.string(),
    sourcePostingPublicId: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
    status: accountingPostingDecisionStatus,
    amountMinor: v.optional(v.number()),
    currency: v.string(),
    policyCode: v.optional(v.string()),
    policyVersion: v.optional(v.number()),
    reason: v.optional(v.string()),
    details: v.optional(v.any()),
    occurredAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization_source_key", ["organizationId", "sourceType", "sourcePublicId", "idempotencyKey"])
    .index("by_organization_idempotency", ["organizationId", "idempotencyKey"])
    .index("by_organization_source", ["organizationId", "sourceType", "sourcePublicId"]),

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

  userSavedViews: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    publicId: v.string(),
    surface: v.union(v.literal("members"), v.literal("leads"), v.literal("customer_finance")),
    name: v.string(),
    state: v.any(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user_surface", ["organizationId", "userId", "surface"]),

  userOnboardingProgress: defineTable({
    userId: v.id("users"),
    organizationId: v.optional(v.id("organizations")),
    audience: v.union(v.literal("owner"), v.literal("staff"), v.literal("member")),
    version: v.number(),
    completedStepKeys: v.array(v.string()),
    dismissedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_audience", ["userId", "audience"])
    .index("by_user_organization_audience", ["userId", "organizationId", "audience"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    publicId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    label: v.string(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user", ["userId"])
    .index("by_user_endpoint", ["userId", "endpoint"]),

  recentWorkspaceItems: defineTable({
    userId: v.id("users"),
    organizationId: v.optional(v.id("organizations")),
    kind: v.union(v.literal("member"), v.literal("lead"), v.literal("receipt"), v.literal("page")),
    entityPublicId: v.string(),
    title: v.string(),
    subtitle: v.optional(v.string()),
    href: v.string(),
    viewedAt: v.number(),
  })
    .index("by_user_organization_viewed", ["userId", "organizationId", "viewedAt"])
    .index("by_user_organization_entity", ["userId", "organizationId", "kind", "entityPublicId"]),

  pinnedWorkspaceItems: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    publicId: v.string(),
    targetKey: v.string(),
    kind: v.union(v.literal("action"), v.literal("saved_view")),
    label: v.string(),
    href: v.string(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user_organization", ["userId", "organizationId"])
    .index("by_user_organization_target", ["userId", "organizationId", "targetKey"]),

  maintenanceState: defineTable({
    key: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed")),
    processedCount: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

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
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"))),
    preferredLanguage: v.optional(v.union(v.literal("en"), v.literal("ar"))),
    addressLine1: v.optional(v.string()),
    city: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactRelationship: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
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

  // Global member-owned profile changes. Gym records receive a synchronized
  // operational copy, while this history remains outside any tenant.
  customerProfileEvents: defineTable({
    userId: v.string(),
    customerProfileId: v.string(),
    changedFields: v.array(v.string()),
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
    ownerConfirmedAt: v.optional(v.number()),
    ownerConfirmedByUserId: v.optional(v.id("users")),
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

  // Provider-neutral renewal journey ledger. A row represents one
  // membership/checkpoint/policy decision, not an optimistic provider send.
  // The first production slice is sandbox-only for SMS/WhatsApp until a
  // channel-specific provider and webhook contract is explicitly enabled.
  renewalDeliveries: defineTable({
    publicId: v.string(),
    organizationId: v.id("organizations"),
    branchId: v.optional(v.id("branches")),
    membershipPublicId: v.string(),
    membershipEndDate: v.string(),
    memberPublicId: v.string(),
    customerUserId: v.optional(v.string()),
    checkpointDaysBefore: v.union(v.literal(14), v.literal(7), v.literal(3), v.literal(1)),
    checkpointKey: v.union(v.literal("14_day"), v.literal("7_day"), v.literal("3_day"), v.literal("1_day_call")),
    channel: v.union(v.literal("whatsapp"), v.literal("sms"), v.literal("staff_task")),
    templateVersion: v.string(),
    policyVersion: v.string(),
    dedupeKey: v.string(),
    recipientReference: v.string(),
    recipientPhone: v.optional(v.string()),
    language: v.union(v.literal("en"), v.literal("ar")),
    consentStatus: v.union(v.literal("explicit_opt_in"), v.literal("explicit_opt_out"), v.literal("unknown"), v.literal("not_applicable")),
    consentSource: v.optional(v.string()),
    consentChangedAt: v.optional(v.number()),
    channelOptedOut: v.boolean(),
    status: v.union(v.literal("deferred"), v.literal("sandboxed"), v.literal("queued"), v.literal("suppressed"), v.literal("cancelled"), v.literal("failed"), v.literal("sent"), v.literal("completed")),
    suppressionReason: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    deferredUntil: v.optional(v.number()),
    taskPublicId: v.optional(v.string()),
    attempts: v.array(v.object({
      attemptedAt: v.number(),
      outcome: v.union(v.literal("accepted"), v.literal("retryable_failure"), v.literal("terminal_failure"), v.literal("suppressed"), v.literal("cancelled")),
      statusCode: v.optional(v.number()),
      errorCode: v.optional(v.string()),
      providerMessageId: v.optional(v.string()),
    })),
    lastAttemptAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_organization", ["organizationId"])
    .index("by_organization_membership", ["organizationId", "membershipPublicId"])
    .index("by_organization_member", ["organizationId", "memberPublicId"])
    .index("by_status_next_attempt", ["status", "nextAttemptAt"]),

  // Renewal decisions are append-only facts. The delivery row is the
  // current projection; this table preserves every system decision without
  // pretending that a sandboxed action reached a member.
  renewalDeliveryEvents: defineTable({
    publicId: v.string(),
    organizationId: v.id("organizations"),
    branchId: v.optional(v.id("branches")),
    deliveryPublicId: v.string(),
    membershipPublicId: v.string(),
    memberPublicId: v.string(),
    eventType: v.union(v.literal("created"), v.literal("deferred"), v.literal("sandboxed"), v.literal("queued"), v.literal("suppressed"), v.literal("cancelled"), v.literal("task_created"), v.literal("completed"), v.literal("provider_attempt")),
    beforeStatus: v.optional(v.string()),
    afterStatus: v.string(),
    reason: v.optional(v.string()),
    details: v.optional(v.any()),
    source: v.literal("system"),
    occurredAt: v.number(),
  })
    .index("by_organization_delivery", ["organizationId", "deliveryPublicId"])
    .index("by_organization_membership", ["organizationId", "membershipPublicId"])
    .index("by_organization_occurred", ["organizationId", "occurredAt"]),

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
    plan: v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"), v.literal("Enterprise")),
    billingInterval: v.optional(v.union(v.literal("monthly"), v.literal("annual"))),
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
    // Provisioning is a resumable workflow around external Clerk calls. These
    // fields are checkpoints, not a second source of tenant lifecycle truth:
    // organization and membership rows remain authoritative once they exist.
    provisioningCheckpoint: v.optional(v.union(v.literal("claimed"), v.literal("organization_recorded"), v.literal("workspace_ready"), v.literal("invitation_recorded"), v.literal("completed"))),
    provisioningOutcome: v.optional(v.union(v.literal("complete"), v.literal("partial"), v.literal("retryable"), v.literal("permanent"))),
    provisioningAttemptCount: v.optional(v.number()),
    provisioningLastCorrelationId: v.optional(v.string()),
    // A lease fences delayed action retries from a newer provisioning attempt.
    provisioningLeaseId: v.optional(v.string()),
    // Keep only bounded provider diagnostics; never persist the Clerk payload.
    provisioningProviderStatus: v.optional(v.number()),
    provisioningProviderCode: v.optional(v.string()),
    provisioningStartedAt: v.optional(v.number()),
    provisioningError: v.optional(v.string()),
    provisionedAt: v.optional(v.number()),
    provisionedOrganizationId: v.optional(v.string()),
    provisionedBranchId: v.optional(v.string()),
    clerkOrganizationId: v.optional(v.string()),
    clerkInvitationId: v.optional(v.string()),
    clerkInvitationStatus: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("expired"), v.literal("failed"))),
  })
    .index("by_application_key", ["applicationKey"])
    .index("by_status", ["status"])
    .index("by_email", ["email"])
    .index("by_public_id", ["publicId"]),

  // Platform decisions sit outside a tenant, so they use their own immutable
  // audit stream rather than being attached to a gym's organization audit log.
  platformAuditEvents: defineTable({
    publicId: v.string(),
    // Automated platform jobs are first-class audit actors but do not
    // impersonate a platform administrator. Human-authored events still
    // provide this user link.
    actorUserId: v.optional(v.id("users")),
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
    clerkInvitationStatus: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("expired"), v.literal("failed"))),
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
    catalogVersion: v.optional(v.number()),
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
    sessionCount: v.number(),
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
    packageNameSnapshot: v.optional(v.string()),
    sessionCountSnapshot: v.optional(v.number()),
    totalPriceMinorSnapshot: v.optional(v.number()),
    currencySnapshot: v.optional(v.string()),
    validityDaysSnapshot: v.optional(v.number()),
    branchAccessSnapshot: v.optional(v.union(v.literal("all"), v.literal("selected"))),
    branchIdsSnapshot: v.optional(v.array(v.id("branches"))),
    status: v.union(v.literal("pending_payment"), v.literal("active"), v.literal("partially_refunded"), v.literal("refunded"), v.literal("cancelled")),
    entitlementId: v.optional(v.id("ptEntitlements")),
    paidAt: v.optional(v.number()),
    refundedSessions: v.optional(v.number()),
    refundedMinor: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
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
    ownerType: v.union(v.literal("gym_logo"), v.literal("gym_cover"), v.literal("gym_gallery"), v.literal("trainer_photo"), v.literal("member_photo"), v.literal("class_image")),
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
    // Tenant-scoped cleanup reads must stay bounded. The legacy by_cleanup
    // index remains for the global scheduled job, while this index lets the
    // upload quota inspect only one organization at a time.
    .index("by_organization_cleanup", ["organizationId", "status", "deleteAfter"])
    .index("by_organization_owner_status", ["organizationId", "ownerType", "status", "deleteAfter"])
    .index("by_cleanup", ["status", "deleteAfter"]),

  // A URL generated by Convex does not expose its eventual storage id until
  // the browser uploads the bytes. Keep a short-lived, tenant-scoped intent so
  // abandoned browser sessions count toward the profile-media quota. The
  // expiry row is not a substitute for provider-side object TTL cleanup: an
  // upload that never reaches storage cannot be deleted by this table.
  mediaUploadIntents: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    correlationId: v.string(),
    ownerType: v.union(v.literal("gym_logo"), v.literal("gym_cover"), v.literal("gym_gallery"), v.literal("trainer_photo"), v.literal("member_photo"), v.literal("class_image")),
    ownerPublicId: v.string(),
    // Bound by the first finalize call after Convex's upload endpoint returns
    // its storage id. Retries must present the same object; a correlation id
    // alone is never sufficient to authorize a commit.
    storageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_organization_expires", ["organizationId", "expiresAt"])
    .index("by_organization_correlation", ["organizationId", "correlationId"])
    .index("by_intent_expiry", ["expiresAt"]),

  domainRecords: defineTable({
    organizationId: v.id("organizations"),
    entityType: v.string(),
    publicId: v.string(),
    branchId: v.optional(v.id("branches")),
    memberPublicId: v.optional(v.string()),
    leadPublicId: v.optional(v.string()),
    customerUserPublicId: v.optional(v.string()),
    customerProfilePublicId: v.optional(v.string()),
    exportExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    data: v.any(),
  })
    .index("by_entity_type", ["entityType"])
    .index("by_entity_type_public_id", ["entityType", "publicId"])
    .index("by_organization_type", ["organizationId", "entityType"])
    .index("by_organization_public_id", ["organizationId", "publicId"])
    .index("by_organization_type_public_id", ["organizationId", "entityType", "publicId"])
    .index("by_organization_branch_type", ["organizationId", "branchId", "entityType"])
    .index("by_organization_member_type", ["organizationId", "memberPublicId", "entityType"])
    .index("by_organization_lead_type", ["organizationId", "leadPublicId", "entityType"])
    .index("by_type_customer_user", ["entityType", "customerUserPublicId"])
    .index("by_type_customer_profile", ["entityType", "customerProfilePublicId"])
    .index("by_type_export_expiry", ["entityType", "exportExpiresAt"]),

  auditEvents: defineTable({
    organizationId: v.id("organizations"),
    publicId: v.string(),
    branchId: v.optional(v.id("branches")),
    destinationBranchId: v.optional(v.id("branches")),
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

  // Public entry points do not have an organization-scoped idempotency row
  // yet. Keep their retry records separate from tenant mutations and retain
  // only the minimum opaque result needed to replay a successful request.
  publicRequestIdempotency: defineTable({
    scope: v.string(),
    key: v.string(),
    requestHash: v.string(),
    result: v.any(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_scope_key", ["scope", "key"])
    .index("by_expires_at", ["expiresAt"]),

  // Bounded, privacy-safe application/user throttling. The fingerprint is a
  // one-way digest; edge/WAF controls remain necessary for IP-level abuse.
  publicRequestGuards: defineTable({
    scope: v.string(),
    fingerprint: v.string(),
    windowStartedAt: v.number(),
    requestCount: v.number(),
    lastRequestAt: v.number(),
  })
    .index("by_scope_fingerprint", ["scope", "fingerprint"])
    .index("by_last_request", ["lastRequestAt"]),

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
