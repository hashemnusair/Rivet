"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale, type TFunction, type TKey } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import type { OperatingBrief } from "@/lib/domain/types";

type Brief = Pick<OperatingBrief, "sections" | "attention" | "missing">;
type AttentionLine = OperatingBrief["attention"][number];

/** A section's figure as a count, or undefined when the server did not send it. */
function figure(brief: Brief, section: string, key: string): number | undefined {
  const value = brief.sections?.find((item) => item.key === section)?.figures.find((item) => item.key === key)?.value;
  return value?.kind === "count" ? value.value : undefined;
}

/**
 * The same sentence the server wrote for one line, rebuilt from the counts the
 * brief already carries so it can be shown in the reader's language. Returns
 * undefined for a line kind or count this client does not know, so the caller
 * falls back to the server's own text and old and new servers both work.
 */
export function attentionLineText(t: TFunction, brief: Brief, line: AttentionLine): string | undefined {
  const count = (section: string, key: string) => figure(brief, section, key);
  const say = (message: TKey, n: number | undefined) => (n === undefined || n <= 0 ? undefined : t(message, { count: n }));
  const difference = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined ? undefined : a - b);
  switch (line.key) {
    case "machines-do-not-use": return say("dashboard.needsAttention.line.machinesDoNotUse", count("equipment", "out_of_service"));
    case "cash-differences": return say("dashboard.needsAttention.line.cashDifferences", count("controls", "variances"));
    case "entry-refused": return say("dashboard.needsAttention.line.entryRefused", count("controls", "entry"));
    case "checklists-failed": return say("dashboard.needsAttention.line.checklistsFailed", count("checklists", "failed"));
    case "support-urgent": return say("dashboard.needsAttention.line.supportUrgent", count("support", "urgent"));
    case "approvals": return say("dashboard.needsAttention.line.approvals", count("controls", "approvals"));
    case "unpaid": return say("dashboard.needsAttention.line.unpaid", count("collections", "members"));
    case "renewals-ending": return say("dashboard.needsAttention.line.renewalsEnding", count("renewals", "ending"));
    case "renewals-ended": return say("dashboard.needsAttention.line.renewalsEnded", count("renewals", "expired"));
    case "followups": {
      const late = count("followups", "overdue");
      const dueToday = count("followups", "today");
      if (late === undefined || dueToday === undefined) return undefined;
      if (late > 0) {
        return t("dashboard.needsAttention.line.followupsLate", { count: late }) + (dueToday > 0 ? t("dashboard.needsAttention.line.followupsLateAndToday", { count: dueToday }) : "");
      }
      return say("dashboard.needsAttention.line.followupsToday", dueToday);
    }
    case "at-risk": return say("dashboard.needsAttention.line.atRisk", count("retention", "members"));
    case "machines-open": return say("dashboard.needsAttention.line.machinesOpen", difference(count("equipment", "open"), count("equipment", "out_of_service")));
    case "maintenance": return say("dashboard.needsAttention.line.maintenance", count("facilities", "open"));
    case "checklists-due": return say("dashboard.needsAttention.line.checklistsDue", count("checklists", "due"));
    case "stock": return say("dashboard.needsAttention.line.stock", count("stock", "products"));
    case "support-open": return say("dashboard.needsAttention.line.supportOpen", difference(count("support", "open"), count("support", "urgent")));
    default: return undefined;
  }
}

/** The plain names the server gives unreadable sources, in the reader's language. */
const SOURCE_KEYS: Record<string, TKey> = {
  "today's work": "dashboard.needsAttention.source.queue",
  "ended memberships": "dashboard.needsAttention.source.expired",
  "machine reports": "dashboard.needsAttention.source.equipment",
  "stock levels": "dashboard.needsAttention.source.stock",
  "RIVET support requests": "dashboard.needsAttention.source.support",
};

/**
 * "Needs attention" on the owner and manager dashboards: one plain sentence
 * per kind of unresolved work, each linking to the page where it is done.
 * Every number comes from the server for the viewer's own branches and role.
 * The Today list below it stays the one ordered list of individual tasks.
 *
 * It loads when the dashboard opens and when someone presses Refresh; it does
 * not poll. The cache key includes the viewer, their role and their branches,
 * so a manager with fewer branches never sees an owner's numbers.
 */
