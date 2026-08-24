"use client";

import {
  Archive,
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cog,
  PackagePlus,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingCart,
  Store,
  Pencil,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  EquipmentAsset,
  EquipmentIssue,
  EquipmentRecommendation,
  EquipmentWorkOrder,
  FacilityTask,
  InventoryBalance,
  LowStockAlert,
  Product,
  PurchaseOrder,
  StockMovementType,
  Supplier,
  UpsertEquipmentAssetInput,
  UpsertEquipmentWorkOrderInput,
  UpsertFacilityTaskInput,
  UpsertProductInput,
  UpsertSupplierInput,
  WorkspaceAccess,
} from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { fromMajor, money, toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { DateText, DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OperationsTab = "inventory" | "facilities" | "equipment";

const CURRENCY_FALLBACK = "JOD";

function newKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function minorValue(value: string, currency: string): ReturnType<typeof money> | undefined {
  if (!value.trim()) return undefined;
  const major = Number(value);
  return Number.isFinite(major) && major >= 0 ? fromMajor(major, currency) : undefined;
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" {
  if (["completed", "received", "resolved", "active", "safe_to_operate"].includes(status)) return "success";
  if (["approved", "in_progress", "partially_received", "maintenance", "blocked"].includes(status)) return "warning";
  if (["critical", "out_of_service", "cancelled", "retired", "replaced"].includes(status)) return "danger";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)} dot>{status.replaceAll("_", " ")}</Badge>;
}

function FormPanel({ title, description, onCancel, children }: { title: string; description?: string; onCancel: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line-2 bg-sunken/30 p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[14px] font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-1 text-[12px] text-ink-3">{description}</p> : null}
        </div>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ArchiveDialog({ label, open, pending, onOpenChange, onConfirm }: { label: string; open: boolean; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <Dialog open={open} onOpenChange={(next) => { if (!next) setReason(""); onOpenChange(next); }}><DialogContent><DialogHeader><DialogTitle>Archive {label}?</DialogTitle><DialogDescription>Historical movements and orders stay intact. The record will no longer be available for new operations.</DialogDescription></DialogHeader><DialogBody><Field label="Reason" required><Textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="No longer offered or created in error" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button><Button variant="danger" loading={pending} disabled={reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}><Archive /> Archive</Button></DialogFooter></DialogContent></Dialog>;
}

function ProductForm({ currency, suppliers, product, pending, onCancel, onSubmit }: { currency: string; suppliers: Supplier[]; product?: Product; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertProductInput) => void }) {
  const [form, setForm] = useState(() => ({ sku: product?.sku ?? "", name: product?.name ?? "", unit: product?.unit ?? "each", reorderPoint: product ? String(product.reorderPoint) : "", targetLevel: product ? String(product.targetLevel) : "", leadTime: product ? String(product.supplierLeadTimeDays) : "", supplierId: product?.preferredSupplierId ?? "", cost: product?.defaultUnitCost ? String(toMajor(product.defaultUnitCost)) : "" }));
  const editing = Boolean(product);
  return (
    <FormPanel title={editing ? "Edit stock item" : "Add stock item"} description="Set the reorder threshold used by low-stock detection." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ id: product?.id, sku: form.sku, name: form.name, unit: form.unit as UpsertProductInput["unit"], reorderPoint: Number(form.reorderPoint), targetLevel: Number(form.targetLevel), supplierLeadTimeDays: Number(form.leadTime), preferredSupplierId: form.supplierId || undefined, defaultUnitCost: minorValue(form.cost, currency) }); }}>
        <Field label="SKU" required><Input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} placeholder="SUP-CREATINE" required /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Creatine" required /></Field>
        <Field label="Unit" required><Select value={form.unit} onValueChange={(value) => setForm((current) => ({ ...current, unit: value as UpsertProductInput["unit"] }))}><SelectTrigger aria-label="Product unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="each">Each</SelectItem><SelectItem value="kg">Kilogram</SelectItem><SelectItem value="liter">Liter</SelectItem><SelectItem value="box">Box</SelectItem><SelectItem value="serving">Serving</SelectItem></SelectContent></Select></Field>
        <Field label="Preferred supplier"><Select value={form.supplierId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, supplierId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Preferred supplier"><SelectValue placeholder="No preference" /></SelectTrigger><SelectContent><SelectItem value="none">No preference</SelectItem>{suppliers.filter((supplier) => supplier.status === "active").map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Reorder point" hint="Whole units" required><Input type="number" min="0" step="1" value={form.reorderPoint} onChange={(event) => setForm((current) => ({ ...current, reorderPoint: event.target.value }))} required /></Field>
        <Field label="Target level" hint="Must be at or above reorder point" required><Input type="number" min="0" step="1" value={form.targetLevel} onChange={(event) => setForm((current) => ({ ...current, targetLevel: event.target.value }))} required /></Field>
        <Field label="Supplier lead time" hint="Days" required><Input type="number" min="0" step="1" value={form.leadTime} onChange={(event) => setForm((current) => ({ ...current, leadTime: event.target.value }))} required /></Field>
        <Field label={`Default unit cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.cost} onChange={(event) => setForm((current) => ({ ...current, cost: event.target.value }))} placeholder="0.000" /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit" loading={pending}><PackagePlus /> {editing ? "Save changes" : "Save item"}</Button></div>
      </form>
    </FormPanel>
  );
}

function SupplierForm({ defaultBranchId, branches, supplier, pending, onCancel, onSubmit }: { defaultBranchId?: string; branches: Array<{ id: string; name: string }>; supplier?: Supplier; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertSupplierInput) => void }) {
  const [form, setForm] = useState(() => ({ name: supplier?.name ?? "", contactName: supplier?.contactName ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "", terms: supplier?.terms ?? "", leadTime: supplier?.leadTimeDays === undefined ? "" : String(supplier.leadTimeDays), branchIds: supplier?.branchIds ?? (defaultBranchId ? [defaultBranchId] : []) }));
  const editing = Boolean(supplier);
  return (
    <FormPanel title={editing ? "Edit supplier" : "Add supplier"} description="Keep supplier contacts and branch coverage in one place." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ id: supplier?.id, name: form.name, contactName: form.contactName || undefined, email: form.email || undefined, phone: form.phone || undefined, terms: form.terms || undefined, leadTimeDays: form.leadTime ? Number(form.leadTime) : undefined, branchIds: form.branchIds }); }}>
        <Field label="Supplier name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required placeholder="Jordan Sports Supply" /></Field>
        <Field label="Contact name"><Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Maya Haddad" /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="orders@example.com" /></Field>
        <Field label="Phone"><Input dir="ltr" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+962 …" /></Field>
        <Field label="Terms"><Input value={form.terms} onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} placeholder="Net 15" /></Field>
        <Field label="Lead time" hint="Days"><Input type="number" min="0" step="1" value={form.leadTime} onChange={(event) => setForm((current) => ({ ...current, leadTime: event.target.value }))} /></Field>
        <div className="sm:col-span-2"><p className="mb-1.5 text-[13px] font-medium text-ink-2">Branches</p><div className="flex flex-wrap gap-2">{branches.map((branch) => <label key={branch.id} className="inline-flex items-center gap-2 rounded-md border border-line-2 px-2.5 py-2 text-[12px]"><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(event) => setForm((current) => ({ ...current, branchIds: event.target.checked ? [...current.branchIds, branch.id] : current.branchIds.filter((id) => id !== branch.id) }))} />{branch.name}</label>)}</div></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit" loading={pending}><Store /> {editing ? "Save changes" : "Save supplier"}</Button></div>
      </form>
    </FormPanel>
  );
}

function MovementForm({ currency, products, branchId, pending, onCancel, onSubmit }: { currency: string; products: Product[]; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: { branchId: string; productId: string; type: StockMovementType; quantity: number; unitCost?: ReturnType<typeof money>; reason?: string; idempotencyKey: string }) => void }) {
  const [form, setForm] = useState<{ productId: string; type: StockMovementType; quantity: string; unitCost: string; reason: string }>({ productId: products[0]?.id ?? "", type: "receive", quantity: "", unitCost: "", reason: "" });
  return (
    <FormPanel title="Record stock movement" description="Every movement is idempotent and leaves an audit trail." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; onSubmit({ branchId, productId: form.productId, type: form.type, quantity: Number(form.quantity), unitCost: minorValue(form.unitCost, currency), reason: form.reason || undefined, idempotencyKey: newKey("stock") }); }}>
        <Field label="Product" required><Select value={form.productId} onValueChange={(value) => setForm((current) => ({ ...current, productId: value }))}><SelectTrigger aria-label="Stock movement product"><SelectValue placeholder="Choose product" /></SelectTrigger><SelectContent>{products.filter((product) => product.status === "active").map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.sku}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Movement" required><Select value={form.type} onValueChange={(value) => setForm((current) => ({ ...current, type: value as StockMovementType }))}><SelectTrigger aria-label="Stock movement type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="receive">Receive</SelectItem><SelectItem value="sale">Sale</SelectItem><SelectItem value="consumption">Consumption</SelectItem><SelectItem value="adjustment">Adjustment</SelectItem><SelectItem value="return">Return</SelectItem><SelectItem value="waste">Waste</SelectItem></SelectContent></Select></Field>
        <Field label="Quantity" hint="Adjustments may be negative" required><Input type="number" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required /></Field>
        <Field label={`Unit cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} /></Field>
        <Field label="Reason" className="sm:col-span-2"><Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Opening stock, damaged unit, sale…" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId}><PackagePlus /> Record movement</Button></div>
      </form>
    </FormPanel>
  );
}

