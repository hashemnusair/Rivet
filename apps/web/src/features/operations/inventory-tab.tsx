"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits, searchKey } from "@/lib/utils/text";

import { isApiError } from "@/lib/api/errors";

import { AlertTriangle, ArrowRightLeft, Boxes, PackagePlus, Pencil, Plus, Search as SearchIcon, ShoppingBag, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { InventoryBalance, InventoryTransferInput, LowStockAlert, Product, Supplier, UpsertProductInput } from "@/lib/domain/types";
import { toMajorString, money } from "@/lib/utils/money";
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
import { DeleteDialog, FormPanel, LoadingGrid, ReadOnlyNotice, SectionHeader, minorValue, useOperationsNumberProblems, newKey, type OperationsMutations } from "./operations-shared";
import { PurchaseOrderForm } from "./purchasing-tabs";

export function ProductForm({ currency, branchId, product, availableQuantity, pending, onCancel, onSubmit, onRequestDelete }: { currency: string; branchId?: string; product?: Product; availableQuantity?: number; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertProductInput) => void; onRequestDelete?: () => void }) {
  const t = useT();
  const validate = useOperationsNumberProblems();
  const [form, setForm] = useState(() => ({ sku: product?.sku ?? "", name: product?.name ?? "", unit: product?.unit ?? "each", availableQuantity: product ? String(availableQuantity ?? 0) : "0", reorderPoint: product ? String(product.reorderPoint) : "", retailPrice: product?.retailPrice ? toMajorString(product.retailPrice) : "" }));
  const problems = { availableQuantity: validate.integer(form.availableQuantity, 0), reorderPoint: validate.integer(form.reorderPoint, 0), retailPrice: validate.amount(form.retailPrice, currency) };
  const invalidNumbers = Object.values(problems).some(Boolean);
  const editing = Boolean(product);
  return (
    <FormPanel title={editing ? t("stockWorkspace.editItem") : t("stockWorkspace.addItemTitle")} description={t("stockWorkspace.itemHint")} onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (invalidNumbers || !form.availableQuantity.trim() || !form.reorderPoint.trim()) return; onSubmit({ id: product?.id, ...(branchId ? { branchId, availableQuantity: Number(latinDigits(form.availableQuantity)) } : {}), sku: form.sku, name: form.name, unit: form.unit as UpsertProductInput["unit"], reorderPoint: Number(latinDigits(form.reorderPoint)), retailPrice: minorValue(form.retailPrice, currency) }); }}>
        <Field label={t("stockWorkspace.sku")} required><Input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value.toUpperCase() }))} placeholder="SUP-CREATINE" required /></Field>
        <Field label={t("common.label.name")} required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("stockWorkspace.creatineExample")} required /></Field>
        <Field label={t("stockWorkspace.unit")} required><Select value={form.unit} onValueChange={(value) => setForm((current) => ({ ...current, unit: value as UpsertProductInput["unit"] }))}><SelectTrigger aria-label={t("stockWorkspace.unit")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="each">{t("stockWorkspace.each")}</SelectItem><SelectItem value="kg">{t("stockWorkspace.kg")}</SelectItem><SelectItem value="liter">{t("stockWorkspace.liter")}</SelectItem><SelectItem value="box">{t("stockWorkspace.box")}</SelectItem><SelectItem value="serving">{t("stockWorkspace.serving")}</SelectItem></SelectContent></Select></Field>
        <Field label={t("stockWorkspace.availableQuantity")} hint={t("stockWorkspace.availableHint")} required error={problems.availableQuantity}><Input dir="ltr" type="text" inputMode="numeric" aria-invalid={Boolean(problems.availableQuantity) || undefined} value={form.availableQuantity} onChange={(event) => setForm((current) => ({ ...current, availableQuantity: latinDigits(event.target.value) }))} required /></Field>
        <Field label={t("stockWorkspace.reorderPoint")} hint={t("stockWorkspace.reorderHint")} required error={problems.reorderPoint}><Input dir="ltr" type="text" inputMode="numeric" aria-invalid={Boolean(problems.reorderPoint) || undefined} value={form.reorderPoint} onChange={(event) => setForm((current) => ({ ...current, reorderPoint: latinDigits(event.target.value) }))} required /></Field>
        <Field label={t("stockWorkspace.sellingPriceCurrency", { currency })} hint={t("stockWorkspace.notForSaleHint")} error={problems.retailPrice}><Input type="text" inputMode="decimal" aria-invalid={Boolean(problems.retailPrice) || undefined} dir="ltr" value={form.retailPrice} onChange={(event) => setForm((current) => ({ ...current, retailPrice: event.target.value }))} placeholder={toMajorString(money(0, currency))} /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">{editing && onRequestDelete ? <Button type="button" variant="danger" onClick={onRequestDelete} disabled={pending}><Trash2 /> {" "}{t("stockWorkspace.deleteItem")}</Button> : <span /> }<Button type="submit" loading={pending} disabled={invalidNumbers}><PackagePlus /> {editing ? t("common.action.saveChanges") : t("stockWorkspace.saveItem")}</Button></div>
      </form>
    </FormPanel>
  );
}

