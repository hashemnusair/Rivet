"use client";

import {
  AlertTriangle,
  Archive,
  Boxes,
  Check,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShoppingCart,
  Store,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  InventoryBalance,
  LowStockAlert,
  DeleteProductInput,
  Product,
  PurchaseOrder,
  Supplier,
  UpsertProductInput,
  UpsertSupplierInput,
  WorkspaceAccess,
} from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { fromMajor, money, toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { DateText, MoneyText } from "@/components/shared/data-display";
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
import { RetailCheckout } from "./retail-checkout";

type OperationsTab = "inventory" | "checkout";

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

function ProductForm({ currency, suppliers, product, pending, onCancel, onSubmit, onRequestDelete }: { currency: string; suppliers: Supplier[]; product?: Product; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertProductInput) => void; onRequestDelete?: () => void }) {
  const [form, setForm] = useState(() => ({ sku: product?.sku ?? "", name: product?.name ?? "", unit: product?.unit ?? "each", reorderPoint: product ? String(product.reorderPoint) : "", targetLevel: product ? String(product.targetLevel) : "", leadTime: product ? String(product.supplierLeadTimeDays) : "", supplierId: product?.preferredSupplierId ?? "", cost: product?.defaultUnitCost ? String(toMajor(product.defaultUnitCost)) : "", retailPrice: product?.retailPrice ? String(toMajor(product.retailPrice)) : "" }));
  const editing = Boolean(product);
  return (
    <FormPanel title={editing ? "Edit stock item" : "Add stock item"} description="Set the safety floor, refill target, delivery time, and selling price for this item." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ id: product?.id, sku: form.sku, name: form.name, unit: form.unit as UpsertProductInput["unit"], reorderPoint: Number(form.reorderPoint), targetLevel: Number(form.targetLevel), supplierLeadTimeDays: Number(form.leadTime), preferredSupplierId: form.supplierId || undefined, defaultUnitCost: minorValue(form.cost, currency), retailPrice: minorValue(form.retailPrice, currency) }); }}>
        <Field label="SKU" required><Input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} placeholder="SUP-CREATINE" required /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Creatine" required /></Field>
        <Field label="Unit" required><Select value={form.unit} onValueChange={(value) => setForm((current) => ({ ...current, unit: value as UpsertProductInput["unit"] }))}><SelectTrigger aria-label="Product unit"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="each">Each</SelectItem><SelectItem value="kg">Kilogram</SelectItem><SelectItem value="liter">Liter</SelectItem><SelectItem value="box">Box</SelectItem><SelectItem value="serving">Serving</SelectItem></SelectContent></Select></Field>
        <Field label="Preferred supplier"><Select value={form.supplierId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, supplierId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Preferred supplier"><SelectValue placeholder="No preference" /></SelectTrigger><SelectContent><SelectItem value="none">No preference</SelectItem>{suppliers.filter((supplier) => supplier.status === "active").map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Alert me at" hint="Available units; the safety floor" required><Input type="number" min="0" step="1" value={form.reorderPoint} onChange={(event) => setForm((current) => ({ ...current, reorderPoint: event.target.value }))} required /></Field>
        <Field label="Refill to" hint="Desired stock after delivery" required><Input type="number" min="0" step="1" value={form.targetLevel} onChange={(event) => setForm((current) => ({ ...current, targetLevel: event.target.value }))} required /></Field>
        <Field label="Delivery time" hint="Days from ordering until stock arrives; enables projection warnings" required><Input type="number" min="0" step="1" value={form.leadTime} onChange={(event) => setForm((current) => ({ ...current, leadTime: event.target.value }))} required /></Field>
        <Field label={"Supplier unit cost (" + currency + ")"} hint="Your purchase cost; separate from the selling price"><Input type="number" min="0" step="0.001" dir="ltr" value={form.cost} onChange={(event) => setForm((current) => ({ ...current, cost: event.target.value }))} placeholder="0.000" /></Field>
        <Field label={"Selling price (" + currency + ")"} hint="Charged at checkout; leave blank if this is not sold to members"><Input type="number" min="0" step="0.001" dir="ltr" value={form.retailPrice} onChange={(event) => setForm((current) => ({ ...current, retailPrice: event.target.value }))} placeholder="0.000" /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">{editing && onRequestDelete ? <Button type="button" variant="danger" onClick={onRequestDelete} disabled={pending}><Trash2 /> Delete item permanently</Button> : <span /> }<Button type="submit" loading={pending}><PackagePlus /> {editing ? "Save changes" : "Save item"}</Button></div>
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
        <Field label="Default delivery time" hint="Optional supplier reference; each product can override it"><Input type="number" min="0" step="1" value={form.leadTime} onChange={(event) => setForm((current) => ({ ...current, leadTime: event.target.value }))} /></Field>
        <div className="sm:col-span-2"><p className="mb-1.5 text-[13px] font-medium text-ink-2">Branches</p><div className="flex flex-wrap gap-2">{branches.map((branch) => <label key={branch.id} className="inline-flex items-center gap-2 rounded-md border border-line-2 px-2.5 py-2 text-[12px]"><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(event) => setForm((current) => ({ ...current, branchIds: event.target.checked ? [...current.branchIds, branch.id] : current.branchIds.filter((id) => id !== branch.id) }))} />{branch.name}</label>)}</div></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit" loading={pending}><Store /> {editing ? "Save changes" : "Save supplier"}</Button></div>
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
        <Field label={"Unit cost (" + currency + ")"} required><Input type="number" min="0" step="0.001" dir="ltr" value={form.unitCost} onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))} required /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Delivery instructions or internal context" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId}><ShoppingCart /> Save draft</Button></div>
      </form>
    </FormPanel>
  );
}

