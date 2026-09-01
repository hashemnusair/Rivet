import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  domainError,
  requirePermission,
  requireReason,
  publicBranchId,
  publicOrganizationId,
  publicUserId,
  type ActorContext,
} from "./security";
import { requireWorkspaceModule, resolveWorkspaceEntitlements, resolveWorkspacePreferences } from "./workspaceModules";
import { platformPlanEntitledModules } from "./platformPlanCatalog";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Branch = Doc<"branches">;
type Product = Doc<"products">;
type ProductTombstone = Doc<"productTombstones">;
type Supplier = Doc<"suppliers">;
type InventoryBalance = Doc<"inventoryBalances">;
type StockMovement = Doc<"stockMovements">;
type PurchaseOrder = Doc<"purchaseOrders">;
type FacilityTask = Doc<"facilityTasks">;
type EquipmentAsset = Doc<"equipmentAssets">;
type EquipmentIssue = Doc<"equipmentIssues">;
type EquipmentWorkOrder = Doc<"equipmentWorkOrders">;

const PRODUCT_UNITS = ["each", "kg", "liter", "box", "serving"] as const;
const STOCK_TYPES = ["receive", "sale", "consumption", "adjustment", "return", "transfer_in", "transfer_out", "waste"] as const;
const FACILITY_KINDS = ["cleaning", "inspection", "incident"] as const;
const FACILITY_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const FACILITY_STATUSES = ["open", "in_progress", "blocked", "completed", "cancelled"] as const;
const ASSET_STATUSES = ["active", "maintenance", "retired", "replaced"] as const;
const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const WORK_ORDER_STATUSES = ["draft", "approved", "in_progress", "completed", "cancelled"] as const;
const ISSUE_STATUSES = ["open", "in_progress", "resolved", "cancelled"] as const;
const EQUIPMENT_SAFETY_STATUSES = ["unknown", "safe_to_operate", "out_of_service"] as const;
type OperationalAccountingSourceType = "facility_supplies" | "equipment_acquisition" | "equipment_repair";
type ImmutableAccountingStatus = "posted" | "reversed";

function value(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

function text(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function optionalText(input: unknown): string | undefined {
  const result = text(input).trim();
  return result || undefined;
}

function integer(input: unknown, fallback = 0): number {
  return typeof input === "number" && Number.isSafeInteger(input) ? input : fallback;
}

function finite(input: unknown, fallback = 0): number {
  return typeof input === "number" && Number.isFinite(input) ? input : fallback;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function businessDate(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function money(minor: number | undefined, currency: string | undefined): Data | undefined {
  return minor === undefined || currency === undefined ? undefined : { amount: minor, currency };
}

function requireNonNegativeMoney(input: unknown, currency: string, field: string, correlationId: string): { amount: number; currency: string } | undefined {
  if (input === undefined || input === null) return undefined;
  const raw = value(input);
  const amount = integer(raw.amount, Number.NaN);
  const requestedCurrency = text(raw.currency, currency).trim().toUpperCase();
  if (!Number.isSafeInteger(amount) || amount < 0 || requestedCurrency !== currency) {
    domainError("VALIDATION_ERROR", `${field} must be a non-negative integer amount in ${currency}.`, { correlationId });
  }
  return { amount, currency: requestedCurrency };
}

async function immutableAccountingStatus(
  ctx: ReadContext,
  actor: ActorContext,
  sourceType: OperationalAccountingSourceType,
  sourcePublicId: string,
  projectedStatus?: unknown,
): Promise<ImmutableAccountingStatus | undefined> {
  const projected = optionalText(projectedStatus);
  if (projected === "posted" || projected === "reversed") return projected;
  const source = await ctx.db
    .query("accountingSourcePostings")
    .withIndex("by_organization_source", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", sourceType).eq("sourcePublicId", sourcePublicId))
    .unique();
  return source?.status === "posted" || source?.status === "reversed" ? source.status : undefined;
}

function rejectImmutableAccountingMutation(actor: ActorContext, entityLabel: string, status: ImmutableAccountingStatus): never {
  domainError("CONFLICT", `${entityLabel} is ${status} in accounting and its source facts are immutable. Reverse the posting and create a new version before changing source fields.`, {
    correlationId: actor.correlationId,
    details: { financialPostingStatus: status },
  });
}

function assertOneOf<T extends string>(input: unknown, values: readonly T[], label: string, correlationId: string): T {
  const normalized = text(input);
  if (!values.includes(normalized as T)) domainError("VALIDATION_ERROR", `${label} is invalid.`, { correlationId });
  return normalized as T;
}

export async function requireOperations(ctx: ReadContext, actor: ActorContext): Promise<void> {
  const entitlementRow = await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).unique();
  const preferences = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).unique();
  const catalogSelection = await platformPlanEntitledModules(ctx, actor.organization.subscriptionPlan);
  const entitlements = resolveWorkspaceEntitlements(actor.organization.subscriptionPlan, entitlementRow ? {
    subscriptionPlan: entitlementRow.subscriptionPlan,
    entitledModules: entitlementRow.entitledModules,
    source: entitlementRow.source,
    updatedAt: entitlementRow.updatedAt,
  } : undefined, catalogSelection);
  const resolvedPreferences = resolveWorkspacePreferences(entitlements.entitledModules, preferences ? {
    enabledModules: preferences.enabledModules,
    updatedAt: preferences.updatedAt,
  } : undefined);
  try {
    requireWorkspaceModule("operations", { entitledModules: entitlements.entitledModules, enabledModules: resolvedPreferences.enabledModules });
  } catch {
    domainError("FEATURE_NOT_AVAILABLE", "The operations workspace module is not enabled for this organization.", { correlationId: actor.correlationId, details: { module: "operations" } });
  }
}

export function requireOperationsWrite(actor: ActorContext): void {
  requirePermission(actor, "operations.manage");
  if (actor.role !== "owner" && actor.role !== "manager") domainError("FORBIDDEN", "Only an organization owner or manager can change daily operations records.", { correlationId: actor.correlationId });
}

/**
 * Payment settings are optional in older tenants. When a settings record is
 * present, however, checkout must honour an explicitly disabled method in the
 * same way as membership collection does. A missing method remains enabled
 * for backwards compatibility with pre-settings tenants.
 */
async function requireRetailPaymentMethodEnabled(ctx: ReadContext, actor: ActorContext, method: string): Promise<void> {
  const settings = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "settings").eq("publicId", "settings"))
    .unique();
  const configured = Array.isArray(value(settings?.data).paymentMethods)
    ? value(settings?.data).paymentMethods.map((item: unknown) => value(item)).find((item: Data) => item.key === method)
    : undefined;
  if (configured && configured.enabled === false) {
    domainError("VALIDATION_ERROR", "This payment method is disabled for the gym.", { correlationId: actor.correlationId, fieldErrors: { method: ["Disabled"] } });
  }
}

export async function branchByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Branch> {
  const branch = id
    ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  assertBranchAccess(actor, branch);
  return branch;
}

/**
 * Resolve a branch for an idempotent replay without requiring it to remain
 * active. The caller still has to belong to the same organization and retain
 * branch scope access; only lifecycle validation is deferred until after the
 * replay lookup.
 */
async function transferBranchScope(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Branch> {
  const branch = id
    ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  if (!branch) domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
  if (actor.branchScope === "selected" && !actor.branchIds.includes(branch._id)) {
    domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  }
  return branch;
}

async function transferProductScope(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Product> {
  const product = id
    ? await ctx.db.query("products").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  if (!product) domainError("NOT_FOUND", "Product not found.", { correlationId: actor.correlationId });
  return product;
}

async function visibleBranches(ctx: ReadContext, actor: ActorContext): Promise<Branch[]> {
  const rows = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return rows.filter((branch) => branch.active && (actor.branchScope === "all" || actor.branchIds.includes(branch._id)));
}

async function zoneByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined, branch?: Branch): Promise<Doc<"zones">> {
  const zone = id
    ? await ctx.db.query("zones").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  if (!zone) domainError("NOT_FOUND", "Zone not found.", { correlationId: actor.correlationId });
  const zoneBranch = await ctx.db.get(zone.branchId);
  assertBranchAccess(actor, zoneBranch);
  if (branch && zone.branchId !== branch._id) domainError("VALIDATION_ERROR", "The zone must belong to the selected branch.", { correlationId: actor.correlationId });
  return zone;
}

async function productByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Product> {
  const product = id
    ? await ctx.db.query("products").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  if (!product) domainError("NOT_FOUND", "Product not found.", { correlationId: actor.correlationId });
  return product;
}

async function productTombstoneByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<ProductTombstone | null> {
  if (!id) return null;
  // The index is intentionally non-unique: a product can be deleted, its SKU
  // reused, and that replacement can later be deleted too. Public IDs remain
  // unique per deletion, but do not rely on Convex `.unique()` for a mutable
  // historical table.
  return (await ctx.db.query("productTombstones").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("productPublicId", id)).collect())[0] ?? null;
}

async function productTombstoneMap(ctx: ReadContext, actor: ActorContext): Promise<Map<string, ProductTombstone>> {
  const rows = await ctx.db.query("productTombstones").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return new Map(rows.map((row) => [row.originalProductId, row]));
}

function supplierVisibleToActor(actor: ActorContext, supplier: Supplier): boolean {
  return actor.branchScope === "all" || supplier.branchIds.some((branchId) => actor.branchIds.includes(branchId));
}

async function supplierByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Supplier> {
  const supplier = id
    ? await ctx.db.query("suppliers").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  if (!supplier) domainError("NOT_FOUND", "Supplier not found.", { correlationId: actor.correlationId });
  if (!supplierVisibleToActor(actor, supplier)) domainError("NOT_FOUND", "Supplier not found.", { correlationId: actor.correlationId });
  return supplier;
}

async function assetByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<EquipmentAsset> {
  const asset = id
    ? await ctx.db.query("equipmentAssets").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  if (!asset) domainError("NOT_FOUND", "Equipment asset not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(asset.branchId);
  assertBranchAccess(actor, branch);
  return asset;
}

async function userByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Doc<"users"> | undefined> {
  if (!id) return undefined;
  const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", id)).unique();
  if (!user || user.status === "deactivated") domainError("NOT_FOUND", "Assignee not found.", { correlationId: actor.correlationId });
  const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
  if (!membership || !membership.active) domainError("NOT_FOUND", "Assignee not found.", { correlationId: actor.correlationId });
  return user;
}

export async function audit(ctx: MutationCtx, actor: ActorContext, input: { action: string; entityType: string; entityId: string; entityLabel: string; summary: string; branchId?: string; destinationBranchId?: string; reason?: string; before?: unknown; after?: unknown }): Promise<void> {
  const branch = input.branchId ? await branchByPublicId(ctx, actor, input.branchId) : undefined;
  const destinationBranch = input.destinationBranchId ? await branchByPublicId(ctx, actor, input.destinationBranchId) : undefined;
  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    branchId: branch?._id,
    destinationBranchId: destinationBranch?._id,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "operations",
    action: input.action,
    entityType: input.entityType,
    entityPublicId: input.entityId,
    entityLabel: input.entityLabel,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: actor.correlationId,
    occurredAt: Date.now(),
  });
}

export async function idempotentResult(ctx: MutationCtx, actor: ActorContext, operation: string, key: string, requestHash: string): Promise<Data | undefined> {
  const rows = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", operation).eq("key", key)).collect();
  const now = Date.now();
  // Idempotency records are bounded retention artifacts, not permanent
  // reservations. Remove expired rows at the point of reuse, including old
  // duplicate rows from pre-unique-index deployments, so a retry can safely
  // create a fresh immutable fact without a background job.
  const expired = rows.filter((row) => row.expiresAt !== undefined && row.expiresAt <= now);
  if (expired.length > 0) await Promise.all(expired.map((row) => ctx.db.delete(row._id)));
  const existing = rows.find((row) => !expired.some((stale) => stale._id === row._id));
  if (!existing) return undefined;
  if (existing.requestHash !== requestHash) domainError("CONFLICT", "This idempotency key was already used for a different request.", { correlationId: actor.correlationId });
  return value(existing.result);
}

export async function saveIdempotentResult(ctx: MutationCtx, actor: ActorContext, operation: string, key: string, requestHash: string, result: unknown): Promise<void> {
  await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation, key, requestHash, result, createdAt: Date.now(), expiresAt: Date.now() + 90 * 86_400_000 });
}

function productView(product: Product, organizationId: string): Data {
  return {
    id: product.publicId,
    organizationId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    reorderPoint: product.reorderPoint,
    preferredSupplierId: product.preferredSupplierId,
    retailPrice: money(product.retailPriceMinor, product.retailPriceCurrency),
    status: product.status,
    createdAt: iso(product.createdAt),
    updatedAt: iso(product.updatedAt),
  };
}

function supplierView(supplier: Supplier, organizationId: string, branches: Map<string, string>, visibleBranchIds?: Set<string>): Data {
  return { id: supplier.publicId, organizationId, name: supplier.name, contactName: supplier.contactName, email: supplier.email, phone: supplier.phone, terms: supplier.terms, branchIds: supplier.branchIds.filter((branchId) => !visibleBranchIds || visibleBranchIds.has(String(branchId))).map((branchId) => branches.get(String(branchId))).filter(Boolean), preferredProductIds: supplier.preferredProductIds, status: supplier.status, createdAt: iso(supplier.createdAt), updatedAt: iso(supplier.updatedAt) };
}

function movementView(movement: StockMovement, organizationId: string, branches: Map<string, string>, products: Map<string, string>, tombstones: Map<string, ProductTombstone> = new Map(), createdById = String(movement.createdByUserId)): Data {
  const tombstone = tombstones.get(String(movement.productId));
  const productId = products.get(String(movement.productId)) ?? tombstone?.productPublicId ?? String(movement.productId);
  return { id: movement.publicId, organizationId, branchId: branches.get(String(movement.branchId)) ?? String(movement.branchId), productId, productSku: movement.productSku ?? tombstone?.sku, productName: movement.productName ?? tombstone?.name, productUnit: movement.productUnit ?? tombstone?.unit, type: movement.type, quantityDelta: movement.quantityDelta, quantity: movement.quantity, unitCost: money(movement.unitCostMinor, movement.unitCostCurrency), totalCost: money(movement.totalCostMinor, movement.totalCostCurrency), reason: movement.reason, referenceType: movement.referenceType, referenceId: movement.referenceId, idempotencyKey: movement.idempotencyKey, financialPostingStatus: movement.financialPostingStatus, financialSourceId: movement.financialSourceId, occurredAt: iso(movement.occurredAt), createdAt: iso(movement.createdAt), createdById };
}

async function balanceRow(ctx: ReadContext, organizationId: Id<"organizations">, branchId: Id<"branches">, productId: Id<"products">): Promise<InventoryBalance | null> {
  return await ctx.db.query("inventoryBalances").withIndex("by_branch_product", (q) => q.eq("organizationId", organizationId).eq("branchId", branchId).eq("productId", productId)).unique();
}

async function ensureBalance(ctx: MutationCtx, actor: ActorContext, branchId: Id<"branches">, productId: Id<"products">): Promise<InventoryBalance> {
  const existing = await balanceRow(ctx, actor.organization._id, branchId, productId);
  if (existing) return existing;
  const publicId = `inventory-${String(branchId)}-${String(productId)}`;
  const id = await ctx.db.insert("inventoryBalances", { organizationId: actor.organization._id, publicId, branchId, productId, quantityOnHand: 0, committedQuantity: 0, sellable: true, updatedAt: Date.now() });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Inventory balance could not be created.", { correlationId: actor.correlationId });
  return created;
}

/**
 * Set the selected branch's available quantity through the same immutable
 * movement path used by receiving and checkout. This keeps stock changes
 * auditable and makes the product form safe to retry.
 */
async function setAvailableQuantity(ctx: MutationCtx, actor: ActorContext, branch: Branch, product: Product, requestedAvailable: number): Promise<void> {
  if (product.status !== "active") domainError("CONFLICT", "Archived products cannot have their stock changed.", { correlationId: actor.correlationId });
  const balance = await balanceRow(ctx, actor.organization._id, branch._id, product._id);
  const currentAvailable = balance ? balance.quantityOnHand - balance.committedQuantity : 0;
  const delta = requestedAvailable - currentAvailable;
  if (delta === 0) return;
  if (!Number.isSafeInteger(delta) || !Number.isSafeInteger((balance?.quantityOnHand ?? 0) + delta + (balance?.committedQuantity ?? 0))) {
    domainError("VALIDATION_ERROR", "Available stock is outside the supported range.", { correlationId: actor.correlationId });
  }
  // Include the pre-change balance state in the request identity. A key based
  // only on the requested quantity would replay an old adjustment if stock
  // later changed and an operator set the product back to that quantity.
  const balanceVersion = balance
    ? `${balance.quantityOnHand}:${balance.committedQuantity}:${balance.updatedAt}:${balance.lastMovementAt ?? ""}`
    : "empty";
  await recordMovementInternal(ctx, actor, {
    branch,
    product,
    type: "adjustment",
    quantity: Math.abs(delta),
    quantityDelta: delta,
    reason: "Product stock availability updated",
    referenceType: "product_stock_edit",
    referenceId: product.publicId,
    idempotencyKey: `product-stock-edit:${product.publicId}:${branch.publicId}:${balanceVersion}:${requestedAvailable}`,
    financialPostingStatus: "not_posted",
  });
}

async function branchPublicMap(ctx: ReadContext, actor: ActorContext): Promise<Map<string, string>> {
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return new Map(branches.map((branch) => [String(branch._id), publicBranchId(branch)]));
}

async function productPublicMap(ctx: ReadContext, actor: ActorContext): Promise<Map<string, string>> {
  const products = await ctx.db.query("products").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return new Map(products.map((product) => [String(product._id), product.publicId]));
}

async function listProducts(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  let rows = await ctx.db.query("products").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  if (input.includeArchived !== true) rows = rows.filter((row) => row.status === "active");
  const search = text(input.search).trim().toLowerCase();
  if (search) rows = rows.filter((row) => `${row.sku} ${row.name}`.toLowerCase().includes(search));
  return rows.sort((left, right) => left.name.localeCompare(right.name)).map((row) => productView(row, publicOrganizationId(actor.organization)));
}