function PurchaseOrderForm({ currency, products, suppliers, branchId, pending, onCancel, onSubmit }: { currency: string; products: Product[]; suppliers: Supplier[]; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: { branchId: string; supplierId: string; lines: Array<{ productId: string; quantity: number; unitCost: ReturnType<typeof money> }>; notes?: string }) => void }) {
  const [form, setForm] = useState({ supplierId: suppliers[0]?.id ?? "", productId: products[0]?.id ?? "", quantity: "", unitCost: "", notes: "" });
  return (
    <FormPanel title="Create purchase order" description="Draft the order first; approval commits the requested quantity." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; const unitCost = minorValue(form.unitCost, currency); if (!unitCost) return; onSubmit({ branchId, supplierId: form.supplierId, lines: [{ productId: form.productId, quantity: Number(form.quantity), unitCost }], notes: form.notes || undefined }); }}>
        <Field label="Supplier" required><Select value={form.supplierId} onValueChange={(value) => setForm((current) => ({ ...current, supplierId: value }))}><SelectTrigger aria-label="Purchase order supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger><SelectContent>{suppliers.filter((supplier) => supplier.status === "active").map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Product" required><Select value={form.productId} onValueChange={(value) => setForm((current) => ({ ...current, productId: value }))}><SelectTrigger aria-label="Purchase order product"><SelectValue placeholder="Choose product" /></SelectTrigger><SelectContent>{products.filter((product) => product.status === "active").map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.sku}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Quantity" required><Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} required /></Field>
        <Field label={`Unit cost (${currency})`} required><Input type="number" min="0" step="0.001" dir="ltr" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} required /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Delivery instructions or internal context" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId}><ShoppingCart /> Save draft</Button></div>
      </form>
    </FormPanel>
  );
}

function FacilityTaskForm({ zones, branchId, pending, onCancel, onSubmit }: { zones: Array<{ id: string; name: string }>; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertFacilityTaskInput) => void }) {
  const [form, setForm] = useState({ zoneId: zones[0]?.id ?? "", kind: "cleaning", severity: "medium", title: "", notes: "", occupancy: "" });
  return (
    <FormPanel title="Request facility task" description="Link the task to a physical zone so the next operator knows where to act." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; onSubmit({ branchId, zoneId: form.zoneId, kind: form.kind as UpsertFacilityTaskInput["kind"], severity: form.severity as UpsertFacilityTaskInput["severity"], title: form.title, notes: form.notes || undefined, trafficContext: form.occupancy ? { occupancyPercent: Number(form.occupancy), capturedAt: new Date().toISOString() } : undefined }); }}>
        <Field label="Zone" required><Select value={form.zoneId} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value }))}><SelectTrigger aria-label="Facility task zone"><SelectValue placeholder="Choose zone" /></SelectTrigger><SelectContent>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Task kind" required><Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value }))}><SelectTrigger aria-label="Facility task kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cleaning">Cleaning</SelectItem><SelectItem value="inspection">Inspection</SelectItem><SelectItem value="incident">Incident</SelectItem></SelectContent></Select></Field>
        <Field label="Severity" required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value }))}><SelectTrigger aria-label="Facility task severity"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></Field>
        <Field label="Current occupancy" hint="Optional percentage from the operator"><Input type="number" min="0" max="100" step="1" dir="ltr" value={form.occupancy} onChange={(event) => setForm((current) => ({ ...current, occupancy: event.target.value }))} placeholder="72" /></Field>
        <Field label="Title" className="sm:col-span-2" required><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Restock bathroom supplies" required /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="What needs attention?" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || zones.length === 0}><ClipboardCheck /> Create task</Button></div>
      </form>
    </FormPanel>
  );
}

