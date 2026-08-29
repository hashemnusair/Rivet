"use client";

import {
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cog,
  PackagePlus,
  Pencil,
  Plus,
  Search as SearchIcon,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  Wrench,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  EquipmentAsset,
  EquipmentIssue,
  EquipmentRecommendation,
  EquipmentWorkOrder,
  InventoryTransferInput,
  InventoryBalance,
  LowStockAlert,
  CreatePurchaseOrderInput,
  DeleteProductInput,
  Product,
  PurchaseOrder,
  PurchaseOrderSourceType,
  Supplier,
  UpsertProductInput,
  UpsertEquipmentAssetInput,
  UpsertEquipmentWorkOrderInput,
  UpsertSupplierInput,
  UpdateEquipmentIssueInput,
  WorkspaceAccess,
} from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { fromMajor, money, toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { DateText, DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasSellableRetailPrice, RetailCheckout } from "./retail-checkout";
import { FacilityTaskWorkspace } from "./facility-task-workspace";

type OperationsTab = "inventory" | "checkout" | "equipment" | "facilities";

const CURRENCY_FALLBACK = "JOD";

function newKey(prefix: string): string {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function minorValue(value: string, currency: string): ReturnType<typeof money> | undefined {
  if (!value.trim()) return undefined;
  const major = Number(value);
  return Number.isFinite(major) && major >= 0 ? fromMajor(major, currency) : undefined;
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" {
  if (["completed", "received", "active"].includes(status)) return "success";
  if (["approved", "partially_received", "blocked"].includes(status)) return "warning";
  if (["cancelled", "archived"].includes(status)) return "danger";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)} dot>{status.replaceAll("_", " ")}</Badge>;
}

const ASSET_STATUS_LABELS: Record<EquipmentAsset["status"], string> = {
  active: "Active",
  maintenance: "In maintenance",
  retired: "Retired",
  replaced: "Replaced",
};

const WORK_ORDER_STATUS_LABELS: Record<EquipmentWorkOrder["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function FormPanel({ title, description, onCancel, children }: { title: string; description?: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ kind = "supplier", label, open, pending, onOpenChange, onConfirm }: { kind?: "product" | "supplier"; label: string; open: boolean; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string, confirmation?: string) => void }) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const isProduct = kind === "product";
  const confirmed = !isProduct || confirmation.trim().toLowerCase() === label.trim().toLowerCase();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setReason(""); setConfirmation(""); } onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isProduct ? "Delete " + label + " permanently?" : "Archive " + label + "?"}</DialogTitle>
          <DialogDescription>
            {isProduct
              ? "This permanently removes the item and frees its SKU for reuse. Existing receipts, stock movements, purchase orders, and audit history remain available as read-only records. This cannot be undone."
              : "Historical movements and orders stay intact. The supplier will no longer be available for new operations."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {isProduct ? <Field label={"Type " + label + " to confirm"} required><Input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={label} /></Field> : null}
          <Field label="Reason" required><Textarea autoFocus={!isProduct} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isProduct ? "No longer sold or created in error" : "No longer used or created in error"} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant="danger" loading={pending} disabled={!confirmed || reason.trim().length < 3} onClick={() => onConfirm(reason.trim(), confirmation.trim() || undefined)}>
            {isProduct ? <Trash2 /> : <Archive />} {isProduct ? "Delete permanently" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ currency, branchId, product, availableQuantity, pending, onCancel, onSubmit, onRequestDelete }: { currency: string; branchId?: string; product?: Product; availableQuantity?: number; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertProductInput) => void; onRequestDelete?: () => void }) {
  const [form, setForm] = useState(() => ({ sku: product?.sku ?? "", name: product?.name ?? "", unit: product?.unit ?? "each", availableQuantity: product ? String(availableQuantity ?? 0) : "0", reorderPoint: product ? String(product.reorderPoint) : "", retailPrice: product?.retailPrice ? String(toMajor(product.retailPrice)) : "" }));
  const editing = Boolean(product);
  return (
    <FormPanel title={editing ? "Edit stock item" : "Add stock item"} description="Keep the item details, the current available quantity, and the price used at checkout in one place." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ id: product?.id, ...(branchId ? { branchId, availableQuantity: Number(form.availableQuantity) } : {}), sku: form.sku, name: form.name, unit: form.unit as UpsertProductInput["unit"], reorderPoint: Number(form.reorderPoint), retailPrice: minorValue(form.retailPrice, currency) }); }}>
        <Field label="SKU" required><Input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} placeholder="SUP-CREATINE" required /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Creatine" required /></Field>
        <Field label="Unit" required><Select value={form.unit} onValueChange={(value) => setForm((current) => ({ ...current, unit: value as UpsertProductInput["unit"] }))}><SelectTrigger aria-label="Product unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="each">Each</SelectItem><SelectItem value="kg">Kilogram</SelectItem><SelectItem value="liter">Liter</SelectItem><SelectItem value="box">Box</SelectItem><SelectItem value="serving">Serving</SelectItem></SelectContent></Select></Field>
        <Field label="Available quantity" hint="What can be sold at this branch" required><Input type="number" min="0" step="1" value={form.availableQuantity} onChange={(event) => setForm((current) => ({ ...current, availableQuantity: event.target.value }))} required /></Field>
        <Field label="Alert me at" hint="Available units; the safety floor" required><Input type="number" min="0" step="1" value={form.reorderPoint} onChange={(event) => setForm((current) => ({ ...current, reorderPoint: event.target.value }))} required /></Field>
        <Field label={"Selling price (" + currency + ")"} hint="Charged at checkout; leave blank if this is not sold to members"><Input type="number" min="0" step="0.001" dir="ltr" value={form.retailPrice} onChange={(event) => setForm((current) => ({ ...current, retailPrice: event.target.value }))} placeholder="0.000" /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">{editing && onRequestDelete ? <Button type="button" variant="danger" onClick={onRequestDelete} disabled={pending}><Trash2 /> Delete item permanently</Button> : <span /> }<Button type="submit" loading={pending}><PackagePlus /> {editing ? "Save changes" : "Save item"}</Button></div>
      </form>
    </FormPanel>
  );
}

function SupplierForm({ defaultBranchId, branches, supplier, pending, onCancel, onSubmit }: { defaultBranchId?: string; branches: Array<{ id: string; name: string }>; supplier?: Supplier; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertSupplierInput) => void }) {
  const [form, setForm] = useState(() => ({ name: supplier?.name ?? "", contactName: supplier?.contactName ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "", terms: supplier?.terms ?? "", branchIds: supplier?.branchIds ?? (defaultBranchId ? [defaultBranchId] : []) }));
  const editing = Boolean(supplier);
  return (
    <FormPanel title={editing ? "Edit supplier" : "Add supplier"} description="Keep supplier contacts and branch coverage in one place." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ id: supplier?.id, name: form.name, contactName: form.contactName || undefined, email: form.email || undefined, phone: form.phone || undefined, terms: form.terms || undefined, branchIds: form.branchIds }); }}>
        <Field label="Supplier name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required placeholder="Jordan Sports Supply" /></Field>
        <Field label="Contact name"><Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Maya Haddad" /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="orders@example.com" /></Field>
        <Field label="Phone"><Input dir="ltr" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+962 …" /></Field>
        <Field label="Terms"><Input value={form.terms} onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} placeholder="Net 15" /></Field>
        <div className="sm:col-span-2"><p className="mb-1.5 text-[13px] font-medium text-ink-2">Branches</p><div className="flex flex-wrap gap-2">{branches.map((branch) => <label key={branch.id} className="inline-flex items-center gap-2 rounded-md border border-line-2 px-2.5 py-2 text-[12px]"><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(event) => setForm((current) => ({ ...current, branchIds: event.target.checked ? [...current.branchIds, branch.id] : current.branchIds.filter((id) => id !== branch.id) }))} />{branch.name}</label>)}</div></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit" loading={pending}><Store /> {editing ? "Save changes" : "Save supplier"}</Button></div>
      </form>
    </FormPanel>
  );
}