async function upsertProduct(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const sku = text(input.sku).trim().toUpperCase();
  const name = text(input.name).trim();
  const unit = assertOneOf(input.unit, PRODUCT_UNITS, "Product unit", actor.correlationId);
  const reorderPoint = integer(input.reorderPoint, Number.NaN);
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(sku)) domainError("VALIDATION_ERROR", "SKU must be 1–32 uppercase letters, numbers, underscores, or hyphens.", { correlationId: actor.correlationId });
  if (!name || name.length > 120) domainError("VALIDATION_ERROR", "Product name must be between 1 and 120 characters.", { correlationId: actor.correlationId });
  if (!Number.isSafeInteger(reorderPoint) || reorderPoint < 0) domainError("VALIDATION_ERROR", "The reorder point must be a non-negative whole number.", { correlationId: actor.correlationId });
  const retailPrice = requireNonNegativeMoney(input.retailPrice, actor.organization.currency, "Retail price", actor.correlationId);
  const preferredSupplierId = optionalText(input.preferredSupplierId);
  let supplier: Supplier | undefined;
  if (preferredSupplierId) supplier = await supplierByPublicId(ctx, actor, preferredSupplierId);
  const inputId = optionalText(input.id);
  const existing = inputId ? await productByPublicId(ctx, actor, inputId) : null;
  const requestedAvailability = input.availableQuantity === undefined ? undefined : integer(input.availableQuantity, Number.NaN);
  if (requestedAvailability !== undefined && (!Number.isSafeInteger(requestedAvailability) || requestedAvailability < 0)) {
    domainError("VALIDATION_ERROR", "Available stock must be a non-negative whole number.", { correlationId: actor.correlationId });
  }
  const adjustmentBranch = input.branchId === undefined ? undefined : await branchByPublicId(ctx, actor, optionalText(input.branchId));
  if (requestedAvailability !== undefined && !adjustmentBranch) {
    domainError("VALIDATION_ERROR", "Select a branch when setting available stock.", { correlationId: actor.correlationId });
  }
  // Archived rows remain as history and may share an SKU with a replacement.
  // `.unique()` cannot be used once that is allowed because the index will
  // legitimately contain more than one historical row.
  const duplicate = (await ctx.db.query("products").withIndex("by_organization_sku", (q) => q.eq("organizationId", actor.organization._id).eq("sku", sku)).collect()).find((candidate) => candidate.status !== "archived");
  // Archived catalog rows no longer reserve an SKU. Their history remains
  // readable, while a replacement item can use the same human-facing code.
  if (duplicate && duplicate.status !== "archived" && duplicate._id !== existing?._id) domainError("CONFLICT", "That SKU is already used by another product.", { correlationId: actor.correlationId });
  const status = input.status === "archived" ? "archived" as const : "active" as const;
  const now = Date.now();
  const fields = { sku, name, description: optionalText(input.description), unit, reorderPoint, preferredSupplierId: supplier?.publicId, retailPriceMinor: retailPrice?.amount, retailPriceCurrency: retailPrice?.currency, status: existing ? input.status ? status : existing.status : status, updatedAt: now };
  if (existing) {
    const before = productView(existing, publicOrganizationId(actor.organization));
    // Clear removed catalog settings as part of ordinary edits. The schema
    // retains optional legacy validators only so old production documents can
    // be read during this gradual cleanup.
    await ctx.db.patch(existing._id, {
      ...fields,
      targetLevel: undefined,
      supplierLeadTimeDays: undefined,
      defaultUnitCostMinor: undefined,
      defaultUnitCostCurrency: undefined,
    });
    const updated = await ctx.db.get(existing._id);
    if (!updated) domainError("NOT_FOUND", "Product could not be loaded after update.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.product.update", entityType: "product", entityId: updated.publicId, entityLabel: updated.name, summary: "Product updated", before, after: productView(updated, publicOrganizationId(actor.organization)) });
    if (requestedAvailability !== undefined && adjustmentBranch) await setAvailableQuantity(ctx, actor, adjustmentBranch, updated, requestedAvailability);
    return productView(updated, publicOrganizationId(actor.organization));
  }
  const publicId = `product-${crypto.randomUUID()}`;
  const id = await ctx.db.insert("products", { organizationId: actor.organization._id, publicId, ...fields, createdAt: now });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Product could not be created.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.product.create", entityType: "product", entityId: created.publicId, entityLabel: created.name, summary: "Product created", after: productView(created, publicOrganizationId(actor.organization)) });
  if (requestedAvailability !== undefined && adjustmentBranch) await setAvailableQuantity(ctx, actor, adjustmentBranch, created, requestedAvailability);
  return productView(created, publicOrganizationId(actor.organization));
}

async function archiveProduct(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  requireReason(input.reason, actor.correlationId);
  const product = await productByPublicId(ctx, actor, optionalText(input.id));
  if (product.status === "archived") return productView(product, publicOrganizationId(actor.organization));
  await ctx.db.patch(product._id, { status: "archived", updatedAt: Date.now() });
  const updated = await ctx.db.get(product._id);
  if (!updated) domainError("NOT_FOUND", "Product could not be loaded after archive.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.product.archive", entityType: "product", entityId: product.publicId, entityLabel: product.name, summary: "Product archived", reason: text(input.reason), before: productView(product, publicOrganizationId(actor.organization)), after: productView(updated, publicOrganizationId(actor.organization)) });
  return productView(updated, publicOrganizationId(actor.organization));
}

function deletedProductResult(tombstone: ProductTombstone): Data {
  return { deleted: true, productId: tombstone.productPublicId, sku: tombstone.sku, name: tombstone.name, deletedAt: iso(tombstone.deletedAt) };
}

async function deleteProduct(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const productPublicId = optionalText(input.productId) ?? optionalText(input.id);
  const confirmation = optionalText(input.confirmation);
  if (!confirmation) domainError("VALIDATION_ERROR", "Type the exact SKU or product name to confirm permanent deletion.", { correlationId: actor.correlationId });
  const alreadyDeleted = await productTombstoneByPublicId(ctx, actor, productPublicId);
  // Retrying a completed delete is safe and deterministic. This also avoids a
  // confusing NOT_FOUND after the UI retries a successful request.
  if (alreadyDeleted) {
    const normalizedConfirmation = confirmation.toLowerCase();
    if (normalizedConfirmation !== alreadyDeleted.sku.toLowerCase() && normalizedConfirmation !== alreadyDeleted.name.toLowerCase()) domainError("VALIDATION_ERROR", "Type the exact SKU or product name to confirm permanent deletion.", { correlationId: actor.correlationId });
    return deletedProductResult(alreadyDeleted);
  }
  const product = productPublicId
    ? await ctx.db.query("products").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", productPublicId)).unique()
    : null;
  if (!product) domainError("NOT_FOUND", "Product not found.", { correlationId: actor.correlationId });
  if (confirmation.toLowerCase() !== product.sku.toLowerCase() && confirmation.toLowerCase() !== product.name.toLowerCase()) domainError("VALIDATION_ERROR", "Type the exact SKU or product name to confirm permanent deletion.", { correlationId: actor.correlationId });

  const balances = await ctx.db.query("inventoryBalances").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const productBalances = balances.filter((row) => row.productId === product._id);
  if (actor.branchScope !== "all" && productBalances.some((row) => !actor.branchIds.includes(row.branchId))) {
    domainError("FORBIDDEN", "This product has inventory in a branch outside your access.", { correlationId: actor.correlationId });
  }
  if (productBalances.some((row) => row.committedQuantity > 0)) {
    domainError("CONFLICT", "This product has inventory committed to an open purchase order. Receive or cancel that order first.", { correlationId: actor.correlationId });
  }
  if (productBalances.some((row) => row.quantityOnHand > 0)) {
    domainError("CONFLICT", "This product still has stock on hand. Sell, return, or adjust it to zero before permanently deleting the item.", { correlationId: actor.correlationId });
  }

  const orders = await ctx.db.query("purchaseOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const dependentOrders = orders.filter((order) => order.lines.some((line) => line.productId === product._id && line.receivedQuantity < line.orderedQuantity));
  if (actor.branchScope !== "all" && dependentOrders.some((order) => !actor.branchIds.includes(order.branchId))) {
    domainError("FORBIDDEN", "This product is used by a purchase order in a branch outside your access.", { correlationId: actor.correlationId });
  }
  const openDependentOrder = dependentOrders.find((order) => order.status === "draft" || order.status === "approved" || order.status === "partially_received");
  if (openDependentOrder) {
    domainError("CONFLICT", "This product is on an open purchase order. Receive or cancel that order before deleting the item.", { correlationId: actor.correlationId, details: { purchaseOrderId: openDependentOrder.publicId } });
  }

  const now = Date.now();
  const before = productView(product, publicOrganizationId(actor.organization));
  const tombstoneId = await ctx.db.insert("productTombstones", {
    organizationId: actor.organization._id,
    productPublicId: product.publicId,
    originalProductId: String(product._id),
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    retailPriceMinor: product.retailPriceMinor,
    retailPriceCurrency: product.retailPriceCurrency,
    deletedAt: now,
    deletedByUserId: actor.user._id,
    reason,
  });

  // These rows are mutable projections. Historical movements, receipts,
  // retail sales, purchase orders, and audit events are intentionally kept.
  for (const row of balances.filter((candidate) => candidate.productId === product._id)) await ctx.db.delete(row._id);
  const alerts = await ctx.db.query("inventoryAlerts").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const alert of alerts.filter((candidate) => candidate.productId === product._id)) await ctx.db.delete(alert._id);
  const suppliers = await ctx.db.query("suppliers").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const supplier of suppliers) {
    if (supplier.preferredProductIds.includes(product.publicId)) {
      await ctx.db.patch(supplier._id, { preferredProductIds: supplier.preferredProductIds.filter((id) => id !== product.publicId), updatedAt: now });
    }
  }
  const tombstone = await ctx.db.get(tombstoneId);
  if (!tombstone) domainError("NOT_FOUND", "Deleted product snapshot could not be loaded.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.product.delete", entityType: "product", entityId: product.publicId, entityLabel: product.name, summary: "Product permanently deleted; historical records retained", reason, before, after: { ...deletedProductResult(tombstone), historicalRecordsRetained: true } });
  await ctx.db.delete(product._id);
  return deletedProductResult(tombstone);
}

async function listSuppliers(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const branchMap = await branchPublicMap(ctx, actor);
  let rows = await ctx.db.query("suppliers").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  if (actor.branchScope !== "all") rows = rows.filter((row) => supplierVisibleToActor(actor, row));
  if (input.includeArchived !== true) rows = rows.filter((row) => row.status === "active");
  const search = text(input.search).trim().toLowerCase();
  if (search) rows = rows.filter((row) => `${row.name} ${row.contactName ?? ""} ${row.email ?? ""}`.toLowerCase().includes(search));
  const visibleBranchIds = actor.branchScope === "all" ? undefined : new Set(actor.branchIds.map(String));
  return rows.sort((left, right) => left.name.localeCompare(right.name)).map((row) => supplierView(row, publicOrganizationId(actor.organization), branchMap, visibleBranchIds));
}

async function upsertSupplier(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const name = text(input.name).trim();
  if (!name || name.length > 120) domainError("VALIDATION_ERROR", "Supplier name must be between 1 and 120 characters.", { correlationId: actor.correlationId });
  const branchIds = [...new Set((Array.isArray(input.branchIds) ? input.branchIds : []).map(String))];
  if (branchIds.length === 0) domainError("VALIDATION_ERROR", "Select at least one supplier branch.", { correlationId: actor.correlationId });
  const branches = await Promise.all(branchIds.map((id) => branchByPublicId(ctx, actor, id)));
  const preferredProductIds = [...new Set((Array.isArray(input.preferredProductIds) ? input.preferredProductIds : []).map(String))];
  const products = await Promise.all(preferredProductIds.map((id) => productByPublicId(ctx, actor, id)));
  const inputId = optionalText(input.id);
  const existing = inputId ? await supplierByPublicId(ctx, actor, inputId) : null;
  const status = input.status === "archived" ? "archived" as const : "active" as const;
  const now = Date.now();
  const fields = { name, contactName: optionalText(input.contactName), email: optionalText(input.email)?.toLowerCase(), phone: optionalText(input.phone), terms: optionalText(input.terms), branchIds: branches.map((branch) => branch._id), preferredProductIds: products.map((product) => product.publicId), status: existing ? input.status ? status : existing.status : status, updatedAt: now };
  const branchMap = await branchPublicMap(ctx, actor);
  const visibleBranchIds = actor.branchScope === "all" ? undefined : new Set(actor.branchIds.map(String));
  if (existing) {
    const before = supplierView(existing, publicOrganizationId(actor.organization), branchMap, visibleBranchIds);
    await ctx.db.patch(existing._id, { ...fields, leadTimeDays: undefined });
    const updated = await ctx.db.get(existing._id);
    if (!updated) domainError("NOT_FOUND", "Supplier could not be loaded after update.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.supplier.update", entityType: "supplier", entityId: updated.publicId, entityLabel: updated.name, summary: "Supplier updated", before, after: supplierView(updated, publicOrganizationId(actor.organization), branchMap, visibleBranchIds) });
    return supplierView(updated, publicOrganizationId(actor.organization), branchMap, visibleBranchIds);
  }
  const publicId = `supplier-${crypto.randomUUID()}`;
  const id = await ctx.db.insert("suppliers", { organizationId: actor.organization._id, publicId, ...fields, createdAt: now });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Supplier could not be created.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.supplier.create", entityType: "supplier", entityId: created.publicId, entityLabel: created.name, summary: "Supplier created", after: supplierView(created, publicOrganizationId(actor.organization), branchMap, visibleBranchIds) });
  return supplierView(created, publicOrganizationId(actor.organization), branchMap, visibleBranchIds);
}

async function archiveSupplier(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  requireReason(input.reason, actor.correlationId);
  const supplier = await supplierByPublicId(ctx, actor, optionalText(input.id));
  const branchMap = await branchPublicMap(ctx, actor);
  const visibleBranchIds = actor.branchScope === "all" ? undefined : new Set(actor.branchIds.map(String));
  if (supplier.status === "archived") return supplierView(supplier, publicOrganizationId(actor.organization), branchMap, visibleBranchIds);
  await ctx.db.patch(supplier._id, { status: "archived", updatedAt: Date.now() });
  const updated = await ctx.db.get(supplier._id);
  if (!updated) domainError("NOT_FOUND", "Supplier could not be loaded after archive.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.supplier.archive", entityType: "supplier", entityId: supplier.publicId, entityLabel: supplier.name, summary: "Supplier archived", reason: text(input.reason), before: supplierView(supplier, publicOrganizationId(actor.organization), branchMap, visibleBranchIds), after: supplierView(updated, publicOrganizationId(actor.organization), branchMap, visibleBranchIds) });
  return supplierView(updated, publicOrganizationId(actor.organization), branchMap, visibleBranchIds);
}

function movementDelta(type: typeof STOCK_TYPES[number], quantity: number): number {
  if (type === "receive" || type === "return" || type === "transfer_in") return quantity;
  if (type === "adjustment") return quantity;
  return -quantity;
}

/**
 * Resolve the branch's moving-average inventory cost without adding a cost
 * field back to the product editor. Purchase receipts already carry the
 * authoritative unit cost; checkout snapshots the cost that was actually in
 * stock at that moment. If any remaining units have no cost evidence, return
 * undefined instead of inventing a value and letting accounting post fake COGS.
 */
async function inventoryCostBasis(ctx: ReadContext, actor: ActorContext, branch: Branch, product: Product, occurredAt: number): Promise<{ amount: number; currency: string } | undefined> {
  const movements = await ctx.db
    .query("stockMovements")
    .withIndex("by_branch_product_occurred", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("productId", product._id))
    .collect();
  let quantity = 0;
  let unpricedQuantity = 0;
  let knownCostMinor = 0;
  for (const movement of movements.filter((row) => row.occurredAt <= occurredAt).sort((left, right) => left.occurredAt - right.occurredAt)) {
    const delta = movement.quantityDelta;
    if (!Number.isSafeInteger(delta) || delta === 0) continue;
    if (delta > 0) {
      const exactPriced = movement.totalCostMinor !== undefined && movement.totalCostCurrency === actor.organization.currency && Number.isSafeInteger(movement.totalCostMinor) && movement.totalCostMinor >= 0;
      const priced = movement.unitCostMinor !== undefined && movement.unitCostCurrency === actor.organization.currency && Number.isSafeInteger(movement.unitCostMinor) && movement.unitCostMinor >= 0;
      if (exactPriced && Number.isSafeInteger(knownCostMinor + movement.totalCostMinor!)) knownCostMinor += movement.totalCostMinor!;
      else if (priced && Number.isSafeInteger(delta * movement.unitCostMinor!)) knownCostMinor += delta * movement.unitCostMinor!;
      else unpricedQuantity += delta;
      quantity += delta;
      continue;
    }
    const outgoing = Math.min(quantity, Math.abs(delta));
    // Consume unpriced units first. This is conservative: a sale only gets a
    // cost basis when every unit still on hand is backed by a known receipt.
    const pricedQuantityBefore = quantity - unpricedQuantity;
    const unpricedUsed = Math.min(unpricedQuantity, outgoing);
    unpricedQuantity -= unpricedUsed;
    const pricedUsed = outgoing - unpricedUsed;
    const exactOutgoing = movement.totalCostMinor !== undefined && movement.totalCostCurrency === actor.organization.currency && Number.isSafeInteger(movement.totalCostMinor) && movement.totalCostMinor >= 0;
    if (exactOutgoing && pricedUsed === outgoing) knownCostMinor = Math.max(0, knownCostMinor - movement.totalCostMinor!);
    else if (pricedUsed > 0 && pricedQuantityBefore > 0) {
      knownCostMinor -= Math.round((knownCostMinor / pricedQuantityBefore) * pricedUsed);
      knownCostMinor = Math.max(0, knownCostMinor);
    }
    quantity = Math.max(0, quantity - outgoing);
  }
  if (quantity <= 0 || unpricedQuantity > 0 || !Number.isSafeInteger(knownCostMinor) || knownCostMinor < 0) return undefined;
  const amount = Math.round(knownCostMinor / quantity);
  return Number.isSafeInteger(amount) && amount >= 0 ? { amount, currency: actor.organization.currency } : undefined;
}