function SectionHeader({ icon: Icon, title, description, actions }: { icon: typeof Boxes; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5"><div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><Icon className="size-3.5 text-ink-2" aria-hidden /></span><div><h2 className="font-display text-[14px] font-semibold">{title}</h2>{description ? <p className="mt-0.5 text-[11.5px] text-ink-3">{description}</p> : null}</div></div>{actions}</div>;
}

function ReadOnlyNotice() {
  return <div className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] text-ink-2" role="status">You have read-only access to inventory. Managers can add items, suppliers, and purchase orders.</div>;
}

type OperationsMutations = {
  product: ReturnType<typeof useApiMutation<unknown, UpsertProductInput>>;
  deleteProduct: ReturnType<typeof useApiMutation<unknown, DeleteProductInput>>;
  supplier: ReturnType<typeof useApiMutation<unknown, UpsertSupplierInput>>;
  archiveSupplier: ReturnType<typeof useApiMutation<unknown, { id: string; reason: string }>>;
  purchaseOrder: ReturnType<typeof useApiMutation<unknown, { branchId: string; supplierId: string; lines: Array<{ productId: string; quantity: number; unitCost: ReturnType<typeof money> }>; notes?: string }>>;
  approveOrder: ReturnType<typeof useApiMutation<unknown, { id: string; reason?: string }>>;
  receiveOrder: ReturnType<typeof useApiMutation<unknown, { purchaseOrderId: string; idempotencyKey: string }>>;
  notifySupplier: ReturnType<typeof useApiMutation<unknown, { purchaseOrderId: string; reason: string; onResult: (message: string) => void }>>;
  refreshAlerts: ReturnType<typeof useApiMutation<unknown, { branchId?: string }>>;
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
  const notifySupplier = useApiMutation((api, input: { purchaseOrderId: string; reason: string; onResult: (message: string) => void }) => api.notifyPurchaseOrderSupplier({ purchaseOrderId: input.purchaseOrderId, reason: input.reason }), { onSuccess: async (result, input) => { input.onResult(result.detail); await invalidate([qk.operations()]); }, successMessage: "Notification preview recorded." });
  const refreshAlerts = useApiMutation((api, input: { branchId?: string }) => api.refreshLowStockAlerts(input), { ...options, successMessage: "Low-stock alerts refreshed." });
  return { product, deleteProduct, supplier, archiveSupplier, purchaseOrder, approveOrder, receiveOrder, notifySupplier, refreshAlerts } as OperationsMutations;
}

