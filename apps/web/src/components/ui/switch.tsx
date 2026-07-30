"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { cn } from "@/lib/utils/cn";

const Switch = forwardRef<
  ComponentRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors data-[state=checked]:bg-ink data-[state=unchecked]:bg-line-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block size-4 rounded-full bg-surface shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5 rtl:data-[state=checked]:-translate-x-4",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

const Checkbox = forwardRef<
  ComponentRef<typeof CheckboxPrimitive.Root>,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-line-3 bg-surface transition-colors data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-paper data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator>
      <svg viewBox="0 0 10 8" className="size-2.5 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
        <path d="M1 4l2.5 2.5L9 1" />
      </svg>
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export { Switch, Checkbox };