function exactCostTotal(unitCost: { amount: number; currency: string } | undefined, quantity: number): { amount: number; currency: string } | undefined {
  if (!unitCost || !Number.isSafeInteger(unitCost.amount) || unitCost.amount < 0 || !Number.isSafeInteger(quantity) || quantity < 0) return undefined;
  const amount = unitCost.amount * quantity;
  return Number.isSafeInteger(amount) ? { amount, currency: unitCost.currency } : undefined;
}

/** Allocate a whole-minor-unit total deterministically while conserving it. */
function allocateExactCost(totalMinor: number | undefined, quantityOnHand: number, quantity: number): number | undefined {
  if (typeof totalMinor !== "number" || !Number.isSafeInteger(totalMinor) || totalMinor < 0 || !Number.isSafeInteger(quantityOnHand) || quantityOnHand <= 0 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > quantityOnHand) return undefined;
  const exactTotal = totalMinor as number;
  if (quantity === quantityOnHand) return exactTotal;
  const numerator = exactTotal * quantity;
  if (!Number.isSafeInteger(numerator)) return undefined;
  return Math.floor(numerator / quantityOnHand);
}

async function recordMovementInternal(ctx: MutationCtx, actor: ActorContext, input: { branch: Branch; product: Product; type: typeof STOCK_TYPES[number]; quantity: number; quantityDelta?: number; unitCost?: { amount: number; currency: string }; totalCostMinor?: number; totalCostCurrency?: string; reason?: string; referenceType?: string; referenceId?: string; idempotencyKey: string; financialPostingStatus: "not_posted" | "pending" | "posted" | "failed"; financialSourceId?: string }): Promise<Data> {
  const requestHash = JSON.stringify({ branchId: publicBranchId(input.branch), productId: input.product.publicId, type: input.type, quantity: input.quantity, quantityDelta: input.quantityDelta, unitCost: input.unitCost, totalCostMinor: input.totalCostMinor, totalCostCurrency: input.totalCostCurrency, reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, financialPostingStatus: input.financialPostingStatus, financialSourceId: input.financialSourceId });
  const existing = await idempotentResult(ctx, actor, "operations.stock_movement", input.idempotencyKey, requestHash);
  if (existing) return existing;
  const delta = input.type === "adjustment" && input.quantityDelta !== undefined ? input.quantityDelta : movementDelta(input.type, input.quantity);
  if (!Number.isSafeInteger(delta) || delta === 0) domainError("VALIDATION_ERROR", "Stock adjustment must change inventory by a non-zero whole number.", { correlationId: actor.correlationId });
  const balance = await ensureBalance(ctx, actor, input.branch._id, input.product._id);
  const nextQuantity = balance.quantityOnHand + delta;
  if (nextQuantity < 0) domainError("CONFLICT", "Stock movement would make inventory negative.", { correlationId: actor.correlationId, details: { productId: input.product.publicId, branchId: publicBranchId(input.branch), quantityOnHand: balance.quantityOnHand, requestedDelta: delta } });
  const now = Date.now();
  const currentCostKnown = balance.quantityOnHand === 0
    ? { amount: 0, currency: actor.organization.currency }
    : (Number.isSafeInteger(balance.totalCostMinor) && (balance.totalCostMinor ?? 0) >= 0 && balance.totalCostCurrency === actor.organization.currency
      ? { amount: balance.totalCostMinor!, currency: balance.totalCostCurrency }
      : undefined);
  let movementTotalCostMinor: number | undefined;
  let movementTotalCostCurrency: string | undefined;
  let nextTotalCostMinor: number | undefined;
  let nextTotalCostCurrency: string | undefined;
  if (delta < 0) {
    movementTotalCostMinor = allocateExactCost(currentCostKnown?.amount, balance.quantityOnHand, Math.abs(delta));
    movementTotalCostCurrency = movementTotalCostMinor === undefined ? undefined : currentCostKnown?.currency;
    if (currentCostKnown && movementTotalCostMinor !== undefined) {
      nextTotalCostMinor = currentCostKnown.amount - movementTotalCostMinor;
      nextTotalCostCurrency = currentCostKnown.currency;
    }
  } else if (delta > 0) {
    const incoming = input.totalCostMinor !== undefined
      ? (Number.isSafeInteger(input.totalCostMinor) && input.totalCostMinor >= 0 ? { amount: input.totalCostMinor, currency: input.totalCostCurrency ?? actor.organization.currency } : undefined)
      : exactCostTotal(input.unitCost, delta);
    if (currentCostKnown && incoming && incoming.currency === actor.organization.currency && Number.isSafeInteger(currentCostKnown.amount + incoming.amount)) {
      movementTotalCostMinor = incoming.amount;
      movementTotalCostCurrency = incoming.currency;
      nextTotalCostMinor = currentCostKnown.amount + incoming.amount;
      nextTotalCostCurrency = incoming.currency;
    } else if (incoming && balance.quantityOnHand === 0) {
      movementTotalCostMinor = incoming.amount;
      movementTotalCostCurrency = incoming.currency;
      nextTotalCostMinor = incoming.amount;
      nextTotalCostCurrency = incoming.currency;
    }
  }
  const publicId = `movement-${crypto.randomUUID()}`;
  await ctx.db.insert("stockMovements", { organizationId: actor.organization._id, publicId, branchId: input.branch._id, productId: input.product._id, productSku: input.product.sku, productName: input.product.name, productUnit: input.product.unit, type: input.type, quantityDelta: delta, quantity: Math.abs(delta), unitCostMinor: input.unitCost?.amount, unitCostCurrency: input.unitCost?.currency, totalCostMinor: movementTotalCostMinor, totalCostCurrency: movementTotalCostCurrency, reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, idempotencyKey: input.idempotencyKey, financialPostingStatus: input.financialPostingStatus, financialSourceId: input.financialSourceId, occurredAt: now, createdAt: now, createdByUserId: actor.user._id });
  await ctx.db.patch(balance._id, { quantityOnHand: nextQuantity, totalCostMinor: nextTotalCostMinor, totalCostCurrency: nextTotalCostCurrency, lastMovementAt: now, updatedAt: now });
  const view = { id: publicId, organizationId: publicOrganizationId(actor.organization), branchId: publicBranchId(input.branch), productId: input.product.publicId, productSku: input.product.sku, productName: input.product.name, productUnit: input.product.unit, type: input.type, quantityDelta: delta, quantity: Math.abs(delta), unitCost: input.unitCost, totalCost: movementTotalCostMinor === undefined ? undefined : { amount: movementTotalCostMinor, currency: movementTotalCostCurrency ?? actor.organization.currency }, reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, idempotencyKey: input.idempotencyKey, financialPostingStatus: input.financialPostingStatus, financialSourceId: input.financialSourceId, occurredAt: iso(now), createdAt: iso(now), createdById: publicUserId(actor.user) };
  await saveIdempotentResult(ctx, actor, "operations.stock_movement", input.idempotencyKey, requestHash, view);
  await audit(ctx, actor, { action: "operations.stock_movement.create", entityType: "stock_movement", entityId: publicId, entityLabel: `${input.product.sku} · ${input.type}`, summary: `Recorded ${input.type} stock movement`, reason: input.reason, after: { productId: input.product.publicId, quantityDelta: delta, financialPostingStatus: input.financialPostingStatus }, branchId: publicBranchId(input.branch) });
  return view;
}

async function recordStockMovement(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const product = await productByPublicId(ctx, actor, optionalText(input.productId));
  if (product.status !== "active") domainError("CONFLICT", "Archived products cannot receive new stock movements.", { correlationId: actor.correlationId });
  const type = assertOneOf(input.type, STOCK_TYPES, "Stock movement type", actor.correlationId);
  const quantity = integer(input.quantity, Number.NaN);
  if (!Number.isSafeInteger(quantity) || quantity === 0 || (type !== "adjustment" && quantity < 0)) domainError("VALIDATION_ERROR", "Stock movement quantity must be a non-zero whole number; adjustments may be negative.", { correlationId: actor.correlationId });
  const unitCost = requireNonNegativeMoney(input.unitCost, actor.organization.currency, "Unit cost", actor.correlationId);
  const reason = optionalText(input.reason);
  if (type === "adjustment") requireReason(reason, actor.correlationId);
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  return await recordMovementInternal(ctx, actor, { branch, product, type, quantity, unitCost, reason, referenceType: optionalText(input.referenceType), referenceId: optionalText(input.referenceId), idempotencyKey, financialPostingStatus: "not_posted" });
}

/**
 * Transfer stock between two concrete branches in one Convex mutation. The
 * source and destination movements share one transfer reference while the
 * idempotency record makes a retried request return the original pair.
 */
async function transferInventory(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const quantity = integer(input.quantity, Number.NaN);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) domainError("VALIDATION_ERROR", "Transfer quantity must be a positive whole number.", { correlationId: actor.correlationId });
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  // Resolve scope before lifecycle validation so an authenticated retry can
  // replay after a branch/product is archived without exposing foreign rows.
  const sourceScope = await transferBranchScope(ctx, actor, optionalText(input.sourceBranchId));
  const destinationScope = await transferBranchScope(ctx, actor, optionalText(input.destinationBranchId));
  if (sourceScope._id === destinationScope._id) {
    domainError("VALIDATION_ERROR", "Choose a different destination branch.", { correlationId: actor.correlationId });
  }
  const productScope = await transferProductScope(ctx, actor, optionalText(input.productId));
  const requestHash = JSON.stringify({ sourceBranchId: sourceScope.publicId, destinationBranchId: destinationScope.publicId, productId: productScope.publicId, quantity, reason });
  const existing = await idempotentResult(ctx, actor, "operations.inventory.transfer", idempotencyKey, requestHash);
  if (existing) return existing;

  const sourceBranch = await branchByPublicId(ctx, actor, sourceScope.publicId);
  const destinationBranch = await branchByPublicId(ctx, actor, destinationScope.publicId);
  const product = await productByPublicId(ctx, actor, productScope.publicId);
  if (product.status !== "active") domainError("CONFLICT", "Archived products cannot be transferred.", { correlationId: actor.correlationId });

  const sourceBalance = await balanceRow(ctx, actor.organization._id, sourceBranch._id, product._id);
  const sourceAvailableQuantity = (sourceBalance?.quantityOnHand ?? 0) - (sourceBalance?.committedQuantity ?? 0);
  if (sourceAvailableQuantity < quantity) {
    domainError("CONFLICT", "The source branch does not have enough available stock for this transfer.", { correlationId: actor.correlationId, details: { productId: product.publicId, sourceBranchId: sourceBranch.publicId, availableQuantity: sourceAvailableQuantity, requestedQuantity: quantity } });
  }
  const destinationBalance = await ensureBalance(ctx, actor, destinationBranch._id, product._id);
  const destinationAvailableQuantity = destinationBalance.quantityOnHand - destinationBalance.committedQuantity;
  const now = Date.now();
  const transferId = `transfer-${crypto.randomUUID()}`;
  const basis = await inventoryCostBasis(ctx, actor, sourceBranch, product, now);
  const sourceTotalCostMinor = sourceBalance && Number.isSafeInteger(sourceBalance.totalCostMinor) && (sourceBalance.totalCostMinor ?? 0) >= 0 && sourceBalance.totalCostCurrency === actor.organization.currency
    ? sourceBalance.totalCostMinor
    : basis && sourceBalance && Number.isSafeInteger(basis.amount * sourceBalance.quantityOnHand)
      ? basis.amount * sourceBalance.quantityOnHand
      : undefined;
  const movedTotalCostMinor = sourceBalance ? allocateExactCost(sourceTotalCostMinor, sourceBalance.quantityOnHand, quantity) : undefined;
  const sourceRemainingCostMinor = sourceTotalCostMinor !== undefined && movedTotalCostMinor !== undefined ? sourceTotalCostMinor - movedTotalCostMinor : undefined;
  const destinationTotalCostMinor = destinationBalance.quantityOnHand === 0
    ? 0
    : (Number.isSafeInteger(destinationBalance.totalCostMinor) && (destinationBalance.totalCostMinor ?? 0) >= 0 && destinationBalance.totalCostCurrency === actor.organization.currency
      ? destinationBalance.totalCostMinor
      : undefined);
  const destinationNextCostMinor = destinationTotalCostMinor !== undefined && movedTotalCostMinor !== undefined && Number.isSafeInteger(destinationTotalCostMinor + movedTotalCostMinor)
    ? destinationTotalCostMinor + movedTotalCostMinor
    : undefined;
  const unitCost = basis ?? (movedTotalCostMinor !== undefined ? { amount: Math.round(movedTotalCostMinor / quantity), currency: actor.organization.currency } : undefined);
  const sourceMovementId = `movement-${crypto.randomUUID()}`;
  const destinationMovementId = `movement-${crypto.randomUUID()}`;
  const sourceMovementKey = `${idempotencyKey}:out`;
  const destinationMovementKey = `${idempotencyKey}:in`;
  await ctx.db.insert("stockMovements", { organizationId: actor.organization._id, publicId: sourceMovementId, branchId: sourceBranch._id, productId: product._id, productSku: product.sku, productName: product.name, productUnit: product.unit, type: "transfer_out", quantityDelta: -quantity, quantity, unitCostMinor: unitCost?.amount, unitCostCurrency: unitCost?.currency, totalCostMinor: movedTotalCostMinor, totalCostCurrency: movedTotalCostMinor === undefined ? undefined : actor.organization.currency, reason, referenceType: "inventory_transfer", referenceId: transferId, idempotencyKey: sourceMovementKey, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdByUserId: actor.user._id });
  await ctx.db.insert("stockMovements", { organizationId: actor.organization._id, publicId: destinationMovementId, branchId: destinationBranch._id, productId: product._id, productSku: product.sku, productName: product.name, productUnit: product.unit, type: "transfer_in", quantityDelta: quantity, quantity, unitCostMinor: unitCost?.amount, unitCostCurrency: unitCost?.currency, totalCostMinor: movedTotalCostMinor, totalCostCurrency: movedTotalCostMinor === undefined ? undefined : actor.organization.currency, reason, referenceType: "inventory_transfer", referenceId: transferId, idempotencyKey: destinationMovementKey, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdByUserId: actor.user._id });
  if (sourceBalance) await ctx.db.patch(sourceBalance._id, { quantityOnHand: sourceBalance.quantityOnHand - quantity, totalCostMinor: sourceRemainingCostMinor, totalCostCurrency: sourceRemainingCostMinor === undefined ? undefined : actor.organization.currency, lastMovementAt: now, updatedAt: now });
  else domainError("CONFLICT", "The source branch inventory balance could not be loaded.", { correlationId: actor.correlationId });
  await ctx.db.patch(destinationBalance._id, { quantityOnHand: destinationBalance.quantityOnHand + quantity, totalCostMinor: destinationNextCostMinor, totalCostCurrency: destinationNextCostMinor === undefined ? undefined : actor.organization.currency, lastMovementAt: now, updatedAt: now });
  await ctx.db.insert("inventoryTransfers", { organizationId: actor.organization._id, publicId: transferId, sourceBranchId: sourceBranch._id, destinationBranchId: destinationBranch._id, productId: product._id, quantity, reason, status: "completed", sourceMovementId, destinationMovementId, totalCostMinor: movedTotalCostMinor, totalCostCurrency: movedTotalCostMinor === undefined ? undefined : actor.organization.currency, sourceAvailableBefore: sourceAvailableQuantity, destinationAvailableBefore: destinationAvailableQuantity, sourceAvailableAfter: sourceAvailableQuantity - quantity, destinationAvailableAfter: destinationAvailableQuantity + quantity, idempotencyKey, createdByUserId: actor.user._id, occurredAt: now, createdAt: now });
  const movementTotalCost = movedTotalCostMinor === undefined ? undefined : { amount: movedTotalCostMinor, currency: actor.organization.currency };
  const sourceMovement = { id: sourceMovementId, organizationId: publicOrganizationId(actor.organization), branchId: sourceBranch.publicId, productId: product.publicId, productSku: product.sku, productName: product.name, productUnit: product.unit, type: "transfer_out", quantityDelta: -quantity, quantity, unitCost, totalCost: movementTotalCost, reason, referenceType: "inventory_transfer", referenceId: transferId, idempotencyKey: sourceMovementKey, financialPostingStatus: "not_posted", occurredAt: iso(now), createdAt: iso(now), createdById: publicUserId(actor.user) };
  const destinationMovement = { id: destinationMovementId, organizationId: publicOrganizationId(actor.organization), branchId: destinationBranch.publicId, productId: product.publicId, productSku: product.sku, productName: product.name, productUnit: product.unit, type: "transfer_in", quantityDelta: quantity, quantity, unitCost, totalCost: movementTotalCost, reason, referenceType: "inventory_transfer", referenceId: transferId, idempotencyKey: destinationMovementKey, financialPostingStatus: "not_posted", occurredAt: iso(now), createdAt: iso(now), createdById: publicUserId(actor.user) };
  const result = { id: transferId, organizationId: publicOrganizationId(actor.organization), sourceBranchId: sourceBranch.publicId, destinationBranchId: destinationBranch.publicId, productId: product.publicId, quantity, reason, idempotencyKey, status: "completed", totalCost: movementTotalCost, sourceMovementId, destinationMovementId, sourceMovement, destinationMovement, sourceAvailableQuantity: sourceAvailableQuantity - quantity, destinationAvailableQuantity: destinationAvailableQuantity + quantity, createdById: publicUserId(actor.user), occurredAt: iso(now) };
  await saveIdempotentResult(ctx, actor, "operations.inventory.transfer", idempotencyKey, requestHash, result);
  await audit(ctx, actor, { action: "operations.inventory.transfer", entityType: "inventory_transfer", entityId: transferId, entityLabel: `${product.sku} · ${sourceBranch.name} → ${destinationBranch.name}`, summary: "Inventory transferred between branches", reason, branchId: sourceBranch.publicId, destinationBranchId: destinationBranch.publicId, before: { sourceBranchId: sourceBranch.publicId, destinationBranchId: destinationBranch.publicId, productId: product.publicId, sourceAvailableQuantity, destinationAvailableQuantity }, after: { sourceBranchId: sourceBranch.publicId, destinationBranchId: destinationBranch.publicId, productId: product.publicId, quantity, totalCostMinor: movedTotalCostMinor, sourceAvailableQuantity: sourceAvailableQuantity - quantity, destinationAvailableQuantity: destinationAvailableQuantity + quantity } });
  return result;
}

