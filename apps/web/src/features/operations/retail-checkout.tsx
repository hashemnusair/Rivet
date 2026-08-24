"use client";

import {
  ArrowLeft,
  Boxes,
  Check,
  ChevronDown,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { qk } from "@/lib/api/keys";
import type { InventoryBalance, MemberSummary, Money, Product, ReceiptDetail, RetailCheckoutInput, RetailSale, WorkspaceAccess } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";

type CheckoutPaymentMethod = RetailCheckoutInput["method"];
type CustomerMode = "member" | "guest";

type RetailCheckoutResult = ReceiptDetail & { receiptId: string; retailSale: RetailSale };

type SellableProduct = Product & { retailPrice?: Money };

interface CartLine {
  product: SellableProduct;
  quantity: number;
}

function newIdempotencyKey() {
  return `retail-sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Product prices are server-authored. The checkout never accepts a client price. */
export function retailPriceOf(product: SellableProduct, currency?: string): Money | undefined {
  const price = product.retailPrice;
  return price && Number.isSafeInteger(price.amount) && price.amount > 0 && (!currency || price.currency === currency) ? price : undefined;
}

export function hasSellableRetailPrice(product: SellableProduct, currency: string): boolean {
  return Boolean(retailPriceOf(product, currency));
}

export function checkoutAmount(lines: CartLine[], currency?: string): Money | undefined {
  const first = lines.find((line) => retailPriceOf(line.product, currency));
  if (!first) return undefined;
  const resolvedCurrency = retailPriceOf(first.product, currency)!.currency;
  const amount = lines.reduce((total, line) => {
    const price = retailPriceOf(line.product, resolvedCurrency);
    return total + (price?.currency === resolvedCurrency ? price.amount * line.quantity : 0);
  }, 0);
  return { amount, currency: resolvedCurrency };
}

function resultReceiptId(value: RetailCheckoutResult): string {
  return value.receiptId;
}

function availableFor(productId: string, balances: InventoryBalance[]): number {
  return balances.find((balance) => balance.productId === productId)?.availableQuantity ?? 0;
}

function ProductCard({
  product,
  available,
  quantity,
  currency,
  onAdd,
}: {
  product: SellableProduct;
  available: number;
  quantity: number;
  currency: string;
  onAdd: () => void;
}) {
  const price = retailPriceOf(product, currency);
  const unavailable = !price || available <= 0;
  return (
    <article className="flex min-w-0 flex-col justify-between rounded-lg border border-line bg-surface p-3.5 shadow-[0_1px_0_rgba(16,16,14,0.02)]">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[13.5px] font-medium text-ink">{product.name}</h2>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">{product.sku}</p>
          </div>
          <Badge variant={price ? (available > 0 ? "success" : "danger") : "warning"}>
            {price ? `${available} available` : "Price missing"}
          </Badge>
        </div>
        <p className="mt-3 text-[14px] font-semibold tabular" dir="ltr">
          {price ? <MoneyText money={price} /> : "Set selling price"}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={quantity > 0 ? "secondary" : "primary"}
        className="mt-4 w-full"
        onClick={onAdd}
        disabled={unavailable || quantity >= available}
        aria-label={quantity > 0 ? `Add another ${product.name}` : `Add ${product.name}`}
      >
        {quantity > 0 ? <Check /> : <Plus />}
        {quantity > 0 ? `${quantity} in sale` : "Add to sale"}
      </Button>
    </article>
  );
}

function CustomerPicker({
  mode,
  onModeChange,
  member,
  onMember,
  guest,
  onGuest,
  branchId,
}: {
  mode: CustomerMode;
  onModeChange: (mode: CustomerMode) => void;
  member: MemberSummary | null;
  onMember: (member: MemberSummary | null) => void;
  guest: { fullName: string; phone: string };
  onGuest: (guest: { fullName: string; phone: string }) => void;
  branchId?: string;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 220);
  const query = useApiQuery(
    qk.members({ checkout: true, branchId, search: debouncedSearch }),
    (api) => api.listMembers({ branchId, search: debouncedSearch || undefined, status: "active", pageSize: 8, sort: "fullName" }),
    { enabled: mode === "member" && !member && Boolean(branchId) },
  );

  return (
    <section className="panel overflow-hidden" aria-labelledby="customer-heading">
      <header className="border-b border-line px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Customer</p>
            <h2 id="customer-heading" className="mt-1 text-[16px] font-semibold">Who is buying?</h2>
          </div>
          <div className="flex rounded-md border border-line-2 bg-sunken/50 p-0.5" role="group" aria-label="Customer type">
            <button
              type="button"
              className={cn("rounded px-2.5 py-1.5 text-[12px] transition-colors", mode === "member" ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
              onClick={() => { onModeChange("member"); onMember(null); }}
              aria-pressed={mode === "member"}
            >
              <UserRound className="me-1 inline size-3.5" aria-hidden /> Member
            </button>
            <button
              type="button"
              className={cn("rounded px-2.5 py-1.5 text-[12px] transition-colors", mode === "guest" ? "bg-surface font-medium text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
              onClick={() => { onModeChange("guest"); onMember(null); }}
              aria-pressed={mode === "guest"}
            >
              <UserRoundPlus className="me-1 inline size-3.5" aria-hidden /> Guest
            </button>
          </div>
        </div>
      </header>
      <div className="p-4">
        {mode === "member" ? (
          member ? (
            <div className="flex items-center gap-3 rounded-md border border-success/30 bg-success-bg/40 p-3" data-testid="selected-member">
              <div className="flex size-9 items-center justify-center rounded-full bg-success text-white" aria-hidden>
                <Check className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{member.fullName}</p>
                <p className="font-mono text-[11px] text-ink-3">{member.memberNumber} · {member.phone}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onMember(null)}>Change</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone or member number…" className="ps-8" aria-label="Search member for retail sale" />
              </div>
              <div className="mt-3">
                {query.isLoading ? (
                  <div className="space-y-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
                ) : query.isError ? (
                  <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
                ) : query.data?.items.length ? (
                  <ul className="divide-y divide-line rounded-md border border-line" aria-label="Member results">
                    {query.data.items.map((item) => (
                      <li key={item.id}>
                        <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-sunken/50" onClick={() => onMember(item)}>
                          <UserRound className="size-4 text-ink-3" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{item.fullName}</span>
                            <span className="block font-mono text-[11px] text-ink-3">{item.memberNumber} · {item.phone}</span>
                          </span>
                          <ChevronDown className="size-3.5 -rotate-90 text-ink-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState compact title={search ? "No active members found" : "Search for a member"} description={search ? "Try a different name, phone or member number, or choose Guest." : undefined} className="border-0" />
                )}
              </div>
            </>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Guest name" required>
              <Input value={guest.fullName} onChange={(event) => onGuest({ ...guest, fullName: event.target.value })} placeholder="Full name" autoComplete="name" required />
            </Field>
            <Field label="Phone number" required hint="Used on the printed receipt">
              <Input dir="ltr" value={guest.phone} onChange={(event) => onGuest({ ...guest, phone: event.target.value })} placeholder="07…" autoComplete="tel" required />
            </Field>
          </div>
        )}
      </div>
    </section>
  );
}

function Cart({ lines, inventory, currency, onQuantity, onRemove }: { lines: CartLine[]; inventory: InventoryBalance[]; currency: string; onQuantity: (productId: string, quantity: number) => void; onRemove: (productId: string) => void }) {
  const total = checkoutAmount(lines, currency) ?? { amount: 0, currency };
  return (
    <section className="panel overflow-hidden lg:sticky lg:top-5" aria-labelledby="cart-heading">
      <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div>
          <p className="eyebrow">Sale</p>
          <h2 id="cart-heading" className="mt-1 text-[16px] font-semibold">Current sale</h2>
        </div>
        <Badge variant={lines.length ? "ink" : "outline"}>{lines.reduce((count, line) => count + line.quantity, 0)} items</Badge>
      </header>
      {lines.length === 0 ? (
        <EmptyState compact title="Sale is empty" description="Choose a priced item to start a checkout." className="m-4" />
      ) : (
        <>
          <div className="divide-y divide-line">
            {lines.map((line) => {
              const price = retailPriceOf(line.product, currency)!;
              return (
                <div key={line.product.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{line.product.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3"><MoneyText money={price} /> each · {line.product.sku}</p>
                    <div className="mt-2 flex items-center gap-1 rounded-md border border-line-2 p-0.5" aria-label={`Quantity for ${line.product.name}`}>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => line.quantity > 1 ? onQuantity(line.product.id, line.quantity - 1) : onRemove(line.product.id)} aria-label={`Decrease ${line.product.name}`}><Minus /></Button>
                      <span className="min-w-7 text-center font-mono text-[12px]" dir="ltr">{line.quantity}</span>
                      <Button type="button" variant="ghost" size="icon-sm" disabled={line.quantity >= availableFor(line.product.id, inventory)} onClick={() => onQuantity(line.product.id, line.quantity + 1)} aria-label={`Increase ${line.product.name}`}><Plus /></Button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="font-mono text-[12.5px] tabular" dir="ltr">{toMajor({ amount: price.amount * line.quantity, currency: price.currency }).toFixed(3)}</span>
                    <Button type="button" variant="ghost" size="icon-sm" className="text-danger hover:text-danger" onClick={() => onRemove(line.product.id)} aria-label={`Remove ${line.product.name}`}><Trash2 /></Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-line bg-sunken/30 px-4 py-4">
            <div className="flex items-center justify-between text-[13px] text-ink-2"><span>Subtotal</span><MoneyText money={total} /></div>
            <div className="mt-2 flex items-center justify-between text-[16px] font-semibold"><span>Total</span><MoneyText money={total} /></div>
          </div>
        </>
      )}
    </section>
  );
}

export function RetailCheckout() {
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const invalidate = useInvalidate();
  const searchParams = useSearchParams();
  const visibleBranches = session?.branches;
  const visibleBranchIds = useMemo(() => new Set((visibleBranches ?? []).map((branch) => branch.id)), [visibleBranches]);
  const requestedBranchId = searchParams.get("branchId") ?? undefined;
  const validUrlBranchId = requestedBranchId && visibleBranchIds.has(requestedBranchId) ? requestedBranchId : undefined;
  const globalBranchId = session?.activeBranchId && visibleBranchIds.has(session.activeBranchId) ? session.activeBranchId : visibleBranches?.[0]?.id;
  const [branchId, setBranchId] = useState("");
  const previousGlobalBranchId = useRef<string | undefined>(undefined);
  const previousUrlBranchId = useRef<string | undefined>(undefined);
  const [productSearch, setProductSearch] = useState("");
  const productDebounced = useDebouncedValue(productSearch, 220);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<CustomerMode>("member");
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [guest, setGuest] = useState({ fullName: "", phone: "" });
  const [method, setMethod] = useState<CheckoutPaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const idempotencyKey = useRef(newIdempotencyKey());
  const currency = session?.organization.currency ?? "JOD";
  const preselectedProductId = searchParams.get("productId");
  const concreteBranchId = visibleBranchIds.has(branchId) ? branchId : validUrlBranchId ?? globalBranchId ?? "";
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) });
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const operationsModule = workspace?.modules.find((entry) => entry.key === "operations");
  const operationsReady = Boolean(operationsModule?.entitled && operationsModule.enabled);

  useEffect(() => {
    const urlChanged = validUrlBranchId !== previousUrlBranchId.current;
    const globalChanged = globalBranchId !== previousGlobalBranchId.current;
    const nextBranchId = validUrlBranchId ?? globalBranchId;
    // A valid branchId in the URL is an explicit deep-link choice. Keep it
    // stable even when the Topbar changes the global branch. Without that
    // explicit choice, follow the session's active branch as it changes.
    const shouldSync = validUrlBranchId ? urlChanged : urlChanged || globalChanged;
    if (shouldSync && nextBranchId && nextBranchId !== branchId) {
      setBranchId(nextBranchId);
      setCart({});
      setMember(null);
    }
    previousUrlBranchId.current = validUrlBranchId;
    previousGlobalBranchId.current = globalBranchId;
  }, [branchId, globalBranchId, validUrlBranchId]);

  const productsQuery = useApiQuery(
    qk.operations({ checkout: "products", branchId: concreteBranchId }),
    (api) => api.listProducts({ includeArchived: false }),
    { enabled: Boolean(concreteBranchId) && operationsReady },
  );
  const inventoryQuery = useApiQuery(
    qk.operations({ checkout: "inventory", branchId: concreteBranchId }),
    (api) => api.listInventory({ branchId: concreteBranchId }),
    { enabled: Boolean(concreteBranchId) && operationsReady },
  );

  const products = useMemo(() => (productsQuery.data ?? []) as SellableProduct[], [productsQuery.data]);
  const visibleProducts = useMemo(() => {
    const search = productDebounced.trim().toLowerCase();
    return products.filter((product) => !search || `${product.name} ${product.sku}`.toLowerCase().includes(search));
  }, [productDebounced, products]);
  const inventory = useMemo(() => inventoryQuery.data ?? [], [inventoryQuery.data]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartLines = useMemo<CartLine[]>(
    () => Object.entries(cart).map(([productId, quantity]) => ({ product: productMap.get(productId), quantity })).filter((line): line is CartLine => Boolean(line.product && line.quantity > 0)),
    [cart, productMap],
  );
  const total = checkoutAmount(cartLines, currency) ?? { amount: 0, currency };

  // Inventory rows link directly into checkout with ?productId=. Add the
  // requested item once its server-authoritative price and branch balance are
  // available, while still letting the operator adjust or remove it.
  const preselectionApplied = useRef<string | undefined>(undefined);
  useEffect(() => {
    const key = `${concreteBranchId}:${preselectedProductId ?? ""}`;
    if (preselectionApplied.current === key || !preselectedProductId || productsQuery.isLoading || inventoryQuery.isLoading || !productsQuery.data || !inventoryQuery.data) return;
    const product = products.find((candidate) => candidate.id === preselectedProductId);
    const available = availableFor(preselectedProductId, inventory);
    if (product && retailPriceOf(product, currency) && available > 0) setCart((current) => ({ ...current, [product.id]: Math.min(current[product.id] ?? 0, available) || 1 }));
    preselectionApplied.current = key;
  }, [concreteBranchId, currency, inventory, inventoryQuery.data, inventoryQuery.isLoading, preselectedProductId, products, productsQuery.data, productsQuery.isLoading]);

  const checkout = useApiMutation(
    (api, input: RetailCheckoutInput) => api.checkoutRetail(input),
    {
      onSuccess: async (result) => {
        const receiptId = resultReceiptId(result);
        router.push(`/payments/receipts/${receiptId}?from=checkout`);
        void invalidate([qk.operations(), qk.members(), qk.receipt(receiptId)]);
      },
    },
  );

  if (!can("members.read")) {
    return <ForbiddenState description="Daily checkout is limited to gym team members with operational read access." />;
  }

  if (!can("payments.collect")) {
    return <ForbiddenState description="Retail checkout requires permission to collect payments." />;
  }

  if (workspaceQuery.isLoading) {
    return <div className="space-y-4"><PageHeader eyebrow="Operations · Sell and stock" title="Checkout" description="Loading workspace access…" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (workspaceQuery.isError || !workspace) {
    return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  }

  if (!operationsModule?.entitled) {
    return <StatePanel icon={Boxes} title="Operations is not included" description="The Growth workspace module adds inventory checkout, facilities, equipment, and supplier workflows." className="mt-4" />;
  }

  if (!operationsModule.enabled) {
    return <StatePanel icon={Boxes} title="Operations is paused" description="An organization owner can enable the operations module from workspace settings." className="mt-4" />;
  }

  if (!concreteBranchId) {
    return <EmptyState title="No branch available" description="Select or configure an active branch before opening checkout." />;
  }

  const stockFor = (productId: string) => availableFor(productId, inventory);
  const updateQuantity = (productId: string, next: number) => {
    const max = stockFor(productId);
    setCart((current) => ({ ...current, [productId]: Math.min(Math.max(0, next), max) }));
  };
  const addProduct = (product: SellableProduct) => updateQuantity(product.id, (cart[product.id] ?? 0) + 1);

  const submit = () => {
    setValidationError(undefined);
    if (!cartLines.length) return setValidationError("Add at least one priced item to the sale.");
    const overStock = cartLines.find((line) => line.quantity > stockFor(line.product.id));
    if (overStock) return setValidationError(`${overStock.product.name} has only ${stockFor(overStock.product.id)} available.`);
    if (mode === "member" && !member) return setValidationError("Select a member or switch to Guest.");
    if (mode === "guest" && (!guest.fullName.trim() || !guest.phone.trim())) return setValidationError("Guest name and phone number are required.");
    if ((method === "cliq" || method === "card") && !reference.trim()) return setValidationError(`A reference number is required for ${method === "cliq" ? "CliQ" : "Visa / card"}.`);
    checkout.mutate({
      branchId: concreteBranchId,
      ...(mode === "member" ? { memberId: member!.id } : { guest: { fullName: guest.fullName.trim(), phone: guest.phone.trim() } }),
      lines: cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      method,
      externalReference: reference.trim() || undefined,
      idempotencyKey: idempotencyKey.current,
    });
  };

  const queryError = productsQuery.error ?? inventoryQuery.error;
  return (
    <div className="mx-auto max-w-6xl space-y-5" data-testid="retail-checkout">
      <PageHeader
        eyebrow="Operations · Sell and stock"
        title="Checkout"
        description="Sell stock at the desk. The server records the payment, receipt, and stock movement together."
        actions={<Button asChild variant="secondary" size="sm"><Link href="/operations"><ArrowLeft /> Operations</Link></Button>}
      />

      {session?.branches.length && session.branches.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="checkout-branch" className="text-[12px] font-medium text-ink-2">Selling from</label>
          <Select value={concreteBranchId} onValueChange={(value) => { setBranchId(value); setCart({}); setMember(null); }}>
            <SelectTrigger id="checkout-branch" className="w-56" aria-label="Checkout branch"><SelectValue /></SelectTrigger>
            <SelectContent>{session.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : null}

      {queryError ? <QueryErrorState error={queryError} onRetry={() => { void productsQuery.refetch(); void inventoryQuery.refetch(); }} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <CustomerPicker mode={mode} onModeChange={setMode} member={member} onMember={setMember} guest={guest} onGuest={setGuest} branchId={concreteBranchId} />

          <section className="panel overflow-hidden" aria-labelledby="products-heading">
            <header className="border-b border-line px-4 py-3.5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><p className="eyebrow">Sellable stock</p><h2 id="products-heading" className="mt-1 text-[16px] font-semibold">Choose items</h2><p className="mt-1 text-[12px] text-ink-3">Only active items with a configured selling price and available stock can be sold.</p></div>
                <div className="relative w-full max-w-xs"><Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search stock…" className="ps-8" aria-label="Search sellable stock" /></div>
              </div>
            </header>
            <div className="p-4">
              {productsQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-40 w-full" />)}</div> : visibleProducts.length === 0 ? <EmptyState compact title={productSearch ? "No matching stock" : "No sellable stock"} description="Add active stock and set a selling price in the Operations catalog." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} available={stockFor(product.id)} quantity={cart[product.id] ?? 0} currency={currency} onAdd={() => addProduct(product)} />)}</div>}
            </div>
          </section>

          <section className="panel p-4" aria-labelledby="payment-heading">
            <div className="mb-3"><p className="eyebrow">Payment</p><h2 id="payment-heading" className="mt-1 text-[16px] font-semibold">How was it paid?</h2></div>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
              {(["cash", "cliq", "card"] as const).map((value) => {
                const label = value === "cash" ? "Cash" : value === "cliq" ? "CliQ" : "Visa / card";
                return <label key={value} className={cn("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]", method === value ? "border-ink bg-sunken/60" : "border-line-2 hover:border-line-3")}><input type="radio" name="checkout-payment-method" value={value} checked={method === value} onChange={() => setMethod(value)} className="accent-[var(--tenant-brand-primary)]" />{label}</label>;
              })}
            </div>
            {method === "cliq" || method === "card" ? <Field className="mt-3" label={`${method === "cliq" ? "CliQ" : "Visa / card"} reference`} required hint="Record the receipt or transaction reference; no payment provider is connected."><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Reference number" dir="ltr" required /></Field> : <p className="mt-3 text-[12px] text-ink-3">Cash sales are recorded against the open cash shift. <Link href="/payments/shifts" className="font-medium underline underline-offset-2">Open or review shift</Link>.</p>}
          </section>
        </div>

        <div className="space-y-4">
          <Cart lines={cartLines} inventory={inventory} currency={currency} onQuantity={updateQuantity} onRemove={(productId) => setCart((current) => { const next = { ...current }; delete next[productId]; return next; })} />
          {validationError ? <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{validationError}</div> : null}
          {checkout.error ? <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{checkout.error.message || "The sale could not be completed. Check stock and try again."}</div> : null}
          <Button type="button" size="lg" className="w-full" onClick={submit} loading={checkout.isPending} disabled={cartLines.length === 0} data-testid="complete-retail-sale"><ShoppingBag /> Complete sale · <span dir="ltr">{toMajor(total).toFixed(3)} {total.currency}</span></Button>
          <p className="text-center text-[11px] text-ink-3">One protected transaction creates the receipt and decreases available stock. If the request is retried, the same sale key prevents duplicates.</p>
        </div>
      </div>
    </div>
  );
}