export function NeedsAttention({ branchId }: { branchId?: string }) {
  const { session } = useApp();
  const { t, locale, isolateLtr } = useLocale();
  const format = useFormat();
  const viewer = session ? `${session.user.id}:${session.roles[0] ?? ""}:${session.branches.map((branch) => branch.id).join(",")}` : "anonymous";
  const query = useApiQuery(qk.operatingBrief(viewer, branchId), (api) => api.getOperatingBrief(branchId ? { branchId } : {}), { enabled: Boolean(session), staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: false });
  // A server that has not been updated yet still sends the old brief. Show the
  // load error for it instead of crashing or showing a wrong "All clear".
  const brief = Array.isArray(query.data?.attention) ? query.data : undefined;
  const updated = brief ? isolateLtr(format.time(brief.generatedAt)) : undefined;

  return (
    <section className="panel overflow-hidden" aria-labelledby="needs-attention-title" data-testid="needs-attention">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="needs-attention-title" className="text-[15px] font-semibold tracking-[-0.01em]">{t("dashboard.needsAttention.title")}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3" data-testid="needs-attention-scope">
            {brief ? <>{t("dashboard.needsAttention.updated", { time: updated ?? "" })}</> : t("dashboard.needsAttention.checking")}
            {query.isError && brief ? <span className="ms-1 text-warning-deep" data-testid="needs-attention-stale">{t("dashboard.needsAttention.stale", { time: updated ?? "" })}</span> : null}
          </p>
        </div>
        <Button type="button" size="xs" variant="ghost" onClick={() => void query.refetch()} loading={query.isFetching} disabled={query.isFetching} data-testid="needs-attention-refresh">
          <RefreshCw /> {t("common.action.refresh")}
        </Button>
      </header>

      {query.isLoading ? (
        <div className="space-y-2 p-4 sm:px-5" aria-label={t("common.a11y.loading")}>
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : !brief ? (
        <p className="px-4 py-6 text-[13px] text-ink-3 sm:px-5" role="status" data-testid="needs-attention-error">
          {t("dashboard.needsAttention.error")}{" "}
          <Button type="button" size="xs" variant="secondary" className="ms-1" onClick={() => void query.refetch()}>{t("common.action.retry")}</Button>
        </p>
      ) : brief.attention.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-5 text-[13.5px] text-ink-2 sm:px-5" data-testid="needs-attention-clear">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          {t("dashboard.needsAttention.clear")}
        </p>
      ) : (
        <ul className="divide-y divide-line" data-testid="needs-attention-lines">
          {brief.attention.map((line) => (
            <li key={line.key} data-testid="needs-attention-line" data-key={line.key}>
              <Link href={line.href} className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/40 focus-visible:bg-sunken/40 sm:px-5">
                {line.urgent ? <AlertTriangle className="size-4 shrink-0 text-danger" aria-label={t("dashboard.needsAttention.urgent")} /> : <Circle className="size-2 shrink-0 fill-ink-4 text-ink-4" aria-hidden />}
                <span className={line.urgent ? "min-w-0 flex-1 text-[13.5px] font-medium text-ink" : "min-w-0 flex-1 text-[13.5px] text-ink-2"}>{locale === "en" ? line.text : attentionLineText(t, brief, line) ?? line.text}</span>
                {line.money ? <MoneyText money={line.money} className="shrink-0 text-[13px] font-medium text-warning-deep" /> : null}
                <ArrowRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {brief?.missing.length ? (
        <p className="border-t border-line px-4 py-2 text-[12px] text-warning-deep sm:px-5" data-testid="needs-attention-missing">
          {t("dashboard.needsAttention.missing", { list: brief.missing.map((name) => (SOURCE_KEYS[name] ? t(SOURCE_KEYS[name]) : name)).join(t("dashboard.needsAttention.listSeparator")) })}
        </p>
      ) : null}
      {brief?.truncated ? (
        <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3 sm:px-5">{t("dashboard.needsAttention.truncated")}</p>
      ) : null}
    </section>
  );
}