function EquipmentAssetForm({ currency, zones, branchId, pending, onCancel, onSubmit }: { currency: string; zones: Array<{ id: string; name: string }>; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentAssetInput) => void }) {
  const [form, setForm] = useState({ code: "", name: "", manufacturer: "", model: "", zoneId: "", purchaseDate: "", purchaseCost: "", usefulLife: "" });
  return (
    <FormPanel title="Register equipment" description="Give every machine a durable code for issue history and fix-vs-replace decisions." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; onSubmit({ branchId, code: form.code, name: form.name, manufacturer: form.manufacturer || undefined, model: form.model || undefined, zoneId: form.zoneId || undefined, purchaseDate: form.purchaseDate || undefined, purchaseCost: minorValue(form.purchaseCost, currency), expectedUsefulLifeMonths: form.usefulLife ? Number(form.usefulLife) : undefined }); }}>
        <Field label="Asset code" required><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="TREAD-02" required /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Commercial treadmill" required /></Field>
        <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))} /></Field>
        <Field label="Model"><Input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} /></Field>
        <Field label="Zone"><Select value={form.zoneId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Equipment zone"><SelectValue placeholder="No zone" /></SelectTrigger><SelectContent><SelectItem value="none">No zone</SelectItem>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Purchase date"><Input type="date" dir="ltr" value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></Field>
        <Field label={`Purchase cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.purchaseCost} onChange={(event) => setForm((current) => ({ ...current, purchaseCost: event.target.value }))} /></Field>
        <Field label="Useful life" hint="Months"><Input type="number" min="1" step="1" dir="ltr" value={form.usefulLife} onChange={(event) => setForm((current) => ({ ...current, usefulLife: event.target.value }))} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId}><Cog /> Register asset</Button></div>
      </form>
    </FormPanel>
  );
}

function IssueForm({ assets, branchId, pending, onCancel, onSubmit }: { assets: EquipmentAsset[]; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: { branchId: string; assetId: string; title: string; description?: string; severity: "low" | "medium" | "high" | "critical"; downtimeDays?: number; safetyStatus: "unknown" | "safe_to_operate" | "out_of_service" }) => void }) {
  const [form, setForm] = useState({ assetId: assets[0]?.id ?? "", title: "", description: "", severity: "medium", downtime: "", safety: "unknown" });
  return (
    <FormPanel title="Report equipment issue" description="Safety status is visible to every operator and feeds the recommendation record." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; onSubmit({ branchId, assetId: form.assetId, title: form.title, description: form.description || undefined, severity: form.severity as "low", downtimeDays: form.downtime ? Number(form.downtime) : undefined, safetyStatus: form.safety as "unknown" }); }}>
        <Field label="Asset" required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value }))}><SelectTrigger aria-label="Issue asset"><SelectValue placeholder="Choose asset" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Severity" required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value }))}><SelectTrigger aria-label="Issue severity"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></Field>
        <Field label="Safety status" required><Select value={form.safety} onValueChange={(value) => setForm((current) => ({ ...current, safety: value }))}><SelectTrigger aria-label="Equipment safety status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Unknown</SelectItem><SelectItem value="safe_to_operate">Safe to operate</SelectItem><SelectItem value="out_of_service">Out of service</SelectItem></SelectContent></Select></Field>
        <Field label="Downtime" hint="Days"><Input type="number" min="0" step="1" dir="ltr" value={form.downtime} onChange={(event) => setForm((current) => ({ ...current, downtime: event.target.value }))} /></Field>
        <Field label="Issue title" className="sm:col-span-2" required><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Belt slipping under load" required /></Field>
        <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0}><ShieldAlert /> Report issue</Button></div>
      </form>
    </FormPanel>
  );
}

function WorkOrderForm({ currency, assets, issues, branchId, pending, onCancel, onSubmit }: { currency: string; assets: EquipmentAsset[]; issues: EquipmentIssue[]; branchId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentWorkOrderInput) => void }) {
  const [form, setForm] = useState({ assetId: assets[0]?.id ?? "", issueId: "", description: "", vendorName: "", partsCost: "", laborCost: "", replacementEstimate: "" });
  const assetIssues = issues.filter((issue) => issue.assetId === form.assetId && issue.status !== "resolved");
  return (
    <FormPanel title="Open work order" description="Record repair and replacement estimates so the system can compare them against issue history." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!branchId) return; onSubmit({ branchId, assetId: form.assetId, issueId: form.issueId || undefined, description: form.description, vendorName: form.vendorName || undefined, partsCost: minorValue(form.partsCost, currency), laborCost: minorValue(form.laborCost, currency), replacementEstimate: minorValue(form.replacementEstimate, currency), status: "draft" }); }}>
        <Field label="Asset" required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value, issueId: "" }))}><SelectTrigger aria-label="Work order asset"><SelectValue placeholder="Choose asset" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Related issue"><Select value={form.issueId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, issueId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Related equipment issue"><SelectValue placeholder="No linked issue" /></SelectTrigger><SelectContent><SelectItem value="none">No linked issue</SelectItem>{assetIssues.map((issue) => <SelectItem key={issue.id} value={issue.id}>{issue.title}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Description" className="sm:col-span-2" required><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Inspect belt and motor" required /></Field>
        <Field label="Vendor"><Input value={form.vendorName} onChange={(event) => setForm((current) => ({ ...current, vendorName: event.target.value }))} placeholder="Service partner" /></Field>
        <Field label={`Replacement estimate (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.replacementEstimate} onChange={(event) => setForm((current) => ({ ...current, replacementEstimate: event.target.value }))} /></Field>
        <Field label={`Parts cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.partsCost} onChange={(event) => setForm((current) => ({ ...current, partsCost: event.target.value }))} /></Field>
        <Field label={`Labor cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.laborCost} onChange={(event) => setForm((current) => ({ ...current, laborCost: event.target.value }))} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0}><Wrench /> Open work order</Button></div>
      </form>
    </FormPanel>
  );
}

function LoadingGrid() {
  return <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}