function PurchaseOrderForm({ currency, products, suppliers, branchId, defaultProductId, pending, onCancel, onSubmit }: { currency: string; products: Product[]; suppliers: Supplier[]; branchId?: string; defaultProductId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: CreatePurchaseOrderInput) => void }) {
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === "active");
  const [form, setForm] = useState<{ sourceType: PurchaseOrderSourceType; supplierId: string; productId: string; quantity: string; unitCost: string; notes: string }>({ sourceType: activeSuppliers.length ? "supplier" : "private", supplierId: activeSuppliers[0]?.id ?? "", productId: defaultProductId && products.some((product) => product.id === defaultProductId) ? defaultProductId : products[0]?.id ?? "", quantity: "", unitCost: "", notes: "" });
  return (
    <FormPanel title="Create purchase order" description="Choose a saved supplier, or keep the source private if you bought the stock elsewhere." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; const unitCost = minorValue(form.unitCost, currency); if (!unitCost || !form.productId || (form.sourceType === "supplier" && !form.supplierId)) return; onSubmit({ branchId, sourceType: form.sourceType, supplierId: form.sourceType === "supplier" ? form.supplierId : undefined, lines: [{ productId: form.productId, quantity: Number(form.quantity), unitCost }], notes: form.notes || undefined }); }}>
        <Field label="Stock source" required><Select value={form.sourceType} onValueChange={(value) => setForm((current) => ({ ...current, sourceType: value as PurchaseOrderSourceType, supplierId: value === "private" ? "" : current.supplierId || activeSuppliers[0]?.id || "" }))}><SelectTrigger aria-label="Purchase order source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="supplier">Saved supplier</SelectItem><SelectItem value="private">Private / bought elsewhere</SelectItem></SelectContent></Select></Field>
        {form.sourceType === "supplier" ? <Field label="Supplier" required><Select value={form.supplierId} onValueChange={(value) => setForm((current) => ({ ...current, supplierId: value }))}><SelectTrigger aria-label="Purchase order supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{activeSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field> : <div className="rounded-md border border-line bg-sunken/50 p-3 text-[12px] text-ink-2" role="status">The source name will not be recorded. The purchase is still tracked in inventory.</div>}
        <Field label="Product" required><Select value={form.productId} onValueChange={(value) => setForm((current) => ({ ...current, productId: value }))}><SelectTrigger aria-label="Purchase order product"><SelectValue placeholder="Choose product" /></SelectTrigger><SelectContent>{products.filter((product) => product.status === "active").map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.sku}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Quantity" required><Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required /></Field>
        <Field label={"Unit cost (" + currency + ")"} required><Input type="number" min="0" step="0.001" dir="ltr" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} required /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional purchase context" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId}><ShoppingCart /> Save draft</Button></div>
      </form>
    </FormPanel>
  );
}

function EquipmentAssetForm({ currency, zones, branchId, asset, activeBlocked = false, pending, onCancel, onSubmit }: { currency: string; zones: Array<{ id: string; name: string }>; branchId?: string; asset?: EquipmentAsset; activeBlocked?: boolean; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentAssetInput) => void }) {
  const [form, setForm] = useState(() => ({
    code: asset?.code ?? "",
    name: asset?.name ?? "",
    manufacturer: asset?.manufacturer ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    zoneId: asset?.zoneId ?? "",
    purchaseDate: asset?.purchaseDate ?? "",
    purchaseCost: asset?.purchaseCost ? String(toMajor(asset.purchaseCost)) : "",
    warrantyEndDate: asset?.warrantyEndDate ?? "",
    status: asset?.status ?? "active",
    serviceInterval: asset?.expectedServiceIntervalDays ? String(asset.expectedServiceIntervalDays) : "",
    usefulLife: asset?.expectedUsefulLifeMonths ? String(asset.expectedUsefulLifeMonths) : "",
  }));
  const editing = Boolean(asset);
  const statusOptions: EquipmentAsset["status"][] = !asset
    ? ["active"]
    : asset.status === "active"
      ? ["active", "maintenance", "retired", "replaced"]
      : asset.status === "maintenance"
        ? ["maintenance", "active", "retired", "replaced"]
        : [asset.status];
  return (
    <FormPanel title={editing ? "Edit machine" : "Add machine"} description="Keep a clear record of each machine, its location, and its current status." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId) return;
        onSubmit({
          id: asset?.id,
          branchId,
          code: form.code,
          name: form.name,
          manufacturer: form.manufacturer || undefined,
          model: form.model || undefined,
          serialNumber: form.serialNumber || undefined,
          zoneId: form.zoneId || undefined,
          purchaseDate: form.purchaseDate || undefined,
          purchaseCost: minorValue(form.purchaseCost, currency),
          warrantyEndDate: form.warrantyEndDate || undefined,
          status: form.status as EquipmentAsset["status"],
          expectedServiceIntervalDays: form.serviceInterval ? Number(form.serviceInterval) : undefined,
          expectedUsefulLifeMonths: form.usefulLife ? Number(form.usefulLife) : undefined,
        });
      }}>
        <Field label="Machine code" hint="A short code staff can recognize" required><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="TREAD-02" required /></Field>
        <Field label="Machine name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Commercial treadmill" required /></Field>
        <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Life Fitness" /></Field>
        <Field label="Model"><Input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="T5" /></Field>
        <Field label="Serial number"><Input dir="ltr" value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} /></Field>
        <Field label="Location"><Select value={form.zoneId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Machine location"><SelectValue placeholder="No location" /></SelectTrigger><SelectContent><SelectItem value="none">No location</SelectItem>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Status" hint={activeBlocked ? "Resolve the out-of-service issue and mark it safe before returning this machine to active use." : editing && (asset?.status === "retired" || asset?.status === "replaced") ? "Retired and replaced machines keep their history and cannot be reactivated." : undefined}><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as EquipmentAsset["status"] }))}><SelectTrigger aria-label="Machine status"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status} disabled={status === "active" && activeBlocked}>{ASSET_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Purchase date"><Input type="date" dir="ltr" value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></Field>
        <Field label={`Purchase cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.purchaseCost} onChange={(event) => setForm((current) => ({ ...current, purchaseCost: event.target.value }))} placeholder="0.000" /></Field>
        <Field label="Warranty ends"><Input type="date" dir="ltr" value={form.warrantyEndDate} onChange={(event) => setForm((current) => ({ ...current, warrantyEndDate: event.target.value }))} /></Field>
        <Field label="Service interval" hint="Days between planned checks"><Input type="number" min="1" step="1" dir="ltr" value={form.serviceInterval} onChange={(event) => setForm((current) => ({ ...current, serviceInterval: event.target.value }))} placeholder="90" /></Field>
        <Field label="Expected useful life" hint="Months"><Input type="number" min="1" step="1" dir="ltr" value={form.usefulLife} onChange={(event) => setForm((current) => ({ ...current, usefulLife: event.target.value }))} placeholder="84" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId}><Cog /> {editing ? "Save machine" : "Add machine"}</Button></div>
      </form>
    </FormPanel>
  );
}

function EquipmentIssueForm({ assets, branchId, pending, onCancel, onSubmit }: { assets: EquipmentAsset[]; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: { branchId: string; assetId: string; title: string; description?: string; severity: EquipmentIssue["severity"]; downtimeDays?: number; safetyStatus: EquipmentIssue["safetyStatus"] }) => void }) {
  const [form, setForm] = useState(() => ({ assetId: assets[0]?.id ?? "", title: "", description: "", severity: "medium", downtime: "", safety: "unknown" }));
  return (
    <FormPanel title="Report machine issue" description="Record what is wrong and whether the machine is safe to use. The issue stays in the machine history until resolved." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId) return;
        onSubmit({ branchId, assetId: form.assetId, title: form.title, description: form.description || undefined, severity: form.severity as EquipmentIssue["severity"], downtimeDays: form.downtime ? Number(form.downtime) : undefined, safetyStatus: form.safety as EquipmentIssue["safetyStatus"] });
      }}>
        <Field label="Machine" required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value }))}><SelectTrigger aria-label="Issue machine"><SelectValue placeholder="Choose machine" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Severity" required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value }))}><SelectTrigger aria-label="Issue severity"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></Field>
        <Field label="Safety status" hint="Tell the next staff member what to do" required><Select value={form.safety} onValueChange={(value) => setForm((current) => ({ ...current, safety: value }))}><SelectTrigger aria-label="Equipment safety status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Needs assessment</SelectItem><SelectItem value="safe_to_operate">Safe to operate</SelectItem><SelectItem value="out_of_service">Take out of service</SelectItem></SelectContent></Select></Field>
        <Field label="Downtime" hint="Days unavailable"><Input type="number" min="0" step="1" dir="ltr" value={form.downtime} onChange={(event) => setForm((current) => ({ ...current, downtime: event.target.value }))} placeholder="0" /></Field>
        <Field label="Issue title" className="sm:col-span-2" required><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Belt slipping under load" required /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Add details that help the repair person." /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0}><ShieldAlert /> Report issue</Button></div>
      </form>
    </FormPanel>
  );
}

function EquipmentWorkOrderForm({ currency, assets, issues, branchId, order, pending, onCancel, onSubmit }: { currency: string; assets: EquipmentAsset[]; issues: EquipmentIssue[]; branchId?: string; order?: EquipmentWorkOrder; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentWorkOrderInput) => void }) {
  const [form, setForm] = useState(() => ({ assetId: order?.assetId ?? assets[0]?.id ?? "", issueId: order?.issueId ?? "", description: order?.description ?? "", vendorName: order?.vendorName ?? "", partsCost: order?.partsCost ? String(toMajor(order.partsCost)) : "", laborCost: order?.laborCost ? String(toMajor(order.laborCost)) : "", replacementEstimate: order?.replacementEstimate ? String(toMajor(order.replacementEstimate)) : "", status: order?.status ?? "draft" }));
  const assetIssues = issues.filter((issue) => issue.assetId === form.assetId && !["resolved", "cancelled"].includes(issue.status));
  const editing = Boolean(order);
  const statusOptions: EquipmentWorkOrder["status"][] = !order
    ? ["draft"]
    : order.status === "draft"
      ? ["draft", "approved", "cancelled"]
      : order.status === "approved"
        ? ["approved", "in_progress", "cancelled"]
        : order.status === "in_progress"
          ? ["in_progress", "completed", "cancelled"]
          : [order.status];
  return (
    <FormPanel title={editing ? "Edit work order" : "Open work order"} description="Track the repair work, costs, and current status for this machine." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId) return;
        onSubmit({ id: order?.id, branchId, assetId: form.assetId, issueId: form.issueId || undefined, description: form.description, vendorName: form.vendorName || undefined, partsCost: minorValue(form.partsCost, currency), laborCost: minorValue(form.laborCost, currency), replacementEstimate: minorValue(form.replacementEstimate, currency), status: form.status as EquipmentWorkOrder["status"] });
      }}>
        <Field label="Machine" required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value, issueId: "" }))}><SelectTrigger aria-label="Work order machine"><SelectValue placeholder="Choose machine" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Related issue"><Select value={form.issueId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, issueId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Related machine issue"><SelectValue placeholder="No linked issue" /></SelectTrigger><SelectContent><SelectItem value="none">No linked issue</SelectItem>{assetIssues.map((issue) => <SelectItem key={issue.id} value={issue.id}>{issue.title}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Description" className="sm:col-span-2" required><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Inspect belt and motor" required /></Field>
        <Field label="Vendor"><Input value={form.vendorName} onChange={(event) => setForm((current) => ({ ...current, vendorName: event.target.value }))} placeholder="Service partner" /></Field>
        <Field label="Status" hint={!editing ? "New work orders start as drafts. Approve one before work begins." : "Use only the next workflow step or cancel this order."}><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as EquipmentWorkOrder["status"] }))}><SelectTrigger aria-label="Work order status"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status}>{WORK_ORDER_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={`Parts cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.partsCost} onChange={(event) => setForm((current) => ({ ...current, partsCost: event.target.value }))} /></Field>
        <Field label={`Labor cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.laborCost} onChange={(event) => setForm((current) => ({ ...current, laborCost: event.target.value }))} /></Field>
        <Field label={`Replacement estimate (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.replacementEstimate} onChange={(event) => setForm((current) => ({ ...current, replacementEstimate: event.target.value }))} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0}><Wrench /> {editing ? "Save work order" : "Open work order"}</Button></div>
      </form>
    </FormPanel>
  );
}

function SectionHeader({ icon: Icon, title, description, actions }: { icon: typeof Boxes; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5"><div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><Icon className="size-3.5 text-ink-2" aria-hidden /></span><div><h2 className="font-display text-[14px] font-semibold">{title}</h2>{description ? <p className="mt-0.5 text-[11.5px] text-ink-3">{description}</p> : null}</div></div>{actions}</div>;
}

function ReadOnlyNotice() {
  return <div className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] text-ink-2" role="status">You have read-only access to operations. Managers can add items, suppliers, purchase orders, and machine records.</div>;
}

type OperationsMutations = {
  product: ReturnType<typeof useApiMutation<unknown, UpsertProductInput>>;
  deleteProduct: ReturnType<typeof useApiMutation<unknown, DeleteProductInput>>;
  supplier: ReturnType<typeof useApiMutation<unknown, UpsertSupplierInput>>;
  archiveSupplier: ReturnType<typeof useApiMutation<unknown, { id: string; reason: string }>>;
  purchaseOrder: ReturnType<typeof useApiMutation<unknown, CreatePurchaseOrderInput>>;
  approveOrder: ReturnType<typeof useApiMutation<unknown, { id: string; reason?: string }>>;
  receiveOrder: ReturnType<typeof useApiMutation<unknown, { purchaseOrderId: string; idempotencyKey: string }>>;
  transfer: ReturnType<typeof useApiMutation<unknown, InventoryTransferInput>>;
  asset: ReturnType<typeof useApiMutation<unknown, UpsertEquipmentAssetInput>>;
  issue: ReturnType<typeof useApiMutation<unknown, { branchId: string; assetId: string; title: string; description?: string; severity: EquipmentIssue["severity"]; downtimeDays?: number; safetyStatus: EquipmentIssue["safetyStatus"] }>>;
  issueUpdate: ReturnType<typeof useApiMutation<unknown, { id: string; input: UpdateEquipmentIssueInput }>>;
  workOrder: ReturnType<typeof useApiMutation<unknown, UpsertEquipmentWorkOrderInput>>;
};

function useOperationsMutations(invalidate: ReturnType<typeof useInvalidate>): OperationsMutations {
  const options = { onSuccess: async () => { await invalidate([qk.operations()]); } };
  const product = useApiMutation((api, input: UpsertProductInput) => api.upsertProduct(input), { ...options, successMessage: "Stock item saved." });
  const deleteProduct = useApiMutation((api, input: DeleteProductInput) => api.deleteProduct(input), { ...options, successMessage: "Stock item permanently deleted." });
  const supplier = useApiMutation((api, input: UpsertSupplierInput) => api.upsertSupplier(input), { ...options, successMessage: "Supplier saved." });
  const archiveSupplier = useApiMutation((api, input: { id: string; reason: string }) => api.archiveSupplier(input.id, input.reason), { ...options, successMessage: "Supplier archived." });
  const purchaseOrder = useApiMutation((api, input: Parameters<typeof api.createPurchaseOrder>[0]) => api.createPurchaseOrder(input), { ...options, successMessage: "Purchase order draft created." });
  const approveOrder = useApiMutation((api, input: { id: string; reason?: string }) => api.approvePurchaseOrder(input.id, input.reason), { ...options, successMessage: "Purchase order approved." });
  const receiveOrder = useApiMutation((api, input: Parameters<typeof api.receivePurchaseOrder>[0]) => api.receivePurchaseOrder(input), { ...options, successMessage: "Purchase order received into stock." });
  const transfer = useApiMutation((api, input: InventoryTransferInput) => api.transferInventory(input), { ...options, successMessage: "Stock moved to the destination branch." });
  const asset = useApiMutation((api, input: UpsertEquipmentAssetInput) => api.upsertEquipmentAsset(input), { ...options, successMessage: "Equipment saved." });
  const issue = useApiMutation((api, input: Parameters<typeof api.reportEquipmentIssue>[0]) => api.reportEquipmentIssue(input), { ...options, successMessage: "Equipment issue reported." });
  const issueUpdate = useApiMutation((api, input: { id: string; input: UpdateEquipmentIssueInput }) => api.updateEquipmentIssue(input.id, input.input), { ...options, successMessage: "Equipment issue updated." });
  const workOrder = useApiMutation((api, input: UpsertEquipmentWorkOrderInput) => api.upsertEquipmentWorkOrder(input), { ...options, successMessage: "Work order saved." });
  return { product, deleteProduct, supplier, archiveSupplier, purchaseOrder, approveOrder, receiveOrder, transfer, asset, issue, issueUpdate, workOrder } as OperationsMutations;
}

function PurchaseOrderRow({ order, writeEnabled, currency, mutations }: { order: PurchaseOrder; writeEnabled: boolean; currency: string; mutations: OperationsMutations }) {
  const [reason, setReason] = useState("");
  const sourceLabel = order.sourceType === "private" ? "Private source" : order.supplierName;
  return <div className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-medium">{sourceLabel}</p><p className="mt-0.5 text-[11.5px] text-ink-3">{order.lines.map((line) => line.productName + " × " + line.orderedQuantity).join(", ")}</p></div><div className="text-end"><StatusBadge status={order.status} /><p className="mt-1"><MoneyText money={order.total} /></p></div></div>{writeEnabled ? <div className="flex flex-wrap items-center gap-2"><Input aria-label={"Reason for approving " + sourceLabel} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approval reason" className="max-w-xs" />{order.status === "draft" ? <Button size="xs" onClick={() => mutations.approveOrder.mutate({ id: order.id, reason: reason.trim() || undefined })} loading={mutations.approveOrder.isPending}><Check /> Approve</Button> : null}{["approved", "partially_received"].includes(order.status) ? <Button size="xs" variant="secondary" onClick={() => mutations.receiveOrder.mutate({ purchaseOrderId: order.id, idempotencyKey: newKey("receive") })} loading={mutations.receiveOrder.isPending}><PackagePlus /> Receive</Button> : null}</div> : null}<p className="text-[11px] text-ink-3">Created <DateText iso={order.createdAt} /> · {currency}</p></div>;
}