export function TransferStockDialog({ open, onOpenChange, sourceBranchId, branches, products, inventory, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; sourceBranchId?: string; branches: Array<{ id: string; name: string; status?: string }>; products: Product[]; inventory: InventoryBalance[]; pending: boolean; onSubmit: (input: InventoryTransferInput) => void }) {
  const t = useT();
  const f = useFormat();
  const validate = useOperationsNumberProblems();
  const [productId, setProductId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const availableByProduct = useMemo(() => new Map(inventory.filter((row) => row.branchId === sourceBranchId).map((row) => [row.productId, row.availableQuantity])), [inventory, sourceBranchId]);
  const transferableProducts = useMemo(() => products.filter((product) => product.status === "active" && (availableByProduct.get(product.id) ?? 0) > 0), [availableByProduct, products]);
  const destinations = useMemo(() => branches.filter((branch) => branch.id !== sourceBranchId && branch.status !== "inactive"), [branches, sourceBranchId]);
  const selectedAvailable = productId ? availableByProduct.get(productId) ?? 0 : 0;
  const sourceBranchName = branches.find((branch) => branch.id === sourceBranchId)?.name ?? t("stockWorkspace.selectedBranch");

  useEffect(() => {
    if (!open) return;
    setProductId((current) => transferableProducts.some((product) => product.id === current) ? current : transferableProducts[0]?.id ?? "");
    setDestinationBranchId((current) => destinations.some((branch) => branch.id === current) ? current : destinations[0]?.id ?? "");
    setQuantity("1");
    setReason("");
  }, [destinations, open, sourceBranchId, transferableProducts]); // Reset only when the source branch or dialog changes.

  const parsedQuantity = Number(latinDigits(quantity));
  const quantityProblem = validate.integer(quantity, 1);
  const canSubmit = Boolean(sourceBranchId && productId && destinationBranchId && !quantityProblem && Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 && parsedQuantity <= selectedAvailable && reason.trim().length >= 3 && !pending);
  // A retry of the same unchanged transfer after a lost response replays the
  // original pair of movements; an edited draft or a reopened dialog is a new
  // request. Minting the key on each click would move the stock twice.
  const draftSignature = JSON.stringify({ open, sourceBranchId, destinationBranchId, productId, quantity: parsedQuantity, reason: reason.trim() });
  const idempotencyKey = useMemo(() => newKey("inventory-transfer"), [draftSignature]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("stockWorkspace.moveTitle")}</DialogTitle><DialogDescription>{t("stockWorkspace.moveHint")}</DialogDescription></DialogHeader><DialogBody><div className="mb-3 rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] text-ink-2"><span className="text-ink-3">{t("stockWorkspace.moveFrom")}</span> <strong>{sourceBranchName}</strong></div><form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (!canSubmit || !sourceBranchId) return; onSubmit({ sourceBranchId, destinationBranchId, productId, quantity: parsedQuantity, reason: reason.trim(), idempotencyKey }); }}>
    <Field label={t("stockWorkspace.item")} hint={transferableProducts.length > 0 ? t("stockWorkspace.availableItemsHint") : t("stockWorkspace.noStockToMove")} required><Select value={productId || "none"} onValueChange={(value) => setProductId(value === "none" ? "" : value)}><SelectTrigger aria-label={t("stockWorkspace.itemToMove")}><SelectValue placeholder={t("stockWorkspace.chooseItem")} /></SelectTrigger><SelectContent>{transferableProducts.length === 0 ? <SelectItem value="none" disabled>{t("stockWorkspace.noStockItems")}</SelectItem> : transferableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {t("stockWorkspace.availableCount", { count: f.number(availableByProduct.get(product.id) ?? 0) })}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t("stockWorkspace.moveTo")} required><Select value={destinationBranchId || "none"} onValueChange={(value) => setDestinationBranchId(value === "none" ? "" : value)}><SelectTrigger aria-label={t("stockWorkspace.moveTo")}><SelectValue placeholder={t("renewFlow.adjust.transfer.chooseBranch")} /></SelectTrigger><SelectContent>{destinations.length === 0 ? <SelectItem value="none" disabled>{t("stockWorkspace.noOtherBranch")}</SelectItem> : destinations.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
    <Field label={t("stockWorkspace.quantity")} error={quantityProblem} hint={productId ? t("stockWorkspace.moveMaximum", { count: f.number(selectedAvailable) }) : t("stockWorkspace.chooseItemFirst")} required><Input aria-label={t("stockWorkspace.quantityToMove")} type="text" inputMode="numeric" dir="ltr" aria-invalid={Boolean(quantityProblem) || undefined} value={quantity} onChange={(event) => setQuantity(latinDigits(event.target.value))} required /></Field>
    <Field label={t("common.label.reason")} required><Textarea aria-label={t("stockWorkspace.moveReason")} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("stockWorkspace.moveExample")} required /></Field>
    <DialogFooter className="px-0 pb-0"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>{t("common.action.cancel")}</Button><Button type="submit" loading={pending} disabled={!canSubmit}><ArrowRightLeft /> {" "}{t("stockWorkspace.moveStock")}</Button></DialogFooter>
  </form></DialogBody></DialogContent></Dialog>;
}

