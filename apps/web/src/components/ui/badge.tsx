import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-sunken text-ink-2",
        outline: "border border-line-2 text-ink-2",
        ink: "bg-ink text-paper",
        signal: "bg-signal-bg text-signal-deep",
        success: "bg-success-bg text-success-deep",
        warning: "bg-warning-bg text-warning-deep",
        danger: "bg-danger-bg text-danger",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };
