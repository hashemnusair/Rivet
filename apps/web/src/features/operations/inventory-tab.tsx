"use client";

import { AlertTriangle, ArrowRightLeft, Boxes, PackagePlus, Pencil, Plus, Search as SearchIcon, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { InventoryBalance, InventoryTransferInput, LowStockAlert, Product, Supplier, UpsertProductInput } from "@/lib/domain/types";
import { toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { hasSellableRetailPrice } from "@/features/checkout/checkout-model";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteDialog, FormPanel, LoadingGrid, ReadOnlyNotice, SectionHeader, minorValue, newKey, type OperationsMutations } from "./operations-shared";
import { PurchaseOrderForm } from "./purchasing-tabs";

export function ProductForm({ currency, branchId, product, availableQuantity, pending, onCancel, onSubmit, onRequestDelete }: { currency: string; branchId?: string; product?: Product; availableQuantity?: number; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertProductInput) => void; onRequestDelete?: () => void }) {
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

export function TransferStockDialog({ open, onOpenChange, sourceBranchId, branches, products, inventory, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; sourceBranchId?: string; branches: Array<{ id: string; name: string; status?: string }>; products: Product[]; inventory: InventoryBalance[]; pending: boolean; onSubmit: (input: InventoryTransferInput) => void }) {
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

export function InventoryTab({ branchId, branchLabel, branches, currency, writeEnabled, products, suppliers, inventory, alerts, loading, error, onRetry, mutations, onSell }: { branchId?: string; branchLabel: string; branches: Array<{ id: string; name: string }>; currency: string; writeEnabled: boolean; products: Product[]; suppliers: Supplier[]; inventory: InventoryBalance[]; alerts: LowStockAlert[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations; onSell?: (productId: string) => void }) {
  const [productForm, setProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [orderForm, setOrderForm] = useState<{ defaultProductId?: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "product"; id: string; label: string }>();
  const productName = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const alertProductIds = useMemo(() => new Set(alerts.map((alert) => alert.productId)), [alerts]);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(term)) : products;
  }, [products, search]);
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
  return (
    <div className="space-y-4" data-testid="operations-inventory">
      <section className="panel overflow-hidden">
        <SectionHeader icon={Boxes} title="Inventory" description={branchId ? "Available is what staff can sell at " + branchLabel.toLowerCase() + "." : "Compare available stock across branches. Choose one branch above before editing or selling."} actions={<div className="flex flex-wrap items-center gap-2"><div className="relative"><SearchIcon className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items…" className="h-8 w-40 ps-8 sm:w-48" aria-label="Search stock items" /></div>{writeEnabled ? <><Button size="sm" onClick={() => { setEditingProduct(undefined); setProductForm(true); }} disabled={!branchId}><Plus /> Add item</Button><Button size="sm" variant="secondary" onClick={() => setTransferDialog(true)} disabled={!branchId}><ArrowRightLeft /> Move stock</Button></> : null}</div>} />
        {!writeEnabled ? <div className="p-4"><ReadOnlyNotice /></div> : null}
        {!branchId && writeEnabled ? <div className="border-b border-line bg-warning-bg/40 px-4 py-2.5 text-[12px] text-warning-deep" role="status">Select a branch above to add items, change quantities, or sell.</div> : null}
        <div className="overflow-x-auto"><table className="w-full text-start"><caption className="sr-only">Available inventory</caption><thead className="border-b border-line bg-sunken/40 text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2.5 font-medium">Item</th><th className="px-4 py-2.5 text-end font-medium">Available</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 text-end font-medium">Selling price</th><th className="px-4 py-2.5 text-end font-medium">Actions</th></tr></thead><tbody className="divide-y divide-line">{products.length === 0 ? <tr><td colSpan={5}><EmptyState compact title="No stock items yet" description="Add an item to start tracking what is available." className="m-4" /></td></tr> : visibleProducts.length === 0 ? <tr><td colSpan={5}><EmptyState compact title="No matching items" description="Try a different name or SKU." className="m-4" /></td></tr> : visibleProducts.map((product) => { const rows = inventoryByProduct.get(product.id) ?? []; const productAlerts = alerts.filter((alert) => alert.productId === product.id); const selectedRow = rows.find((row) => row.branchId === branchId); const available = selectedRow?.availableQuantity ?? 0; const totalAvailable = rows.reduce((sum, row) => sum + row.availableQuantity, 0); const low = selectedRow ? available <= product.reorderPoint : rows.some((row) => row.availableQuantity <= product.reorderPoint); const needsReplenishment = alertProductIds.has(product.id); const alertBranches = [...new Set(productAlerts.map((alert) => branches.find((branch) => branch.id === alert.branchId)?.name ?? alert.branchId))].join(", "); const sellable = Boolean(onSell && branchId && available > 0 && hasSellableRetailPrice(product, currency)); return <tr key={product.id} className="text-[12.5px]"><td className="px-4 py-3"><span className="font-medium">{product.name}</span><span className="block text-[11px] text-ink-3">{product.sku} · {product.unit}</span></td><td className={cn("px-4 py-3 text-end font-mono", needsReplenishment ? "text-warning-deep" : "text-ink")} dir="ltr">{branchId ? available : <><span>Total {totalAvailable}</span>{rows.length > 0 ? <span className="mt-1 block text-[10.5px] font-sans text-ink-3">{rows.map((row) => `${branches.find((branch) => branch.id === row.branchId)?.name ?? row.branchId}: ${row.availableQuantity}`).join(" · ")}</span> : null}</>}</td><td className="px-4 py-3">{needsReplenishment ? <Badge variant="warning" dot>{branchId ? (low ? "Low stock" : "Replenish soon") : `${low ? "Low stock" : "Replenish soon"} · ${alertBranches}`}</Badge> : <Badge variant="success" dot>Available</Badge>}</td><td className="px-4 py-3 text-end font-mono" dir="ltr">{product.retailPrice ? <MoneyText money={product.retailPrice} /> : <span className="text-ink-3">Not set</span>}</td><td className="px-4 py-3 text-end"><div className="flex items-center justify-end gap-1">{sellable ? <Button size="xs" variant="secondary" aria-label={"Sell " + product.name} onClick={() => onSell!(product.id)}><ShoppingBag /> Sell</Button> : null}{writeEnabled && branchId ? <Button size="xs" variant={needsReplenishment ? "primary" : "ghost"} aria-label={"Reorder " + product.name} onClick={() => setOrderForm({ defaultProductId: product.id })}><PackagePlus /> Reorder</Button> : null}{writeEnabled ? <Button size="icon" variant="ghost" aria-label={"Edit " + product.name} onClick={() => { setEditingProduct(product); setProductForm(true); }} disabled={!branchId}><Pencil /></Button> : null}</div></td></tr>; })}</tbody></table></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/30 px-4 py-2.5 text-[11.5px]" role="status"><AlertTriangle className={cn("size-3.5", alerts.length > 0 ? "text-warning-deep" : "text-ink-3")} aria-hidden />{alerts.length > 0 ? <span><strong>{alerts.length}</strong> low-stock {alerts.length === 1 ? "alert" : "alerts"}{branchId ? " at this branch" : " across visible branches"}.</span> : <span>No low-stock alerts for this scope.</span>}{alerts.length > 0 ? <span className="text-ink-3">{alerts.slice(0, 3).map((alert) => `${productName.get(alert.productId) ?? "Item"} · ${branches.find((branch) => branch.id === alert.branchId)?.name ?? alert.branchId} (${alert.availableQuantity})`).join(" · ")}{alerts.length > 3 ? " · …" : ""}</span> : null}</div>
      </section>

      <TransferStockDialog open={transferDialog} onOpenChange={setTransferDialog} sourceBranchId={branchId} branches={branches} products={products} inventory={inventory} pending={mutations.transfer.isPending} onSubmit={(input) => mutations.transfer.mutate(input, { onSuccess: () => setTransferDialog(false) })} />

      {productForm ? <ProductForm key={editingProduct?.id ?? "new-product"} currency={currency} branchId={branchId} product={editingProduct} availableQuantity={editingProduct ? inventoryByProduct.get(editingProduct.id)?.[0]?.availableQuantity : undefined} pending={mutations.product.isPending} onCancel={closeProductForm} onRequestDelete={editingProduct ? () => { const productToDelete = editingProduct; closeProductForm(); setDeleteTarget({ type: "product", id: productToDelete.id, label: productToDelete.name }); } : undefined} onSubmit={(input) => mutations.product.mutate(input, { onSuccess: closeProductForm })} /> : null}
      {orderForm ? <PurchaseOrderForm currency={currency} products={products} suppliers={suppliers} branchId={branchId} defaultProductId={orderForm.defaultProductId} pending={mutations.purchaseOrder.isPending} onCancel={() => setOrderForm(null)} onSubmit={(input) => mutations.purchaseOrder.mutate(input, { onSuccess: () => setOrderForm(null) })} /> : null}
      <DeleteDialog kind={deleteTarget?.type} label={deleteTarget?.label ?? "item"} open={Boolean(deleteTarget)} pending={mutations.deleteProduct.isPending} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onConfirm={(reason, confirmation) => { if (!deleteTarget) return; mutations.deleteProduct.mutate({ productId: deleteTarget.id, reason, confirmation: confirmation ?? "" }, { onSuccess: () => setDeleteTarget(undefined) }); }} />
    </div>
  );
}