export function InventoryTab({ branchId, branchLabel, branches, currency, writeEnabled, products, suppliers, inventory, alerts, loading, error, onRetry, mutations, onSell }: { branchId?: string; branchLabel: string; branches: Array<{ id: string; name: string }>; currency: string; writeEnabled: boolean; products: Product[]; suppliers: Supplier[]; inventory: InventoryBalance[]; alerts: LowStockAlert[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations; onSell?: (productId: string) => void }) {
  const { t, locale, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const [productForm, setProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [orderForm, setOrderForm] = useState<{ defaultProductId?: string } | null>(null);
  const [transferDialog, setTransferDialog] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(() => params.get("stockSearch") ?? "");
  const [attentionOnly, setAttentionOnly] = useState(() => params.get("stock") === "attention");
  const updateView = (attention: boolean, term: string) => {
    const next = new URLSearchParams(params.toString());
    if (attention) next.set("stock", "attention"); else next.delete("stock");
    if (term) next.set("stockSearch", term); else next.delete("stockSearch");
    router.replace(`/operations?${next}`, { scroll: false });
  };
  const [deleteTarget, setDeleteTarget] = useState<{ type: "product"; id: string; label: string }>();
  const productName = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
  const alertProductIds = useMemo(() => new Set(alerts.map((alert) => alert.productId)), [alerts]);
  const visibleProducts = useMemo(() => {
    const term = searchKey(search.trim());
    return products.filter((product) => (!term || searchKey(`${product.name} ${product.sku}`).includes(term)) && (!attentionOnly || alertProductIds.has(product.id)))
      .sort((a, b) => Number(alertProductIds.has(b.id)) - Number(alertProductIds.has(a.id)));
  }, [products, search, attentionOnly, alertProductIds]);
  const inventoryByProduct = useMemo(() => {
    const map = new Map<string, InventoryBalance[]>();
    inventory.forEach((row) => {
      if (!branchId || row.branchId === branchId) map.set(row.productId, [...(map.get(row.productId) ?? []), row]);
    });
    return map;
  }, [branchId, inventory]);
  if (loading) return <LoadingGrid />;
  if (error && (products.length === 0 || (isApiError(error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.code)))) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription={t("stockWorkspace.noStockAccess")} />;
  const closeProductForm = () => { setProductForm(false); setEditingProduct(undefined); };
  return (
    <div className="space-y-4" data-testid="operations-inventory">
      <section className="panel overflow-hidden">
        <SectionHeader icon={Boxes} title={t("dashboard.today.kind.low_stock")} description={branchId ? t("stockWorkspace.branchStock", { branch: isolate(branchLabel) }) : t("stockWorkspace.allStockHint")} actions={<div className="flex flex-wrap items-center gap-2"><Button size="sm" variant={attentionOnly ? "primary" : "secondary"} aria-pressed={attentionOnly} onClick={() => { setAttentionOnly(!attentionOnly); updateView(!attentionOnly, search); }}>{t("stockWorkspace.lowOnly")}</Button><div className="relative"><SearchIcon className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} onBlur={() => updateView(attentionOnly, search)} placeholder={t("stockWorkspace.searchPlaceholder")} className="h-8 w-40 ps-8 sm:w-48" aria-label={t("stockWorkspace.searchLabel")} /></div>{writeEnabled ? <><Button size="sm" onClick={() => { setEditingProduct(undefined); setProductForm(true); }} disabled={!branchId}><Plus /> {" "}{t("stockWorkspace.addItem")}</Button><Button size="sm" variant="secondary" onClick={() => setTransferDialog(true)} disabled={!branchId}><ArrowRightLeft /> {" "}{t("stockWorkspace.moveStock")}</Button></> : null}</div>} />
        {!writeEnabled ? <div className="p-4"><ReadOnlyNotice /></div> : null}
        {!branchId && writeEnabled ? <div className="border-b border-line bg-warning-bg/40 px-4 py-2.5 text-[12px] text-warning-deep" role="status">{t("stockWorkspace.chooseBranchStock")}</div> : null}
        <div><table className="block w-full text-start md:table"><caption className="sr-only">{t("dashboard.today.kind.low_stock")}</caption><thead className="sr-only border-b border-line bg-sunken/40 text-[12px] text-ink-3 md:not-sr-only md:table-header-group"><tr><th className="px-4 py-2.5 font-medium">{t("stockWorkspace.item")}</th><th className="px-4 py-2.5 text-end font-medium">{t("stockWorkspace.available")}</th><th className="px-4 py-2.5 font-medium">{t("common.label.status")}</th><th className="px-4 py-2.5 text-end font-medium">{t("stockWorkspace.sellingPrice")}</th><th className="px-4 py-2.5 text-end font-medium">{t("common.label.actions")}</th></tr></thead><tbody className="block divide-y divide-line md:table-row-group">{products.length === 0 ? <tr><td colSpan={5}><EmptyState compact title={t("stockWorkspace.noItems")} description={t("stockWorkspace.addFirstItem")} className="m-4" /></td></tr> : visibleProducts.length === 0 ? <tr><td colSpan={5}><EmptyState compact title={t("stockWorkspace.noMatches")} description={attentionOnly ? t("stockWorkspace.noLowMatches") : t("stockWorkspace.trySearch")} className="m-4" /></td></tr> : visibleProducts.map((product) => { const rows = inventoryByProduct.get(product.id) ?? []; const productAlerts = alerts.filter((alert) => alert.productId === product.id); const selectedRow = rows.find((row) => row.branchId === branchId); const available = selectedRow?.availableQuantity ?? 0; const totalAvailable = rows.reduce((sum, row) => sum + row.availableQuantity, 0); const low = selectedRow ? available <= product.reorderPoint : rows.some((row) => row.availableQuantity <= product.reorderPoint); const needsReplenishment = alertProductIds.has(product.id); const alertBranches = [...new Set(productAlerts.map((alert) => branches.find((branch) => branch.id === alert.branchId)?.name ?? alert.branchId))].map(name => isolate(name)).join(locale === "ar" ? "، " : ", "); const sellable = Boolean(onSell && branchId && available > 0 && hasSellableRetailPrice(product, currency)); return <tr key={product.id} className="grid grid-cols-2 items-start gap-y-2 px-4 py-4 text-[13.5px] md:table-row md:p-0"><td className="col-span-2 md:px-4 md:py-3"><span className="font-medium">{product.name}</span><span className="block text-[12px] text-ink-3"><bdi dir="ltr">{product.sku}</bdi> · {t(`stockWorkspace.${product.unit}`)}</span></td><td className={cn("tabular-nums md:px-4 md:py-3 md:text-end", needsReplenishment ? "text-warning-deep" : "text-ink")} ><span className="me-2 text-[12px] text-ink-3 md:hidden">{t("stockWorkspace.available")}</span>{branchId ? f.number(available) : <><span>{t("common.label.total")}{" "}{f.number(totalAvailable)}</span>{rows.length > 0 ? <span className="mt-1 block text-[12px] text-ink-3">{rows.map((row) => t("stockWorkspace.branchAvailable", { branch: isolate(branches.find((branch) => branch.id === row.branchId)?.name ?? row.branchId), count: f.number(row.availableQuantity) })).join(" · ")}</span> : null}</>}</td><td className="md:px-4 md:py-3">{needsReplenishment ? <Badge variant="warning" dot>{branchId ? (low ? t("stockWorkspace.lowStock") : t("stockWorkspace.orderSoon")) : `${low ? t("stockWorkspace.lowStock") : t("stockWorkspace.orderSoon")} · ${alertBranches}`}</Badge> : <Badge variant="success" dot>{t("stockWorkspace.inStock")}</Badge>}</td><td className="tabular-nums md:px-4 md:py-3 md:text-end" ><span className="me-2 text-[12px] text-ink-3 md:hidden">{t("renewFlow.adjust.planChange.rowPrice")}</span>{product.retailPrice ? <MoneyText money={product.retailPrice} /> : <span className="text-ink-3">{t("common.state.notSet")}</span>}</td><td className="col-span-2 border-t border-line pt-2 md:border-0 md:px-4 md:py-3 md:text-end"><div className="flex flex-wrap items-center gap-1 md:justify-end">{sellable ? <Button size="xs" variant="secondary" aria-label={t("stockWorkspace.sellNamed", { name: product.name })} onClick={() => onSell!(product.id)}><ShoppingBag /> {" "}{t("stockWorkspace.sell")}</Button> : null}{writeEnabled && branchId ? <Button size="xs" variant={needsReplenishment ? "primary" : "ghost"} aria-label={t("stockWorkspace.reorderNamed", { name: product.name })} onClick={() => setOrderForm({ defaultProductId: product.id })}><PackagePlus /> {" "}{t("stockWorkspace.reorder")}</Button> : null}{writeEnabled ? <Button size="icon" variant="ghost" aria-label={t("stockWorkspace.editNamed", { name: product.name })} onClick={() => { setEditingProduct(product); setProductForm(true); }} disabled={!branchId}><Pencil /></Button> : null}</div></td></tr>; })}</tbody></table></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-sunken/30 px-4 py-2.5 text-[12px]" role="status"><AlertTriangle className={cn("size-3.5", alerts.length > 0 ? "text-warning-deep" : "text-ink-3")} aria-hidden />{alerts.length > 0 ? <span>{t(branchId ? "stockWorkspace.branchAlerts" : "stockWorkspace.allAlerts", { alerts: t("stockWorkspace.alerts", { count: alerts.length }) })}</span> : <span>{t("stockWorkspace.noLowAlerts")}</span>}{alerts.length > 0 ? <span className="text-ink-3">{alerts.slice(0, 3).map((alert) => t("stockWorkspace.alertSummary", { name: isolate(productName.get(alert.productId) ?? t("stockWorkspace.item")), branch: isolate(branches.find((branch) => branch.id === alert.branchId)?.name ?? alert.branchId), count: isolateLtr(f.number(alert.availableQuantity)) })).join(" · ")}{alerts.length > 3 ? " · …" : ""}</span> : null}</div>
      </section>

      <TransferStockDialog open={transferDialog} onOpenChange={setTransferDialog} sourceBranchId={branchId} branches={branches} products={products} inventory={inventory} pending={mutations.transfer.isPending} onSubmit={(input) => mutations.transfer.mutate(input, { onSuccess: () => setTransferDialog(false) })} />

      {productForm ? <ProductForm key={editingProduct?.id ?? "new-product"} currency={currency} branchId={branchId} product={editingProduct} availableQuantity={editingProduct ? inventoryByProduct.get(editingProduct.id)?.[0]?.availableQuantity : undefined} pending={mutations.product.isPending} onCancel={closeProductForm} onRequestDelete={editingProduct ? () => { const productToDelete = editingProduct; closeProductForm(); setDeleteTarget({ type: "product", id: productToDelete.id, label: productToDelete.name }); } : undefined} onSubmit={(input) => mutations.product.mutate(input, { onSuccess: closeProductForm })} /> : null}
      {orderForm ? <PurchaseOrderForm currency={currency} products={products} suppliers={suppliers} branchId={branchId} defaultProductId={orderForm.defaultProductId} pending={mutations.purchaseOrder.isPending} onCancel={() => setOrderForm(null)} onSubmit={(input) => mutations.purchaseOrder.mutate(input, { onSuccess: () => setOrderForm(null) })} /> : null}
      <DeleteDialog kind={deleteTarget?.type} label={deleteTarget?.label ?? t("stockWorkspace.item")} open={Boolean(deleteTarget)} pending={mutations.deleteProduct.isPending} onOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onConfirm={(reason, confirmation) => { if (!deleteTarget) return; mutations.deleteProduct.mutate({ productId: deleteTarget.id, reason, confirmation: confirmation ?? "" }, { onSuccess: () => setDeleteTarget(undefined) }); }} />
    </div>
  );
}
