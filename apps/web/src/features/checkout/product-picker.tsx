"use client";
import { useT } from "@/lib/i18n/provider";

import { Check, Plus, Search } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { InventoryBalance } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { availableFor, filterSellableProducts, retailPriceOf, unsellableReason, type SellableProduct } from "./checkout-model";

export interface ProductPickerProps {
  products: SellableProduct[];
  inventory: InventoryBalance[];
  currency: string;
  cart: Record<string, number>;
  search: string;
  onSearch: (value: string) => void;
  onAdd: (product: SellableProduct) => void;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
}

/**
 * Dense, scannable rows instead of cards: name, SKU, price, what is left,
 * one big Add target. Typing a SKU and pressing Enter adds that item, which
 * is exactly what a barcode scanner does.
 */
export function ProductPicker({ products, inventory, currency, cart, search, onSearch, onAdd, loading, error, onRetry }: ProductPickerProps) {
  const t = useT();
  const { products: visible, exactSkuMatch } = filterSellableProducts(products, search);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const candidate = exactSkuMatch ?? (visible.length === 1 ? visible[0] : undefined);
    if (!candidate) return;
    event.preventDefault();
    if (!unsellableReason(candidate, availableFor(candidate.id, inventory), currency)) {
      onAdd(candidate);
      onSearch("");
    }
  };
  return (
    <section className="panel overflow-hidden" aria-labelledby="products-heading">
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="products-heading" className="text-[15px] font-semibold">{t("salesWorkspace.chooseItems")}</h2>
            <p className="text-[12px] text-ink-3">{t("salesWorkspace.searchHint")}</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input autoFocus value={search} onChange={(event) => onSearch(event.target.value)} onKeyDown={onKeyDown} placeholder={t("salesWorkspace.searchPlaceholder")} className="h-11 ps-8 sm:h-9" aria-label={t("salesWorkspace.searchItems")} inputMode="search" autoComplete="off" />
          </div>
        </div>
      </header>
      {loading ? (
        <div className="space-y-2 p-4">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
      ) : error ? (
        <div className="p-4"><QueryErrorState error={error} onRetry={onRetry} /></div>
      ) : visible.length === 0 ? (
        <EmptyState compact title={search ? t("salesWorkspace.noMatches") : t("salesWorkspace.noItems")} description={search ? t("salesWorkspace.trySearch") : t("salesWorkspace.addStockHint")} className="m-4" />
      ) : (
        <ul className="divide-y divide-line" aria-label={t("salesWorkspace.itemsForSale")}>
          {visible.map((product) => {
            const available = availableFor(product.id, inventory);
            const price = retailPriceOf(product, currency);
            const reason = unsellableReason(product, available, currency, t);
            const quantity = cart[product.id] ?? 0;
            const atLimit = quantity >= available;
            return (
              <li key={product.id} className={cn("flex items-center gap-3 px-3 py-2 sm:px-4", reason && "opacity-70")} data-testid="sellable-product-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">{product.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                    <bdi dir="ltr" className="font-mono">{product.sku}</bdi>
                    {reason ? <Badge variant={!price ? "warning" : "danger"}>{reason}</Badge> : <span>{t("salesWorkspace.stockCount", { count: available })}</span>}
                  </p>
                </div>
                <span className="shrink-0 text-[13.5px] font-semibold tabular" dir="ltr">{price ? <MoneyText money={price} hideCurrency /> : "—"}</span>
                <Button type="button" size="sm" variant={quantity > 0 ? "secondary" : "primary"} className="h-11 min-w-11 shrink-0 sm:h-9" onClick={() => onAdd(product)} disabled={Boolean(reason) || atLimit} aria-label={quantity > 0 ? t("salesWorkspace.addAnother", { name: product.name }) : t("salesWorkspace.addProduct", { name: product.name })} title={atLimit && !reason ? t("salesWorkspace.noMoreStock") : undefined}>
                  {quantity > 0 ? <Check /> : <Plus />}
                  <span className="hidden sm:inline">{quantity > 0 ? t("salesWorkspace.inSale", { count: quantity }) : t("common.action.add")}</span>
                  {quantity > 0 ? <span className="sm:hidden">{quantity}</span> : null}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
