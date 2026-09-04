"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronUp, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { InventoryBalance, Money } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { toMajor } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { availableFor, retailPriceOf, type CartLine } from "./checkout-model";

export interface CartLinesProps {
  lines: CartLine[];
  inventory: InventoryBalance[];
  currency: string;
  onQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export function CartLines({ lines, inventory, currency, onQuantity, onRemove }: CartLinesProps) {
  if (lines.length === 0) return <EmptyState compact title="Sale is empty" description="Add an item to start." className="m-4" />;
  return (
    <ul className="divide-y divide-line" aria-label="Items in sale">
      {lines.map((line) => {
        const price = retailPriceOf(line.product, currency)!;
        const available = availableFor(line.product.id, inventory);
        return (
          <li key={line.product.id} className="flex items-start gap-3 px-4 py-3" data-testid="cart-line">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{line.product.name}</p>
              <p className="mt-0.5 text-[11px] text-ink-3"><span className="font-mono">{line.product.sku}</span> · <MoneyText money={price} hideCurrency /> each · {available} available</p>
              <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-line-2 p-0.5" role="group" aria-label={`Quantity for ${line.product.name}`}>
                <Button type="button" variant="ghost" size="icon" className="size-10 sm:size-8" onClick={() => (line.quantity > 1 ? onQuantity(line.product.id, line.quantity - 1) : onRemove(line.product.id))} aria-label={`Decrease ${line.product.name}`}><Minus /></Button>
                <span className="min-w-8 text-center font-mono text-[13px]" dir="ltr" aria-live="polite">{line.quantity}</span>
                <Button type="button" variant="ghost" size="icon" className="size-10 sm:size-8" disabled={line.quantity >= available} onClick={() => onQuantity(line.product.id, line.quantity + 1)} aria-label={`Increase ${line.product.name}`}><Plus /></Button>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="font-mono text-[13px] tabular" dir="ltr">{toMajor({ amount: price.amount * line.quantity, currency: price.currency }).toFixed(3)}</span>
              <Button type="button" variant="ghost" size="icon" className="size-10 text-danger hover:text-danger sm:size-8" onClick={() => onRemove(line.product.id)} aria-label={`Remove ${line.product.name}`}><Trash2 /></Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CartTotals({ total, itemCount }: { total: Money; itemCount: number }) {
  return (
    <div className="border-t border-line bg-sunken/30 px-4 py-3">
      <div className="flex items-center justify-between text-[12.5px] text-ink-2"><span>{itemCount} {itemCount === 1 ? "item" : "items"}</span><MoneyText money={total} /></div>
      <div className="mt-1 flex items-center justify-between text-[17px] font-semibold"><span>Total</span><MoneyText money={total} /></div>
    </div>
  );
}

/** Desktop: the sale stays visible beside the product list the whole time. */
export function DesktopCart({ lines, total, children, ...props }: CartLinesProps & { total: Money; children: ReactNode }) {
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);
  return (
    <div className="space-y-4 lg:sticky lg:top-5">
      <section className="panel overflow-hidden" aria-labelledby="cart-heading" data-testid="checkout-cart">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="cart-heading" className="text-[15px] font-semibold">Current sale</h2>
          <Badge variant={lines.length ? "ink" : "outline"}>{itemCount} {itemCount === 1 ? "item" : "items"}</Badge>
        </header>
        <CartLines lines={lines} {...props} />
        <CartTotals total={total} itemCount={itemCount} />
      </section>
      {children}
    </div>
  );
}

/**
 * Phones: a sticky bar shows the running total; tapping it opens a bottom
 * sheet with the lines, customer and payment. Nothing scrolls sideways and
 * every target is at least 44px.
 */
export function MobileCart({ lines, total, open, onOpenChange, children, ...props }: CartLinesProps & { total: Money; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);
  return (
    <>
      <div className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-4px_16px_rgba(16,16,14,0.08)]", open && "hidden")} data-testid="mobile-cart-bar">
        <Button type="button" size="lg" className="flex h-12 w-full items-center justify-between" onClick={() => onOpenChange(true)} disabled={lines.length === 0} aria-label={`Review sale, ${itemCount} items, ${toMajor(total).toFixed(3)} ${total.currency}`}>
          <span className="flex items-center gap-2"><ShoppingBag /> {itemCount === 0 ? "No items yet" : `Review & pay · ${itemCount} ${itemCount === 1 ? "item" : "items"}`}</span>
          <span className="flex items-center gap-1 tabular" dir="ltr">{toMajor(total).toFixed(3)} {total.currency} <ChevronUp /></span>
        </Button>
      </div>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-night/45 data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content
            className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-lg bg-surface pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-dialog outline-none data-[state=open]:animate-fade-up"
            data-testid="mobile-cart-sheet"
            aria-describedby="mobile-cart-description"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
              <DialogPrimitive.Title className="text-[15px] font-semibold">Current sale</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close current sale"><X /></Button>
              </DialogPrimitive.Close>
            </header>
            <DialogPrimitive.Description id="mobile-cart-description" className="sr-only">Review the items, optionally attach a member, choose payment, and complete this sale.</DialogPrimitive.Description>
            <CartLines lines={lines} {...props} />
            <CartTotals total={total} itemCount={itemCount} />
            <div className="space-y-4 p-4">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
