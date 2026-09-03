import { AlertTriangle, Inbox, Lock, SearchX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ERR, isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
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
        "border-line-2 bg-surface/55",
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
  title = "Something went wrong",
  description = "The request could not be completed. Your last loaded data is preserved; try again.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StatePanel
      icon={AlertTriangle}
      title={title}
      description={description}
      className={className}
      role="alert"
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

export function ForbiddenState({
  description = "Your account role does not have permission to view this area.",
  className,
}: {
  description?: string;
  className?: string;
}) {
  return (
    <StatePanel
      icon={Lock}
      title="Not allowed for this role"
      description={description}
      className={className}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
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
}: {
  error: unknown;
  onRetry?: () => void;
  forbiddenDescription?: string;
  notFoundTitle?: string;
  className?: string;
}) {
  if (isApiError(error)) {
    if (error.code === ERR.FORBIDDEN) {
      return <ForbiddenState description={forbiddenDescription ?? error.message} className={className} />;
    }
    if (error.code === ERR.NOT_FOUND) {
      return <NotFoundState title={notFoundTitle ?? "Not found"} description={error.message} className={className} />;
    }
    return <ErrorState description={error.message} onRetry={onRetry} className={className} />;
  }
  return <ErrorState onRetry={onRetry} className={className} />;
}

export function NotFoundState({
  title = "Not found",
  description = "The record you are looking for does not exist — it may have been removed, or the link is wrong.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <StatePanel
      icon={SearchX}
      title={title}
      description={description}
      className={className}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
