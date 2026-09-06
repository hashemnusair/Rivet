import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The one content frame for every console page: the workspace padding and a
 * shared content ceiling, so no platform surface sits flush against the shell.
 */
export function PlatformPage({ children, className, narrow = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { children: ReactNode; className?: string; narrow?: boolean }) {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className={cn("mx-auto", narrow ? "max-w-[1180px]" : "max-w-[1480px]", className)} {...props}>{children}</div>
    </div>
  );
}

/** A white panel with the product hairline and radius; no resting shadow. */
export function PlatformPanel({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)} {...props}>
      {children}
    </section>
  );
}

/** Panel header: one title, optional description, optional actions on the end side. */
export function PlatformPanelHeader({ title, description, actions, id, className }: { title: string; description?: string; actions?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold leading-snug text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Pressed-state pills for one-click filters, the same shape the reports scope
 * bar uses. The group carries the label; each pill announces its own state.
 */
export function FilterPills<T extends string>({ label, value, items, onChange, className, disabled = false }: {
  label: string;
  value: T;
  items: ReadonlyArray<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(item.value)}
            data-touch-target
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
              active ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-ink-3 hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined ? <>{" "}<span className={cn("tabular text-[11.5px]", active ? "text-paper/75" : "text-ink-3")}>{item.count}</span></> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A quiet, inline notice for stale data: last-known content stays on screen. */
export function StaleNotice({ children, onRetry, retrying = false }: { children: ReactNode; onRetry?: () => void; retrying?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-2.5 text-[12.5px] text-warning-deep" role="status" aria-live="polite">
      <span>{children}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} disabled={retrying} className="font-medium underline underline-offset-4 disabled:opacity-60" data-touch-target>
          {retrying ? "Retrying…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
