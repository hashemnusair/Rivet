import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type LabelElement = "p" | "span" | "div" | "h2" | "h3" | "dt";

/**
 * Human-facing context for a section or compact data point.
 *
 * Context labels use the product typeface and sentence case. They should add
 * information that the nearby heading does not already communicate.
 */
export function ContextLabel({
  as = "p",
  children,
  className,
  tone = "default",
}: {
  as?: LabelElement;
  children: ReactNode;
  className?: string;
  tone?: "default" | "night";
}) {
  const Component = as as ElementType;
  return (
    <Component
      className={cn(
        "text-[12px] font-medium leading-4",
        tone === "night" ? "text-night-ink-3" : "text-ink-3",
        className,
      )}
      data-rivet-label="context"
    >
      {children}
    </Component>
  );
}

/**
 * Machine-facing metadata such as identifiers, references, and terse codes.
 * This is the only general-purpose product label that uses uppercase mono.
 */
export function TechnicalLabel({
  as = "p",
  children,
  className,
  tone = "default",
}: {
  as?: LabelElement;
  children: ReactNode;
  className?: string;
  tone?: "default" | "night";
}) {
  const Component = as as ElementType;
  return (
    <Component
      className={cn(
        "font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.12em]",
        tone === "night" ? "text-night-ink-3" : "text-ink-3",
        className,
      )}
      data-rivet-label="technical"
    >
      {children}
    </Component>
  );
}