function SupplierManagementDialog({ open, onOpenChange, suppliers, branches, writeEnabled, onAdd, onEdit, onArchive }: { open: boolean; onOpenChange: (open: boolean) => void; suppliers: Supplier[]; branches: Array<{ id: string; name: string }>; writeEnabled: boolean; onAdd: () => void; onEdit: (supplier: Supplier) => void; onArchive: (supplier: Supplier) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Suppliers</DialogTitle><DialogDescription>Manage the contacts used when you replenish stock.</DialogDescription></DialogHeader><DialogBody className="max-h-[60vh] overflow-y-auto p-0">{suppliers.length === 0 ? <EmptyState compact title="No suppliers" description="Add the suppliers you use for stock replenishment." className="m-4" /> : <div className="divide-y divide-line">{suppliers.map((supplier) => <div key={supplier.id} className="flex items-center gap-3 p-4"><div className="flex size-8 items-center justify-center rounded-md bg-sunken"><Store className="size-4 text-ink-2" aria-hidden /></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{supplier.name}</p><p className="mt-0.5 truncate text-[11.5px] text-ink-3">{supplier.contactName ?? "No contact"} · {supplier.email ?? supplier.phone ?? "No contact channel"}</p><div className="mt-1 flex flex-wrap gap-1">{supplier.branchIds.map((id) => <Badge key={id} variant="neutral">{branches.find((branch) => branch.id === id)?.name ?? id}</Badge>)}</div></div><StatusBadge status={supplier.status} />{writeEnabled ? <div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" aria-label={"Edit " + supplier.name} onClick={() => onEdit(supplier)}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={"Archive " + supplier.name} onClick={() => onArchive(supplier)}><Archive /></Button></div> : null}</div>)}</div>}</DialogBody><DialogFooter>{writeEnabled ? <Button onClick={onAdd}><Plus /> Add supplier</Button> : null}<Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function PurchaseOrderListDialog({ open, onOpenChange, orders, writeEnabled, currency, mutations, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; orders: PurchaseOrder[]; writeEnabled: boolean; currency: string; mutations: OperationsMutations; onCreate: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Purchase orders</DialogTitle><DialogDescription>Approve a draft to reserve stock, then receive it when it arrives.</DialogDescription></DialogHeader><DialogBody className="max-h-[60vh] overflow-y-auto p-0">{orders.length === 0 ? <EmptyState compact title="No purchase orders" description="Create a draft when a stock alert needs replenishment." className="m-4" /> : <div className="divide-y divide-line">{orders.map((order) => <PurchaseOrderRow key={order.id} order={order} writeEnabled={writeEnabled} currency={currency} mutations={mutations} />)}</div>}</DialogBody><DialogFooter>{writeEnabled ? <Button onClick={onCreate}><Plus /> New purchase order</Button> : null}<Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function TransferStockDialog({ open, onOpenChange, sourceBranchId, branches, products, inventory, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; sourceBranchId?: string; branches: Array<{ id: string; name: string; status?: string }>; products: Product[]; inventory: InventoryBalance[]; pending: boolean; onSubmit: (input: InventoryTransferInput) => void }) {
  const [productId, setProductId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const availableByProduct = useMemo(() => new Map(inventory.filter((row) => row.branchId === sourceBranchId).map((row) => [row.productId, row.availableQuantity])), [inventory, sourceBranchId]);
  const transferableProducts = useMemo(() => products.filter((product) => product.status === "active" && (availableByProduct.get(product.id) ?? 0) > 0), [availableByProduct, products]);
  const destinations = useMemo(() => branches.filter((branch) => branch.id !== sourceBranchId && branch.status !== "inactive"), [branches, sourceBranchId]);
  const selectedAvailable = productId ? availableByProduct.get(productId) ?? 0 : 0;
  const sourceBranchName = branches.find((branch) => branch.id === sourceBranchId)?.name ?? "Selected branch";

  useEffect(() => {
    if (!open) return;
    setProductId((current) => transferableProducts.some((product) => product.id === current) ? current : transferableProducts[0]?.id ?? "");
    setDestinationBranchId((current) => destinations.some((branch) => branch.id === current) ? current : destinations[0]?.id ?? "");
    setQuantity("1");
    setReason("");
  }, [destinations, open, sourceBranchId, transferableProducts]); // Reset only when the source branch or dialog changes.

  const parsedQuantity = Number(quantity);
  const canSubmit = Boolean(sourceBranchId && productId && destinationBranchId && Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= selectedAvailable && reason.trim().length >= 3 && !pending);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Move stock to another branch</DialogTitle><DialogDescription>Choose an item and destination. The source branch decreases and the destination branch increases together.</DialogDescription></DialogHeader><DialogBody><div className="mb-3 rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] text-ink-2"><span className="text-ink-3">Moving from</span> <strong>{sourceBranchName}</strong></div><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!canSubmit || !sourceBranchId) return; onSubmit({ sourceBranchId, destinationBranchId, productId, quantity: parsedQuantity, reason: reason.trim(), idempotencyKey: newKey("inventory-transfer") }); }}>
    <Field label="Item" hint={transferableProducts.length > 0 ? "Only items available at the selected branch are shown." : "There is no available stock to move from this branch."} required><Select value={productId || "none"} onValueChange={(value) => setProductId(value === "none" ? "" : value)}><SelectTrigger aria-label="Transfer item"><SelectValue placeholder="Choose an item" /></SelectTrigger><SelectContent>{transferableProducts.length === 0 ? <SelectItem value="none" disabled>No available items</SelectItem> : transferableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {availableByProduct.get(product.id)} available</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Destination branch" required><Select value={destinationBranchId || "none"} onValueChange={(value) => setDestinationBranchId(value === "none" ? "" : value)}><SelectTrigger aria-label="Transfer destination"><SelectValue placeholder="Choose a branch" /></SelectTrigger><SelectContent>{destinations.length === 0 ? <SelectItem value="none" disabled>No other branch available</SelectItem> : destinations.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
    <Field label="Quantity" hint={productId ? `Up to ${selectedAvailable} available at the source branch.` : "Choose an item first."} required><Input aria-label="Transfer quantity" type="number" min="1" max={selectedAvailable || undefined} step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></Field>
    <Field label="Reason" hint="This is saved with both stock movements and the audit record." required><Textarea aria-label="Transfer reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Restock the Sweifieh branch" required /></Field>
    <DialogFooter className="px-0 pb-0"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button><Button type="submit" loading={pending} disabled={!canSubmit}><ArrowRightLeft /> Move stock</Button></DialogFooter>
  </form></DialogBody></DialogContent></Dialog>;
}

function EquipmentRecommendationPanel({ asset, recommendation, loading, error }: { asset?: EquipmentAsset; recommendation?: EquipmentRecommendation; loading: boolean; error?: unknown }) {
  if (!asset) return <div className="flex min-h-40 items-center justify-center p-5 text-center text-[12px] text-ink-3">Select a machine to see its repair history.</div>;
  if (loading) return <div className="space-y-3 p-5"><Skeleton className="h-5 w-32" /><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-40" /></div>;
  if (error) return <div className="p-5 text-[12px] text-danger" role="alert">Machine history could not be loaded. Try again after refreshing.</div>;
  if (!recommendation) return null;
  const decisionLabel = recommendation.decision === "fix" ? "Repair looks reasonable" : recommendation.decision === "replace" ? "Replacement may be better" : "More information needed";
  const decisionTone = recommendation.decision === "fix" ? "success" : recommendation.decision === "replace" ? "danger" : "warning";
  return <div className="space-y-3 p-5"><div><p className="eyebrow">Repair decision support</p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant={decisionTone} dot>{recommendation.decision.replaceAll("_", " ")}</Badge><span className="text-[13px] font-medium">{decisionLabel}</span></div><p className="mt-1 text-[11px] text-ink-3">Based only on recorded issues, costs, age, and useful life. A manager still makes the final decision.</p></div><div className="grid grid-cols-2 gap-3 text-[12px]"><div><p className="eyebrow">Issues</p><p className="mt-1 font-mono text-[17px]" dir="ltr">{recommendation.issueCount}</p></div><div><p className="eyebrow">Downtime</p><p className="mt-1 font-mono text-[17px]" dir="ltr">{recommendation.downtimeDays}d</p></div><div><p className="eyebrow">Repair total</p><p className="mt-1"><MoneyText money={recommendation.repairCost} /></p></div><div><p className="eyebrow">Replacement</p><p className="mt-1"><MoneyText money={recommendation.replacementEstimate} /></p></div></div><ul className="space-y-1 border-t border-line pt-3 text-[11px] text-ink-2">{recommendation.rationale.map((reason) => <li key={reason} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />{reason}</li>)}</ul></div>;
}

function EquipmentTab({ branchId, currency, writeEnabled, zones, assets, issues, workOrders, loading, error, onRetry, mutations }: { branchId?: string; currency: string; writeEnabled: boolean; zones: Array<{ id: string; name: string }>; assets: EquipmentAsset[]; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const [assetForm, setAssetForm] = useState<EquipmentAsset | "new" | null>(null);
  const [issueForm, setIssueForm] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState<EquipmentWorkOrder | "new" | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const actionAssets = assets.filter((asset) => !["retired", "replaced"].includes(asset.status));
  const recommendationQuery = useApiQuery(qk.operations({ kind: "equipment-recommendation", assetId: selectedAsset?.id }), (api) => api.getEquipmentRecommendation(selectedAsset!.id), { enabled: Boolean(selectedAsset?.id) });

  useEffect(() => {
    if (!assets.some((asset) => asset.id === selectedAssetId)) setSelectedAssetId(assets[0]?.id);
  }, [assets, selectedAssetId]);

  if (!branchId) return <StatePanel icon={Wrench} title="Choose a branch first" description="Equipment belongs to one branch at a time. Choose a branch above to view and update its machines." className="mt-2" />;
  if (loading) return <LoadingGrid />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription="Your role can’t read machine records for this workspace." />;

  const updateAssetStatus = (asset: EquipmentAsset, status: EquipmentAsset["status"]) => mutations.asset.mutate({ id: asset.id, branchId: asset.branchId, zoneId: asset.zoneId, code: asset.code, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, serialNumber: asset.serialNumber, purchaseDate: asset.purchaseDate, installationDate: asset.installationDate, purchaseCost: asset.purchaseCost, warrantyEndDate: asset.warrantyEndDate, status, expectedServiceIntervalDays: asset.expectedServiceIntervalDays, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths });
  const updateWorkOrder = (order: EquipmentWorkOrder, status: EquipmentWorkOrder["status"]) => mutations.workOrder.mutate({ id: order.id, branchId: order.branchId, assetId: order.assetId, issueId: order.issueId, status, description: order.description, assigneeId: order.assigneeId, vendorName: order.vendorName, partsCost: order.partsCost, laborCost: order.laborCost, replacementEstimate: order.replacementEstimate });
  const hasUnsafeOpenIssue = (assetId: string) => issues.some((issue) => issue.assetId === assetId && !["resolved", "cancelled"].includes(issue.status) && issue.safetyStatus === "out_of_service");
  const openIssues = issues.filter((issue) => !["resolved", "cancelled"].includes(issue.status));
  const openOrders = workOrders.filter((order) => !["completed", "cancelled"].includes(order.status));
  // Daily work lives in the open items; history stays visible below them.
  const sortedIssues = [...issues].sort((left, right) => Number(["resolved", "cancelled"].includes(left.status)) - Number(["resolved", "cancelled"].includes(right.status)));
  const sortedWorkOrders = [...workOrders].sort((left, right) => Number(["completed", "cancelled"].includes(left.status)) - Number(["completed", "cancelled"].includes(right.status)));
  return <div className="space-y-4" data-testid="operations-equipment">
    <div className="grid grid-cols-3 gap-2 sm:gap-3"><section className="panel p-3 sm:p-4"><p className="eyebrow">Machines</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{assets.length}</p><p className="mt-1 hidden text-[11px] text-ink-3 sm:block">Registered at this branch</p></section><section className={cn("panel p-3 sm:p-4", openIssues.length > 0 && "border-warning/50 bg-warning-bg/20")}><p className="eyebrow">Open issues</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{openIssues.length}</p><p className="mt-1 hidden text-[11px] text-ink-3 sm:block">Resolve after the machine is checked</p></section><section className="panel p-3 sm:p-4"><p className="eyebrow">Open work orders</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{openOrders.length}</p><p className="mt-1 hidden text-[11px] text-ink-3 sm:block">Repairs in progress or awaiting work</p></section></div>
    {!writeEnabled ? <ReadOnlyNotice /> : null}
    <section className="panel overflow-hidden"><SectionHeader icon={Wrench} title="Machine register" description="Select a machine to see its status, issue history, and repair decision support." actions={writeEnabled ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setIssueForm(true)} disabled={actionAssets.length === 0}><ShieldAlert /> Report issue</Button><Button size="sm" onClick={() => setAssetForm("new")}><Plus /> Add machine</Button></div> : null} />
      {assets.length === 0 ? <EmptyState title="No machines registered" description="Add the first machine for this branch to start recording issues and repairs." className="m-4" /> : <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:divide-x lg:divide-y-0"><div className="divide-y divide-line">{assets.map((asset) => { const unsafeOpenIssue = hasUnsafeOpenIssue(asset.id); const cannotActivate = asset.status === "maintenance" && unsafeOpenIssue; return <div key={asset.id} className={cn("flex items-center gap-3 p-4", selectedAsset?.id === asset.id && "bg-sunken")}><button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start hover:opacity-80" onClick={() => setSelectedAssetId(asset.id)} aria-pressed={selectedAsset?.id === asset.id}><span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface"><Cog className="size-4 text-ink-2" aria-hidden /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-medium">{asset.code}</span><StatusBadge status={asset.status} /></span><span className="mt-1 block truncate text-[13px]">{asset.name}</span><span className="mt-0.5 block truncate text-[11px] text-ink-3">{asset.manufacturer ?? "Unknown manufacturer"}{asset.model ? ` · ${asset.model}` : ""} · {issues.filter((issue) => issue.assetId === asset.id).length} issue records</span></span><ChevronRight className="size-4 shrink-0 text-ink-3 rtl:rotate-180" aria-hidden /></button>{writeEnabled ? <div className="flex shrink-0 flex-col items-end gap-1"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${asset.name}`} onClick={() => setAssetForm(asset)}><Pencil /></Button>{!["retired", "replaced"].includes(asset.status) ? <Button size="xs" variant="secondary" onClick={() => updateAssetStatus(asset, asset.status === "maintenance" ? "active" : "maintenance")} loading={mutations.asset.isPending} disabled={cannotActivate} title={cannotActivate ? "Resolve the out-of-service issue and mark it safe before returning this machine to active use." : undefined}>{asset.status === "maintenance" ? "Mark active" : "Maintenance"}</Button> : null}</div>{cannotActivate ? <span className="max-w-44 text-end text-[10px] leading-snug text-warning-deep" role="status">Resolve the out-of-service issue below before marking active.</span> : null}</div> : null}</div>; })}</div><EquipmentRecommendationPanel asset={selectedAsset} recommendation={recommendationQuery.data} loading={recommendationQuery.isLoading} error={recommendationQuery.error} /></div>}
    </section>
    <div className="grid gap-4 lg:grid-cols-2"><section className="panel overflow-hidden"><SectionHeader icon={ShieldAlert} title="Issue history" description="Every report stays here; update the status as the machine is investigated and repaired." />{sortedIssues.length === 0 ? <EmptyState compact title="No issue history" description="Reported machine problems will appear here." className="m-4" /> : <div className="divide-y divide-line">{sortedIssues.map((issue) => { const asset = assets.find((item) => item.id === issue.assetId); return <div key={issue.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[13px] font-medium">{issue.title}</p><p className="mt-0.5 text-[11px] text-ink-3">{asset?.code ?? "Machine"} · {issue.severity} · {issue.downtimeDays ?? 0} downtime days</p></div><StatusBadge status={issue.status} /></div><p className="text-[11px] text-ink-3"><StatusBadge status={issue.safetyStatus} /> · reported <DateTimeText iso={issue.reportedAt} /></p>{writeEnabled && !["resolved", "cancelled"].includes(issue.status) ? <div className="flex flex-wrap gap-2 pt-1"><Button size="xs" variant="secondary" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: issue.status === "open" ? { status: "in_progress" } : { status: "resolved", safetyStatus: "safe_to_operate" } })} loading={mutations.issueUpdate.isPending} title={issue.status === "open" ? undefined : "Resolving confirms this machine is safe to operate."}>{issue.status === "open" ? "Start investigation" : "Resolve issue"}</Button><Button size="xs" variant="ghost" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: { status: "cancelled" } })} loading={mutations.issueUpdate.isPending}>Cancel report</Button></div> : null}</div>; })}</div>}</section>
      <section className="panel overflow-hidden"><SectionHeader icon={Wrench} title="Work orders" description="Approve a repair, start the work, then complete or cancel it. Costs remain visible for management and finance." actions={writeEnabled ? <Button size="sm" onClick={() => setWorkOrderForm("new")} disabled={actionAssets.length === 0}><Plus /> Open work order</Button> : null} />{sortedWorkOrders.length === 0 ? <EmptyState compact title="No work orders" description="Open one when a machine needs repair or a replacement quote." className="m-4" /> : <div className="divide-y divide-line">{sortedWorkOrders.map((order) => { const asset = assets.find((item) => item.id === order.assetId); return <div key={order.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[13px] font-medium">{order.description}</p><p className="mt-0.5 text-[11px] text-ink-3">{asset?.code ?? "Machine"}{order.vendorName ? ` · ${order.vendorName}` : ""}</p></div><StatusBadge status={order.status} /></div><p className="text-[11px] text-ink-3">Repair <MoneyText money={order.totalCost} /> · replacement <MoneyText money={order.replacementEstimate} /> · opened <DateTimeText iso={order.openedAt} /></p>{writeEnabled && !["completed", "cancelled"].includes(order.status) ? <div className="flex flex-wrap gap-2 pt-1">{order.status === "draft" ? <Button size="xs" onClick={() => updateWorkOrder(order, "approved")} loading={mutations.workOrder.isPending}><Check /> Approve</Button> : null}{order.status === "approved" ? <Button size="xs" variant="secondary" onClick={() => updateWorkOrder(order, "in_progress")} loading={mutations.workOrder.isPending}><Wrench /> Start work</Button> : null}{order.status === "in_progress" ? <Button size="xs" onClick={() => updateWorkOrder(order, "completed")} loading={mutations.workOrder.isPending}><CheckCircle2 /> Complete</Button> : null}<Button size="xs" variant="ghost" onClick={() => updateWorkOrder(order, "cancelled")} loading={mutations.workOrder.isPending}>Cancel order</Button><Button size="icon" variant="ghost" aria-label={`Edit ${order.description}`} onClick={() => setWorkOrderForm(order)}><Pencil /></Button></div> : null}</div>; })}</div>}</section></div>
    {assetForm ? <EquipmentAssetForm currency={currency} zones={zones} branchId={branchId} asset={assetForm === "new" ? undefined : assetForm} activeBlocked={assetForm !== "new" && hasUnsafeOpenIssue(assetForm.id)} pending={mutations.asset.isPending} onCancel={() => setAssetForm(null)} onSubmit={(input) => mutations.asset.mutate(input, { onSuccess: () => setAssetForm(null) })} /> : null}
    {issueForm ? <EquipmentIssueForm assets={actionAssets} branchId={branchId} pending={mutations.issue.isPending} onCancel={() => setIssueForm(false)} onSubmit={(input) => mutations.issue.mutate(input, { onSuccess: () => setIssueForm(false) })} /> : null}
    {workOrderForm ? <EquipmentWorkOrderForm currency={currency} assets={actionAssets} issues={issues} branchId={branchId} order={workOrderForm === "new" ? undefined : workOrderForm} pending={mutations.workOrder.isPending} onCancel={() => setWorkOrderForm(null)} onSubmit={(input) => mutations.workOrder.mutate(input, { onSuccess: () => setWorkOrderForm(null) })} /> : null}
  </div>;
}

function InventoryTab({ branchId, branchLabel, branches, currency, writeEnabled, products, suppliers, inventory, alerts, orders, loading, error, onRetry, mutations, onSell }: { branchId?: string; branchLabel: string; branches: Array<{ id: string; name: string }>; currency: string; writeEnabled: boolean; products: Product[]; suppliers: Supplier[]; inventory: InventoryBalance[]; alerts: LowStockAlert[]; orders: PurchaseOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations; onSell?: (productId: string) => void }) {
  const [productForm, setProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [supplierForm, setSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier>();
  const [orderForm, setOrderForm] = useState<{ defaultProductId?: string } | null>(null);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [ordersDialog, setOrdersDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "product" | "supplier"; id: string; label: string }>();
  const productName = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const alertProductIds = useMemo(() => new Set(alerts.map((alert) => alert.productId)), [alerts]);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(term)) : products;
  }, [products, search]);
  const openOrderCount = useMemo(() => orders.filter((order) => ["draft", "approved", "partially_received"].includes(order.status)).length, [orders]);
  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, InventoryBalance[]>();
    inventory.forEach((row) => {
      if (!branchId || row.branchId === branchId) map.set(row.productId, [...(map.get(row.productId) ?? []), row]);
    });
    return map;
  }, [branchId, inventory]);
  if (loading) return <LoadingGrid />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription="Your role can’t read inventory for this workspace." />;
  const closeProductForm = () => { setProductForm(false); setEditingProduct(undefined); };
  const closeSupplierForm = () => { setSupplierForm(false); setEditingSupplier(undefined); };
  return (
    <div className="space-y-4" data-testid="operations-inventory">
      <section className="panel overflow-hidden">
        <SectionHeader icon={Boxes} title="Inventory" description={branchId ? "Available is what staff can sell at " + branchLabel.toLowerCase() + "." : "Compare available stock across branches. Choose one branch above before editing or selling."} actions={<div className="flex flex-wrap items-center gap-2"><div className="relative"><SearchIcon className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items…" className="h-8 w-40 ps-8 sm:w-48" aria-label="Search stock items" /></div>{writeEnabled ? <><Button size="sm" onClick={() => { setEditingProduct(undefined); setProductForm(true); }} disabled={!branchId}><Plus /> Add item</Button><Button size="sm" variant="secondary" onClick={() => setTransferDialog(true)} disabled={!branchId}><ArrowRightLeft /> Move stock</Button><Button size="sm" variant="secondary" onClick={() => setSupplierDialog(true)}><Store /> Suppliers</Button><Button size="sm" variant="secondary" onClick={() => setOrdersDialog(true)} disabled={!branchId} aria-label="Purchase orders"><ShoppingCart /> Purchase orders{openOrderCount > 0 ? <Badge variant="warning" className="ms-0.5">{openOrderCount}</Badge> : null}</Button></> : null}</div>} />
        {!writeEnabled ? <div className="p-4"><ReadOnlyNotice /></div> : null}
        {!branchId && writeEnabled ? <div className="border-b border-line bg-warning-bg/40 px-4 py-2.5 text-[12px] text-warning-deep" role="status">Select a branch above to add items, change quantities, create purchase orders, or check out.</div> : null}
        <div className="overflow-x-auto"><table className="w-full text-start"><caption className="sr-only">Available inventory</caption><thead className="border-b border-line bg-sunken/40 text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2.5 font-medium">Item</th><th className="px-4 py-2.5 text-end font-medium">Available</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 text-end font-medium">Selling price</th><th className="px-4 py-2.5 text-end font-medium">Actions</th></tr></thead><tbody className="divide-y divide-line">{products.length === 0 ? <tr><td colSpan={5}><EmptyState compact title="No stock items yet" description="Add an item to start tracking what is available." className="m-4" /></td></tr> : visibleProducts.length === 0 ? <tr><td colSpan={5}><EmptyState compact title="No matching items" description="Try a different name or SKU." className="m-4" /></td></tr> : visibleProducts.map((product) => { const rows = inventoryByProduct.get(product.id) ?? []; const productAlerts = alerts.filter((alert) => alert.productId === product.id); const selectedRow = rows.find((row) => row.branchId === branchId); const available = selectedRow?.availableQuantity ?? 0; const totalAvailable = rows.reduce((sum, row) => sum + row.availableQuantity, 0); const low = selectedRow ? available <= product.reorderPoint : rows.some((row) => row.availableQuantity <= product.reorderPoint); const needsReplenishment = alertProductIds.has(product.id); const alertBranches = [...new Set(productAlerts.map((alert) => branches.find((branch) => branch.id === alert.branchId)?.name ?? alert.branchId))].join(", "); const sellable = Boolean(onSell && branchId && available > 0 && hasSellableRetailPrice(product, currency)); return <tr key={product.id} className="text-[12.5px]"><td className="px-4 py-3"><span className="font-medium">{product.name}</span><span className="block text-[11px] text-ink-3">{product.sku} · {product.unit}</span></td><td className={cn("px-4 py-3 text-end font-mono", needsReplenishment ? "text-warning-deep" : "text-ink")} dir="ltr">{branchId ? available : <><span>Total {totalAvailable}</span>{rows.length > 0 ? <span className="mt-1 block text-[10px] font-sans text-ink-3">{rows.map((row) => `${branches.find((branch) => branch.id === row.branchId)?.name ?? row.branchId}: ${row.availableQuantity}`).join(" · ")}</span> : null}</>}</td><td className="px-4 py-3">{needsReplenishment ? <Badge variant="warning" dot>{branchId ? (low ? "Low stock" : "Replenish soon") : `${low ? "Low stock" : "Replenish soon"} · ${alertBranches}`}</Badge> : <Badge variant="success" dot>Available</Badge>}</td><td className="px-4 py-3 text-end font-mono" dir="ltr">{product.retailPrice ? <MoneyText money={product.retailPrice} /> : <span className="text-ink-3">Not set</span>}</td><td className="px-4 py-3 text-end"><div className="flex items-center justify-end gap-1">{sellable ? <Button size="xs" variant="secondary" aria-label={"Sell " + product.name} onClick={() => onSell!(product.id)}><ShoppingBag /> Sell</Button> : null}{writeEnabled && branchId ? <Button size="xs" variant={needsReplenishment ? "primary" : "ghost"} aria-label={"Reorder " + product.name} onClick={() => setOrderForm({ defaultProductId: product.id })}><PackagePlus /> Reorder</Button> : null}{writeEnabled ? <Button size="icon" variant="ghost" aria-label={"Edit " + product.name} onClick={() => { setEditingProduct(product); setProductForm(true); }} disabled={!branchId}><Pencil /></Button> : null}</div></td></tr>; })}</tbody></table></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/30 px-4 py-2.5 text-[11.5px]" role="status"><AlertTriangle className={cn("size-3.5", alerts.length > 0 ? "text-warning-deep" : "text-ink-3")} aria-hidden />{alerts.length > 0 ? <span><strong>{alerts.length}</strong> low-stock {alerts.length === 1 ? "alert" : "alerts"}{branchId ? " at this branch" : " across visible branches"}.</span> : <span>No low-stock alerts for this scope.</span>}{alerts.length > 0 ? <span className="text-ink-3">{alerts.slice(0, 3).map((alert) => `${productName.get(alert.productId) ?? "Item"} · ${branches.find((branch) => branch.id === alert.branchId)?.name ?? alert.branchId} (${alert.availableQuantity})`).join(" · ")}{alerts.length > 3 ? " · …" : ""}</span> : null}</div>
      </section>

      <SupplierManagementDialog open={supplierDialog} onOpenChange={setSupplierDialog} suppliers={suppliers} branches={branches} writeEnabled={writeEnabled} onAdd={() => { setSupplierDialog(false); setEditingSupplier(undefined); setSupplierForm(true); }} onEdit={(supplier) => { setSupplierDialog(false); setEditingSupplier(supplier); setSupplierForm(true); }} onArchive={(supplier) => { setSupplierDialog(false); setDeleteTarget({ type: "supplier", id: supplier.id, label: supplier.name }); }} />
      <PurchaseOrderListDialog open={ordersDialog} onOpenChange={setOrdersDialog} orders={orders} writeEnabled={writeEnabled} currency={currency} mutations={mutations} onCreate={() => { setOrdersDialog(false); setOrderForm({}); }} />
      <TransferStockDialog open={transferDialog} onOpenChange={setTransferDialog} sourceBranchId={branchId} branches={branches} products={products} inventory={inventory} pending={mutations.transfer.isPending} onSubmit={(input) => mutations.transfer.mutate(input, { onSuccess: () => setTransferDialog(false) })} />

      {productForm ? <ProductForm key={editingProduct?.id ?? "new-product"} currency={currency} branchId={branchId} product={editingProduct} availableQuantity={editingProduct ? inventoryByProduct.get(editingProduct.id)?.[0]?.availableQuantity : undefined} pending={mutations.product.isPending} onCancel={closeProductForm} onRequestDelete={editingProduct ? () => { const productToDelete = editingProduct; closeProductForm(); setDeleteTarget({ type: "product", id: productToDelete.id, label: productToDelete.name }); } : undefined} onSubmit={(input) => mutations.product.mutate(input, { onSuccess: closeProductForm })} /> : null}
      {supplierForm ? <SupplierForm key={editingSupplier?.id ?? "new-supplier"} defaultBranchId={branchId} branches={branches} supplier={editingSupplier} pending={mutations.supplier.isPending} onCancel={closeSupplierForm} onSubmit={(input) => mutations.supplier.mutate(input, { onSuccess: closeSupplierForm })} /> : null}
      {orderForm ? <PurchaseOrderForm currency={currency} products={products} suppliers={suppliers} branchId={branchId} defaultProductId={orderForm.defaultProductId} pending={mutations.purchaseOrder.isPending} onCancel={() => setOrderForm(null)} onSubmit={(input) => mutations.purchaseOrder.mutate(input, { onSuccess: () => setOrderForm(null) })} /> : null}
      <DeleteDialog kind={deleteTarget?.type} label={deleteTarget?.label ?? "item"} open={Boolean(deleteTarget)} pending={mutations.deleteProduct.isPending || mutations.archiveSupplier.isPending} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onConfirm={(reason, confirmation) => { if (!deleteTarget) return; const onSuccess = () => setDeleteTarget(undefined); if (deleteTarget.type === "product") mutations.deleteProduct.mutate({ productId: deleteTarget.id, reason, confirmation: confirmation ?? "" }, { onSuccess }); else mutations.archiveSupplier.mutate({ id: deleteTarget.id, reason }, { onSuccess }); }} />
    </div>
  );
}

function LoadingGrid() {
  return <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}

export function OperationsCommandCenter() {
  const { session, setBranch } = useApp();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<OperationsTab>(requestedTab === "facilities" ? "facilities" : "inventory");
  // A Sell action on an inventory row jumps straight into checkout with that
  // item already in the sale, instead of making staff find it twice.
  const [saleProductId, setSaleProductId] = useState<string>();
  const branchId = session?.activeBranchId;
  const branchLabel = branchId ? session?.branches.find((branch) => branch.id === branchId)?.name ?? branchId : "All branches";
  const currency = session?.organization.currency ?? CURRENCY_FALLBACK;
  const writeEnabled = can("operations.manage");
  const canCheckout = can("payments.collect");
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess());
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const operationsModule = workspace?.modules.find((entry) => entry.key === "operations");
  const ready = Boolean(operationsModule?.entitled && operationsModule.enabled);
  const productQuery = useApiQuery(qk.operations({ kind: "products" }), (api) => api.listProducts(), { enabled: ready });
  const supplierQuery = useApiQuery(qk.operations({ kind: "suppliers" }), (api) => api.listSuppliers(), { enabled: ready });
  const inventoryQuery = useApiQuery(qk.operations({ kind: "inventory", branchId }), (api) => api.listInventory({ branchId }), { enabled: ready });
  const alertQuery = useApiQuery(qk.operations({ kind: "alerts", branchId }), (api) => api.listLowStockAlerts({ branchId }), { enabled: ready });
  const ordersQuery = useApiQuery(qk.operations({ kind: "purchase-orders", branchId }), (api) => api.listPurchaseOrders({ branchId }), { enabled: ready });
  const zonesQuery = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { enabled: ready && Boolean(branchId) });
  const assetsQuery = useApiQuery(qk.operations({ kind: "equipment-assets", branchId }), (api) => api.listEquipmentAssets({ branchId }), { enabled: ready && Boolean(branchId) });
  const issuesQuery = useApiQuery(qk.operations({ kind: "equipment-issues", branchId }), (api) => api.listEquipmentIssues({ branchId }), { enabled: ready && Boolean(branchId) });
  const workOrdersQuery = useApiQuery(qk.operations({ kind: "equipment-work-orders", branchId }), (api) => api.listEquipmentWorkOrders({ branchId }), { enabled: ready && Boolean(branchId) });
  const mutations = useOperationsMutations(invalidate);

  useEffect(() => {
    const requestedBranchId = searchParams.get("branch");
    if (!requestedBranchId || session?.activeBranchId === requestedBranchId || !session?.branches.some((branch) => branch.id === requestedBranchId)) return;
    void setBranch(requestedBranchId);
  }, [searchParams, session?.activeBranchId, session?.branches, setBranch]);

  if (!can("members.read")) return <ForbiddenState description="Daily operations are limited to gym team members with operational read access." />;
  if (workspaceQuery.isLoading) return <div className="space-y-4"><PageHeader eyebrow="Operations" title="Inventory and checkout" description="A simple place to see stock, sell items, and replenish what is running low." /><LoadingGrid /></div>;
  if (workspaceQuery.isError || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => workspaceQuery.refetch()} />;
  if (!operationsModule?.entitled) return <StatePanel icon={Boxes} title="Operations is not included" description="The Growth workspace module adds inventory checkout and supplier workflows." className="mt-4" />;
  if (!operationsModule.enabled) return <StatePanel icon={Boxes} title="Operations is paused" description="An organization owner can enable the operations module from workspace settings." className="mt-4" />;

  const inventoryError = productQuery.error ?? supplierQuery.error ?? inventoryQuery.error ?? alertQuery.error ?? ordersQuery.error;
  const equipmentError = zonesQuery.error ?? assetsQuery.error ?? issuesQuery.error ?? workOrdersQuery.error;
  const retryInventory = () => { void Promise.all([productQuery.refetch(), supplierQuery.refetch(), inventoryQuery.refetch(), alertQuery.refetch(), ordersQuery.refetch()]); };
  const retryEquipment = () => { void Promise.all([zonesQuery.refetch(), assetsQuery.refetch(), issuesQuery.refetch(), workOrdersQuery.refetch()]); };
  const inventoryLoading = [productQuery, supplierQuery, inventoryQuery, alertQuery, ordersQuery].some((query) => query.isLoading);
  const equipmentLoading = Boolean(branchId) && [zonesQuery, assetsQuery, issuesQuery, workOrdersQuery].some((query) => query.isLoading);
  const products = productQuery.data ?? [];
  const suppliers = supplierQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const alerts = alertQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const assets = assetsQuery.data ?? [];
  const issues = issuesQuery.data ?? [];
  const workOrders = workOrdersQuery.data ?? [];
  const branches = session?.branches ?? [];
  return <div className="space-y-4" data-testid="operations-command-center"><PageHeader eyebrow="Operations" title="Inventory, facilities, and machines" description={branchId ? `Run daily work at ${branchLabel.toLowerCase()}. Stock, spaces, and equipment stay tied to this branch.` : "Compare stock across branches. Select a branch for checkout, facility work, or equipment."} actions={<div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-2"><label htmlFor="operations-branch" className="sr-only">Operations branch</label><Select value={branchId ?? "all"} onValueChange={(value) => { void setBranch(value === "all" ? undefined : value); }}><SelectTrigger id="operations-branch" aria-label="Operations branch" className="h-8 min-w-44 border-0 bg-transparent px-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All branches</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>} />{inventoryError || equipmentError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some operational data could not refresh. <button type="button" className="font-medium underline" onClick={() => { retryInventory(); retryEquipment(); }}>Retry</button></div> : null}<Tabs value={tab} onValueChange={(value) => setTab(value as OperationsTab)}><TabsList aria-label="Operations workspace" className="inline-flex w-fit max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1"><TabsTrigger value="inventory" className="gap-1.5 rounded-md px-3 py-1.5 text-[12px]"><Boxes className="size-3.5" /> Inventory</TabsTrigger>{canCheckout ? <TabsTrigger value="checkout" disabled={!branchId} className="gap-1.5 rounded-md px-3 py-1.5 text-[12px]"><ShoppingCart className="size-3.5" /> Checkout</TabsTrigger> : null}<TabsTrigger value="facilities" className="gap-1.5 rounded-md px-3 py-1.5 text-[12px]"><ClipboardCheck className="size-3.5" /> Facilities</TabsTrigger><TabsTrigger value="equipment" className="gap-1.5 rounded-md px-3 py-1.5 text-[12px]"><Wrench className="size-3.5" /> Equipment</TabsTrigger></TabsList><TabsContent value="inventory"><InventoryTab branchId={branchId} branchLabel={branchLabel} branches={branches} currency={currency} writeEnabled={writeEnabled} products={products} suppliers={suppliers} inventory={inventory} alerts={alerts} orders={orders} loading={inventoryLoading} error={inventoryError} onRetry={retryInventory} mutations={mutations} onSell={canCheckout && branchId ? (productId) => { setSaleProductId(productId); setTab("checkout"); } : undefined} /></TabsContent>{canCheckout ? <TabsContent value="checkout">{branchId ? <RetailCheckout embedded preselectProductId={saleProductId} /> : <StatePanel icon={ShoppingCart} title="Choose a branch first" description="Checkout uses the selected branch’s independent inventory. Choose a branch above to begin a sale." className="mt-2" />}</TabsContent> : null}<TabsContent value="facilities"><FacilityTaskWorkspace branchId={branchId} zones={zonesQuery.data ?? []} writeEnabled={writeEnabled} /></TabsContent><TabsContent value="equipment"><EquipmentTab branchId={branchId} currency={currency} writeEnabled={writeEnabled} zones={zonesQuery.data ?? []} assets={assets} issues={issues} workOrders={workOrders} loading={equipmentLoading} error={equipmentError} onRetry={retryEquipment} mutations={mutations} /></TabsContent></Tabs></div>;
}
