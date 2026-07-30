"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = forwardRef<
  ComponentRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 5, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[80] max-w-64 rounded-sm bg-night px-2.5 py-1.5 text-xs text-night-ink shadow-pop animate-fade-in",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = "TooltipContent";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-sm bg-sunken-2/70", className)} {...props} />;
}

function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-label="Loading" role="status">
      <div className="flex gap-3 border-b border-line py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 border-b border-line/70 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" style={{ animationDelay: `${(r * cols + c) * 40}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monogram avatar — deterministic ink tint from the name hash.
// ---------------------------------------------------------------------------
const AVATAR_TONES = [
  "bg-[#2b2921] text-[#e8e4d5]",
  "bg-[#3a2e26] text-[#ecdfd2]",
  "bg-[#26322b] text-[#d9e6dc]",
  "bg-[#2e2a38] text-[#e0dbe8]",
  "bg-[#38262a] text-[#ecd9db]",
  "bg-[#243338] text-[#d5e4e8]",
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Monogram({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const tone = AVATAR_TONES[hashString(name) % AVATAR_TONES.length];
  const sizes = {
    xs: "size-6 text-[9px]",
    sm: "size-7 text-[10px]",
    md: "size-9 text-[11.5px]",
    lg: "size-12 text-[15px]",
    xl: "size-16 text-[20px]",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold tracking-wide",
        tone,
        sizes[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Keyboard hint
// ---------------------------------------------------------------------------
function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-2 bg-surface px-1 font-mono text-[10.5px] font-medium text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Skeleton, TableSkeleton, Monogram, Kbd };
