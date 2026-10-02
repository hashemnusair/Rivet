"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { tabListClassName, tabTriggerClassName } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";

export interface SegmentedTabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is not plain text. */
  name?: string;
}

/**
 * In-page section tabs for the member portal, drawn with the product's shared
 * tab classes so members see the same hairline underline as the workspace.
 * Arrow keys move the selection so keyboard users are never stuck on the
 * first tab, the selected tab scrolls into view on narrow screens, and every
 * item meets the coarse-pointer target.
 */
export function SegmentedTabs<T extends string>({
  label,
  value,
  onChange,
  items,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<SegmentedTabItem<T>>;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>(`[data-tab-value="${value}"]`);
    if (!list || !selected) return;
    const bounds = list.getBoundingClientRect();
    const active = selected.getBoundingClientRect();
    if (active.left < bounds.left) list.scrollLeft += active.left - bounds.left;
    else if (active.right > bounds.right) list.scrollLeft += active.right - bounds.right;
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab-value="${target.value}"]`)?.focus();
  };

  return (
    <div ref={listRef} role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn(tabListClassName, className)}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={item.name}
            tabIndex={selected ? 0 : -1}
            data-tab-value={item.value}
            onClick={() => onChange(item.value)}
            className={tabTriggerClassName}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
