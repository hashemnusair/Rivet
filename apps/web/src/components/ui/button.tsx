import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-[var(--tenant-brand-primary)] text-[var(--tenant-brand-primary-foreground)] hover:bg-[var(--tenant-brand-primary-hover)] active:bg-[var(--tenant-brand-primary-hover)]",
        signal: "bg-signal text-white hover:bg-signal-deep active:bg-[#8f171e]",
        secondary: "bg-surface text-ink border border-line-2 hover:border-line-3 hover:bg-sunken/60 active:bg-sunken",
        ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
        danger: "bg-surface text-danger border border-danger/40 hover:bg-danger-bg",
        night: "bg-night-ink text-night hover:bg-white",
        "night-ghost": "text-night-ink-2 hover:bg-night-3 hover:text-night-ink",
        "night-outline": "border border-night-line text-night-ink hover:bg-night-3",
        link: "text-ink underline underline-offset-4 decoration-line-3 hover:decoration-ink px-0",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-sm [&_svg]:size-3.5",
        sm: "h-8 px-3 text-[13px] rounded-md [&_svg]:size-4",
        default: "h-9 px-4 text-[13.5px] rounded-md [&_svg]:size-4",
        lg: "h-11 px-5 text-sm rounded-md [&_svg]:size-[18px]",
        icon: "size-9 rounded-md [&_svg]:size-4",
        "icon-sm": "size-7 rounded-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        data-touch-target
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        data-rivet-button={variant ?? "primary"}
        {...props}
      >
        {/* Slot needs exactly one child, so asChild renders the child untouched. */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