function PurchaseOrderRow({ order, writeEnabled, currency, mutations }: { order: PurchaseOrder; writeEnabled: boolean; currency: string; mutations: OperationsMutations }) {
  const [reason, setReason] = useState("");
  const [notifyResult, setNotifyResult] = useState<string>();
  return <div className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-medium">{order.supplierName}</p><p className="mt-0.5 text-[11.5px] text-ink-3">{order.lines.map((line) => line.productName + " × " + line.orderedQuantity).join(", ")}</p></div><div className="text-end"><StatusBadge status={order.status} /><p className="mt-1"><MoneyText money={order.total} /></p></div></div>{writeEnabled ? <div className="flex flex-wrap items-center gap-2"><Input aria-label={"Reason for approving " + order.supplierName} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approval / notification reason" className="max-w-xs" />{order.status === "draft" ? <Button size="xs" onClick={() => mutations.approveOrder.mutate({ id: order.id, reason: reason.trim() || undefined })} loading={mutations.approveOrder.isPending}><Check /> Approve</Button> : null}{["approved", "partially_received"].includes(order.status) ? <Button size="xs" variant="secondary" onClick={() => mutations.receiveOrder.mutate({ purchaseOrderId: order.id, idempotencyKey: newKey("receive") })} loading={mutations.receiveOrder.isPending}><PackagePlus /> Receive</Button> : null}<Button size="xs" variant="secondary" disabled={!reason.trim()} onClick={() => mutations.notifySupplier.mutate({ purchaseOrderId: order.id, reason: reason.trim(), onResult: setNotifyResult })} loading={mutations.notifySupplier.isPending}><Send /> Notify supplier</Button></div> : null}{notifyResult ? <p className="text-[11.5px] text-warning-deep" role="status">{notifyResult}</p> : null}<p className="text-[11px] text-ink-3">Created <DateText iso={order.createdAt} /> · {currency}</p></div>;
}