function InventoryTab({ branchId, branchLabel, branches, currency, writeEnabled, products, suppliers, inventory, alerts, orders, movements, loading, error, onRetry, mutations }: { branchId?: string; branchLabel: string; branches: Array<{ id: string; name: string }>; currency: string; writeEnabled: boolean; products: Product[]; suppliers: Supplier[]; inventory: InventoryBalance[]; alerts: LowStockAlert[]; orders: PurchaseOrder[]; movements: import("@/lib/domain/types").StockMovement[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const [productForm, setProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [supplierForm, setSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier>();
  const [movementForm, setMovementForm] = useState(false);
  const [orderForm, setOrderForm] = useState(false);
  const [alertReasons, setAlertReasons] = useState<Record<string, string>>({});
  const [archiveTarget, setArchiveTarget] = useState<{ type: "product" | "supplier"; id: string; label: string }>();
  const productName = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  if (loading) return <LoadingGrid />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription="Your role can’t read daily operations for this workspace." />;
  return (
    <div className="space-y-4" data-testid="operations-inventory">
      <div className="grid gap-3 sm:grid-cols-3">
        <section className="panel p-4"><Stat label="Stock items" value={products.length} context={`${branchLabel} scope`} /></section>
        <section className={cn("panel p-4", alerts.length > 0 && "border-warning/50 bg-warning-bg/20")}><Stat label="Low-stock alerts" value={alerts.length} tone={alerts.length > 0 ? "warning" : "default"} context={alerts.length > 0 ? "Review before the next supplier run" : "No open alerts"} /></section>
        <section className="panel p-4"><Stat label="Purchase orders" value={orders.length} context="Drafts and open receipts" /></section>
      </div>

      {!writeEnabled ? <ReadOnlyNotice /> : null}
      {productForm ? <ProductForm key={editingProduct?.id ?? "new-product"} currency={currency} suppliers={suppliers} product={editingProduct} pending={mutations.product.isPending} onCancel={() => { setProductForm(false); setEditingProduct(undefined); }} onSubmit={(input) => mutations.product.mutate(input, { onSuccess: () => { setProductForm(false); setEditingProduct(undefined); } })} /> : null}
      {supplierForm ? <SupplierForm key={editingSupplier?.id ?? "new-supplier"} defaultBranchId={branchId} branches={branches} supplier={editingSupplier} pending={mutations.supplier.isPending} onCancel={() => { setSupplierForm(false); setEditingSupplier(undefined); }} onSubmit={(input) => mutations.supplier.mutate(input, { onSuccess: () => { setSupplierForm(false); setEditingSupplier(undefined); } })} /> : null}
      {movementForm ? <MovementForm currency={currency} products={products} branchId={branchId} pending={mutations.movement.isPending} onCancel={() => setMovementForm(false)} onSubmit={(input) => mutations.movement.mutate(input, { onSuccess: () => setMovementForm(false) })} /> : null}
      {orderForm ? <PurchaseOrderForm currency={currency} products={products} suppliers={suppliers} branchId={branchId} pending={mutations.purchaseOrder.isPending} onCancel={() => setOrderForm(false)} onSubmit={(input) => mutations.purchaseOrder.mutate(input, { onSuccess: () => setOrderForm(false) })} /> : null}
      <ArchiveDialog label={archiveTarget?.type === "product" ? "stock item" : "supplier"} open={Boolean(archiveTarget)} pending={mutations.archiveProduct.isPending || mutations.archiveSupplier.isPending} onOpenChange={(open) => { if (!open) setArchiveTarget(undefined); }} onConfirm={(reason) => { if (!archiveTarget) return; const onSuccess = () => setArchiveTarget(undefined); if (archiveTarget.type === "product") mutations.archiveProduct.mutate({ id: archiveTarget.id, reason }, { onSuccess }); else mutations.archiveSupplier.mutate({ id: archiveTarget.id, reason }, { onSuccess }); }} />

      <section className="panel overflow-hidden">
        <SectionHeader icon={AlertTriangle} title="Low-stock queue" description="Projected availability includes supplier lead time." actions={<div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => mutations.refreshAlerts.mutate({ branchId })} loading={mutations.refreshAlerts.isPending}><RefreshCw /> Refresh</Button>{writeEnabled ? <Button size="sm" onClick={() => setOrderForm(true)} disabled={!branchId || products.length === 0 || suppliers.length === 0}><ShoppingCart /> New PO</Button> : null}</div>} />
        {alerts.length === 0 ? <EmptyState compact title="No open low-stock alerts" description="Refresh after recording movement or changing reorder points." className="m-4" /> : <div className="divide-y divide-line">{alerts.map((alert) => <div key={alert.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium text-ink">{productName.get(alert.productId) ?? alert.productId}</p><p className="mt-1 text-[12px] text-ink-3">Available <span className="font-mono" dir="ltr">{alert.availableQuantity}</span> · reorder at <span className="font-mono" dir="ltr">{alert.reorderPoint}</span> · projected at lead time <span className="font-mono" dir="ltr">{alert.projectedQuantityAtLeadTime.toFixed(1)}</span></p></div>{writeEnabled ? <div className="flex w-full gap-2 sm:w-auto"><Input aria-label={`Reason for dismissing ${productName.get(alert.productId) ?? "alert"}`} value={alertReasons[alert.id] ?? ""} onChange={(event) => setAlertReasons((current) => ({ ...current, [alert.id]: event.target.value }))} placeholder="Reason to dismiss" className="min-w-0 sm:w-44" /><Button size="sm" variant="secondary" disabled={!alertReasons[alert.id]?.trim()} loading={mutations.dismissAlert.isPending} onClick={() => mutations.dismissAlert.mutate({ alertId: alert.id, reason: alertReasons[alert.id]!.trim(), branchId })}>Dismiss</Button></div> : null}</div>)}</div>}
      </section>

      <section className="panel overflow-hidden"><SectionHeader icon={Boxes} title="Inventory balances" description="On-hand, committed, and available stock by branch." actions={writeEnabled ? <Button size="sm" variant="secondary" onClick={() => setMovementForm(true)} disabled={!branchId || products.length === 0}><PackagePlus /> Record movement</Button> : null} /><div className="overflow-x-auto"><table className="w-full text-start"><thead className="border-b border-line bg-sunken/40 text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2.5 font-medium">Item</th><th className="px-4 py-2.5 text-end font-medium">On hand</th><th className="px-4 py-2.5 text-end font-medium">Committed</th><th className="px-4 py-2.5 text-end font-medium">Available</th><th className="px-4 py-2.5 font-medium">Updated</th></tr></thead><tbody className="divide-y divide-line">{inventory.length === 0 ? <tr><td colSpan={5}><EmptyState compact title="No inventory balances" description="Record a receive or adjustment to start tracking stock." className="m-4" /></td></tr> : inventory.map((row) => <tr key={row.id} className="text-[12.5px]"><td className="px-4 py-3"><span className="font-medium">{productName.get(row.productId) ?? row.productId}</span><span className="block text-[11px] text-ink-3">{row.branchId}</span></td><td className="px-4 py-3 text-end font-mono" dir="ltr">{row.quantityOnHand}</td><td className="px-4 py-3 text-end font-mono" dir="ltr">{row.committedQuantity}</td><td className={cn("px-4 py-3 text-end font-mono", row.availableQuantity <= 0 ? "text-danger" : "text-ink")} dir="ltr">{row.availableQuantity}</td><td className="px-4 py-3 text-ink-3"><DateTimeText iso={row.updatedAt} /></td></tr>)}</tbody></table></div></section>

      <section className="panel overflow-hidden"><SectionHeader icon={RefreshCw} title="Recent stock movements" description="Immutable movement history for this branch scope." />{movements.length === 0 ? <EmptyState compact title="No stock movements recorded" description="Receiving, sales, consumption, and adjustments will appear here." className="m-4" /> : <div className="divide-y divide-line">{movements.slice(0, 12).map((movement) => <div key={movement.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[12px]"><span className={cn("flex size-7 items-center justify-center rounded-md font-mono", movement.quantityDelta >= 0 ? "bg-success-bg text-success-deep" : "bg-danger-bg text-danger")} aria-label={movement.quantityDelta >= 0 ? "Stock increase" : "Stock decrease"}>{movement.quantityDelta >= 0 ? "+" : "−"}</span><div className="min-w-0 flex-1"><p className="font-medium">{productName.get(movement.productId) ?? movement.productId} · {movement.type.replaceAll("_", " ")}</p><p className="mt-0.5 text-[11px] text-ink-3">{movement.reason ?? "No reason recorded"} · {movement.branchId}</p></div><span className="font-mono tabular" dir="ltr">{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span><DateTimeText iso={movement.occurredAt} /></div>)}</div>}</section>

      <div className="grid gap-4 lg:grid-cols-2"><section className="panel overflow-hidden"><SectionHeader icon={Store} title="Suppliers" description="Contacts and branch coverage." actions={writeEnabled ? <Button size="sm" onClick={() => { setEditingSupplier(undefined); setSupplierForm(true); }}><Plus /> Add supplier</Button> : null} />{suppliers.length === 0 ? <EmptyState compact title="No suppliers" description="Add the suppliers you use for stock replenishment." className="m-4" /> : <div className="divide-y divide-line">{suppliers.map((supplier) => <div key={supplier.id} className="flex items-center gap-3 p-4"><div className="flex size-8 items-center justify-center rounded-md bg-sunken"><Store className="size-4 text-ink-2" aria-hidden /></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{supplier.name}</p><p className="mt-0.5 truncate text-[11.5px] text-ink-3">{supplier.contactName ?? "No contact"} · {supplier.email ?? supplier.phone ?? "No contact channel"}</p><div className="mt-1 flex flex-wrap gap-1">{supplier.branchIds.map((id) => <Badge key={id} variant="neutral">{branches.find((branch) => branch.id === id)?.name ?? id}</Badge>)}</div></div><StatusBadge status={supplier.status} />{writeEnabled ? <div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${supplier.name}`} onClick={() => { setEditingSupplier(supplier); setSupplierForm(true); }}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={`Archive ${supplier.name}`} onClick={() => setArchiveTarget({ type: "supplier", id: supplier.id, label: supplier.name })}><Archive /></Button></div> : null}</div>)}</div>}</section><section className="panel overflow-hidden"><SectionHeader icon={ShoppingCart} title="Purchase orders" description="Approval and receiving change inventory commitments." />{orders.length === 0 ? <EmptyState compact title="No purchase orders" description="Create a draft when a stock alert needs replenishment." className="m-4" /> : <div className="divide-y divide-line">{orders.map((order) => <PurchaseOrderRow key={order.id} order={order} writeEnabled={writeEnabled} currency={currency} mutations={mutations} />)}</div>}</section></div>

      <section className="panel overflow-hidden"><SectionHeader icon={PackagePlus} title="Stock catalog" description="Archive items when they are no longer sold; historical movements remain available." actions={writeEnabled ? <Button size="sm" onClick={() => { setEditingProduct(undefined); setProductForm(true); }}><Plus /> Add stock item</Button> : null} />{products.length === 0 ? <EmptyState compact title="No active stock items" description="Add a product to start tracking inventory." className="m-4" /> : <div className="divide-y divide-line">{products.map((product) => <div key={product.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{product.name}</p><p className="mt-0.5 text-[11.5px] text-ink-3">{product.sku} · reorder at {product.reorderPoint} · target {product.targetLevel} · {product.supplierLeadTimeDays}d lead time</p></div>{product.preferredSupplierId ? <Badge variant="neutral">{suppliers.find((supplier) => supplier.id === product.preferredSupplierId)?.name ?? "Preferred supplier"}</Badge> : null}<StatusBadge status={product.status} />{writeEnabled ? <div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${product.name}`} onClick={() => { setEditingProduct(product); setProductForm(true); }}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={`Archive ${product.name}`} onClick={() => setArchiveTarget({ type: "product", id: product.id, label: product.name })}><Archive /></Button></div> : null}</div>)}</div>}</section>
    </div>
  );
}

function PurchaseOrderRow({ order, writeEnabled, currency, mutations }: { order: PurchaseOrder; writeEnabled: boolean; currency: string; mutations: OperationsMutations }) {
  const [reason, setReason] = useState("");
  const [notifyResult, setNotifyResult] = useState<string>();
  return <div className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-medium">{order.supplierName}</p><p className="mt-0.5 text-[11.5px] text-ink-3">{order.lines.map((line) => `${line.productName} × ${line.orderedQuantity}`).join(", ")}</p></div><div className="text-end"><StatusBadge status={order.status} /><p className="mt-1"><MoneyText money={order.total} /></p></div></div>{writeEnabled ? <div className="flex flex-wrap items-center gap-2"><Input aria-label={`Reason for approving ${order.supplierName}`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approval / notification reason" className="max-w-xs" />{order.status === "draft" ? <Button size="xs" onClick={() => mutations.approveOrder.mutate({ id: order.id, reason: reason.trim() || undefined })} loading={mutations.approveOrder.isPending}><Check /> Approve</Button> : null}{["approved", "partially_received"].includes(order.status) ? <Button size="xs" variant="secondary" onClick={() => mutations.receiveOrder.mutate({ purchaseOrderId: order.id, idempotencyKey: newKey("receive") })} loading={mutations.receiveOrder.isPending}><PackagePlus /> Receive</Button> : null}<Button size="xs" variant="secondary" disabled={!reason.trim()} onClick={() => mutations.notifySupplier.mutate({ purchaseOrderId: order.id, reason: reason.trim(), onResult: setNotifyResult })} loading={mutations.notifySupplier.isPending}><Send /> Notify supplier</Button></div> : null}{notifyResult ? <p className="text-[11.5px] text-warning-deep" role="status">{notifyResult}</p> : null}<p className="text-[11px] text-ink-3">Created <DateText iso={order.createdAt} /> · {currency}</p></div>;
}

function FacilitiesTab({ branchId, writeEnabled, zones, tasks, loading, error, onRetry, mutations }: { branchId?: string; writeEnabled: boolean; zones: Array<{ id: string; name: string }>; tasks: FacilityTask[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const [taskForm, setTaskForm] = useState(false);
  if (loading) return <LoadingGrid />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} />;
  const openTasks = tasks.filter((task) => !["completed", "cancelled"].includes(task.status));
  const updateTask = (task: FacilityTask, status: FacilityTask["status"]) => mutations.facility.mutate({ id: task.id, branchId: task.branchId, zoneId: task.zoneId, kind: task.kind, severity: task.severity, status, title: task.title, notes: task.notes, trafficContext: task.trafficContext, suppliesCost: task.suppliesCost });
  return <div className="space-y-4" data-testid="operations-facilities"><div className="grid gap-3 sm:grid-cols-3"><section className="panel p-4"><Stat label="Open tasks" value={openTasks.length} tone={openTasks.length > 0 ? "warning" : "default"} context="Cleaning, inspection, incident" /></section><section className="panel p-4"><Stat label="High priority" value={openTasks.filter((task) => ["high", "critical"].includes(task.severity)).length} tone="danger" context="Needs manager attention" /></section><section className="panel p-4"><Stat label="Zones linked" value={new Set(tasks.map((task) => task.zoneId)).size} context="Tasks with physical location" /></section></div>{!writeEnabled ? <ReadOnlyNotice /> : null}{taskForm ? <FacilityTaskForm zones={zones} branchId={branchId} pending={mutations.facility.isPending} onCancel={() => setTaskForm(false)} onSubmit={(input) => mutations.facility.mutate(input, { onSuccess: () => setTaskForm(false) })} /> : null}<section className="panel overflow-hidden"><SectionHeader icon={ClipboardCheck} title="Facility queue" description="Move each task from open to in progress, blocked, or completed." actions={writeEnabled ? <Button size="sm" onClick={() => setTaskForm(true)} disabled={!branchId || zones.length === 0}><Plus /> Request task</Button> : null} />{zones.length === 0 ? <EmptyState title="Add a zone before assigning tasks" description="Facility records need a real branch zone. Configure zones in Settings first." className="m-4" /> : tasks.length === 0 ? <EmptyState title="No facility tasks" description="Create a cleaning, inspection, or incident task when the floor needs attention." className="m-4" /> : <div className="divide-y divide-line">{tasks.map((task) => <div key={task.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 gap-3"><span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", task.severity === "critical" ? "bg-danger-bg text-danger" : "bg-sunken text-ink-2")}><ClipboardCheck className="size-4" aria-hidden /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-[13px] font-medium">{task.title}</p><StatusBadge status={task.status} /><Badge variant={statusVariant(task.severity)}>{task.severity}</Badge></div><p className="mt-1 text-[11.5px] text-ink-3">{task.zoneName} · {task.kind}{task.trafficContext?.occupancyPercent !== undefined ? ` · ${task.trafficContext.occupancyPercent}% occupied when reported` : ""}</p>{task.notes ? <p className="mt-1 text-[12px] text-ink-2">{task.notes}</p> : null}<p className="mt-1 text-[11px] text-ink-3">Updated <DateTimeText iso={task.updatedAt} />{task.suppliesCost ? <span> · supplies <MoneyText money={task.suppliesCost} /></span> : null}</p></div></div>{writeEnabled && !["completed", "cancelled"].includes(task.status) ? <div className="flex flex-wrap justify-end gap-2">{task.status === "open" || task.status === "blocked" ? <Button size="xs" variant="secondary" onClick={() => updateTask(task, "in_progress")} loading={mutations.facility.isPending}><RefreshCw /> {task.status === "blocked" ? "Resume" : "Start"}</Button> : null}{task.status === "open" || task.status === "in_progress" || task.status === "blocked" ? <Button size="xs" onClick={() => updateTask(task, "completed")} loading={mutations.facility.isPending}><CheckCircle2 /> Complete</Button> : null}</div> : null}</div>)}</div>}</section></div>;
}

function EquipmentTab({ branchId, currency, writeEnabled, zones, assets, issues, workOrders, loading, error, onRetry, mutations }: { branchId?: string; currency: string; writeEnabled: boolean; zones: Array<{ id: string; name: string }>; assets: EquipmentAsset[]; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const [assetForm, setAssetForm] = useState(false);
  const [issueForm, setIssueForm] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const actionAssets = assets.filter((asset) => !branchId || asset.branchId === branchId);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const recommendationQuery = useApiQuery(qk.operations({ kind: "equipment-recommendation", assetId: selectedAsset?.id }), (api) => api.getEquipmentRecommendation(selectedAsset!.id), { enabled: Boolean(selectedAsset?.id) });
  if (loading) return <LoadingGrid />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} />;
  const updateAssetStatus = (asset: EquipmentAsset, status: EquipmentAsset["status"]) => mutations.asset.mutate({ id: asset.id, branchId: asset.branchId, zoneId: asset.zoneId, code: asset.code, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, serialNumber: asset.serialNumber, purchaseDate: asset.purchaseDate, installationDate: asset.installationDate, purchaseCost: asset.purchaseCost, warrantyEndDate: asset.warrantyEndDate, status, expectedServiceIntervalDays: asset.expectedServiceIntervalDays, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths });
  const updateWorkOrder = (order: EquipmentWorkOrder, status: EquipmentWorkOrder["status"]) => mutations.workOrder.mutate({ id: order.id, branchId: order.branchId, assetId: order.assetId, issueId: order.issueId, status, description: order.description, assigneeId: order.assigneeId, vendorName: order.vendorName, partsCost: order.partsCost, laborCost: order.laborCost, replacementEstimate: order.replacementEstimate });
  return <div className="space-y-4" data-testid="operations-equipment"><div className="grid gap-3 sm:grid-cols-3"><section className="panel p-4"><Stat label="Equipment assets" value={assets.length} context="Coded branch inventory" /></section><section className="panel p-4"><Stat label="Open issues" value={issues.filter((issue) => !["resolved", "cancelled"].includes(issue.status)).length} tone="warning" context="Safety and downtime queue" /></section><section className="panel p-4"><Stat label="Work orders" value={workOrders.filter((order) => !["completed", "cancelled"].includes(order.status)).length} context="Repair and replacement work" /></section></div>{!writeEnabled ? <ReadOnlyNotice /> : null}{assetForm ? <EquipmentAssetForm currency={currency} zones={zones} branchId={branchId} pending={mutations.asset.isPending} onCancel={() => setAssetForm(false)} onSubmit={(input) => mutations.asset.mutate(input, { onSuccess: () => setAssetForm(false) })} /> : null}{issueForm ? <IssueForm assets={actionAssets} branchId={branchId} pending={mutations.issue.isPending} onCancel={() => setIssueForm(false)} onSubmit={(input) => mutations.issue.mutate(input, { onSuccess: () => setIssueForm(false) })} /> : null}{workOrderForm ? <WorkOrderForm currency={currency} assets={actionAssets} issues={issues} branchId={branchId} pending={mutations.workOrder.isPending} onCancel={() => setWorkOrderForm(false)} onSubmit={(input) => mutations.workOrder.mutate(input, { onSuccess: () => setWorkOrderForm(false) })} /> : null}<section className="panel overflow-hidden"><SectionHeader icon={Cog} title="Machine register" description="Select an asset to inspect its recorded fix-vs-replace evidence." actions={<div className="flex gap-2">{writeEnabled ? <><Button size="sm" variant="secondary" onClick={() => setIssueForm(true)} disabled={!branchId || actionAssets.length === 0}><ShieldAlert /> Report issue</Button><Button size="sm" onClick={() => setAssetForm(true)} disabled={!branchId}><Plus /> Register asset</Button></> : null}</div>} />{assets.length === 0 ? <EmptyState title="No equipment registered" description="Register a machine with a durable code before reporting issues." className="m-4" /> : <div className="grid gap-0 divide-y divide-line lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:divide-x lg:divide-y-0"> <div className="divide-y divide-line">{assets.map((asset) => <div key={asset.id} className={cn("flex items-center gap-3 p-4", selectedAsset?.id === asset.id && "bg-sunken")}><button type="button" onClick={() => setSelectedAssetId(asset.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start transition-colors hover:bg-sunken/50" aria-pressed={selectedAsset?.id === asset.id}><span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface"><Wrench className="size-4 text-ink-2" aria-hidden /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-medium">{asset.code}</span><StatusBadge status={asset.status} /></span><span className="mt-1 block truncate text-[13px]">{asset.name}</span><span className="mt-0.5 block text-[11px] text-ink-3">{asset.manufacturer ?? "Unknown maker"}{asset.model ? ` · ${asset.model}` : ""} · {issues.filter((issue) => issue.assetId === asset.id).length} issues</span></span><ChevronRight className="size-4 shrink-0 text-ink-3 rtl:rotate-180" aria-hidden /></button>{writeEnabled && !["retired", "replaced"].includes(asset.status) ? <Button size="xs" variant="secondary" onClick={() => updateAssetStatus(asset, asset.status === "maintenance" ? "active" : "maintenance")} loading={mutations.asset.isPending}>{asset.status === "maintenance" ? "Mark active" : "Mark maintenance"}</Button> : null}</div>)}</div><RecommendationPanel asset={selectedAsset} recommendation={recommendationQuery.data} loading={recommendationQuery.isLoading} error={recommendationQuery.error} /></div>}</section><div className="grid gap-4 lg:grid-cols-2"><section className="panel overflow-hidden"><SectionHeader icon={ShieldAlert} title="Issue history" description="Resolve issues once the equipment is safe and the work is documented." />{issues.length === 0 ? <EmptyState compact title="No reported issues" description="A clean issue history is still recorded evidence." className="m-4" /> : <div className="divide-y divide-line">{issues.map((issue) => { const asset = assets.find((item) => item.id === issue.assetId); return <div key={issue.id} className="space-y-1.5 p-4"><div className="flex items-start justify-between gap-2"><p className="text-[13px] font-medium">{issue.title}</p><StatusBadge status={issue.safetyStatus} /></div><p className="text-[11.5px] text-ink-3">{asset?.code ?? issue.assetId} · {issue.severity} · {issue.downtimeDays ?? 0} downtime days</p><p className="text-[11px] text-ink-3"><DateTimeText iso={issue.reportedAt} /> · <StatusBadge status={issue.status} /></p>{writeEnabled && !["resolved", "cancelled"].includes(issue.status) ? <div className="flex flex-wrap gap-2 pt-1"><Button size="xs" variant="secondary" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: { status: issue.status === "open" ? "in_progress" : "resolved", safetyStatus: issue.status === "in_progress" ? "safe_to_operate" : issue.safetyStatus } })} loading={mutations.issueUpdate.isPending}>{issue.status === "open" ? "Start investigation" : "Resolve issue"}</Button></div> : null}</div>; })}</div>}</section><section className="panel overflow-hidden"><SectionHeader icon={Wrench} title="Work orders" description="Move each order through approval, work, and completion; costs remain management records until posted by finance." actions={writeEnabled ? <Button size="sm" onClick={() => setWorkOrderForm(true)} disabled={!branchId || actionAssets.length === 0}><Plus /> Open order</Button> : null} />{workOrders.length === 0 ? <EmptyState compact title="No work orders" description="Open one when a machine needs a repair quote or replacement estimate." className="m-4" /> : <div className="divide-y divide-line">{workOrders.map((order) => { const asset = assets.find((item) => item.id === order.assetId); return <div key={order.id} className="space-y-1.5 p-4"><div className="flex items-start justify-between gap-2"><p className="text-[13px] font-medium">{order.description}</p><StatusBadge status={order.status} /></div><p className="text-[11.5px] text-ink-3">{asset?.code ?? order.assetId}{order.vendorName ? ` · ${order.vendorName}` : ""}</p><p className="text-[11px] text-ink-3">Repair <MoneyText money={order.totalCost} /> · replace <MoneyText money={order.replacementEstimate} /> · finance <StatusBadge status={order.financialPostingStatus} /></p>{writeEnabled && !["completed", "cancelled"].includes(order.status) ? <div className="flex flex-wrap gap-2 pt-1">{order.status === "draft" ? <Button size="xs" onClick={() => updateWorkOrder(order, "approved")} loading={mutations.workOrder.isPending}><Check /> Approve</Button> : null}{["approved", "draft"].includes(order.status) ? <Button size="xs" variant="secondary" onClick={() => updateWorkOrder(order, "in_progress")} loading={mutations.workOrder.isPending}><Wrench /> Start work</Button> : null}{order.status === "in_progress" ? <Button size="xs" onClick={() => updateWorkOrder(order, "completed")} loading={mutations.workOrder.isPending}><CheckCircle2 /> Complete</Button> : null}</div> : null}</div>; })}</div>}</section></div></div>;
}

function RecommendationPanel({ asset, recommendation, loading, error }: { asset?: EquipmentAsset; recommendation?: EquipmentRecommendation; loading: boolean; error?: unknown }) {
  if (!asset) return <div className="flex min-h-48 items-center justify-center p-6 text-center text-[12.5px] text-ink-3">Select a machine to inspect its recommendation.</div>;
  if (loading) return <div className="space-y-3 p-5"><Skeleton className="h-5 w-32" /><Skeleton className="h-20 w-full" /><Skeleton className="h-4 w-48" /></div>;
  if (error) return <div className="p-5"><ErrorState title="Recommendation unavailable" description="The recorded evidence could not be loaded." /></div>;
  if (!recommendation) return null;
  const title = recommendation.decision === "fix" ? "Fix is supported" : recommendation.decision === "replace" ? "Replacement is supported" : "More evidence needed";
  const tone = recommendation.decision === "replace" ? "danger" : recommendation.decision === "fix" ? "success" : "warning";
  return <div className="space-y-4 p-5"><div><p className="eyebrow">Recorded recommendation</p><div className="mt-2 flex items-center gap-2"><Badge variant={tone} dot>{recommendation.decision.replaceAll("_", " ")}</Badge><span className="text-[13px] font-medium">{title}</span></div><p className="mt-2 text-[11.5px] text-ink-3">Confidence: {recommendation.confidence.replaceAll("_", " ")}. This is decision support, not an automatic purchase approval.</p></div><div className="grid grid-cols-2 gap-3"><div><p className="eyebrow">Issues</p><p className="mt-1 font-mono text-[18px]" dir="ltr">{recommendation.issueCount}</p></div><div><p className="eyebrow">Downtime</p><p className="mt-1 font-mono text-[18px]" dir="ltr">{recommendation.downtimeDays}d</p></div><div><p className="eyebrow">Repair total</p><p className="mt-1"><MoneyText money={recommendation.repairCost} /></p></div><div><p className="eyebrow">Replacement</p><p className="mt-1"><MoneyText money={recommendation.replacementEstimate} /></p></div></div><ul className="space-y-1.5 border-t border-line pt-3 text-[11.5px] text-ink-2">{recommendation.rationale.map((reason) => <li key={reason} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />{reason}</li>)}</ul></div>;
}

function SectionHeader({ icon: Icon, title, description, actions }: { icon: typeof Boxes; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5"><div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><Icon className="size-3.5 text-ink-2" aria-hidden /></span><div><h2 className="font-display text-[14px] font-semibold">{title}</h2>{description ? <p className="mt-0.5 text-[11.5px] text-ink-3">{description}</p> : null}</div></div>{actions}</div>;
}

function ReadOnlyNotice() {
  return <div className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] text-ink-2" role="status">You have read-only access to operations. Owners and managers can create, approve, receive, and complete records.</div>;
}

type OperationsMutations = {
  product: ReturnType<typeof useApiMutation<unknown, UpsertProductInput>>;
  archiveProduct: ReturnType<typeof useApiMutation<unknown, { id: string; reason: string }>>;
  supplier: ReturnType<typeof useApiMutation<unknown, UpsertSupplierInput>>;
  archiveSupplier: ReturnType<typeof useApiMutation<unknown, { id: string; reason: string }>>;
  movement: ReturnType<typeof useApiMutation<unknown, { branchId: string; productId: string; type: "receive" | "sale" | "consumption" | "adjustment" | "return" | "transfer_in" | "transfer_out" | "waste"; quantity: number; unitCost?: ReturnType<typeof money>; reason?: string; idempotencyKey: string }>>;
  purchaseOrder: ReturnType<typeof useApiMutation<unknown, { branchId: string; supplierId: string; lines: Array<{ productId: string; quantity: number; unitCost: ReturnType<typeof money> }>; notes?: string }>>;
  approveOrder: ReturnType<typeof useApiMutation<unknown, { id: string; reason?: string }>>;
  receiveOrder: ReturnType<typeof useApiMutation<unknown, { purchaseOrderId: string; idempotencyKey: string }>>;
  notifySupplier: ReturnType<typeof useApiMutation<unknown, { purchaseOrderId: string; reason: string; onResult: (message: string) => void }>>;
  refreshAlerts: ReturnType<typeof useApiMutation<unknown, { branchId?: string }>>;
  dismissAlert: ReturnType<typeof useApiMutation<unknown, { alertId: string; reason: string; branchId?: string }>>;
  facility: ReturnType<typeof useApiMutation<unknown, UpsertFacilityTaskInput>>;
  asset: ReturnType<typeof useApiMutation<unknown, UpsertEquipmentAssetInput>>;
  issue: ReturnType<typeof useApiMutation<unknown, { branchId: string; assetId: string; title: string; description?: string; severity: "low" | "medium" | "high" | "critical"; downtimeDays?: number; safetyStatus: "unknown" | "safe_to_operate" | "out_of_service" }>>;
  issueUpdate: ReturnType<typeof useApiMutation<unknown, { id: string; input: import("@/lib/domain/types").UpdateEquipmentIssueInput }>>;
  workOrder: ReturnType<typeof useApiMutation<unknown, UpsertEquipmentWorkOrderInput>>;
};

function useOperationsMutations(invalidate: ReturnType<typeof useInvalidate>): OperationsMutations {
  const options = { onSuccess: async () => { await invalidate([qk.operations()]); } };
  const product = useApiMutation((api, input: UpsertProductInput) => api.upsertProduct(input), { ...options, successMessage: "Stock item saved." });
  const archiveProduct = useApiMutation((api, input: { id: string; reason: string }) => api.archiveProduct(input.id, input.reason), { ...options, successMessage: "Stock item archived." });
  const supplier = useApiMutation((api, input: UpsertSupplierInput) => api.upsertSupplier(input), { ...options, successMessage: "Supplier saved." });
  const archiveSupplier = useApiMutation((api, input: { id: string; reason: string }) => api.archiveSupplier(input.id, input.reason), { ...options, successMessage: "Supplier archived." });
  const movement = useApiMutation((api, input: Parameters<typeof api.recordStockMovement>[0]) => api.recordStockMovement(input), { ...options, successMessage: "Stock movement recorded." });
  const purchaseOrder = useApiMutation((api, input: Parameters<typeof api.createPurchaseOrder>[0]) => api.createPurchaseOrder(input), { ...options, successMessage: "Purchase order draft created." });
  const approveOrder = useApiMutation((api, input: { id: string; reason?: string }) => api.approvePurchaseOrder(input.id, input.reason), { ...options, successMessage: "Purchase order approved." });
  const receiveOrder = useApiMutation((api, input: Parameters<typeof api.receivePurchaseOrder>[0]) => api.receivePurchaseOrder(input), { ...options, successMessage: "Purchase order received into stock." });
  const notifySupplier = useApiMutation((api, input: { purchaseOrderId: string; reason: string; onResult: (message: string) => void }) => api.notifyPurchaseOrderSupplier({ purchaseOrderId: input.purchaseOrderId, reason: input.reason }), { onSuccess: async (result, input) => { input.onResult(result.detail); await invalidate([qk.operations()]); }, successMessage: "Notification preview recorded." });
  const refreshAlerts = useApiMutation((api, input: { branchId?: string }) => api.refreshLowStockAlerts(input), { ...options, successMessage: "Low-stock queue refreshed." });
  const dismissAlert = useApiMutation((api, input: { alertId: string; reason: string; branchId?: string }) => api.dismissLowStockAlert({ alertId: input.alertId, reason: input.reason }), { ...options, successMessage: "Alert dismissed." });
  const facility = useApiMutation((api, input: UpsertFacilityTaskInput) => api.upsertFacilityTask(input), { ...options, successMessage: "Facility task saved." });
  const asset = useApiMutation((api, input: UpsertEquipmentAssetInput) => api.upsertEquipmentAsset(input), { ...options, successMessage: "Equipment asset saved." });
  const issue = useApiMutation((api, input: Parameters<typeof api.reportEquipmentIssue>[0]) => api.reportEquipmentIssue(input), { ...options, successMessage: "Equipment issue reported." });
  const issueUpdate = useApiMutation((api, input: { id: string; input: import("@/lib/domain/types").UpdateEquipmentIssueInput }) => api.updateEquipmentIssue(input.id, input.input), { ...options, successMessage: "Equipment issue updated." });
  const workOrder = useApiMutation((api, input: UpsertEquipmentWorkOrderInput) => api.upsertEquipmentWorkOrder(input), { ...options, successMessage: "Work order opened." });
  return { product, archiveProduct, supplier, archiveSupplier, movement, purchaseOrder, approveOrder, receiveOrder, notifySupplier, refreshAlerts, dismissAlert, facility, asset, issue, issueUpdate, workOrder } as OperationsMutations;
}

export function OperationsCommandCenter() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState<OperationsTab>("inventory");
  const branchId = session?.activeBranchId;
  const branchLabel = branchId ? session?.branches.find((branch) => branch.id === branchId)?.name ?? branchId : "All visible branches";
  const currency = session?.organization.currency ?? CURRENCY_FALLBACK;
  const writeEnabled = can("operations.manage");
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess());
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const operationsModule = workspace?.modules.find((entry) => entry.key === "operations");
  const ready = Boolean(operationsModule?.entitled && operationsModule.enabled);
  const productQuery = useApiQuery(qk.operations({ kind: "products" }), (api) => api.listProducts(), { enabled: ready });
  const supplierQuery = useApiQuery(qk.operations({ kind: "suppliers" }), (api) => api.listSuppliers(), { enabled: ready });
  const inventoryQuery = useApiQuery(qk.operations({ kind: "inventory", branchId }), (api) => api.listInventory({ branchId }), { enabled: ready });
  const movementQuery = useApiQuery(qk.operations({ kind: "movements", branchId }), (api) => api.listStockMovements({ branchId, page: 1, pageSize: 50 }), { enabled: ready });
  const alertQuery = useApiQuery(qk.operations({ kind: "alerts", branchId }), (api) => api.listLowStockAlerts({ branchId }), { enabled: ready });
  const ordersQuery = useApiQuery(qk.operations({ kind: "purchase-orders", branchId }), (api) => api.listPurchaseOrders({ branchId }), { enabled: ready });
  const actionBranchId = branchId ?? session?.branches[0]?.id;
  const zonesQuery = useApiQuery(qk.operations({ kind: "zones", branchId: actionBranchId }), (api) => api.listZones({ branchId: actionBranchId, includeArchived: false }), { enabled: ready });
  const facilityQuery = useApiQuery(qk.operations({ kind: "facility", branchId }), (api) => api.listFacilityTasks({ branchId }), { enabled: ready });
  const assetQuery = useApiQuery(qk.operations({ kind: "assets", branchId }), (api) => api.listEquipmentAssets({ branchId }), { enabled: ready });
  const issueQuery = useApiQuery(qk.operations({ kind: "issues", branchId }), (api) => api.listEquipmentIssues({ branchId }), { enabled: ready });
  const workOrderQuery = useApiQuery(qk.operations({ kind: "work-orders", branchId }), (api) => api.listEquipmentWorkOrders({ branchId }), { enabled: ready });
  const mutations = useOperationsMutations(invalidate);

  if (!can("members.read")) return <ForbiddenState description="Daily operations are limited to gym team members with operational read access." />;
  if (workspaceQuery.isLoading) return <div className="space-y-4"><PageHeader eyebrow="Operations" title="Daily operations" description="Inventory, facilities, and equipment in one branch-aware command center." /><LoadingGrid /></div>;
  if (workspaceQuery.isError || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => workspaceQuery.refetch()} />;
  if (!operationsModule?.entitled) return <StatePanel icon={Boxes} title="Operations is not included" description="The Growth workspace module adds inventory, facilities, equipment, and supplier workflows." className="mt-4" />;
  if (!operationsModule.enabled) return <StatePanel icon={Boxes} title="Operations is paused" description="An organization owner can enable the operations module from workspace settings." className="mt-4" />;
  const inventoryError = productQuery.error ?? supplierQuery.error ?? inventoryQuery.error ?? movementQuery.error ?? alertQuery.error ?? ordersQuery.error;
  const facilitiesError = zonesQuery.error ?? facilityQuery.error;
  const equipmentError = zonesQuery.error ?? assetQuery.error ?? issueQuery.error ?? workOrderQuery.error;
  const retryAll = () => { void Promise.all([productQuery.refetch(), supplierQuery.refetch(), inventoryQuery.refetch(), movementQuery.refetch(), alertQuery.refetch(), ordersQuery.refetch(), zonesQuery.refetch(), facilityQuery.refetch(), assetQuery.refetch(), issueQuery.refetch(), workOrderQuery.refetch()]); };
  const retryInventory = () => { void Promise.all([productQuery.refetch(), supplierQuery.refetch(), inventoryQuery.refetch(), movementQuery.refetch(), alertQuery.refetch(), ordersQuery.refetch()]); };
  const retryFacilities = () => { void Promise.all([zonesQuery.refetch(), facilityQuery.refetch()]); };
  const retryEquipment = () => { void Promise.all([zonesQuery.refetch(), assetQuery.refetch(), issueQuery.refetch(), workOrderQuery.refetch()]); };
  const inventoryLoading = [productQuery, supplierQuery, inventoryQuery, movementQuery, alertQuery, ordersQuery].some((query) => query.isLoading);
  const facilitiesLoading = [zonesQuery, facilityQuery].some((query) => query.isLoading);
  const equipmentLoading = [zonesQuery, assetQuery, issueQuery, workOrderQuery].some((query) => query.isLoading);
  const products = productQuery.data ?? [];
  const suppliers = supplierQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const movements = movementQuery.data?.items ?? [];
  const alerts = alertQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const zones = zonesQuery.data ?? [];
  const tasks = facilityQuery.data ?? [];
  const assets = assetQuery.data ?? [];
  const issues = issueQuery.data ?? [];
  const workOrders = workOrderQuery.data ?? [];
  return <div className="space-y-4" data-testid="operations-command-center"><PageHeader eyebrow="Operations" title="Daily operations" description={`Keep ${branchLabel.toLowerCase()} ready: stock, facilities, suppliers, and equipment decisions in one workspace.`} actions={<div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-2"><span className="size-1.5 rounded-full bg-success" aria-hidden />{branchLabel}</div>} />{inventoryError || facilitiesError || equipmentError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some operational panels could not refresh. Each panel has its own retry action. <button type="button" className="font-medium underline" onClick={retryAll}>Retry all</button></div> : null}<Tabs value={tab} onValueChange={(value) => setTab(value as OperationsTab)}><TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="inventory"><Boxes className="size-3.5" /> Inventory & suppliers</TabsTrigger><TabsTrigger value="facilities"><ClipboardCheck className="size-3.5" /> Facilities</TabsTrigger><TabsTrigger value="equipment"><Wrench className="size-3.5" /> Equipment</TabsTrigger></TabsList><TabsContent value="inventory"><InventoryTab branchId={actionBranchId} branchLabel={branchLabel} branches={session?.branches ?? []} currency={currency} writeEnabled={writeEnabled} products={products} suppliers={suppliers} inventory={inventory} alerts={alerts} orders={orders} movements={movements} loading={inventoryLoading} error={inventoryError} onRetry={retryInventory} mutations={mutations} /></TabsContent><TabsContent value="facilities"><FacilitiesTab branchId={actionBranchId} writeEnabled={writeEnabled} zones={zones} tasks={tasks} loading={facilitiesLoading} error={facilitiesError} onRetry={retryFacilities} mutations={mutations} /></TabsContent><TabsContent value="equipment"><EquipmentTab branchId={actionBranchId} currency={currency} writeEnabled={writeEnabled} zones={zones} assets={assets} issues={issues} workOrders={workOrders} loading={equipmentLoading} error={equipmentError} onRetry={retryEquipment} mutations={mutations} /></TabsContent></Tabs></div>;
}
