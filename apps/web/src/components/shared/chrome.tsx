"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/providers/app-providers";
import type { Page } from "@/lib/domain/types";

/** Page title block: eyebrow + display title + actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {description ? <p className="mt-1 text-[13px] text-ink-2 max-w-2xl">{description}</p> : null}
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
  const t = useT();
  if (page.totalItems === 0) return null;
  const from = (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.totalItems, page.page * page.pageSize);
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-3 text-[12.5px] text-ink-3", className)}>
      {/* The range reads in the page's own direction — it is a sentence with a
          word in it. Only the bare from–to pair is pinned LTR so bidi cannot
          reverse the two numbers around the dash. */}
      <span className="tabular">
        {t("common.states.pageRange", {
          range: `\u2066${from}\u2013${to}\u2069`,
          total: page.totalItems,
        })}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon-sm" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)} aria-label={t("common.states.previousPage")}>
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
          aria-label={t("common.states.nextPage")}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** Stat block — label above, mono figure, optional delta/context line. */
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
      <p className="eyebrow">{label}</p>
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
