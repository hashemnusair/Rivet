"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { ContextLabel } from "@/components/ui/typography";
import { usePermissions } from "@/lib/providers/app-providers";
import type { Page } from "@/lib/domain/types";

/** Page title block: optional human context + display title + actions. */
export function PageHeader({
  sectionLabel,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  sectionLabel?: string;
  /** @deprecated Migrate callers to sectionLabel, then remove this alias. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const context = sectionLabel ?? eyebrow;
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {context ? <ContextLabel className="mb-1.5">{context}</ContextLabel> : null}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-[13.5px] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden className="text-ink-4">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-ink transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink-2">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Permission gate — usability only; the mock API re-enforces server-side. */
export function Gate({ permission, children, fallback = null }: { permission: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  const { can, canAny } = usePermissions();
  const allowed = Array.isArray(permission) ? canAny(permission) : can(permission);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export function DataPagination<T>({
  page,
  onPage,
  className,
}: {
  page: Page<T>;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (page.totalItems === 0) return null;
  const from = (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.totalItems, page.page * page.pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-3 text-[12.5px] text-ink-3", className)}>
      {/* Ranges and page ratios stay LTR so bidi cannot reverse them. */}
      <span className="tabular" dir="ltr">
        {from}–{to} of {page.totalItems}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon-sm" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 tabular" dir="ltr">
          {page.page} / {page.totalPages}
        </span>
        <Button
          variant="secondary"
          size="icon-sm"
          disabled={page.page >= page.totalPages}
          onClick={() => onPage(page.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Stat block — readable label, tabular figure, optional delta/context line. */
export function Stat({
  label,
  value,
  context,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  tone?: "default" | "danger" | "success" | "warning";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <ContextLabel>{label}</ContextLabel>
      <div
        className={cn(
          "mt-1.5 text-[26px] font-semibold leading-none tabular tracking-[-0.02em]",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success-deep",
          tone === "warning" && "text-warning-deep",
        )}
      >
        {value}
      </div>
      {context ? <div className="mt-1.5 text-[12px] text-ink-3">{context}</div> : null}
    </div>
  );
}
