"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { cn } from "@/lib/utils/cn";
import { useLocale } from "@/lib/i18n/provider";

const RadioGroup = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Root>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, dir, ...props }, ref) => {
  // Radix defaults to left-to-right without a direction provider; follow the
  // reader's language so Arabic options, hints and arrow keys run right to left.
  const { dir: localeDir } = useLocale();
  return <RadioGroupPrimitive.Root ref={ref} dir={dir ?? localeDir} className={cn("grid gap-2", className)} {...props} />;
});
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-3 bg-surface transition-colors data-[state=checked]:border-ink data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-ink" />
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = "RadioGroupItem";

/** Card-style radio option used in payment method / role pickers. */
const RadioCard = forwardRef<
  ComponentRef<typeof RadioGroupPrimitive.Item>,
  ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "cursor-pointer rounded-md border border-line-2 bg-surface px-3 py-2.5 text-start transition-colors hover:border-line-3 data-[state=checked]:border-ink data-[state=checked]:bg-sunken/50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </RadioGroupPrimitive.Item>
));
RadioCard.displayName = "RadioCard";

export { RadioGroup, RadioGroupItem, RadioCard };
