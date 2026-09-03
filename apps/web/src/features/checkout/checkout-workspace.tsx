"use client";

import { Boxes } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import type { InventoryBalance, OrganizationSettings, WorkspaceAccess } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { usePermissions } from "@/lib/providers/app-providers";
import { toMajor } from "@/lib/utils/money";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { DesktopCart, MobileCart } from "./cart-panel";
import { availableFor, buildCheckoutInput, checkoutAmount, newSaleIdempotencyKey, retailPriceOf, saleDraftSignature, validateSaleDraft, type CartLine, type CheckoutPaymentMethod, type CustomerAttachment, type SaleDraft, type SellableProduct } from "./checkout-model";
import { CustomerAttach } from "./customer-attach";
import { PaymentSection } from "./payment-section";
import { ProductPicker } from "./product-picker";
import { SaleResult, type RetailCheckoutResult } from "./sale-result";
import { useCheckoutBranch } from "./use-checkout-branch";
import { useIsDesktop } from "./use-is-desktop";

/**
 * The one checkout. Branch → items → sale → (optional) customer → payment →
 * complete → result. Anonymous by default; the server validates the whole
 * sale and records stock, receipt, shift, audit and accounting facts together.
 */
export function CheckoutWorkspace() {
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const searchParams = useSearchParams();
  const desktop = useIsDesktop();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState<CustomerAttachment>({ kind: "walk_in" });
  const [method, setMethod] = useState<CheckoutPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const [serverError, setServerError] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [completed, setCompleted] = useState<RetailCheckoutResult | null>(null);
  const submitting = useRef(false);
  const resetSale = () => { setCart({}); setCustomer({ kind: "walk_in" }); setReference(""); setValidationError(undefined); setServerError(undefined); setSheetOpen(false); };
  const { branches, concreteBranchId, chooseBranch, branchChanging, branchSelectionError, session } = useCheckoutBranch(resetSale);
  const productDebounced = useDebouncedValue(productSearch, 150);
  const currency = session?.organization.currency ?? "JOD";
  const branchName = branches.find((branch) => branch.id === concreteBranchId)?.name;
  const preselectedProductId = searchParams.get("productId");

  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) });
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings(), { enabled: Boolean(session) });
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const settings = settingsQuery.data as OrganizationSettings | undefined;
  const operationsModule = workspace?.modules.find((entry) => entry.key === "operations");
  const operationsReady = Boolean(operationsModule?.entitled && operationsModule.enabled);
  const configuredPaymentMethods = settings?.paymentMethods;
  const enabledMethods = useMemo<Set<CheckoutPaymentMethod>>(() => {
    if (!configuredPaymentMethods?.length) return new Set(["cash", "cliq", "card"]);
    return new Set(configuredPaymentMethods.filter((configured) => configured.enabled).map((configured) => configured.key).filter((key): key is CheckoutPaymentMethod => key === "cash" || key === "cliq" || key === "card"));
  }, [configuredPaymentMethods]);
  useEffect(() => {
    if (!enabledMethods.has(method)) {
      const fallback = (["cash", "cliq", "card"] as const).find((candidate) => enabledMethods.has(candidate));
      if (fallback) setMethod(fallback);
      setReference("");
    }
  }, [enabledMethods, method]);

  const productsQuery = useApiQuery(qk.operations({ checkout: "products", branchId: concreteBranchId }), (api) => api.listProducts({ includeArchived: false }), { enabled: Boolean(concreteBranchId) && operationsReady });
  const inventoryQuery = useApiQuery(qk.operations({ checkout: "inventory", branchId: concreteBranchId }), (api) => api.listInventory({ branchId: concreteBranchId }), { enabled: Boolean(concreteBranchId) && operationsReady });
  const canSeeShift = can("reconciliation.open_shift");
  const shiftQuery = useApiQuery(qk.currentShift(concreteBranchId), (api) => api.getCurrentCashShift(concreteBranchId), { enabled: Boolean(concreteBranchId) && operationsReady && canSeeShift && method === "cash" });
  const products = useMemo(() => (productsQuery.data ?? []) as SellableProduct[], [productsQuery.data]);
  const inventory = useMemo<InventoryBalance[]>(() => inventoryQuery.data ?? [], [inventoryQuery.data]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartLines = useMemo<CartLine[]>(() => Object.entries(cart).map(([productId, quantity]) => ({ product: productMap.get(productId), quantity })).filter((line): line is CartLine => Boolean(line.product && line.quantity > 0)), [cart, productMap]);
  const total = checkoutAmount(cartLines, currency) ?? { amount: 0, currency };
  const cashShiftOpen = canSeeShift && method === "cash" && shiftQuery.isSuccess ? Boolean(shiftQuery.data) : undefined;
  const draft: SaleDraft = { branchId: concreteBranchId, lines: cartLines, customer, method, reference };
  const signature = saleDraftSignature(draft);
  // One idempotency key per distinct draft: a retry of the same sale replays
  // safely, and a changed sale gets a fresh key instead of a false conflict.
  const idempotencyKey = useMemo(() => newSaleIdempotencyKey(), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  // A Sell action or deep link preselects one item once its price and branch
  // balance are known; the operator can still adjust or remove it.
  const preselectionApplied = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = `${concreteBranchId}:${preselectedProductId ?? ""}`;
    if (preselectionApplied.current === key || !preselectedProductId || !productsQuery.data || !inventoryQuery.data) return;
    const product = products.find((candidate) => candidate.id === preselectedProductId);
    const available = availableFor(preselectedProductId, inventory);
    if (product && retailPriceOf(product, currency) && available > 0) setCart((current) => ({ ...current, [product.id]: Math.min(current[product.id] ?? 0, available) || 1 }));
    preselectionApplied.current = key;
  }, [concreteBranchId, currency, inventory, inventoryQuery.data, preselectedProductId, products, productsQuery.data]);

  const checkout = useApiMutation((api, input: Parameters<typeof api.checkoutRetail>[0]) => api.checkoutRetail(input), {
    onSuccess: async (result) => {
      setCompleted(result as RetailCheckoutResult);
      resetSale();
      void invalidate([qk.operations(), qk.members(), qk.receipt(result.receiptId), qk.currentShift(concreteBranchId)]);
    },
    onError: (error) => {
      setServerError(isApiError(error) ? error.message : "The sale could not be completed. Check stock and try again.");
      if (isApiError(error) && error.code === "NO_OPEN_SHIFT") void shiftQuery.refetch();
    },
    onSettled: () => { submitting.current = false; },
  });

  if (!can("members.read")) return <ForbiddenState description="Checkout is limited to gym team members with operational read access." />;
  if (!can("payments.collect")) return <ForbiddenState description="Checkout requires permission to collect payments." />;
  if (workspaceQuery.isLoading) return <div className="space-y-4"><PageHeader title="Checkout" description="Loading workspace access…" /><Skeleton className="h-48 w-full" /></div>;
  if (workspaceQuery.isError || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!operationsModule?.entitled) return <StatePanel icon={Boxes} title="Checkout is not included" description="The Growth workspace module adds stock, checkout, suppliers, and purchase orders." className="mt-4" />;
  if (!operationsModule.enabled) return <StatePanel icon={Boxes} title="Checkout is paused" description="An organization owner can enable the operations module from workspace settings." className="mt-4" />;

  const branchPicker = branches.length > 1 ? (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="checkout-branch" className="text-[12px] font-medium text-ink-2">Selling from</label>
      <Select value={concreteBranchId} onValueChange={chooseBranch} disabled={branchChanging}>
        <SelectTrigger id="checkout-branch" className="h-11 w-56 sm:h-9" aria-label="Checkout branch"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
        <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
      </Select>
      {branchSelectionError ? <p className="basis-full text-[12px] text-danger" role="alert">{branchSelectionError}</p> : null}
    </div>
  ) : null;
  const header = <PageHeader title="Checkout" description={branchName ? `Selling from ${branchName}. Walk-in by default; attach a member only when it matters.` : "Sell stock at the desk. The server records the payment, receipt, and stock movement together."} actions={<Button asChild variant="secondary" size="sm"><Link href={concreteBranchId ? `/operations?branch=${encodeURIComponent(concreteBranchId)}` : "/operations"}><Boxes /> Stock & purchasing</Link></Button>} />;

  if (completed) {
    return (
      <div className="mx-auto max-w-6xl space-y-5" data-testid="retail-checkout">
        {header}
        <SaleResult result={completed} canAdjust={can("payments.refund") || can("payments.void")} onNextSale={() => setCompleted(null)} />
      </div>
    );
  }

  if (!concreteBranchId) {
    return (
      <div className="mx-auto max-w-6xl space-y-5" data-testid="retail-checkout">
        {header}
        {branchPicker}
        <EmptyState title={branches.length ? "Choose a branch to check out" : "No branch available"} description={branches.length ? "Checkout needs one specific branch so stock and the receipt are recorded correctly." : "Configure an active branch before opening checkout."} />
      </div>
    );
  }

  const updateQuantity = (productId: string, next: number) => setCart((current) => ({ ...current, [productId]: Math.min(Math.max(0, next), availableFor(productId, inventory)) }));
  const removeLine = (productId: string) => setCart((current) => { const copy = { ...current }; delete copy[productId]; return copy; });
  const submit = () => {
    if (submitting.current || checkout.isPending) return;
    setServerError(undefined);
    const problem = validateSaleDraft(draft, inventory, currency, { cashShiftOpen });
    setValidationError(problem);
    if (problem) return;
    submitting.current = true;
    checkout.mutate(buildCheckoutInput(draft, idempotencyKey));
  };
  const cashBlocked = method === "cash" && cashShiftOpen === false;

  const salePanel = (
    <>
      <CustomerAttach value={customer} onChange={setCustomer} branchId={concreteBranchId} />
      <PaymentSection method={method} onMethod={(next) => { setMethod(next); if (next === "cash") setReference(""); }} enabledMethods={enabledMethods} reference={reference} onReference={setReference} branchName={branchName} cashShift={{ known: canSeeShift, loading: shiftQuery.isLoading, error: shiftQuery.error ?? undefined, shift: shiftQuery.data ?? null, onRetry: () => void shiftQuery.refetch() }} />
      {validationError ? <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{validationError}</div> : null}
      {serverError ? <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{serverError}</div> : null}
      <Button type="button" size="lg" className="h-12 w-full" onClick={submit} loading={checkout.isPending} disabled={cartLines.length === 0 || cashBlocked} data-testid="complete-retail-sale">Complete sale · <span dir="ltr">{toMajor(total).toFixed(3)} {total.currency}</span></Button>
    </>
  );
  const queryError = productsQuery.error ?? inventoryQuery.error;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24 lg:pb-0" data-testid="retail-checkout">
      {header}
      {branchPicker}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ProductPicker products={products} inventory={inventory} currency={currency} cart={cart} search={productSearch} onSearch={setProductSearch} onAdd={(product) => updateQuantity(product.id, (cart[product.id] ?? 0) + 1)} loading={productsQuery.isLoading || inventoryQuery.isLoading} error={queryError} onRetry={() => { void productsQuery.refetch(); void inventoryQuery.refetch(); }} />
        {desktop
          ? <DesktopCart lines={cartLines} inventory={inventory} currency={currency} total={total} onQuantity={updateQuantity} onRemove={removeLine}>{salePanel}</DesktopCart>
          : <MobileCart lines={cartLines} inventory={inventory} currency={currency} total={total} open={sheetOpen} onOpenChange={setSheetOpen} onQuantity={updateQuantity} onRemove={removeLine}>{salePanel}</MobileCart>}
      </div>
      <p className="text-[11px] text-ink-3">{productDebounced ? `Showing items matching “${productDebounced}”. ` : ""}One protected transaction creates the receipt and decreases available stock; a retried request reuses the same sale key so nothing is sold twice.</p>
    </div>
  );
}