function retailSaleView(sale: Doc<"retailSales">, organizationId: string, branchId: string): Data {
  return {
    id: sale.publicId,
    organizationId,
    branchId,
    receiptId: sale.receiptId,
    receiptNumber: sale.receiptNumber,
    customer: sale.customer,
    lines: sale.lines.map((line) => ({
      productId: line.productId,
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: { amount: line.unitPriceMinor, currency: line.currency },
      lineTotal: { amount: line.lineTotalMinor, currency: line.currency },
      unitCost: money(line.unitCostMinor, line.unitCostCurrency),
    })),
    subtotal: { amount: sale.subtotalMinor, currency: sale.currency },
    total: { amount: sale.totalMinor, currency: sale.currency },
    status: sale.status,
    refundedAmount: sale.refundedMinor ? { amount: sale.refundedMinor, currency: sale.currency } : undefined,
    returnedLines: sale.returnedLines,
    refundReason: sale.refundReason,
    voidReason: sale.voidReason,
    voidedAt: sale.voidedAt ? iso(sale.voidedAt) : undefined,
    method: sale.method,
    externalReference: sale.externalReference,
    shiftId: sale.shiftId,
    idempotencyKey: sale.idempotencyKey,
    createdById: sale.createdByPublicId,
    createdByName: sale.createdByName,
    createdAt: iso(sale.createdAt),
    updatedAt: iso(sale.updatedAt),
  };
}

function retailReceiptDetail(
  sale: Doc<"retailSales">,
  receipt: Data,
  organization: Data,
  branch: Branch,
  actor: ActorContext,
): Data {
  const customer = value(sale.customer);
  const receiptId = text(receipt.id, sale.receiptId);
  const receiptNumber = text(receipt.receiptNumber, sale.receiptNumber);
  const paymentId = text(receipt.paymentId, `retail-payment-${sale.publicId}`);
  const adjustment = receipt.kind === "refund" || receipt.kind === "void";
  const payment = {
    id: paymentId,
    organizationId: publicOrganizationId(actor.organization),
    branchId: publicBranchId(branch),
    type: adjustment ? receipt.kind : "retail_sale",
    customer,
    amount: receipt.amount ?? { amount: sale.totalMinor, currency: sale.currency },
    method: receipt.method ?? sale.method,
    status: receipt.status ?? sale.status,
    refundedAmount: sale.refundedMinor ? { amount: sale.refundedMinor, currency: sale.currency } : undefined,
    refundReason: sale.refundReason,
    voidReason: sale.voidReason,
    receiptId,
    receiptNumber,
    collectedById: sale.createdByPublicId,
    collectedByName: sale.createdByName,
    shiftId: receipt.shiftId ?? sale.shiftId,
    externalReference: receipt.externalReference ?? sale.externalReference,
    idempotencyKey: receipt.idempotencyKey ?? sale.idempotencyKey,
    occurredAt: text(receipt.occurredAt) || iso(sale.createdAt),
  };
  return {
    receipt,
    receiptId,
    organization: { name: actor.organization.name, receiptFooter: text(organization.receiptFooter), taxRatePercent: finite(organization.taxRatePercent) },
    branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone },
    member: customer.kind === "member" ? { fullName: text(customer.fullName), memberNumber: text(customer.memberNumber, "Member") } : undefined,
    customer,
    payment,
    retailSale: retailSaleView(sale, publicOrganizationId(actor.organization), publicBranchId(branch)),
    relatedPayments: [],
  };
}

export async function openCashShiftForBranch(ctx: ReadContext, actor: ActorContext, branch: Branch, expectedShiftId?: string): Promise<Doc<"domainRecords"> | null> {
  const shifts = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "shift")).collect();
  return shifts.find((shift) => shift.branchId === branch._id && value(shift.data).status === "open" && (!expectedShiftId || cashShiftPublicId(shift) === expectedShiftId)) ?? null;
}

export function cashShiftPublicId(shift: Doc<"domainRecords">): string {
  return optionalText(value(shift.data).id) ?? shift.publicId;
}

