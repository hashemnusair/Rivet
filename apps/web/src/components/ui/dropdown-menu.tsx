"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { cn } from "@/lib/utils/cn";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[70] min-w-44 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-pop data-[state=open]:animate-scale-in",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors data-[highlighted]:bg-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-3.5 [&_svg]:text-ink-3",
      destructive && "text-danger data-[highlighted]:bg-danger-bg [&_svg]:text-danger",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuLabel = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
};
