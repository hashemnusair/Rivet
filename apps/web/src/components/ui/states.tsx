"use client";

import { AlertTriangle, Inbox, Lock, SearchX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ERR, isApiError, localizeApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { useT, useLocale } from "@/lib/i18n/provider";
import { Button } from "./button";

/**
 * Shared empty / error / forbidden / not-found surfaces.
 * One restrained composition used across every route.
 */
export function StatePanel({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
  layout,
  role = "status",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** @deprecated Prefer an explicit layout. */
  compact?: boolean;
  layout?: "inline" | "section" | "page";
  role?: "status" | "alert";
}) {
  const resolvedLayout = layout ?? (compact ? "section" : "page");
  return (
    <div
      className={cn(
        "relative border-line-2 bg-surface/55",
        resolvedLayout === "inline" && "flex items-start gap-3 border-y px-3 py-3 text-start",
        resolvedLayout === "section" && "flex items-start gap-3 rounded-md border border-dashed px-4 py-4 text-start",
        resolvedLayout === "page" && "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center",
        className,
      )}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      data-state-layout={resolvedLayout}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-line bg-surface",
          resolvedLayout === "page" ? "mb-3 size-10" : "size-8",
        )}
      >
        <Icon className="size-4.5 text-ink-3" aria-hidden />
      </div>
      <div className={cn("min-w-0", resolvedLayout === "page" && "flex flex-col items-center")}>
        <h3 className="font-display text-[14px] font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-1 max-w-md text-[13px] leading-relaxed text-ink-2">{description}</p> : null}
        {action ? <div className={resolvedLayout === "inline" ? "mt-2" : "mt-3"}>{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState(props: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  layout?: "inline" | "section" | "page";
  className?: string;
}) {
  return <StatePanel icon={Inbox} {...props} />;
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
  layout,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  layout?: "inline" | "section" | "page";
}) {
  const t = useT();
  return (
    <StatePanel
      icon={AlertTriangle}
      title={title ?? t("common.states.errorTitle")}
      description={description ?? t("common.states.errorDescription")}
      className={className}
      layout={layout}
      role="alert"
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("common.action.retry")}
          </Button>
        ) : undefined
      }
    />
  );
}

export function ForbiddenState({
  description,
  className,
  layout,
}: {
  description?: string;
  className?: string;
  layout?: "inline" | "section" | "page";
}) {
  const t = useT();
  return (
    <StatePanel
      icon={Lock}
      title={t("common.states.forbiddenTitle")}
      description={description ?? t("common.states.forbiddenDescription")}
      className={className}
      layout={layout}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard">{t("common.states.backToDashboard")}</Link>
        </Button>
      }
    />
  );
}

/**
 * Picks the right surface for a failed query: a permission wall, a missing
 * record, or a retryable failure. Keeps every route honest about *why* it is
 * empty instead of showing one generic error.
 */
export function QueryErrorState({
  error,
  onRetry,
  forbiddenDescription,
  notFoundTitle,
  className,
  layout,
}: {
  error: unknown;
  onRetry?: () => void;
  forbiddenDescription?: string;
  notFoundTitle?: string;
  className?: string;
  layout?: "inline" | "section" | "page";
}) {
  const { t, locale } = useLocale();
  const presented = localizeApiError(error, locale);
  if (isApiError(error)) {
    if (error.code === ERR.FORBIDDEN) {
      return <ForbiddenState description={forbiddenDescription ?? presented.message} className={className} layout={layout} />;
    }
    if (error.code === ERR.NOT_FOUND) {
      return <NotFoundState title={notFoundTitle ?? t("common.states.notFoundTitle")} description={presented.message} className={className} layout={layout} />;
    }
    return <ErrorState description={presented.message} onRetry={onRetry} className={className} layout={layout} />;
  }
  return <ErrorState onRetry={onRetry} className={className} layout={layout} />;
}

export function NotFoundState({
  title,
  description,
  className,
  layout,
}: {
  title?: string;
  description?: string;
  className?: string;
  layout?: "inline" | "section" | "page";
}) {
  const t = useT();
  return (
    <StatePanel
      icon={SearchX}
      title={title ?? t("common.states.notFoundTitle")}
      description={description ?? t("common.states.notFoundDescription")}
      className={className}
      layout={layout}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard">{t("common.states.backToDashboard")}</Link>
        </Button>
      }
    />
  );
}