async function retailCheckout(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePermission(actor, "payments.collect");

  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const method = assertOneOf(input.method, ["cash", "cliq", "card"] as const, "Retail payment method", actor.correlationId);
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  const rawGuest = value(input.guest);
  const guest = input.guest === undefined ? undefined : { fullName: text(rawGuest.fullName).trim(), phone: text(rawGuest.phone).trim() };
  const memberId = optionalText(input.memberId);
  // A walk-in sale needs no customer at all. A member may be attached, or
  // guest contact details recorded when a receipt needs a name; never both.
  if (memberId && guest) domainError("VALIDATION_ERROR", "Choose an existing member or enter guest details, not both.", { correlationId: actor.correlationId });
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const normalizedLines = rawLines.map((raw) => ({ productId: optionalText(value(raw).productId) ?? "", quantity: integer(value(raw).quantity, Number.NaN) })).sort((left, right) => left.productId.localeCompare(right.productId));
  const externalReference = optionalText(input.externalReference);
  const requestHash = JSON.stringify({ branchId: publicBranchId(branch), memberId, guest, lines: normalizedLines, method, externalReference });
  const replay = await idempotentResult(ctx, actor, "operations.retail.checkout", idempotencyKey, requestHash);
  if (replay) return replay;
  await requireRetailPaymentMethodEnabled(ctx, actor, method);
  if (method !== "cash" && !externalReference) domainError("VALIDATION_ERROR", "An external reference is required for CliQ and Visa/card payments.", { correlationId: actor.correlationId, fieldErrors: { externalReference: ["Required for this payment method"] } });
  if (guest && (!guest.fullName || guest.fullName.length > 120 || !guest.phone || guest.phone.length > 40)) domainError("VALIDATION_ERROR", "Guest name and phone are required.", { correlationId: actor.correlationId, fieldErrors: { fullName: ["Required"], phone: ["Required"] } });
  if (normalizedLines.length === 0 || normalizedLines.length > 100) domainError("VALIDATION_ERROR", "A checkout must contain 1 to 100 product lines.", { correlationId: actor.correlationId });
  const seen = new Set<string>();
  const lines: Array<{ product: Product; quantity: number; balance: InventoryBalance; unitPriceMinor: number; lineTotalMinor: number; unitCost?: { amount: number; currency: string } }> = [];
  let totalMinor = 0;
  for (const raw of normalizedLines) {
    if (!raw.productId || seen.has(raw.productId)) domainError("VALIDATION_ERROR", "A checkout cannot repeat a product line.", { correlationId: actor.correlationId });
    seen.add(raw.productId);
    if (!Number.isSafeInteger(raw.quantity) || raw.quantity <= 0) domainError("VALIDATION_ERROR", "Product quantities must be positive whole numbers.", { correlationId: actor.correlationId });
    const product = await productByPublicId(ctx, actor, raw.productId);
    if (product.status !== "active") domainError("CONFLICT", "Archived products cannot be sold.", { correlationId: actor.correlationId });
    if (product.retailPriceMinor === undefined || product.retailPriceMinor <= 0 || product.retailPriceCurrency !== actor.organization.currency) domainError("CONFLICT", `Set a positive retail price for ${product.name} before selling it.`, { correlationId: actor.correlationId, details: { productId: product.publicId } });
    // Read balances during prevalidation. Creating a missing zero balance here
    // would be a mutation before the rest of the cart had passed validation,
    // which would violate the all-or-nothing checkout contract on a later-line
    // failure.
    const balance = await balanceRow(ctx, actor.organization._id, branch._id, product._id);
    const available = balance ? balance.quantityOnHand - balance.committedQuantity : 0;
    if (!balance || balance.sellable === false || available < raw.quantity) domainError("CONFLICT", `${product.name} has only ${available} available.`, { correlationId: actor.correlationId, details: { productId: product.publicId, availableQuantity: available, requestedQuantity: raw.quantity } });
    const lineTotalMinor = product.retailPriceMinor * raw.quantity;
    if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(totalMinor + lineTotalMinor)) domainError("VALIDATION_ERROR", "Checkout total is too large.", { correlationId: actor.correlationId });
    totalMinor += lineTotalMinor;
    lines.push({ product, quantity: raw.quantity, balance, unitPriceMinor: product.retailPriceMinor, lineTotalMinor });
  }
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) domainError("VALIDATION_ERROR", "Checkout total must be greater than zero.", { correlationId: actor.correlationId });

  let memberRecord: Doc<"domainRecords"> | null = null;
  let customer: {
    kind: "member" | "guest" | "walk_in";
    fullName: string;
    phone?: string;
    memberId?: string;
    memberNumber?: string;
  };
  if (memberId) {
    memberRecord = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", memberId)).unique();
    if (!memberRecord) domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
    // A sale must be attributed to the member's home/record branch. Do not
    // disclose a member that belongs to another branch to a scoped actor (or
    // accidentally sell a branch-B member from branch A).
    if (memberRecord.branchId && memberRecord.branchId !== branch._id) domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
    const memberData = value(memberRecord.data);
    const memberHomeBranchId = optionalText(memberData.homeBranchId);
    if (memberHomeBranchId && memberHomeBranchId !== publicBranchId(branch)) domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
    customer = { kind: "member", fullName: text(memberData.fullName, "Member"), phone: optionalText(memberData.phone), memberId: memberRecord.publicId, memberNumber: optionalText(memberData.memberNumber) };
  } else if (guest) {
    customer = { kind: "guest", fullName: guest.fullName, phone: guest.phone };
  } else {
    // No member, no guest profile, no placeholder record anywhere: the
    // receipt simply says who it was for.
    customer = { kind: "walk_in", fullName: "Walk-in customer" };
  }

  let shiftId: string | undefined;
  if (method === "cash") {
    const shift = await openCashShiftForBranch(ctx, actor, branch);
    if (!shift) domainError("NO_OPEN_SHIFT", "Open a cash shift before checking out cash sales.", { correlationId: actor.correlationId });
    shiftId = cashShiftPublicId(shift);
  }
  const now = Date.now();
  for (const line of lines) line.unitCost = await inventoryCostBasis(ctx, actor, branch, line.product, now);
  const receipt = await allocateRetailReceipt(ctx, actor);
  const saleId = `retail-sale-${crypto.randomUUID()}`;
  const sale = await ctx.db.insert("retailSales", {
    organizationId: actor.organization._id,
    publicId: saleId,
    branchId: branch._id,
    receiptId: receipt.id,
    receiptNumber: receipt.number,
    memberId: memberRecord?.publicId,
    customer,
    lines: lines.map(({ product, quantity, unitPriceMinor, lineTotalMinor, unitCost }) => ({ productId: product.publicId, sku: product.sku, productName: product.name, quantity, unitPriceMinor, lineTotalMinor, currency: actor.organization.currency, unitCostMinor: unitCost?.amount, unitCostCurrency: unitCost?.currency })),
    subtotalMinor: totalMinor,
    totalMinor,
    currency: actor.organization.currency,
    status: "completed",
    refundedMinor: 0,
    returnedLines: [],
    method,
    externalReference,
    shiftId,
    idempotencyKey,
    createdByUserId: actor.user._id,
    createdByPublicId: publicUserId(actor.user),
    createdByName: actor.user.fullName,
    createdAt: now,
    updatedAt: now,
  });
  const receiptData = { id: receipt.id, receiptNumber: receipt.number, paymentId: `retail-payment-${saleId}`, retailSaleId: saleId, issuedAt: iso(now) };
  await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "receipt", publicId: receipt.id, branchId: branch._id, memberPublicId: memberRecord?.publicId, createdAt: now, updatedAt: now, data: { ...receiptData, organizationId: publicOrganizationId(actor.organization) } });
  // Keep retail collections in the existing payment projection so shifts,
  // reconciliation, dashboards, transaction lists, and accounting all see a
  // durable payment fact without pretending a guest is a member.
  await ctx.db.insert("domainRecords", {
    organizationId: actor.organization._id,
    entityType: "payment",
    publicId: receiptData.paymentId,
    branchId: branch._id,
    memberPublicId: memberRecord?.publicId,
    createdAt: now,
    updatedAt: now,
    data: {
      id: receiptData.paymentId,
      organizationId: publicOrganizationId(actor.organization),
      branchId: publicBranchId(branch),
      memberId: memberRecord?.publicId,
      customer,
      type: "retail_sale",
      amount: { amount: totalMinor, currency: actor.organization.currency },
      method,
      status: "completed",
      receiptId: receipt.id,
      receiptNumber: receipt.number,
      collectedById: publicUserId(actor.user),
      collectedByName: actor.user.fullName,
      shiftId,
      externalReference,
      idempotencyKey,
      retailSaleId: saleId,
      occurredAt: iso(now),
    },
  });
  for (const line of lines) {
    const movementId = `movement-${crypto.randomUUID()}`;
    const delta = -line.quantity;
    await ctx.db.insert("stockMovements", { organizationId: actor.organization._id, publicId: movementId, branchId: branch._id, productId: line.product._id, productSku: line.product.sku, productName: line.product.name, productUnit: line.product.unit, type: "sale", quantityDelta: delta, quantity: line.quantity, unitCostMinor: line.unitCost?.amount, unitCostCurrency: line.unitCost?.currency, reason: `Retail sale ${receipt.number}`, referenceType: "retail_sale", referenceId: saleId, idempotencyKey: `${idempotencyKey}:${line.product.publicId}`, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdByUserId: actor.user._id });
    await ctx.db.patch(line.balance._id, { quantityOnHand: line.balance.quantityOnHand + delta, lastMovementAt: now, updatedAt: now });
  }
  if (memberRecord) {
    const timelineId = `timeline-${crypto.randomUUID()}`;
    await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "timeline", publicId: timelineId, branchId: branch._id, memberPublicId: memberRecord.publicId, createdAt: now, updatedAt: now, data: { id: timelineId, organizationId: publicOrganizationId(actor.organization), memberId: memberRecord.publicId, branchId: publicBranchId(branch), type: "payment_collected", title: `Retail sale — ${actor.organization.currency} ${(totalMinor / 1000).toFixed(3)}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, occurredAt: iso(now), meta: { receiptNumber: receipt.number, receiptId: receipt.id, retailSaleId: saleId, saleType: "retail" } } });
  }
  await audit(ctx, actor, { action: "operations.retail_sale.create", entityType: "retail_sale", entityId: saleId, entityLabel: receipt.number, summary: `Retail sale ${receipt.number} · ${actor.organization.currency} ${(totalMinor / 1000).toFixed(3)}`, after: { receiptId: receipt.id, total: totalMinor, method, customer: customer.kind }, branchId: publicBranchId(branch) });
  const storedSale = await ctx.db.get(sale);
  if (!storedSale) domainError("NOT_FOUND", "Retail sale could not be loaded after checkout.", { correlationId: actor.correlationId });
  const organization = { receiptFooter: actor.organization.receiptFooter ?? "Thank you.", taxRatePercent: actor.organization.taxRatePercent ?? 0 };
  const result = retailReceiptDetail(storedSale, receiptData, organization, branch, actor);
  await saveIdempotentResult(ctx, actor, "operations.retail.checkout", idempotencyKey, requestHash, result);
  return result;
}

async function retailSaleForMutation(ctx: MutationCtx, actor: ActorContext, saleId: string): Promise<{ sale: Doc<"retailSales">; branch: Branch }> {
  const sale = await ctx.db.query("retailSales").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", saleId)).unique();
  if (!sale) domainError("NOT_FOUND", "Retail sale not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(sale.branchId);
  if (!branch) domainError("NOT_FOUND", "Retail sale branch not found.", { correlationId: actor.correlationId });
  assertBranchAccess(actor, branch);
  return { sale, branch };
}

async function originalRetailReceipt(ctx: MutationCtx, actor: ActorContext, sale: Doc<"retailSales">): Promise<Data> {
  const row = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "receipt").eq("publicId", sale.receiptId)).unique();
  if (!row) domainError("NOT_FOUND", "Retail receipt not found.", { correlationId: actor.correlationId });
  return value(row.data);
}

async function patchRetailPayment(ctx: MutationCtx, actor: ActorContext, sale: Doc<"retailSales">, patch: Data): Promise<void> {
  const paymentId = `retail-payment-${sale.publicId}`;
  const row = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "payment").eq("publicId", paymentId)).unique();
  if (!row) domainError("NOT_FOUND", "Retail payment fact not found.", { correlationId: actor.correlationId });
  await ctx.db.patch(row._id, { data: { ...value(row.data), ...patch }, updatedAt: Date.now() });
}

async function recordDeletedProductReturn(
  ctx: MutationCtx,
  actor: ActorContext,
  tombstone: ProductTombstone,
  branch: Branch,
  quantity: number,
  unitCost: { amount: number; currency: string } | undefined,
  reason: string,
  referenceId: string,
  idempotencyKey: string,
  referenceType: "retail_refund" | "retail_void",
): Promise<void> {
  const productId = tombstone.originalProductId as Id<"products">;
  const requestHash = JSON.stringify({ branchId: publicBranchId(branch), productId: tombstone.productPublicId, type: "return", quantity, unitCost, reason, referenceType, referenceId });
  const replay = await idempotentResult(ctx, actor, "operations.stock_movement", idempotencyKey, requestHash);
  if (replay) return;
  const now = Date.now();
  const publicId = `movement-${crypto.randomUUID()}`;
  await ctx.db.insert("stockMovements", { organizationId: actor.organization._id, publicId, branchId: branch._id, productId, productSku: tombstone.sku, productName: tombstone.name, productUnit: tombstone.unit, type: "return", quantityDelta: quantity, quantity, unitCostMinor: unitCost?.amount, unitCostCurrency: unitCost?.currency, reason, referenceType, referenceId, idempotencyKey, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdByUserId: actor.user._id });
  // The catalog row is gone, but the returned physical units still belong to
  // the deleted identity. Keep a non-sellable tombstone balance so inventory
  // history and COGS remain reconcilable without ever putting stock into a
  // replacement product that reused the SKU.
  const existingBalance = await balanceRow(ctx, actor.organization._id, branch._id, productId);
  if (existingBalance) {
    await ctx.db.patch(existingBalance._id, { quantityOnHand: existingBalance.quantityOnHand + quantity, sellable: false, lastMovementAt: now, updatedAt: now });
  } else {
    await ctx.db.insert("inventoryBalances", { organizationId: actor.organization._id, publicId: `inventory-${String(branch._id)}-${String(productId)}`, branchId: branch._id, productId, quantityOnHand: quantity, committedQuantity: 0, sellable: false, lastMovementAt: now, updatedAt: now });
  }
  const view = { id: publicId, organizationId: publicOrganizationId(actor.organization), branchId: publicBranchId(branch), productId: tombstone.productPublicId, productSku: tombstone.sku, productName: tombstone.name, productUnit: tombstone.unit, type: "return" as const, quantityDelta: quantity, quantity, unitCost, reason, referenceType, referenceId, idempotencyKey, financialPostingStatus: "not_posted" as const, occurredAt: iso(now), createdAt: iso(now), createdById: publicUserId(actor.user) };
  await saveIdempotentResult(ctx, actor, "operations.stock_movement", idempotencyKey, requestHash, view);
  await audit(ctx, actor, { action: "operations.stock_movement.create", entityType: "stock_movement", entityId: publicId, entityLabel: `${tombstone.sku} · return`, summary: "Recorded return for a deleted product", reason, after: { productId: tombstone.productPublicId, quantityDelta: quantity, financialPostingStatus: "not_posted" }, branchId: publicBranchId(branch) });
}

async function restoreRetailStock(ctx: MutationCtx, actor: ActorContext, sale: Doc<"retailSales">, branch: Branch, lines: Array<{ productId: string; quantity: number; unitCost?: { amount: number; currency: string } }>, reason: string, idempotencyKey: string, referenceType: "retail_refund" | "retail_void"): Promise<void> {
  for (const line of lines) {
    const product = await ctx.db.query("products").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", line.productId)).unique();
    if (product) {
      await recordMovementInternal(ctx, actor, {
        branch,
        product,
        type: "return",
        quantity: line.quantity,
        unitCost: line.unitCost,
        reason,
        referenceType,
        referenceId: sale.publicId,
        idempotencyKey: `${idempotencyKey}:${product.publicId}`,
        financialPostingStatus: "not_posted",
      });
      continue;
    }
    const tombstone = await productTombstoneByPublicId(ctx, actor, line.productId);
    if (!tombstone) domainError("NOT_FOUND", "The product identity for this sale is no longer available.", { correlationId: actor.correlationId });
    await recordDeletedProductReturn(ctx, actor, tombstone, branch, line.quantity, line.unitCost, reason, sale.publicId, `${idempotencyKey}:${tombstone.productPublicId}`, referenceType);
  }
}

async function refundRetailSale(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePermission(actor, "payments.refund");
  const reason = optionalText(input.reason);
  requireReason(reason, actor.correlationId);
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  const lines = rawLines.map((raw) => ({ productId: optionalText(value(raw).productId) ?? "", quantity: integer(value(raw).quantity, Number.NaN) })).sort((a, b) => a.productId.localeCompare(b.productId));
  const saleId = optionalText(input.saleId) ?? "";
  const requestHash = JSON.stringify({ saleId, lines, reason });
  const { sale, branch } = await retailSaleForMutation(ctx, actor, saleId);
  // Resolve and authorize the sale's organization/branch before consulting
  // the idempotency store. Otherwise a scoped actor could replay a receipt
  // from another branch merely by guessing a previously-used request key.
  const replay = await idempotentResult(ctx, actor, "operations.retail.refund", idempotencyKey, requestHash);
  if (replay) return replay;
  if (sale.status === "voided") domainError("CONFLICT", "Voided retail sales cannot be refunded.", { correlationId: actor.correlationId });
  if (sale.status === "refunded") domainError("CONFLICT", "This retail sale is already fully refunded.", { correlationId: actor.correlationId });
  if (lines.length === 0 || lines.length > sale.lines.length) domainError("VALIDATION_ERROR", "Choose at least one sold item to refund.", { correlationId: actor.correlationId });
  const returned = new Map((sale.returnedLines ?? []).map((line) => [line.productId, line.quantity]));
  const seen = new Set<string>();
  let refundMinor = 0;
  for (const line of lines) {
    const sold = sale.lines.find((candidate) => candidate.productId === line.productId);
    if (!sold || seen.has(line.productId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) domainError("VALIDATION_ERROR", "Refund lines must be unique sold products with positive whole quantities.", { correlationId: actor.correlationId });
    seen.add(line.productId);
    if ((returned.get(line.productId) ?? 0) + line.quantity > sold.quantity) domainError("CONFLICT", `${sold.productName} exceeds the remaining refundable quantity.`, { correlationId: actor.correlationId });
    refundMinor += sold.unitPriceMinor * line.quantity;
  }
  const now = Date.now();
  const refundedMinor = (sale.refundedMinor ?? 0) + refundMinor;
  const nextReturned = [...returned.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  for (const line of lines) {
    const existing = nextReturned.find((candidate) => candidate.productId === line.productId);
    if (existing) existing.quantity += line.quantity;
    else nextReturned.push({ ...line });
  }
  const status = refundedMinor >= sale.totalMinor ? "refunded" as const : "partially_refunded" as const;
  const openShift = await openCashShiftForBranch(ctx, actor, branch);
  if (sale.method === "cash" && !openShift) domainError("NO_OPEN_SHIFT", "Open a cash shift before recording a cash refund.", { correlationId: actor.correlationId });
  const linesWithCost = lines.map((line) => {
    const sold = sale.lines.find((candidate) => candidate.productId === line.productId);
    const unitCost = sold?.unitCostMinor !== undefined && sold.unitCostCurrency ? { amount: sold.unitCostMinor, currency: sold.unitCostCurrency } : undefined;
    return { ...line, unitCost };
  });
  await restoreRetailStock(ctx, actor, sale, branch, linesWithCost, reason!, idempotencyKey, "retail_refund");
  await ctx.db.patch(sale._id, { status, refundedMinor, returnedLines: nextReturned, refundReason: reason, updatedAt: now });
  await patchRetailPayment(ctx, actor, sale, { status, refundedAmount: { amount: refundedMinor, currency: sale.currency }, refundReason: reason });

  const refundReceipt = await allocateRetailReceipt(ctx, actor);
  const refundPaymentId = `retail-refund-${crypto.randomUUID()}`;
  const refundShiftId = openShift ? cashShiftPublicId(openShift) : undefined;
  const refundReceiptData = { id: refundReceipt.id, receiptNumber: refundReceipt.number, paymentId: refundPaymentId, retailSaleId: sale.publicId, issuedAt: iso(now), occurredAt: iso(now), shiftId: refundShiftId, kind: "refund", amount: { amount: -refundMinor, currency: sale.currency }, method: sale.method, status: "completed", customer: sale.customer, externalReference: sale.externalReference, idempotencyKey, originalPaymentId: `retail-payment-${sale.publicId}`, refundReason: reason };
  await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "receipt", publicId: refundReceipt.id, branchId: branch._id, memberPublicId: sale.memberId, createdAt: now, updatedAt: now, data: { ...refundReceiptData, organizationId: publicOrganizationId(actor.organization) } });
  await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "payment", publicId: refundPaymentId, branchId: branch._id, memberPublicId: sale.memberId, createdAt: now, updatedAt: now, data: { id: refundPaymentId, organizationId: publicOrganizationId(actor.organization), branchId: publicBranchId(branch), memberId: sale.memberId, customer: sale.customer, type: "refund", amount: { amount: -refundMinor, currency: sale.currency }, method: sale.method, status: "completed", receiptId: refundReceipt.id, receiptNumber: refundReceipt.number, collectedById: publicUserId(actor.user), collectedByName: actor.user.fullName, shiftId: refundShiftId, idempotencyKey, originalPaymentId: `retail-payment-${sale.publicId}`, retailSaleId: sale.publicId, refundReason: reason, occurredAt: iso(now) } });
  await audit(ctx, actor, { action: "operations.retail_sale.refund", entityType: "retail_sale", entityId: sale.publicId, entityLabel: sale.receiptNumber, summary: `Refunded ${sale.currency} ${(refundMinor / 1000).toFixed(3)} from retail sale ${sale.receiptNumber}`, reason, before: { status: sale.status, refundedMinor: sale.refundedMinor ?? 0 }, after: { status, refundedMinor, returnedLines: nextReturned }, branchId: publicBranchId(branch) });
  const updated = await ctx.db.get(sale._id);
  if (!updated) domainError("NOT_FOUND", "Retail sale could not be loaded after refund.", { correlationId: actor.correlationId });
  const result = retailReceiptDetail(updated, refundReceiptData, { receiptFooter: actor.organization.receiptFooter ?? "Thank you.", taxRatePercent: actor.organization.taxRatePercent ?? 0 }, branch, actor);
  await saveIdempotentResult(ctx, actor, "operations.retail.refund", idempotencyKey, requestHash, result);
  return result;
}

async function voidRetailSale(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePermission(actor, "payments.void");
  const reason = optionalText(input.reason);
  requireReason(reason, actor.correlationId);
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  const saleId = optionalText(input.saleId) ?? "";
  const requestHash = JSON.stringify({ saleId, reason });
  const { sale, branch } = await retailSaleForMutation(ctx, actor, saleId);
  // Branch authorization must happen before idempotent replay for the same
  // reason as refunds: a replay response is still sensitive receipt data.
  const replay = await idempotentResult(ctx, actor, "operations.retail.void", idempotencyKey, requestHash);
  if (replay) return replay;
  if (sale.status === "voided") domainError("CONFLICT", "This retail sale is already voided.", { correlationId: actor.correlationId });
  if ((sale.refundedMinor ?? 0) > 0) domainError("CONFLICT", "A partially refunded retail sale cannot be voided.", { correlationId: actor.correlationId });
  if (sale.method === "cash") {
    const openShift = sale.shiftId ? await openCashShiftForBranch(ctx, actor, branch, sale.shiftId) : null;
    if (!openShift) {
      domainError("NO_OPEN_SHIFT", "Cash sales can only be voided while their original cash shift is open.", { correlationId: actor.correlationId });
    }
  }
  const timeZone = actor.organization.timezone || "Asia/Amman";
  if (businessDate(sale.createdAt, timeZone) !== businessDate(Date.now(), timeZone)) domainError("CONFLICT", "Retail sales can only be voided on the same business day. Issue a refund instead.", { correlationId: actor.correlationId });
  const lines = sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCost: line.unitCostMinor !== undefined && line.unitCostCurrency ? { amount: line.unitCostMinor, currency: line.unitCostCurrency } : undefined }));
  await restoreRetailStock(ctx, actor, sale, branch, lines, reason!, idempotencyKey, "retail_void");
  const now = Date.now();
  await ctx.db.patch(sale._id, { status: "voided", returnedLines: lines.map(({ productId, quantity }) => ({ productId, quantity })), voidReason: reason, voidedAt: now, updatedAt: now });
  await patchRetailPayment(ctx, actor, sale, { status: "voided", voidReason: reason });
  await audit(ctx, actor, { action: "operations.retail_sale.void", entityType: "retail_sale", entityId: sale.publicId, entityLabel: sale.receiptNumber, summary: `Voided retail sale ${sale.receiptNumber}`, reason, before: { status: sale.status }, after: { status: "voided", returnedLines: lines }, branchId: publicBranchId(branch) });
  const updated = await ctx.db.get(sale._id);
  if (!updated) domainError("NOT_FOUND", "Retail sale could not be loaded after void.", { correlationId: actor.correlationId });
  const result = retailReceiptDetail(updated, await originalRetailReceipt(ctx, actor, updated), { receiptFooter: actor.organization.receiptFooter ?? "Thank you.", taxRatePercent: actor.organization.taxRatePercent ?? 0 }, branch, actor);
  await saveIdempotentResult(ctx, actor, "operations.retail.void", idempotencyKey, requestHash, result);
  return result;
}

async function allocateRetailReceipt(ctx: MutationCtx, actor: ActorContext): Promise<{ id: string; number: string }> {
  const current = actor.organization.nextReceiptNumber ?? 1001;
  await ctx.db.patch(actor.organization._id, { nextReceiptNumber: current + 1, updatedAt: Date.now() });
  return { id: `receipt-${crypto.randomUUID()}`, number: `${actor.organization.receiptPrefix ?? "RV"}-${String(current).padStart(6, "0")}` };
}

async function listInventory(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const requestedBranch = optionalText(input.branchId);
  const branches = requestedBranch ? [await branchByPublicId(ctx, actor, requestedBranch)] : await visibleBranches(ctx, actor);
  const requestedProductId = optionalText(input.productId);
  const product = requestedProductId ? await ctx.db.query("products").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", requestedProductId)).unique() : undefined;
  const tombstone = requestedProductId ? await productTombstoneByPublicId(ctx, actor, requestedProductId) : null;
  if (requestedProductId && !product && !tombstone) domainError("NOT_FOUND", "Product not found.", { correlationId: actor.correlationId });
  const internalProductId = product?._id ?? (tombstone?.originalProductId as Id<"products"> | undefined);
  const rows = (await Promise.all(branches.map((branch) => ctx.db.query("inventoryBalances").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect()))).flat().filter((row) => row.sellable !== false && (!internalProductId || row.productId === internalProductId));
  const branchMap = await branchPublicMap(ctx, actor);
  const productMap = await productPublicMap(ctx, actor);
  const tombstones = await productTombstoneMap(ctx, actor);
  return rows.sort((left, right) => String(left.productId).localeCompare(String(right.productId))).map((row) => ({ id: row.publicId, organizationId: publicOrganizationId(actor.organization), branchId: branchMap.get(String(row.branchId)) ?? String(row.branchId), productId: productMap.get(String(row.productId)) ?? tombstones.get(String(row.productId))?.productPublicId ?? String(row.productId), quantityOnHand: row.quantityOnHand, committedQuantity: row.committedQuantity, availableQuantity: row.quantityOnHand - row.committedQuantity, totalCost: money(row.totalCostMinor, row.totalCostCurrency), lastMovementAt: row.lastMovementAt ? iso(row.lastMovementAt) : undefined, updatedAt: iso(row.updatedAt) }));
}

async function listStockMovements(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const branch = input.branchId ? await branchByPublicId(ctx, actor, optionalText(input.branchId)) : undefined;
  const requestedProductId = optionalText(input.productId);
  const product = requestedProductId ? await ctx.db.query("products").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", requestedProductId)).unique() : undefined;
  const tombstone = requestedProductId ? await productTombstoneByPublicId(ctx, actor, requestedProductId) : null;
  if (requestedProductId && !product && !tombstone) domainError("NOT_FOUND", "Product not found.", { correlationId: actor.correlationId });
  const internalProductId = product?._id ?? (tombstone?.originalProductId as Id<"products"> | undefined);
  let rows = branch
    ? await ctx.db.query("stockMovements").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect()
    : await ctx.db.query("stockMovements").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  rows = rows.filter((row) => (!branch || row.branchId === branch._id) && (!internalProductId || row.productId === internalProductId) && (actor.branchScope === "all" || actor.branchIds.includes(row.branchId))).sort((left, right) => right.occurredAt - left.occurredAt);
  const page = Math.max(1, integer(input.page, 1));
  const pageSize = Math.min(100, Math.max(1, integer(input.pageSize, 20)));
  const branchMap = await branchPublicMap(ctx, actor);
  const productMap = await productPublicMap(ctx, actor);
  const tombstones = await productTombstoneMap(ctx, actor);
  const users = await Promise.all([...new Set(rows.map((row) => String(row.createdByUserId)))].map(async (id) => await ctx.db.get(id as Id<"users">)));
  const userMap = new Map(users.filter((user): user is Doc<"users"> => Boolean(user)).map((user) => [String(user._id), publicUserId(user)]));
  return { items: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => movementView(row, publicOrganizationId(actor.organization), branchMap, productMap, tombstones, userMap.get(String(row.createdByUserId)))), page, pageSize, totalItems: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) };
}

async function lowStockSnapshots(ctx: ReadContext, actor: ActorContext, input: Data): Promise<Data[]> {
  const requestedBranch = optionalText(input.branchId);
  const branches = requestedBranch ? [await branchByPublicId(ctx, actor, requestedBranch)] : await visibleBranches(ctx, actor);
  const products = (await ctx.db.query("products").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect()).filter((product) => product.status === "active");
  const now = Date.now();
  const snapshots: Data[] = [];
  for (const branch of branches) {
    for (const product of products) {
      const balance = await balanceRow(ctx, actor.organization._id, branch._id, product._id);
      const quantityOnHand = balance?.quantityOnHand ?? 0;
      const committedQuantity = balance?.committedQuantity ?? 0;
      const availableQuantity = quantityOnHand - committedQuantity;
      if (availableQuantity > product.reorderPoint) continue;
      const publicId = `alert-${publicBranchId(branch)}-${product.publicId}`;
      const existing = await ctx.db.query("inventoryAlerts").withIndex("by_branch_product", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("productId", product._id)).unique();
      snapshots.push({ id: existing?.publicId ?? publicId, organizationId: publicOrganizationId(actor.organization), branchId: publicBranchId(branch), productId: product.publicId, quantityOnHand, committedQuantity, availableQuantity, reorderPoint: product.reorderPoint, status: existing?.status ?? "open", dismissedAt: existing?.dismissedAt ? iso(existing.dismissedAt) : undefined, dismissedReason: existing?.dismissedReason, updatedAt: iso(existing?.updatedAt ?? now) });
    }
  }
  return snapshots;
}

async function listLowStockAlerts(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const alerts = await lowStockSnapshots(ctx, actor, input);
  return input.includeDismissed === true ? alerts : alerts.filter((alert) => alert.status === "open");
}

async function refreshLowStockAlerts(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const snapshots = await lowStockSnapshots(ctx, actor, input);
  const now = Date.now();
  for (const snapshot of snapshots) {
    const branch = await branchByPublicId(ctx, actor, snapshot.branchId);
    const product = await productByPublicId(ctx, actor, snapshot.productId);
    const existing = await ctx.db.query("inventoryAlerts").withIndex("by_branch_product", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("productId", product._id)).unique();
    if (existing) await ctx.db.patch(existing._id, { updatedAt: now });
    else await ctx.db.insert("inventoryAlerts", { organizationId: actor.organization._id, publicId: snapshot.id, branchId: branch._id, productId: product._id, status: "open", updatedAt: now });
  }
  return await listLowStockAlerts(ctx, actor, { ...input, includeDismissed: true });
}

async function dismissLowStockAlert(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const alertId = optionalText(input.alertId);
  const alert = alertId ? await ctx.db.query("inventoryAlerts").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", alertId)).unique() : null;
  if (!alert) domainError("NOT_FOUND", "Low-stock alert not found. Refresh the alert queue and try again.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(alert.branchId);
  assertBranchAccess(actor, branch);
  const now = Date.now();
  await ctx.db.patch(alert._id, { status: "dismissed", dismissedAt: now, dismissedReason: reason, updatedAt: now });
  await audit(ctx, actor, { action: "operations.inventory_alert.dismiss", entityType: "inventory_alert", entityId: alert.publicId, entityLabel: alert.publicId, summary: "Low-stock alert dismissed", reason, branchId: publicBranchId(branch) });
  const snapshots = await lowStockSnapshots(ctx, actor, { branchId: publicBranchId(branch), includeDismissed: true });
  return snapshots.find((item) => item.id === alert.publicId) ?? { id: alert.publicId, status: "dismissed", dismissedAt: iso(now), dismissedReason: reason };
}

function purchaseOrderView(order: PurchaseOrder, organizationId: string, branchId: string, supplierId: string | undefined, products = new Map<string, string>(), approvedById?: string): Data {
  const sourceType = order.sourceType ?? (supplierId ? "supplier" : "private");
  return { id: order.publicId, organizationId, branchId, sourceType, supplierId, supplierName: sourceType === "private" ? "Private purchase" : order.supplierName, lines: order.lines.map((line) => ({ productId: products.get(String(line.productId)) ?? String(line.productId), sku: line.sku, productName: line.productName, orderedQuantity: line.orderedQuantity, receivedQuantity: line.receivedQuantity, unitCost: { amount: line.unitCostMinor, currency: line.unitCostCurrency }, lineTotal: { amount: line.lineTotalMinor, currency: line.unitCostCurrency } })), status: order.status, currency: order.currency, total: { amount: order.totalMinor, currency: order.currency }, supplierInvoiceReference: order.supplierInvoiceReference, notes: order.notes, approvedAt: order.approvedAt ? iso(order.approvedAt) : undefined, approvedById: approvedById ?? (order.approvedByUserId ? String(order.approvedByUserId) : undefined), receivedAt: order.receivedAt ? iso(order.receivedAt) : undefined, createdAt: iso(order.createdAt), updatedAt: iso(order.updatedAt) };
}

async function purchaseOrderViewResolved(ctx: ReadContext, actor: ActorContext, order: PurchaseOrder): Promise<Data> {
  const branch = await ctx.db.get(order.branchId);
  assertBranchAccess(actor, branch);
  const supplier = order.supplierId ? await ctx.db.get(order.supplierId) : null;
  if (order.supplierId && (!supplier || supplier.organizationId !== actor.organization._id)) domainError("NOT_FOUND", "Supplier not found.", { correlationId: actor.correlationId });
  const products = await Promise.all(order.lines.map((line) => ctx.db.get(line.productId)));
  const tombstones = await productTombstoneMap(ctx, actor);
  const productMap = new Map(products.filter((product): product is Product => Boolean(product)).map((product) => [String(product._id), product.publicId]));
  for (const line of order.lines) {
    const tombstone = tombstones.get(String(line.productId));
    if (tombstone) productMap.set(String(line.productId), tombstone.productPublicId);
  }
  const approvedBy = order.approvedByUserId ? await ctx.db.get(order.approvedByUserId) : undefined;
  return purchaseOrderView(order, publicOrganizationId(actor.organization), publicBranchId(branch), supplier?.publicId, productMap, approvedBy ? publicUserId(approvedBy) : undefined);
}

async function listPurchaseOrders(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const requestedBranch = optionalText(input.branchId);
  const branch = requestedBranch ? await branchByPublicId(ctx, actor, requestedBranch) : undefined;
  let rows = await ctx.db.query("purchaseOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  rows = rows.filter((row) => (!branch || row.branchId === branch._id) && (actor.branchScope === "all" || actor.branchIds.includes(row.branchId)) && (!input.status || row.status === input.status));
  rows.sort((left, right) => right.createdAt - left.createdAt);
  return await Promise.all(rows.map((row) => purchaseOrderViewResolved(ctx, actor, row)));
}

async function createPurchaseOrder(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const requestedSource = optionalText(input.sourceType) ?? (optionalText(input.supplierId) ? "supplier" : "private");
  if (requestedSource !== "supplier" && requestedSource !== "private") domainError("VALIDATION_ERROR", "Purchase source is invalid.", { correlationId: actor.correlationId });
  const supplier = requestedSource === "supplier" ? await supplierByPublicId(ctx, actor, optionalText(input.supplierId)) : null;
  if (supplier && supplier.status !== "active") domainError("CONFLICT", "Archived suppliers cannot receive purchase orders.", { correlationId: actor.correlationId });
  if (supplier && supplier.branchIds.length > 0 && !supplier.branchIds.includes(branch._id)) domainError("VALIDATION_ERROR", "Supplier is not configured for this branch.", { correlationId: actor.correlationId });
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length === 0 || rawLines.length > 100) domainError("VALIDATION_ERROR", "A purchase order must contain 1 to 100 product lines.", { correlationId: actor.correlationId });
  const seen = new Set<string>();
  const currency = actor.organization.currency;
  const lines: Array<{ productId: Id<"products">; sku: string; productName: string; orderedQuantity: number; receivedQuantity: number; unitCostMinor: number; unitCostCurrency: string; lineTotalMinor: number }> = [];
  for (const raw of rawLines) {
    const product = await productByPublicId(ctx, actor, optionalText(value(raw).productId));
    if (product.status !== "active") domainError("CONFLICT", "Archived products cannot be ordered.", { correlationId: actor.correlationId });
    if (seen.has(product.publicId)) domainError("VALIDATION_ERROR", "A purchase order cannot repeat a product line.", { correlationId: actor.correlationId });
    seen.add(product.publicId);
    const quantity = integer(value(raw).quantity, Number.NaN);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) domainError("VALIDATION_ERROR", "Purchase quantities must be positive whole numbers.", { correlationId: actor.correlationId });
    const unitCost = requireNonNegativeMoney(value(raw).unitCost, currency, "Purchase unit cost", actor.correlationId);
    if (!unitCost) domainError("VALIDATION_ERROR", "Purchase unit cost is required.", { correlationId: actor.correlationId });
    lines.push({ productId: product._id, sku: product.sku, productName: product.name, orderedQuantity: quantity, receivedQuantity: 0, unitCostMinor: unitCost.amount, unitCostCurrency: unitCost.currency, lineTotalMinor: quantity * unitCost.amount });
  }
  const totalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const now = Date.now();
  const publicId = `po-${crypto.randomUUID()}`;
  const supplierName = supplier?.name ?? "Private purchase";
  const id = await ctx.db.insert("purchaseOrders", { organizationId: actor.organization._id, publicId, branchId: branch._id, sourceType: requestedSource, supplierId: supplier?._id, supplierName, lines, status: "draft", currency, totalMinor, supplierInvoiceReference: optionalText(input.supplierInvoiceReference), notes: optionalText(input.notes), createdAt: now, updatedAt: now });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Purchase order could not be created.", { correlationId: actor.correlationId });
  const createdView = await purchaseOrderViewResolved(ctx, actor, created);
  await audit(ctx, actor, { action: "operations.purchase_order.create", entityType: "purchase_order", entityId: created.publicId, entityLabel: `${supplierName} · ${created.publicId}`, summary: requestedSource === "private" ? "Private purchase order created" : "Purchase order created", branchId: publicBranchId(branch), after: createdView });
  return createdView;
}

async function updateCommitted(ctx: MutationCtx, actor: ActorContext, branchId: Id<"branches">, productId: Id<"products">, delta: number): Promise<void> {
  const balance = await ensureBalance(ctx, actor, branchId, productId);
  const next = balance.committedQuantity + delta;
  if (next < 0) domainError("CONFLICT", "Committed inventory cannot become negative.", { correlationId: actor.correlationId });
  await ctx.db.patch(balance._id, { committedQuantity: next, updatedAt: Date.now() });
}

async function approvePurchaseOrder(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const orderId = optionalText(input.id);
  const order = orderId ? await ctx.db.query("purchaseOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", orderId)).unique() : null;
  if (!order) domainError("NOT_FOUND", "Purchase order not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(order.branchId);
  assertBranchAccess(actor, branch);
  if (order.status !== "draft") domainError("CONFLICT", "Only draft purchase orders can be approved.", { correlationId: actor.correlationId });
  const reason = optionalText(input.reason);
  const now = Date.now();
  for (const line of order.lines) await updateCommitted(ctx, actor, order.branchId, line.productId, line.orderedQuantity);
  await ctx.db.patch(order._id, { status: "approved", approvedAt: now, approvedByUserId: actor.user._id, updatedAt: now });
  const updated = await ctx.db.get(order._id);
  if (!updated) domainError("NOT_FOUND", "Purchase order could not be loaded after approval.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.purchase_order.approve", entityType: "purchase_order", entityId: order.publicId, entityLabel: order.supplierName, summary: "Purchase order approved", reason, before: { status: order.status }, after: { status: updated.status, total: updated.totalMinor }, branchId: publicBranchId(branch) });
  return await purchaseOrderViewResolved(ctx, actor, updated);
}

async function receivePurchaseOrder(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const orderId = optionalText(input.purchaseOrderId);
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded receiving idempotency key is required.", { correlationId: actor.correlationId });
  const requestHash = JSON.stringify({ purchaseOrderId: orderId, lines: input.lines });
  const order = orderId ? await ctx.db.query("purchaseOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", orderId)).unique() : null;
  if (!order) domainError("NOT_FOUND", "Purchase order not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(order.branchId);
  // The target order and its branch are resolved before consulting the
  // idempotency record. A known key is not a bearer token: a caller must still
  // belong to this tenant and retain access to the order's branch. Replay is
  // allowed after a successful receive changes the order status (and after a
  // branch is deactivated), but never across an organization or branch scope.
  if (!branch || branch.organizationId !== actor.organization._id) domainError("NOT_FOUND", "Purchase order not found.", { correlationId: actor.correlationId });
  if (actor.branchScope === "selected" && !actor.branchIds.includes(branch._id)) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  const existingResult = await idempotentResult(ctx, actor, "operations.purchase_order.receive", idempotencyKey, requestHash);
  if (existingResult) return existingResult;
  assertBranchAccess(actor, branch);
  if (order.status !== "approved" && order.status !== "partially_received") domainError("CONFLICT", "Only approved purchase orders can be received.", { correlationId: actor.correlationId });
  const requested = Array.isArray(input.lines) && input.lines.length > 0 ? input.lines : (await Promise.all(order.lines.filter((line) => line.receivedQuantity < line.orderedQuantity).map(async (line) => ({ productId: (await ctx.db.get(line.productId))?.publicId ?? String(line.productId), quantity: line.orderedQuantity - line.receivedQuantity }))));
  if (requested.length === 0) domainError("CONFLICT", "This purchase order has no remaining quantity to receive.", { correlationId: actor.correlationId });
  const lines = order.lines.map((line) => ({ ...line }));
  const movementKeys: string[] = [];
  for (const raw of requested) {
    const productId = optionalText(value(raw).productId);
    const product = await productByPublicId(ctx, actor, productId);
    const line = lines.find((candidate) => candidate.productId === product._id || candidate.sku === productId);
    if (!line) domainError("VALIDATION_ERROR", "Received product is not on this purchase order.", { correlationId: actor.correlationId });
    const quantity = integer(value(raw).quantity, Number.NaN);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || line.receivedQuantity + quantity > line.orderedQuantity) domainError("VALIDATION_ERROR", "Received quantity exceeds the remaining purchase order quantity.", { correlationId: actor.correlationId });
    const suppliedCost = value(raw).unitCost === undefined ? { amount: line.unitCostMinor, currency: line.unitCostCurrency } : requireNonNegativeMoney(value(raw).unitCost, actor.organization.currency, "Received unit cost", actor.correlationId);
    const key = `${idempotencyKey}:${product.publicId}`;
    await recordMovementInternal(ctx, actor, { branch, product, type: "receive", quantity, unitCost: suppliedCost, reason: `Purchase order ${order.publicId} receiving`, referenceType: "purchase_order", referenceId: order.publicId, idempotencyKey: key, financialPostingStatus: "not_posted" });
    line.receivedQuantity += quantity;
    await updateCommitted(ctx, actor, order.branchId, product._id, -quantity);
    movementKeys.push(key);
  }
  const complete = lines.every((line) => line.receivedQuantity === line.orderedQuantity);
  const now = Date.now();
  await ctx.db.patch(order._id, { lines, status: complete ? "received" : "partially_received", receivedAt: complete ? now : order.receivedAt, updatedAt: now });
  const updated = await ctx.db.get(order._id);
  if (!updated) domainError("NOT_FOUND", "Purchase order could not be loaded after receiving.", { correlationId: actor.correlationId });
  const view = await purchaseOrderViewResolved(ctx, actor, updated);
  await saveIdempotentResult(ctx, actor, "operations.purchase_order.receive", idempotencyKey, requestHash, view);
  await audit(ctx, actor, { action: "operations.purchase_order.receive", entityType: "purchase_order", entityId: order.publicId, entityLabel: order.supplierName, summary: complete ? "Purchase order fully received" : "Purchase order partially received", after: { status: updated.status, movementKeys }, branchId: publicBranchId(branch) });
  return view;
}

async function notifyPurchaseOrderSupplier(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const orderId = optionalText(input.purchaseOrderId);
  const order = orderId ? await ctx.db.query("purchaseOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", orderId)).unique() : null;
  if (!order) domainError("NOT_FOUND", "Purchase order not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(order.branchId);
  assertBranchAccess(actor, branch);
  const channel = input.channel === "supplier_sms" ? "supplier_sms" : "supplier_email";
  const result = { purchaseOrderId: order.publicId, status: "not_configured" as const, channel, detail: order.sourceType === "private" || !order.supplierId ? "This is a private purchase, so no supplier contact is recorded or notified." : "No supplier provider is configured; no external notification was sent.", attemptedAt: iso(Date.now()) };
  await audit(ctx, actor, { action: "operations.supplier_notification.preview", entityType: "purchase_order", entityId: order.publicId, entityLabel: order.supplierName, summary: "Supplier notification held in sandbox", reason, after: result, branchId: publicBranchId(branch) });
  return result;
}

async function facilityView(ctx: ReadContext, actor: ActorContext, task: FacilityTask): Promise<Data> {
  const branch = await ctx.db.get(task.branchId);
  const zone = await ctx.db.get(task.zoneId);
  assertBranchAccess(actor, branch);
  if (!zone) domainError("NOT_FOUND", "Facility zone not found.", { correlationId: actor.correlationId });
  return { id: task.publicId, organizationId: publicOrganizationId(actor.organization), branchId: publicBranchId(branch), zoneId: zone.publicId, zoneName: zone.name, kind: task.kind, severity: task.severity, status: task.status, title: task.title, notes: task.notes, assigneeId: task.assigneeId, dueAt: task.dueAt ? iso(task.dueAt) : undefined, completedAt: task.completedAt ? iso(task.completedAt) : undefined, trafficContext: task.trafficContext ? { checkInsLastHour: task.trafficContext.checkInsLastHour, occupancyPercent: task.trafficContext.occupancyPercent, capturedAt: task.trafficContext.capturedAt ? iso(task.trafficContext.capturedAt) : undefined } : undefined, suppliesCost: money(task.suppliesCostMinor, task.suppliesCostCurrency), financialPostingStatus: task.financialPostingStatus, financialSourceId: task.financialSourceId, createdAt: iso(task.createdAt), updatedAt: iso(task.updatedAt) };
}

async function listFacilityTasks(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const branch = input.branchId ? await branchByPublicId(ctx, actor, optionalText(input.branchId)) : undefined;
  const zone = input.zoneId ? await zoneByPublicId(ctx, actor, optionalText(input.zoneId), branch) : undefined;
  let rows = zone
    ? await ctx.db.query("facilityTasks").withIndex("by_zone", (q) => q.eq("organizationId", actor.organization._id).eq("zoneId", zone._id)).collect()
    : branch
      ? await ctx.db.query("facilityTasks").withIndex("by_branch_status", (q) => {
        const scoped = q.eq("organizationId", actor.organization._id).eq("branchId", branch._id);
        return input.status ? scoped.eq("status", input.status) : scoped;
      }).collect()
      : input.status
        ? await ctx.db.query("facilityTasks").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", input.status)).collect()
        : await ctx.db.query("facilityTasks").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  rows = rows.filter((row) => (!branch || row.branchId === branch._id) && (!zone || row.zoneId === zone._id) && (!input.status || row.status === input.status) && (!input.kind || row.kind === input.kind) && (actor.branchScope === "all" || actor.branchIds.includes(row.branchId))).sort((left, right) => right.updatedAt - left.updatedAt);
  return await Promise.all(rows.map((row) => facilityView(ctx, actor, row)));
}

async function upsertFacilityTask(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const zone = await zoneByPublicId(ctx, actor, optionalText(input.zoneId), branch);
  const kind = assertOneOf(input.kind, FACILITY_KINDS, "Facility task kind", actor.correlationId);
  const severity = assertOneOf(input.severity, FACILITY_SEVERITIES, "Facility task severity", actor.correlationId);
  const requestedStatus = input.status === undefined ? undefined : assertOneOf(input.status, FACILITY_STATUSES, "Facility task status", actor.correlationId);
  const status = requestedStatus ?? "open";
  const title = text(input.title).trim();
  if (!title || title.length > 160) domainError("VALIDATION_ERROR", "Facility task title must be between 1 and 160 characters.", { correlationId: actor.correlationId });
  const assignee = await userByPublicId(ctx, actor, optionalText(input.assigneeId));
  const dueAt = input.dueAt === undefined ? undefined : Date.parse(text(input.dueAt));
  if (input.dueAt !== undefined && !Number.isFinite(dueAt)) domainError("VALIDATION_ERROR", "Facility task due date is invalid.", { correlationId: actor.correlationId });
  const trafficRaw = input.trafficContext === undefined ? undefined : value(input.trafficContext);
  const trafficContext = trafficRaw ? { checkInsLastHour: trafficRaw.checkInsLastHour === undefined ? undefined : integer(trafficRaw.checkInsLastHour, Number.NaN), occupancyPercent: trafficRaw.occupancyPercent === undefined ? undefined : finite(trafficRaw.occupancyPercent, Number.NaN), capturedAt: trafficRaw.capturedAt === undefined ? undefined : Date.parse(text(trafficRaw.capturedAt)) } : undefined;
  if (trafficContext && ((trafficContext.checkInsLastHour !== undefined && (!Number.isSafeInteger(trafficContext.checkInsLastHour) || trafficContext.checkInsLastHour < 0)) || (trafficContext.occupancyPercent !== undefined && (!Number.isFinite(trafficContext.occupancyPercent) || trafficContext.occupancyPercent < 0 || trafficContext.occupancyPercent > 100)) || (trafficContext.capturedAt !== undefined && !Number.isFinite(trafficContext.capturedAt)))) domainError("VALIDATION_ERROR", "Traffic context must contain recorded non-negative check-ins and 0–100 occupancy.", { correlationId: actor.correlationId });
  const suppliesCost = requireNonNegativeMoney(input.suppliesCost, actor.organization.currency, "Supplies cost", actor.correlationId);
  const inputId = optionalText(input.id);
  const existing = inputId ? await ctx.db.query("facilityTasks").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", inputId)).unique() : null;
  if (existing && existing.branchId !== branch._id) domainError("VALIDATION_ERROR", "A facility task cannot move between branches.", { correlationId: actor.correlationId });
  const now = Date.now();
  const effectiveStatus = existing ? requestedStatus ?? existing.status : status;
  const immutableStatus = existing ? await immutableAccountingStatus(ctx, actor, "facility_supplies", existing.publicId, existing.financialPostingStatus) : undefined;
  // A source-posted task can still receive harmless operational edits, but
  // omitted source fields must remain intact instead of being cleared by a
  // partial form submission.
  const completedAt = immutableStatus && input.status === undefined
    ? existing?.completedAt
    : effectiveStatus === "completed" ? existing?.completedAt ?? now : undefined;
  const suppliesCostMinor = immutableStatus && input.suppliesCost === undefined ? existing?.suppliesCostMinor : suppliesCost?.amount;
  const suppliesCostCurrency = immutableStatus && input.suppliesCost === undefined ? existing?.suppliesCostCurrency : suppliesCost?.currency;
  if (existing && immutableStatus && (
    zone._id !== existing.zoneId ||
    effectiveStatus !== existing.status ||
    completedAt !== existing.completedAt ||
    suppliesCostMinor !== existing.suppliesCostMinor ||
    suppliesCostCurrency !== existing.suppliesCostCurrency
  )) {
    rejectImmutableAccountingMutation(actor, "This facility task", immutableStatus);
  }
  const fields = { branchId: branch._id, zoneId: zone._id, kind, severity, status: effectiveStatus, title, notes: optionalText(input.notes), assigneeId: assignee ? publicUserId(assignee) : undefined, dueAt, completedAt, trafficContext: trafficContext ? { checkInsLastHour: trafficContext.checkInsLastHour, occupancyPercent: trafficContext.occupancyPercent, capturedAt: trafficContext.capturedAt } : undefined, suppliesCostMinor, suppliesCostCurrency, financialPostingStatus: existing?.financialPostingStatus ?? "not_posted", financialSourceId: existing?.financialSourceId, updatedAt: now };
  if (existing) {
    const before = await facilityView(ctx, actor, existing);
    await ctx.db.patch(existing._id, fields);
    const updated = await ctx.db.get(existing._id);
    if (!updated) domainError("NOT_FOUND", "Facility task could not be loaded after update.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.facility_task.update", entityType: "facility_task", entityId: updated.publicId, entityLabel: updated.title, summary: "Facility task updated", before, after: await facilityView(ctx, actor, updated), branchId: publicBranchId(branch) });
    return await facilityView(ctx, actor, updated);
  }
  const publicId = `facility-${crypto.randomUUID()}`;
  const id = await ctx.db.insert("facilityTasks", { organizationId: actor.organization._id, publicId, ...fields, createdAt: now });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Facility task could not be created.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.facility_task.create", entityType: "facility_task", entityId: created.publicId, entityLabel: created.title, summary: "Facility task created", after: await facilityView(ctx, actor, created), branchId: publicBranchId(branch) });
  return await facilityView(ctx, actor, created);
}

function equipmentAssetView(asset: EquipmentAsset, organizationId: string, branchId: string, zoneId?: string, issueCount = 0): Data {
  return { id: asset.publicId, organizationId, branchId, zoneId, code: asset.code, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, serialNumber: asset.serialNumber, purchaseDate: asset.purchaseDate, installationDate: asset.installationDate, purchaseCost: money(asset.purchaseCostMinor, asset.purchaseCostCurrency), warrantyEndDate: asset.warrantyEndDate, status: asset.status, expectedServiceIntervalDays: asset.expectedServiceIntervalDays, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths, issueCount, createdAt: iso(asset.createdAt), updatedAt: iso(asset.updatedAt) };
}

async function equipmentAssetViewResolved(ctx: ReadContext, actor: ActorContext, asset: EquipmentAsset): Promise<Data> {
  const branch = await ctx.db.get(asset.branchId);
  assertBranchAccess(actor, branch);
  const zone = asset.zoneId ? await ctx.db.get(asset.zoneId) : undefined;
  const issues = await ctx.db.query("equipmentIssues").withIndex("by_asset", (q) => q.eq("organizationId", actor.organization._id).eq("assetId", asset._id)).collect();
  return equipmentAssetView(asset, publicOrganizationId(actor.organization), publicBranchId(branch), zone?.publicId, issues.length);
}

async function listEquipmentAssets(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const branch = input.branchId ? await branchByPublicId(ctx, actor, optionalText(input.branchId)) : undefined;
  let rows = await ctx.db.query("equipmentAssets").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  rows = rows.filter((row) => (!branch || row.branchId === branch._id) && (!input.status || row.status === input.status) && (actor.branchScope === "all" || actor.branchIds.includes(row.branchId))).sort((left, right) => left.code.localeCompare(right.code));
  return await Promise.all(rows.map((row) => equipmentAssetViewResolved(ctx, actor, row)));
}

async function upsertEquipmentAsset(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const zone = input.zoneId ? await zoneByPublicId(ctx, actor, optionalText(input.zoneId), branch) : undefined;
  const code = text(input.code).trim().toUpperCase();
  const name = text(input.name).trim();
  const status = assertOneOf(input.status ?? "active", ASSET_STATUSES, "Equipment status", actor.correlationId);
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) domainError("VALIDATION_ERROR", "Equipment code must be 1–32 uppercase letters, numbers, underscores, or hyphens.", { correlationId: actor.correlationId });
  if (!name || name.length > 120) domainError("VALIDATION_ERROR", "Equipment name must be between 1 and 120 characters.", { correlationId: actor.correlationId });
  const purchaseCost = requireNonNegativeMoney(input.purchaseCost, actor.organization.currency, "Purchase cost", actor.correlationId);
  const expectedServiceIntervalDays = input.expectedServiceIntervalDays === undefined ? undefined : integer(input.expectedServiceIntervalDays, Number.NaN);
  const expectedUsefulLifeMonths = input.expectedUsefulLifeMonths === undefined ? undefined : integer(input.expectedUsefulLifeMonths, Number.NaN);
  if ((expectedServiceIntervalDays !== undefined && (!Number.isSafeInteger(expectedServiceIntervalDays) || expectedServiceIntervalDays < 1)) || (expectedUsefulLifeMonths !== undefined && (!Number.isSafeInteger(expectedUsefulLifeMonths) || expectedUsefulLifeMonths < 1 || expectedUsefulLifeMonths > 600))) domainError("VALIDATION_ERROR", "Equipment service intervals must be positive whole numbers and useful life must be between 1 and 600 months.", { correlationId: actor.correlationId });
  const inputId = optionalText(input.id);
  const existing = inputId ? await assetByPublicId(ctx, actor, inputId) : null;
  if (existing && existing.branchId !== branch._id) domainError("CONFLICT", "Equipment assets cannot be reassigned between branches; use a future transfer workflow.", { correlationId: actor.correlationId });
  if (existing && input.status !== undefined && input.status !== existing.status) {
    const allowed = existing.status === "active"
      ? ["maintenance", "retired", "replaced"]
      : existing.status === "maintenance" ? ["active", "retired", "replaced"] : [];
    if (!allowed.includes(status)) domainError("CONFLICT", `An equipment asset cannot move from ${existing.status} to ${status}.`, { correlationId: actor.correlationId });
  }
  if (input.status === "active" && existing) {
    const issues = await ctx.db.query("equipmentIssues").withIndex("by_asset", (q) => q.eq("organizationId", actor.organization._id).eq("assetId", existing._id)).collect();
    if (issues.some((issue) => issue.status !== "resolved" && issue.status !== "cancelled" && issue.safetyStatus === "out_of_service")) {
      domainError("CONFLICT", "This equipment has an unresolved out-of-service issue. Resolve the issue before marking the asset active.", { correlationId: actor.correlationId });
    }
  }
  // Retired/replaced assets remain available for maintenance and accounting
  // history, but their branch code should be reusable by a new live asset.
  // Only active/maintenance assets reserve a code.
  const duplicate = (await ctx.db.query("equipmentAssets").withIndex("by_branch_code", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("code", code)).collect()).find((candidate) => candidate.status === "active" || candidate.status === "maintenance");
  if (duplicate && duplicate._id !== existing?._id) domainError("CONFLICT", "That equipment code is already used in this branch.", { correlationId: actor.correlationId });
  const immutableStatus = existing ? await immutableAccountingStatus(ctx, actor, "equipment_acquisition", existing.publicId) : undefined;
  const purchaseDate = immutableStatus && input.purchaseDate === undefined ? existing?.purchaseDate : optionalText(input.purchaseDate);
  const purchaseCostMinor = immutableStatus && input.purchaseCost === undefined ? existing?.purchaseCostMinor : purchaseCost?.amount;
  const purchaseCostCurrency = immutableStatus && input.purchaseCost === undefined ? existing?.purchaseCostCurrency : purchaseCost?.currency;
  if (existing && immutableStatus && (
    purchaseDate !== existing.purchaseDate ||
    purchaseCostMinor !== existing.purchaseCostMinor ||
    purchaseCostCurrency !== existing.purchaseCostCurrency
  )) {
    rejectImmutableAccountingMutation(actor, "This equipment acquisition", immutableStatus);
  }
  const fields = { branchId: branch._id, zoneId: zone?._id, code, name, manufacturer: optionalText(input.manufacturer), model: optionalText(input.model), serialNumber: optionalText(input.serialNumber), purchaseDate, installationDate: optionalText(input.installationDate), purchaseCostMinor, purchaseCostCurrency, warrantyEndDate: optionalText(input.warrantyEndDate), status: existing ? input.status ? status : existing.status : status, expectedServiceIntervalDays, expectedUsefulLifeMonths, updatedAt: Date.now() };
  if (existing) {
    const before = await equipmentAssetViewResolved(ctx, actor, existing);
    await ctx.db.patch(existing._id, fields);
    const updated = await ctx.db.get(existing._id);
    if (!updated) domainError("NOT_FOUND", "Equipment asset could not be loaded after update.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: updated.publicId, entityLabel: updated.code, summary: "Equipment asset updated", before, after: await equipmentAssetViewResolved(ctx, actor, updated), branchId: publicBranchId(branch) });
    return await equipmentAssetViewResolved(ctx, actor, updated);
  }
  const now = Date.now();
  const publicId = `asset-${crypto.randomUUID()}`;
  const id = await ctx.db.insert("equipmentAssets", { organizationId: actor.organization._id, publicId, ...fields, createdAt: now });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Equipment asset could not be created.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.equipment_asset.create", entityType: "equipment_asset", entityId: created.publicId, entityLabel: created.code, summary: "Equipment asset created", after: await equipmentAssetViewResolved(ctx, actor, created), branchId: publicBranchId(branch) });
  return await equipmentAssetViewResolved(ctx, actor, created);
}

function equipmentIssueView(issue: EquipmentIssue, organizationId: string, branchId: string, assetId: string, createdById = String(issue.createdByUserId)): Data {
  return { id: issue.publicId, organizationId, branchId, assetId, title: issue.title, description: issue.description, severity: issue.severity, status: issue.status, reportedAt: iso(issue.reportedAt), resolvedAt: issue.resolvedAt ? iso(issue.resolvedAt) : undefined, downtimeDays: issue.downtimeDays, safetyStatus: issue.safetyStatus, createdById };
}

async function listEquipmentIssues(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const branch = input.branchId ? await branchByPublicId(ctx, actor, optionalText(input.branchId)) : undefined;
  const asset = input.assetId ? await assetByPublicId(ctx, actor, optionalText(input.assetId)) : undefined;
  let rows = await ctx.db.query("equipmentIssues").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  rows = rows.filter((row) => (!branch || row.branchId === branch._id) && (!asset || row.assetId === asset._id) && (!input.status || row.status === input.status) && (actor.branchScope === "all" || actor.branchIds.includes(row.branchId))).sort((left, right) => right.reportedAt - left.reportedAt);
  const branchMap = await branchPublicMap(ctx, actor);
  const assets = await ctx.db.query("equipmentAssets").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const assetMap = new Map(assets.map((item) => [String(item._id), item.publicId]));
  const users = await Promise.all([...new Set(rows.map((row) => String(row.createdByUserId)))].map(async (id) => await ctx.db.get(id as Id<"users">)));
  const userMap = new Map(users.filter((user): user is Doc<"users"> => Boolean(user)).map((user) => [String(user._id), publicUserId(user)]));
  return rows.map((row) => equipmentIssueView(row, publicOrganizationId(actor.organization), branchMap.get(String(row.branchId)) ?? String(row.branchId), assetMap.get(String(row.assetId)) ?? String(row.assetId), userMap.get(String(row.createdByUserId))));
}

async function reportEquipmentIssue(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const asset = await assetByPublicId(ctx, actor, optionalText(input.assetId));
  if (asset.branchId !== branch._id) domainError("VALIDATION_ERROR", "Equipment asset must belong to the selected branch.", { correlationId: actor.correlationId });
  if (asset.status === "retired" || asset.status === "replaced") domainError("CONFLICT", "Retired or replaced equipment cannot receive new issues.", { correlationId: actor.correlationId });
  const title = text(input.title).trim();
  if (!title || title.length > 160) domainError("VALIDATION_ERROR", "Issue title must be between 1 and 160 characters.", { correlationId: actor.correlationId });
  const severity = assertOneOf(input.severity, ISSUE_SEVERITIES, "Equipment issue severity", actor.correlationId);
  const safety = assertOneOf(input.safetyStatus ?? "unknown", ["unknown", "safe_to_operate", "out_of_service"] as const, "Equipment safety status", actor.correlationId);
  const downtimeDays = input.downtimeDays === undefined ? undefined : finite(input.downtimeDays, Number.NaN);
  if (downtimeDays !== undefined && (!Number.isFinite(downtimeDays) || downtimeDays < 0)) domainError("VALIDATION_ERROR", "Downtime days must be non-negative.", { correlationId: actor.correlationId });
  const now = Date.now();
  const publicId = `issue-${crypto.randomUUID()}`;
  const id = await ctx.db.insert("equipmentIssues", { organizationId: actor.organization._id, publicId, branchId: branch._id, assetId: asset._id, title, description: optionalText(input.description), severity, status: "open", reportedAt: now, downtimeDays, safetyStatus: safety, createdByUserId: actor.user._id });
  if (safety === "out_of_service" && asset.status === "active") {
    const beforeAsset = await equipmentAssetViewResolved(ctx, actor, asset);
    await ctx.db.patch(asset._id, { status: "maintenance", updatedAt: now });
    const updatedAsset = await ctx.db.get(asset._id);
    if (!updatedAsset) domainError("NOT_FOUND", "Equipment asset could not be loaded after issue report.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: updatedAsset.publicId, entityLabel: updatedAsset.code, summary: "Equipment marked for maintenance after an out-of-service issue", before: beforeAsset, after: await equipmentAssetViewResolved(ctx, actor, updatedAsset), branchId: publicBranchId(branch) });
  }
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Equipment issue could not be created.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.equipment_issue.create", entityType: "equipment_issue", entityId: created.publicId, entityLabel: created.title, summary: "Equipment issue reported", after: equipmentIssueView(created, publicOrganizationId(actor.organization), publicBranchId(branch), asset.publicId), branchId: publicBranchId(branch) });
  return equipmentIssueView(created, publicOrganizationId(actor.organization), publicBranchId(branch), asset.publicId);
}

async function updateEquipmentIssue(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const issueId = optionalText(input.id);
  const issue = issueId ? await ctx.db.query("equipmentIssues").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", issueId)).unique() : null;
  if (!issue) domainError("NOT_FOUND", "Equipment issue not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(issue.branchId);
  assertBranchAccess(actor, branch);
  const status = input.status === undefined ? issue.status : assertOneOf(input.status, ISSUE_STATUSES, "Equipment issue status", actor.correlationId);
  const safetyStatus = input.safetyStatus === undefined ? issue.safetyStatus : assertOneOf(input.safetyStatus, EQUIPMENT_SAFETY_STATUSES, "Equipment safety status", actor.correlationId);
  if (status === "resolved" && safetyStatus !== "safe_to_operate") domainError("VALIDATION_ERROR", "An issue can only be resolved when the equipment is safe to operate.", { correlationId: actor.correlationId });
  if (status !== issue.status) {
    const allowed = issue.status === "open" ? ["in_progress", "resolved", "cancelled"] : issue.status === "in_progress" ? ["resolved", "cancelled"] : [];
    if (!allowed.includes(status)) domainError("CONFLICT", `An equipment issue cannot move from ${issue.status} to ${status}.`, { correlationId: actor.correlationId });
  }
  const downtimeDays = input.downtimeDays === undefined ? issue.downtimeDays : finite(input.downtimeDays, Number.NaN);
  if (downtimeDays !== undefined && (!Number.isFinite(downtimeDays) || downtimeDays < 0)) domainError("VALIDATION_ERROR", "Downtime days must be non-negative.", { correlationId: actor.correlationId });
  const issueAsset = await ctx.db.get(issue.assetId);
  if (!issueAsset) domainError("NOT_FOUND", "Equipment asset not found.", { correlationId: actor.correlationId });
  const before = equipmentIssueView(issue, publicOrganizationId(actor.organization), publicBranchId(branch), issueAsset.publicId);
  const resolvedAt = status === "resolved" ? issue.resolvedAt ?? Date.now() : undefined;
  await ctx.db.patch(issue._id, { status, safetyStatus, downtimeDays, resolvedAt });
  if (safetyStatus === "out_of_service" && issueAsset.status === "active") {
    const beforeAsset = await equipmentAssetViewResolved(ctx, actor, issueAsset);
    await ctx.db.patch(issueAsset._id, { status: "maintenance", updatedAt: Date.now() });
    const updatedAsset = await ctx.db.get(issueAsset._id);
    if (!updatedAsset) domainError("NOT_FOUND", "Equipment asset could not be loaded after issue update.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: updatedAsset.publicId, entityLabel: updatedAsset.code, summary: "Equipment marked for maintenance after an out-of-service issue", before: beforeAsset, after: await equipmentAssetViewResolved(ctx, actor, updatedAsset), branchId: publicBranchId(branch) });
  } else if (status === "resolved" && safetyStatus === "safe_to_operate" && issueAsset.status === "maintenance") {
    const remainingIssues = await ctx.db.query("equipmentIssues").withIndex("by_asset", (q) => q.eq("organizationId", actor.organization._id).eq("assetId", issueAsset._id)).collect();
    if (!remainingIssues.some((candidate) => candidate._id !== issue._id && candidate.status !== "resolved" && candidate.status !== "cancelled")) {
      const beforeAsset = await equipmentAssetViewResolved(ctx, actor, issueAsset);
      await ctx.db.patch(issueAsset._id, { status: "active", updatedAt: Date.now() });
      const updatedAsset = await ctx.db.get(issueAsset._id);
      if (!updatedAsset) domainError("NOT_FOUND", "Equipment asset could not be loaded after issue resolution.", { correlationId: actor.correlationId });
      await audit(ctx, actor, { action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: updatedAsset.publicId, entityLabel: updatedAsset.code, summary: "Equipment returned to active use after all issues were resolved", before: beforeAsset, after: await equipmentAssetViewResolved(ctx, actor, updatedAsset), branchId: publicBranchId(branch) });
    }
  }
  const updated = await ctx.db.get(issue._id);
  if (!updated) domainError("NOT_FOUND", "Equipment issue could not be loaded after update.", { correlationId: actor.correlationId });
  const asset = issueAsset;
  const after = equipmentIssueView(updated, publicOrganizationId(actor.organization), publicBranchId(branch), asset.publicId);
  await audit(ctx, actor, { action: "operations.equipment_issue.update", entityType: "equipment_issue", entityId: updated.publicId, entityLabel: updated.title, summary: status === "resolved" ? "Equipment issue resolved" : "Equipment issue updated", before, after, branchId: publicBranchId(branch) });
  return after;
}

function workOrderView(order: EquipmentWorkOrder, organizationId: string, branchId: string, assetId: string, issueId?: string): Data {
  return { id: order.publicId, organizationId, branchId, assetId, issueId, status: order.status, description: order.description, assigneeId: order.assigneeId, vendorName: order.vendorName, partsCost: money(order.partsCostMinor, order.costCurrency), laborCost: money(order.laborCostMinor, order.costCurrency), totalCost: money(order.totalCostMinor, order.costCurrency), replacementEstimate: money(order.replacementEstimateMinor, order.costCurrency), financialPostingStatus: order.financialPostingStatus, financialSourceId: order.financialSourceId, openedAt: iso(order.openedAt), completedAt: order.completedAt ? iso(order.completedAt) : undefined, updatedAt: iso(order.updatedAt) };
}

async function workOrderViewResolved(ctx: ReadContext, actor: ActorContext, order: EquipmentWorkOrder): Promise<Data> {
  const branch = await ctx.db.get(order.branchId);
  const asset = await ctx.db.get(order.assetId);
  assertBranchAccess(actor, branch);
  if (!asset) domainError("NOT_FOUND", "Equipment asset not found.", { correlationId: actor.correlationId });
  const issue = order.issueId ? await ctx.db.get(order.issueId) : undefined;
  return workOrderView(order, publicOrganizationId(actor.organization), publicBranchId(branch), asset.publicId, issue?.publicId);
}

async function listEquipmentWorkOrders(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const branch = input.branchId ? await branchByPublicId(ctx, actor, optionalText(input.branchId)) : undefined;
  const asset = input.assetId ? await assetByPublicId(ctx, actor, optionalText(input.assetId)) : undefined;
  let rows = await ctx.db.query("equipmentWorkOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  rows = rows.filter((row) => (!branch || row.branchId === branch._id) && (!asset || row.assetId === asset._id) && (!input.status || row.status === input.status) && (actor.branchScope === "all" || actor.branchIds.includes(row.branchId))).sort((left, right) => right.openedAt - left.openedAt);
  return await Promise.all(rows.map((row) => workOrderViewResolved(ctx, actor, row)));
}

async function upsertEquipmentWorkOrder(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const asset = await assetByPublicId(ctx, actor, optionalText(input.assetId));
  if (asset.branchId !== branch._id) domainError("VALIDATION_ERROR", "Equipment asset must belong to the selected branch.", { correlationId: actor.correlationId });
  const issue = input.issueId ? await ctx.db.query("equipmentIssues").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", optionalText(input.issueId)!)).unique() : undefined;
  if (input.issueId && (!issue || issue.branchId !== branch._id || issue.assetId !== asset._id)) domainError("NOT_FOUND", "Equipment issue not found for this asset.", { correlationId: actor.correlationId });
  const description = text(input.description).trim();
  if (!description || description.length > 240) domainError("VALIDATION_ERROR", "Work-order description must be between 1 and 240 characters.", { correlationId: actor.correlationId });
  const requestedStatus = input.status === undefined ? undefined : assertOneOf(input.status, WORK_ORDER_STATUSES, "Work-order status", actor.correlationId);
  const status = requestedStatus ?? "draft";
  const partsCost = requireNonNegativeMoney(input.partsCost, actor.organization.currency, "Parts cost", actor.correlationId);
  const laborCost = requireNonNegativeMoney(input.laborCost, actor.organization.currency, "Labor cost", actor.correlationId);
  const replacementEstimate = requireNonNegativeMoney(input.replacementEstimate, actor.organization.currency, "Replacement estimate", actor.correlationId);
  const assignee = await userByPublicId(ctx, actor, optionalText(input.assigneeId));
  if (assignee) {
    const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", assignee._id)).unique();
    if (membership?.branchScope === "selected" && !membership.branchIds.includes(branch._id)) domainError("VALIDATION_ERROR", "The assignee does not have access to this branch.", { correlationId: actor.correlationId });
  }
  const inputId = optionalText(input.id);
  const existing = inputId ? await ctx.db.query("equipmentWorkOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", inputId)).unique() : null;
  if (existing && (existing.branchId !== branch._id || existing.assetId !== asset._id)) domainError("VALIDATION_ERROR", "A work order cannot move between assets or branches.", { correlationId: actor.correlationId });
  if (existing && requestedStatus !== undefined && requestedStatus !== existing.status && !(
    (existing.status === "draft" && ["approved", "cancelled"].includes(requestedStatus)) ||
    (existing.status === "approved" && ["in_progress", "cancelled"].includes(requestedStatus)) ||
    (existing.status === "in_progress" && ["completed", "cancelled"].includes(requestedStatus))
  )) domainError("CONFLICT", `A work order cannot move from ${existing.status} to ${requestedStatus}.`, { correlationId: actor.correlationId });
  const now = Date.now();
  const effectiveStatus = existing ? requestedStatus ?? existing.status : status;
  const immutableStatus = existing ? await immutableAccountingStatus(ctx, actor, "equipment_repair", existing.publicId, existing.financialPostingStatus) : undefined;
  const issueId = immutableStatus && input.issueId === undefined ? existing?.issueId : issue?._id;
  const partsCostMinor = immutableStatus && input.partsCost === undefined ? existing?.partsCostMinor : partsCost?.amount;
  const laborCostMinor = immutableStatus && input.laborCost === undefined ? existing?.laborCostMinor : laborCost?.amount;
  const totalCostForSource = immutableStatus && input.partsCost === undefined && input.laborCost === undefined
    ? existing?.totalCostMinor
    : partsCostMinor !== undefined || laborCostMinor !== undefined ? (partsCostMinor ?? 0) + (laborCostMinor ?? 0) : undefined;
  const replacementEstimateMinor = immutableStatus && input.replacementEstimate === undefined ? existing?.replacementEstimateMinor : replacementEstimate?.amount;
  const costCurrency = immutableStatus && input.partsCost === undefined && input.laborCost === undefined ? existing?.costCurrency : actor.organization.currency;
  const completedAt = immutableStatus && input.status === undefined
    ? existing?.completedAt
    : effectiveStatus === "completed" ? existing?.completedAt ?? now : undefined;
  if (existing && immutableStatus && (
    branch._id !== existing.branchId ||
    asset._id !== existing.assetId ||
    issueId !== existing.issueId ||
    effectiveStatus !== existing.status ||
    completedAt !== existing.completedAt ||
    partsCostMinor !== existing.partsCostMinor ||
    laborCostMinor !== existing.laborCostMinor ||
    totalCostForSource !== existing.totalCostMinor ||
    replacementEstimateMinor !== existing.replacementEstimateMinor ||
    costCurrency !== existing.costCurrency
  )) {
    rejectImmutableAccountingMutation(actor, "This equipment work order", immutableStatus);
  }
  const fields = { branchId: branch._id, assetId: asset._id, issueId, status: effectiveStatus, description, assigneeId: assignee ? publicUserId(assignee) : undefined, vendorName: optionalText(input.vendorName), partsCostMinor, laborCostMinor, totalCostMinor: totalCostForSource, replacementEstimateMinor, costCurrency: immutableStatus ? costCurrency : actor.organization.currency, financialPostingStatus: existing?.financialPostingStatus ?? "not_posted", financialSourceId: existing?.financialSourceId, completedAt, updatedAt: now };
  if (existing) {
    const before = await workOrderViewResolved(ctx, actor, existing);
    await ctx.db.patch(existing._id, fields);
    const updated = await ctx.db.get(existing._id);
    if (!updated) domainError("NOT_FOUND", "Work order could not be loaded after update.", { correlationId: actor.correlationId });
    await audit(ctx, actor, { action: "operations.equipment_work_order.update", entityType: "equipment_work_order", entityId: updated.publicId, entityLabel: updated.description, summary: "Equipment work order updated", before, after: await workOrderViewResolved(ctx, actor, updated), branchId: publicBranchId(branch) });
    return await workOrderViewResolved(ctx, actor, updated);
  }
  const publicId = `work-order-${crypto.randomUUID()}`;
  const id = await ctx.db.insert("equipmentWorkOrders", { organizationId: actor.organization._id, publicId, ...fields, openedAt: now });
  const created = await ctx.db.get(id);
  if (!created) domainError("NOT_FOUND", "Work order could not be created.", { correlationId: actor.correlationId });
  await audit(ctx, actor, { action: "operations.equipment_work_order.create", entityType: "equipment_work_order", entityId: created.publicId, entityLabel: created.description, summary: "Equipment work order created", after: await workOrderViewResolved(ctx, actor, created), branchId: publicBranchId(branch) });
  return await workOrderViewResolved(ctx, actor, created);
}

async function getEquipmentRecommendation(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "members.read");
  await requireOperations(ctx, actor);
  const asset = await assetByPublicId(ctx, actor, optionalText(input.id));
  const issues = await ctx.db.query("equipmentIssues").withIndex("by_asset", (q) => q.eq("organizationId", actor.organization._id).eq("assetId", asset._id)).collect();
  const orders = await ctx.db.query("equipmentWorkOrders").withIndex("by_asset", (q) => q.eq("organizationId", actor.organization._id).eq("assetId", asset._id)).collect();
  const validOrders = orders.filter((order) => order.status === "completed" && order.financialPostingStatus !== "reversed").sort((left, right) => left.openedAt - right.openedAt || left.publicId.localeCompare(right.publicId));
  const repairCostMinor = validOrders.reduce((sum, order) => sum + (order.totalCostMinor ?? 0), 0);
  const replacementOrder = orders.filter((order) => order.status !== "cancelled" && order.financialPostingStatus !== "reversed" && order.replacementEstimateMinor !== undefined).sort((left, right) => left.openedAt - right.openedAt || left.publicId.localeCompare(right.publicId)).at(-1);
  const replacementEstimateMinor = replacementOrder?.replacementEstimateMinor;
  const relevantIssues = issues.filter((issue) => issue.status !== "cancelled");
  const downtimeDays = relevantIssues.reduce((sum, issue) => sum + (issue.downtimeDays ?? 0), 0);
  const issueCount = relevantIssues.length;
  const ageMonths = asset.purchaseDate ? Math.max(0, Math.floor((Date.now() - Date.parse(asset.purchaseDate)) / (30.44 * 86_400_000))) : undefined;
  const rationale: string[] = [];
  if (repairCostMinor === 0) rationale.push("No recorded repair cost is available.");
  if (replacementEstimateMinor === undefined) rationale.push("No recorded replacement estimate is available.");
  if (asset.purchaseDate === undefined) rationale.push("Purchase date is not recorded, so age cannot be assessed.");
  if (asset.expectedUsefulLifeMonths === undefined) rationale.push("Expected useful life is not recorded.");
  const safetyIssue = relevantIssues.some((issue) => issue.status !== "resolved" && issue.safetyStatus === "out_of_service");
  if (safetyIssue) rationale.push("An unresolved issue marks the asset out of service.");
  if (issueCount > 0) rationale.push(`${issueCount} issue${issueCount === 1 ? "" : "s"} recorded; downtime totals ${downtimeDays} day${downtimeDays === 1 ? "" : "s"}.`);
  let decision: "fix" | "replace" | "insufficient_data" = "insufficient_data";
  if (repairCostMinor > 0 && replacementEstimateMinor !== undefined && asset.purchaseDate !== undefined && asset.expectedUsefulLifeMonths !== undefined) {
    const agedOut = ageMonths !== undefined && ageMonths >= asset.expectedUsefulLifeMonths;
    const repairRatioHigh = repairCostMinor >= replacementEstimateMinor * 0.6;
    const reliabilityConcern = issueCount >= 3 || downtimeDays >= 14;
    decision = agedOut || repairRatioHigh || (reliabilityConcern && repairCostMinor >= replacementEstimateMinor * 0.4) || safetyIssue ? "replace" : "fix";
    rationale.push(agedOut ? "Recorded age meets or exceeds useful life." : `Recorded age is ${ageMonths} months against ${asset.expectedUsefulLifeMonths} months useful life.`);
    rationale.push(`Recorded repair cost is ${Math.round((repairCostMinor / replacementEstimateMinor) * 100)}% of the replacement estimate.`);
    if (!agedOut && !repairRatioHigh && !reliabilityConcern && !safetyIssue) rationale.push("Recorded repair cost is below the replacement threshold and issue history is limited.");
  }
  return { assetId: asset.publicId, decision, confidence: "recorded_inputs_only", repairCost: repairCostMinor > 0 ? { amount: repairCostMinor, currency: actor.organization.currency } : undefined, replacementEstimate: replacementEstimateMinor !== undefined ? { amount: replacementEstimateMinor, currency: actor.organization.currency } : undefined, issueCount, downtimeDays, assetAgeMonths: ageMonths, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths, rationale };
}

export async function operationsQuery(ctx: QueryCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "operations.products.list": return await listProducts(ctx, actor, input);
    case "operations.suppliers.list": return await listSuppliers(ctx, actor, input);
    case "operations.inventory.list": return await listInventory(ctx, actor, input);
    case "operations.stock_movements.list": return await listStockMovements(ctx, actor, input);
    case "operations.low_stock.list": return await listLowStockAlerts(ctx, actor, input);
    case "operations.purchase_orders.list": return await listPurchaseOrders(ctx, actor, input);
    case "operations.facility_tasks.list": return await listFacilityTasks(ctx, actor, input);
    case "operations.equipment_assets.list": return await listEquipmentAssets(ctx, actor, input);
    case "operations.equipment_issues.list": return await listEquipmentIssues(ctx, actor, input);
    case "operations.equipment_work_orders.list": return await listEquipmentWorkOrders(ctx, actor, input);
    case "operations.equipment.recommendation": return await getEquipmentRecommendation(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown operations query ${operation}.`, { correlationId: actor.correlationId });
  }
}