function SupplierManagementDialog({ open, onOpenChange, suppliers, branches, writeEnabled, onAdd, onEdit, onArchive }: { open: boolean; onOpenChange: (open: boolean) => void; suppliers: Supplier[]; branches: Array<{ id: string; name: string }>; writeEnabled: boolean; onAdd: () => void; onEdit: (supplier: Supplier) => void; onArchive: (supplier: Supplier) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Suppliers</DialogTitle><DialogDescription>Manage the contacts used when you replenish stock.</DialogDescription></DialogHeader><DialogBody className="max-h-[60vh] overflow-y-auto p-0">{suppliers.length === 0 ? <EmptyState compact title="No suppliers" description="Add the suppliers you use for stock replenishment." className="m-4" /> : <div className="divide-y divide-line">{suppliers.map((supplier) => <div key={supplier.id} className="flex items-center gap-3 p-4"><div className="flex size-8 items-center justify-center rounded-md bg-sunken"><Store className="size-4 text-ink-2" aria-hidden /></div><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{supplier.name}</p><p className="mt-0.5 truncate text-[11.5px] text-ink-3">{supplier.contactName ?? "No contact"} · {supplier.email ?? supplier.phone ?? "No contact channel"}</p><div className="mt-1 flex flex-wrap gap-1">{supplier.branchIds.map((id) => <Badge key={id} variant="neutral">{branches.find((branch) => branch.id === id)?.name ?? id}</Badge>)}</div></div><StatusBadge status={supplier.status} />{writeEnabled ? <div className="flex shrink-0 gap-1"><Button size="icon" variant="ghost" aria-label={"Edit " + supplier.name} onClick={() => onEdit(supplier)}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={"Archive " + supplier.name} onClick={() => onArchive(supplier)}><Archive /></Button></div> : null}</div>)}</div>}</DialogBody><DialogFooter>{writeEnabled ? <Button onClick={onAdd}><Plus /> Add supplier</Button> : null}<Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function PurchaseOrderListDialog({ open, onOpenChange, orders, writeEnabled, currency, mutations, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; orders: PurchaseOrder[]; writeEnabled: boolean; currency: string; mutations: OperationsMutations; onCreate: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Purchase orders</DialogTitle><DialogDescription>Approve an order to reserve stock, then receive it when the delivery arrives.</DialogDescription></DialogHeader><DialogBody className="max-h-[60vh] overflow-y-auto p-0">{orders.length === 0 ? <EmptyState compact title="No purchase orders" description="Create a draft when a stock alert needs replenishment." className="m-4" /> : <div className="divide-y divide-line">{orders.map((order) => <PurchaseOrderRow key={order.id} order={order} writeEnabled={writeEnabled} currency={currency} mutations={mutations} />)}</div>}</DialogBody><DialogFooter>{writeEnabled ? <Button onClick={onCreate}><Plus /> New purchase order</Button> : null}<Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function InventoryTab({ branchId, branchLabel, branches, currency, writeEnabled, products, suppliers, inventory, alerts, orders, loading, error, onRetry, mutations }: { branchId?: string; branchLabel: string; branches: Array<{ id: string; name: string }>; currency: string; writeEnabled: boolean; products: Product[]; suppliers: Supplier[]; inventory: InventoryBalance[]; alerts: LowStockAlert[]; orders: PurchaseOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const [productForm, setProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [supplierForm, setSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier>();
  const [orderForm, setOrderForm] = useState(false);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [ordersDialog, setOrdersDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "product" | "supplier"; id: string; label: string }>();
  const productName = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const alertProductIds = useMemo(() => new Set(alerts.map((alert) => alert.productId)), [alerts]);
  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, InventoryBalance>();
    inventory.forEach((row) => {
      if (!branchId || row.branchId === branchId) map.set(row.productId, row);
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
        <SectionHeader icon={Boxes} title="Inventory" description={"Simple stock view for " + branchLabel.toLowerCase() + ". Available is what can be sold right now."} actions={<div className="flex flex-wrap gap-2">{writeEnabled ? <><Button size="sm" onClick={() => { setEditingProduct(undefined); setProductForm(true); }}><Plus /> Add item</Button><Button size="sm" variant="secondary" onClick={() => setSupplierDialog(true)}><Store /> Suppliers</Button><Button size="sm" variant="secondary" onClick={() => setOrdersDialog(true)} disabled={!branchId}><ShoppingCart /> Purchase orders</Button></> : null}</div>} />
        {!writeEnabled ? <div className="p-4"><ReadOnlyNotice /></div> : null}
        <div className="overflow-x-auto"><table className="w-full text-start"><caption className="sr-only">Available inventory</caption><thead className="border-b border-line bg-sunken/40 text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2.5 font-medium">Item</th><th className="px-4 py-2.5 text-end font-medium">Available</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 text-end font-medium">Actions</th></tr></thead><tbody className="divide-y divide-line">{products.length === 0 ? <tr><td colSpan={4}><EmptyState compact title="No stock items yet" description="Add an item to start tracking what is available." className="m-4" /></td></tr> : products.map((product) => { const row = inventoryByProduct.get(product.id); const available = row?.availableQuantity ?? 0; const low = available <= product.reorderPoint; const needsReplenishment = alertProductIds.has(product.id); return <tr key={product.id} className="text-[12.5px]"><td className="px-4 py-3"><span className="font-medium">{product.name}</span><span className="block text-[11px] text-ink-3">{product.sku} · {product.supplierLeadTimeDays}d delivery</span></td><td className={cn("px-4 py-3 text-end font-mono", needsReplenishment ? "text-warning-deep" : "text-ink")} dir="ltr">{available}</td><td className="px-4 py-3">{needsReplenishment ? <Badge variant="warning" dot>{low ? "Low stock" : "Replenish soon"}</Badge> : <Badge variant="success" dot>Available</Badge>}</td><td className="px-4 py-3 text-end"><div className="flex justify-end gap-1">{writeEnabled ? <><Button size="icon" variant="ghost" aria-label={"Edit " + product.name} onClick={() => { setEditingProduct(product); setProductForm(true); }}><Pencil /></Button><Button size="icon" variant="ghost" aria-label={"Delete " + product.name} onClick={() => setDeleteTarget({ type: "product", id: product.id, label: product.name })}><Trash2 /></Button></> : null}</div></td></tr>; })}</tbody></table></div>
      </section>

      <section className="panel overflow-hidden">
        <SectionHeader icon={AlertTriangle} title="Low-stock alerts" description="Items at or below their safety floor, or projected to fall below it before delivery arrives." actions={<Button size="sm" variant="secondary" onClick={() => mutations.refreshAlerts.mutate({ branchId })} loading={mutations.refreshAlerts.isPending}><RefreshCw /> Refresh alerts</Button>} />
        {alerts.length === 0 ? <EmptyState compact title="No low-stock alerts" description="Alerts refresh after stock changes and threshold updates." className="m-4" /> : <div className="divide-y divide-line">{alerts.map((alert) => <div key={alert.id} className="p-4"><p className="font-medium text-ink">{productName.get(alert.productId) ?? alert.productId}</p><p className="mt-1 text-[12px] text-ink-3">Available <span className="font-mono" dir="ltr">{alert.availableQuantity}</span> · alert at <span className="font-mono" dir="ltr">{alert.reorderPoint}</span> · projected at delivery <span className="font-mono" dir="ltr">{alert.projectedQuantityAtLeadTime.toFixed(1)}</span></p></div>)}</div>}
      </section>

      <SupplierManagementDialog open={supplierDialog} onOpenChange={setSupplierDialog} suppliers={suppliers} branches={branches} writeEnabled={writeEnabled} onAdd={() => { setSupplierDialog(false); setEditingSupplier(undefined); setSupplierForm(true); }} onEdit={(supplier) => { setSupplierDialog(false); setEditingSupplier(supplier); setSupplierForm(true); }} onArchive={(supplier) => { setSupplierDialog(false); setDeleteTarget({ type: "supplier", id: supplier.id, label: supplier.name }); }} />
      <PurchaseOrderListDialog open={ordersDialog} onOpenChange={setOrdersDialog} orders={orders} writeEnabled={writeEnabled} currency={currency} mutations={mutations} onCreate={() => { setOrdersDialog(false); setOrderForm(true); }} />

      {productForm ? <ProductForm key={editingProduct?.id ?? "new-product"} currency={currency} suppliers={suppliers} product={editingProduct} pending={mutations.product.isPending} onCancel={closeProductForm} onRequestDelete={editingProduct ? () => { const productToDelete = editingProduct; closeProductForm(); setDeleteTarget({ type: "product", id: productToDelete.id, label: productToDelete.name }); } : undefined} onSubmit={(input) => mutations.product.mutate(input, { onSuccess: closeProductForm })} /> : null}
      {supplierForm ? <SupplierForm key={editingSupplier?.id ?? "new-supplier"} defaultBranchId={branchId} branches={branches} supplier={editingSupplier} pending={mutations.supplier.isPending} onCancel={closeSupplierForm} onSubmit={(input) => mutations.supplier.mutate(input, { onSuccess: closeSupplierForm })} /> : null}
      {orderForm ? <PurchaseOrderForm currency={currency} products={products} suppliers={suppliers} branchId={branchId} pending={mutations.purchaseOrder.isPending} onCancel={() => setOrderForm(false)} onSubmit={(input) => mutations.purchaseOrder.mutate(input, { onSuccess: () => setOrderForm(false) })} /> : null}
      <DeleteDialog kind={deleteTarget?.type} label={deleteTarget?.label ?? "item"} open={Boolean(deleteTarget)} pending={mutations.deleteProduct.isPending || mutations.archiveSupplier.isPending} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onConfirm={(reason, confirmation) => { if (!deleteTarget) return; const onSuccess = () => setDeleteTarget(undefined); if (deleteTarget.type === "product") mutations.deleteProduct.mutate({ productId: deleteTarget.id, reason, confirmation: confirmation ?? "" }, { onSuccess }); else mutations.archiveSupplier.mutate({ id: deleteTarget.id, reason }, { onSuccess }); }} />
    </div>
  );
}

function LoadingGrid() {
  return <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}

export function OperationsCommandCenter() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState<OperationsTab>("inventory");
  const branchId = session?.activeBranchId ?? session?.branches[0]?.id;
  const branchLabel = branchId ? session?.branches.find((branch) => branch.id === branchId)?.name ?? branchId : "No branch selected";
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
  const mutations = useOperationsMutations(invalidate);

  if (!can("members.read")) return <ForbiddenState description="Daily operations are limited to gym team members with operational read access." />;
  if (workspaceQuery.isLoading) return <div className="space-y-4"><PageHeader eyebrow="Operations" title="Inventory and checkout" description="A simple place to see stock, sell items, and replenish what is running low." /><LoadingGrid /></div>;
  if (workspaceQuery.isError || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => workspaceQuery.refetch()} />;
  if (!operationsModule?.entitled) return <StatePanel icon={Boxes} title="Operations is not included" description="The Growth workspace module adds inventory checkout and supplier workflows." className="mt-4" />;
  if (!operationsModule.enabled) return <StatePanel icon={Boxes} title="Operations is paused" description="An organization owner can enable the operations module from workspace settings." className="mt-4" />;

  const inventoryError = productQuery.error ?? supplierQuery.error ?? inventoryQuery.error ?? alertQuery.error ?? ordersQuery.error;
  const retryInventory = () => { void Promise.all([productQuery.refetch(), supplierQuery.refetch(), inventoryQuery.refetch(), alertQuery.refetch(), ordersQuery.refetch()]); };
  const inventoryLoading = [productQuery, supplierQuery, inventoryQuery, alertQuery, ordersQuery].some((query) => query.isLoading);
  const products = productQuery.data ?? [];
  const suppliers = supplierQuery.data ?? [];
  const inventory = inventoryQuery.data ?? [];
  const alerts = alertQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  return <div className="space-y-4" data-testid="operations-command-center"><PageHeader eyebrow="Operations" title="Inventory and checkout" description={"See what is available at " + branchLabel.toLowerCase() + ", sell it, and replenish it when stock runs low."} actions={<div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-2"><span className="size-1.5 rounded-full bg-success" aria-hidden />{branchLabel}</div>} />{inventoryError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some inventory data could not refresh. <button type="button" className="font-medium underline" onClick={retryInventory}>Retry</button></div> : null}<Tabs value={tab} onValueChange={(value) => setTab(value as OperationsTab)}><TabsList aria-label="Operations workspace" className="inline-flex w-fit rounded-lg border border-line bg-surface p-1"><TabsTrigger value="inventory" className="gap-1.5 rounded-md px-3 py-1.5 text-[12px]"><Boxes className="size-3.5" /> Inventory</TabsTrigger>{canCheckout ? <TabsTrigger value="checkout" className="gap-1.5 rounded-md px-3 py-1.5 text-[12px]"><ShoppingCart className="size-3.5" /> Checkout</TabsTrigger> : null}</TabsList><TabsContent value="inventory"><InventoryTab branchId={branchId} branchLabel={branchLabel} branches={session?.branches ?? []} currency={currency} writeEnabled={writeEnabled} products={products} suppliers={suppliers} inventory={inventory} alerts={alerts} orders={orders} loading={inventoryLoading} error={inventoryError} onRetry={retryInventory} mutations={mutations} /></TabsContent>{canCheckout ? <TabsContent value="checkout"><RetailCheckout embedded /></TabsContent> : null}</Tabs></div>;
}
