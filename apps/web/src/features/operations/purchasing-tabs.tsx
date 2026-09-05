"use client";

import { Archive, Check, PackagePlus, Pencil, Plus, ShoppingCart, Store, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CreatePurchaseOrderInput, Product, PurchaseOrder, PurchaseOrderSourceType, Supplier, UpsertSupplierInput } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { DateText, MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { DeleteDialog, FormPanel, LoadingGrid, ReadOnlyNotice, SectionHeader, StatusBadge, minorValue, newKey, type OperationsMutations } from "./operations-shared";

export function SupplierForm({ defaultBranchId, branches, supplier, pending, onCancel, onSubmit }: { defaultBranchId?: string; branches: Array<{ id: string; name: string }>; supplier?: Supplier; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertSupplierInput) => void }) {
  const [form, setForm] = useState(() => ({ name: supplier?.name ?? "", contactName: supplier?.contactName ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "", terms: supplier?.terms ?? "", branchIds: supplier?.branchIds ?? (defaultBranchId ? [defaultBranchId] : []) }));
  const editing = Boolean(supplier);
  return (
    <FormPanel title={editing ? "Edit supplier" : "Add supplier"} description="Keep supplier contacts and branch coverage in one place." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit({ id: supplier?.id, name: form.name, contactName: form.contactName || undefined, email: form.email || undefined, phone: form.phone || undefined, terms: form.terms || undefined, branchIds: form.branchIds }); }}>
        <Field label="Supplier name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required placeholder="Jordan Sports Supply" /></Field>
        <Field label="Contact name"><Input value={form.contactName} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} placeholder="Maya Haddad" /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="orders@example.com" /></Field>
        <Field label="Phone"><Input type="tel" dir="ltr" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+962 …" /></Field>
        <Field label="Terms"><Input value={form.terms} onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))} placeholder="Net 15" /></Field>
        <div className="sm:col-span-2"><p className="mb-1.5 text-[13px] font-medium text-ink-2">Branches</p><div className="flex flex-wrap gap-2">{branches.map((branch) => <label key={branch.id} className="inline-flex items-center gap-2 rounded-md border border-line-2 px-2.5 py-2 text-[12px]"><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(event) => setForm((current) => ({ ...current, branchIds: event.target.checked ? [...current.branchIds, branch.id] : current.branchIds.filter((id) => id !== branch.id) }))} />{branch.name}</label>)}</div></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="submit" loading={pending}><Store /> {editing ? "Save changes" : "Save supplier"}</Button></div>
      </form>
    </FormPanel>
  );
}

