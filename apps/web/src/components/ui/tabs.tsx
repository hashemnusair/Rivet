"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { cn } from "@/lib/utils/cn";

const Tabs = TabsPrimitive.Root;

export const tabListClassName = "flex min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto border-b border-line-3";
export const tabTriggerClassName = "relative inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2 py-3 text-[13.5px] font-semibold text-ink-2 transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink aria-selected:border-ink aria-selected:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink aria-pressed:border-ink aria-pressed:text-ink cursor-pointer sm:px-4";

const TabsList = forwardRef<
  ComponentRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const listRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => listRef.current!);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const revealSelection = () => {
      const selected = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!selected) return;
      const bounds = list.getBoundingClientRect();
      const active = selected.getBoundingClientRect();
      if (active.left < bounds.left) list.scrollLeft += active.left - bounds.left;
      else if (active.right > bounds.right) list.scrollLeft += active.right - bounds.right;
    };
    revealSelection();
    window.addEventListener("resize", revealSelection);
    const observer = new MutationObserver(revealSelection);
    observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", revealSelection);
    };
  }, []);
  return <TabsPrimitive.List ref={listRef} className={cn(tabListClassName, className)} {...props} />;
});
TabsList.displayName = "TabsList";

const TabsTrigger = forwardRef<
  ComponentRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      tabTriggerClassName,
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = forwardRef<
  ComponentRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4 outline-none", className)} {...props} />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
