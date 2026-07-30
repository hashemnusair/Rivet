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
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center border border-dashed border-line-2 rounded-lg bg-surface/60",
        compact ? "px-6 py-8" : "px-6 py-14",
        className,
      )}
      role="status"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-line bg-surface">
        <Icon className="size-4.5 text-ink-3" aria-hidden />
      </div>
      <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-ink-2">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return <StatePanel icon={Inbox} {...props} />;
}

export function ErrorState({
  title = "Something went wrong",
  description = "The request failed. Your demo data is safe — try again, or disable “Fail next request” in demo controls.",
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
  description = "Your current demo role does not have permission to view this area. Switch roles from the user menu to compare experiences.",
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