export function PurchaseOrderForm({ currency, products, suppliers, branchId, defaultProductId, pending, onCancel, onSubmit }: { currency: string; products: Product[]; suppliers: Supplier[]; branchId?: string; defaultProductId?: string; pending: boolean; onCancel: () => void; onSubmit: (input: CreatePurchaseOrderInput) => void }) {
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

export function PurchaseOrderRow({ order, writeEnabled, currency, mutations }: { order: PurchaseOrder; writeEnabled: boolean; currency: string; mutations: OperationsMutations }) {
  const [reason, setReason] = useState("");
  const sourceLabel = order.sourceType === "private" ? "Private source" : order.supplierName;
  return <div className="space-y-2 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[13px] font-medium">{sourceLabel}</p><p className="mt-0.5 text-[12px] text-ink-3">{order.lines.map((line) => line.productName + " × " + line.orderedQuantity).join(", ")}</p></div><div className="text-end"><StatusBadge status={order.status} /><p className="mt-1"><MoneyText money={order.total} /></p></div></div>{writeEnabled && ["draft", "approved", "partially_received"].includes(order.status) ? <div className="flex flex-wrap items-center gap-2">{order.status === "draft" ? <Input aria-label={"Reason for approving " + sourceLabel} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approval reason (optional)" className="max-w-xs" /> : null}{order.status === "draft" ? <Button size="xs" onClick={() => mutations.approveOrder.mutate({ id: order.id, reason: reason.trim() || undefined })} loading={mutations.approveOrder.isPending}><Check /> Approve</Button> : null}{["approved", "partially_received"].includes(order.status) ? <Button size="xs" variant="secondary" onClick={() => mutations.receiveOrder.mutate({ purchaseOrderId: order.id, idempotencyKey: newKey("receive") })} loading={mutations.receiveOrder.isPending}><PackagePlus /> Receive</Button> : null}</div> : null}<p className="text-[12px] text-ink-3">Created <DateText iso={order.createdAt} /> · {currency}</p></div>;
}

const ORDER_FILTERS = [
  { value: "open", label: "Open" },
  { value: "received", label: "Received" },
  { value: "all", label: "All" },
] as const;
type OrderFilter = (typeof ORDER_FILTERS)[number]["value"];

export function PurchaseOrdersTab({ branchId, currency, writeEnabled, products, suppliers, orders, loading, error, onRetry, mutations, highlightOrderId }: { branchId?: string; currency: string; writeEnabled: boolean; products: Product[]; suppliers: Supplier[]; orders: PurchaseOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations; highlightOrderId?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [filter, setFilter] = useState<OrderFilter>(() => ORDER_FILTERS.find((entry) => entry.value === params.get("orders"))?.value ?? (highlightOrderId && orders.some((order) => order.id === highlightOrderId && ["received", "cancelled"].includes(order.status)) ? "all" : "open"));
  const [orderForm, setOrderForm] = useState(false);
  useEffect(() => {
    if (highlightOrderId && orders.some((order) => order.id === highlightOrderId && ["received", "cancelled"].includes(order.status))) setFilter("all");
  }, [highlightOrderId, orders]);
  const visible = useMemo(() => orders.filter((order) => filter === "all" || (filter === "open" ? ["draft", "approved", "partially_received"].includes(order.status) : ["received", "cancelled"].includes(order.status))), [filter, orders]);
  if (loading) return <LoadingGrid />;
  if (error && orders.length === 0) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription="Your role can’t read purchase orders for this workspace." />;
  return (
    <div className="space-y-4" data-testid="operations-orders">
      {!writeEnabled ? <ReadOnlyNotice /> : null}
      <section className="panel overflow-hidden">
        <SectionHeader icon={ShoppingCart} title="Purchase orders" description="Approve a draft to reserve stock, then receive it when it arrives. A received supplier order becomes a payable." actions={<div className="flex flex-wrap items-center gap-2"><div className="flex rounded-md border border-line-2 bg-sunken/50 p-0.5" role="group" aria-label="Order status">{ORDER_FILTERS.map((entry) => <button key={entry.value} type="button" aria-pressed={filter === entry.value} className={cn("rounded px-2.5 py-1.5 text-[12px] transition-colors", filter === entry.value ? "bg-surface font-medium text-ink" : "text-ink-3 hover:text-ink")} onClick={() => { setFilter(entry.value); const next = new URLSearchParams(params.toString()); next.set("orders", entry.value); router.replace(`/operations?${next}`, { scroll: false }); }}>{entry.label}</button>)}</div><Button asChild size="sm" variant="secondary"><Link href={branchId ? `/operations?tab=payables&branch=${encodeURIComponent(branchId)}` : "/operations?tab=payables"}><WalletCards /> Payables</Link></Button>{writeEnabled ? <Button size="sm" onClick={() => setOrderForm(true)} disabled={!branchId}><Plus /> New purchase order</Button> : null}</div>} />
        {!branchId && writeEnabled ? <div className="border-b border-line bg-warning-bg/40 px-4 py-2.5 text-[12px] text-warning-deep" role="status">Select a branch above to create or receive purchase orders.</div> : null}
        {visible.length === 0 ? <EmptyState compact title={filter === "open" ? "No open purchase orders" : "No purchase orders"} description={filter === "open" ? "Create a draft when stock needs replenishing. Received orders move to the Received list." : "Orders for this branch will appear here."} className="m-4" /> : <div className="divide-y divide-line">{visible.map((order) => <div key={order.id} className={cn(highlightOrderId === order.id && "bg-sunken/40")} data-testid="purchase-order-row" data-highlighted={highlightOrderId === order.id ? "true" : undefined}><PurchaseOrderRow order={order} writeEnabled={writeEnabled} currency={currency} mutations={mutations} /></div>)}</div>}
      </section>
      {orderForm ? <PurchaseOrderForm currency={currency} products={products} suppliers={suppliers} branchId={branchId} pending={mutations.purchaseOrder.isPending} onCancel={() => setOrderForm(false)} onSubmit={(input) => mutations.purchaseOrder.mutate(input, { onSuccess: () => setOrderForm(false) })} /> : null}
    </div>
  );
}

export function SuppliersTab({ branchId, branches, writeEnabled, suppliers, loading, error, onRetry, mutations }: { branchId?: string; branches: Array<{ id: string; name: string }>; writeEnabled: boolean; suppliers: Supplier[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const [supplierForm, setSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier>();
  const [archiveTarget, setArchiveTarget] = useState<Supplier>();
  const closeSupplierForm = () => { setSupplierForm(false); setEditingSupplier(undefined); };
  if (loading) return <LoadingGrid />;
  if (error && suppliers.length === 0) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription="Your role can’t read suppliers for this workspace." />;
  return (
    <div className="space-y-4" data-testid="operations-suppliers">
      {!writeEnabled ? <ReadOnlyNotice /> : null}
      <section className="panel overflow-hidden">
        <SectionHeader icon={Store} title="Suppliers" description="The people you buy stock from. Each supplier’s open balance lives in Payables." actions={writeEnabled ? <Button size="sm" onClick={() => { setEditingSupplier(undefined); setSupplierForm(true); }}><Plus /> Add supplier</Button> : null} />
        {suppliers.length === 0 ? <EmptyState compact title="No suppliers" description="Add the suppliers you use for stock replenishment." className="m-4" /> : (
          <div className="divide-y divide-line">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="flex flex-wrap items-center gap-3 p-4" data-testid="supplier-row">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken"><Store className="size-4 text-ink-2" aria-hidden /></div>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13.5px] font-medium">{supplier.name}</p>
                  <p className="mt-0.5 break-words text-[12px] text-ink-3">{supplier.contactName ?? "No contact"} · {supplier.email ?? supplier.phone ?? "No contact channel"}{supplier.terms ? ` · ${supplier.terms}` : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{supplier.branchIds.map((id) => <Badge key={id} variant="neutral">{branches.find((branch) => branch.id === id)?.name ?? id}</Badge>)}</div>
                </div>
                <StatusBadge status={supplier.status} />
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild size="xs" variant="secondary"><Link href={`/operations/payables?supplier=${encodeURIComponent(supplier.id)}`}><WalletCards /> Payables</Link></Button>
                  {writeEnabled ? <><Button size="icon" variant="ghost" aria-label={"Edit " + supplier.name} onClick={() => { setEditingSupplier(supplier); setSupplierForm(true); }}><Pencil /></Button>{supplier.status === "active" ? <Button size="icon" variant="ghost" aria-label={"Archive " + supplier.name} onClick={() => setArchiveTarget(supplier)}><Archive /></Button> : null}</> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {supplierForm ? <SupplierForm key={editingSupplier?.id ?? "new-supplier"} defaultBranchId={branchId} branches={branches} supplier={editingSupplier} pending={mutations.supplier.isPending} onCancel={closeSupplierForm} onSubmit={(input) => mutations.supplier.mutate(input, { onSuccess: closeSupplierForm })} /> : null}
      <DeleteDialog kind="supplier" label={archiveTarget?.name ?? "supplier"} open={Boolean(archiveTarget)} pending={mutations.archiveSupplier.isPending} onOpenChange={(open) => { if (!open) setArchiveTarget(undefined); }} onConfirm={(reason) => { if (!archiveTarget) return; mutations.archiveSupplier.mutate({ id: archiveTarget.id, reason }, { onSuccess: () => setArchiveTarget(undefined) }); }} />
    </div>
  );
}