export async function operationsMutation(ctx: MutationCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "operations.product.upsert": return await upsertProduct(ctx, actor, input);
    case "operations.product.delete": return await deleteProduct(ctx, actor, input);
    case "operations.product.archive": return await archiveProduct(ctx, actor, input);
    case "operations.supplier.upsert": return await upsertSupplier(ctx, actor, input);
    case "operations.supplier.archive": return await archiveSupplier(ctx, actor, input);
    case "operations.stock_movement.record": return await recordStockMovement(ctx, actor, input);
    case "operations.inventory.transfer": return await transferInventory(ctx, actor, input);
    case "operations.retail.checkout": return await retailCheckout(ctx, actor, input);
    case "operations.retail.refund": return await refundRetailSale(ctx, actor, input);
    case "operations.retail.void": return await voidRetailSale(ctx, actor, input);
    case "operations.low_stock.refresh": return await refreshLowStockAlerts(ctx, actor, input);
    case "operations.low_stock.dismiss": return await dismissLowStockAlert(ctx, actor, input);
    case "operations.purchase_order.create": return await createPurchaseOrder(ctx, actor, input);
    case "operations.purchase_order.approve": return await approvePurchaseOrder(ctx, actor, input);
    case "operations.purchase_order.receive": return await receivePurchaseOrder(ctx, actor, input);
    case "operations.supplier_notification.preview": return await notifyPurchaseOrderSupplier(ctx, actor, input);
    case "operations.facility_task.upsert": return await upsertFacilityTask(ctx, actor, input);
    case "operations.equipment_asset.upsert": return await upsertEquipmentAsset(ctx, actor, input);
    case "operations.equipment_issue.report": return await reportEquipmentIssue(ctx, actor, input);
    case "operations.equipment_issue.update": return await updateEquipmentIssue(ctx, actor, input);
    case "operations.equipment_work_order.upsert": return await upsertEquipmentWorkOrder(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown operations mutation ${operation}.`, { correlationId: actor.correlationId });
  }
}
