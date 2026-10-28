"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Check, CircleAlert, RefreshCw, Snowflake, Sun, type LucideIcon } from "lucide-react";
import { getApi } from "@/lib/api/client";
import { localizeApiError } from "@/lib/api/errors";
import { chatActionOpen, type ChatAction, type ChatActionKind, type ChatMoney } from "@/lib/ai/chat/contracts";
import type { Money } from "@/lib/domain/types";
import { useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

const ICONS: Record<ChatActionKind, LucideIcon> = {
  renew_membership: RefreshCw,
  freeze_membership: Snowflake,
  unfreeze_membership: Sun,
};

/** Re-renders once a minute, so a card left open turns stale on its own. */
function subscribeMinute(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
}

function useMinute(): number {
  return useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000), () => 0) * 60_000;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </>
  );
}

/**
 * A change Wazen proposed. Nothing happens until the person presses the
 * confirm button; the server then checks the card is still current and runs
 * the existing operation as them. The card shows what was saved afterwards.
 */
export function ActionCard({ messageId, partId, action, completedAt, onNavigate }: { messageId?: string; partId: string; action: ChatAction; completedAt?: string; onNavigate?: () => void }) {
  const { t, locale, isolate } = useLocale();
  const format = useFormat();
  const invalidate = useInvalidate();
  const now = useMinute();
  const [busy, setBusy] = useState<"confirm" | "dismiss" | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [local, setLocal] = useState<ChatAction | undefined>();
  // The saved card wins once the conversation catches up with the decision.
  const current = local && action.status === "proposed" ? local : action;
  const open = chatActionOpen(current, completedAt, now || Date.now());
  const Icon = ICONS[current.kind];
  const money = (value: ChatMoney) => format.money(value as Money);
  const range = (start?: string, end?: string) => (start && end ? t("askRivet.action.range", { start: format.date(start), end: format.date(end) }) : "");

  const decide = async (decision: "confirm" | "dismiss") => {
    if (!messageId || busy) return;
    setBusy(decision);
    setError(undefined);
    try {
      setLocal(await getApi().decideAiChatAction({ messageId, partId, decision }));
      if (decision === "confirm") void invalidate();
    } catch (caught) {
      setError(localizeApiError(caught, locale).message || t("askRivet.action.failed"));
    } finally {
      setBusy(undefined);
    }
  };

  const done = current.status === "done";
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-surface", done ? "border-line" : "border-line-2")} data-testid="ask-action" data-kind={current.kind} data-status={current.status}>
      <div className="flex items-start gap-3 px-3.5 pb-2 pt-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", done ? "bg-success/10 text-success" : "bg-sunken text-ink-2")}>
          {done ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-5 text-ink">{t(`askRivet.action.${current.kind}.${done ? "done" : "title"}` as TKey)}</p>
          <p className="truncate text-[12.5px] leading-5 text-ink-3"><bdi>{current.memberName}</bdi>{current.planName ? <> · <bdi>{current.planName}</bdi></> : null}</p>
        </div>
      </div>

      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 px-3.5 pb-3 text-[12.5px] leading-5">
        {current.kind === "renew_membership" ? (
          <>
            <Row label={t("askRivet.action.newTerm")}>{done && current.result?.endDate ? range(current.result.startDate ?? current.startDate, current.result.endDate) : range(current.startDate, current.endDate) || t("askRivet.action.startsAfter", { date: format.date(current.basis.endDate) })}</Row>
            {current.price || current.result?.amount ? <Row label={t("askRivet.action.price")}><span className="tabular">{money(current.result?.amount ?? current.price!)}</span></Row> : null}
          </>
        ) : (
          <>
            <Row label={t("askRivet.action.freeze")}>
              {range(current.freezeStart, current.freezeEnd)}
              {current.kind === "freeze_membership" && current.days ? <span className="text-ink-3"> · {t("askRivet.action.days", { count: current.days })}</span> : null}
            </Row>
            {done && current.result?.endDate ? (
              <Row label={t("askRivet.action.endsBefore")}>{format.date(current.result.endDate)}</Row>
            ) : (
              <Row label={t("askRivet.action.endsAfter")}>
                <span className="text-ink-3 line-through decoration-ink-4">{format.date(current.basis.endDate)}</span> <span aria-hidden className="text-ink-3">→</span> {current.newEndDate ? format.date(current.newEndDate) : "—"}
              </Row>
            )}
            {current.reason ? <Row label={t("askRivet.action.reason")}><bdi className="break-words">{current.reason}</bdi></Row> : null}
          </>
        )}
      </dl>

      {current.status === "proposed" && open ? (
        <div className="border-t border-line bg-sunken/40 px-3.5 py-2.5">
          {current.kind === "renew_membership" ? <p className="mb-2 text-[12px] leading-5 text-ink-3">{current.dueNow || !current.startDate ? t("askRivet.action.owed") : t("askRivet.action.owedLater", { date: format.date(current.startDate) })}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void decide("confirm")} loading={busy === "confirm"} disabled={Boolean(busy) || !messageId} data-testid="ask-action-confirm">
              {t(`askRivet.action.${current.kind}.confirm` as TKey)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void decide("dismiss")} disabled={Boolean(busy) || !messageId} data-testid="ask-action-dismiss">
              {t("askRivet.action.notNow")}
            </Button>
            <span className="text-[11.5px] text-ink-3">{t("askRivet.action.hint")}</span>
          </div>
          {error ? (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-5 text-danger" role="alert" data-testid="ask-action-error">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      ) : current.status === "proposed" ? (
        <p className="border-t border-line px-3.5 py-2 text-[12px] text-ink-3" data-testid="ask-action-expired">{t("askRivet.action.expired")}</p>
      ) : current.status === "dismissed" ? (
        <p className="border-t border-line px-3.5 py-2 text-[12px] text-ink-3">{t("askRivet.action.dismissed")}</p>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-line px-3.5 py-2.5">
          {current.kind === "renew_membership" && current.dueNow ? (
            <Link href={`/members/${encodeURIComponent(current.memberId)}?action=collect`} onNavigate={onNavigate} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-2.5 text-[12.5px] font-medium text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" data-testid="ask-action-collect">
              {t("askRivet.action.collect")}
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
            </Link>
          ) : null}
          <Link href={`/members/${encodeURIComponent(current.memberId)}`} onNavigate={onNavigate} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-2 bg-surface px-2.5 text-[12.5px] font-medium text-ink transition-colors hover:border-line-3 focus-visible:outline-2 focus-visible:outline-ink" aria-label={`${t("askRivet.action.openMember")}: ${isolate(current.memberName)}`}>
            {t("askRivet.action.openMember")}
            <ArrowUpRight className="size-3.5 text-ink-3 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
