"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { WhatsAppHandoff } from "@/features/crm/whatsapp-handoff";
import type { CollectionItem } from "@/lib/ai/collections";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { useAiErrorText } from "./ai-message";
import { capabilityAvailable, useAiSettings } from "./use-assist";

function CollectionRow({ item }: { item: CollectionItem }) {
  const { t } = useLocale();
  const format = useFormat();
  const { session } = useApp();
  const currency = session?.organization.currency ?? "JOD";
  return (
    <li className="space-y-1.5 py-3 text-[12.5px]" data-testid="collection-call">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/members/${item.memberId}?tab=payments`} className="text-[13px] font-semibold text-ink hover:underline" dir="auto">{item.memberName}</Link>
        <span className="font-semibold text-ink tabular">{t("aiWork.collections.owed", { amount: format.money({ amount: item.outstandingMinor, currency }), count: item.chargeCount })}</span>
      </div>
      <p className="text-ink-2">
        {t("aiWork.collections.overdue", { count: item.daysOverdue })} · {t("aiWork.collections.since", { date: format.date(item.oldestDueDate) })}
        {item.recentlyContacted ? <> <Badge variant="neutral" className="ms-1">{t("aiWork.collections.recentlyContacted")}</Badge></> : null}
      </p>
      <p className="text-ink-3">
        {item.lastPayment
          ? <>{t("aiWork.collections.lastPaid", { amount: format.money({ amount: item.lastPayment.amountMinor, currency }), date: format.date(item.lastPayment.at) })}{item.lastPayment.receiptId ? <> · <Link href={`/payments/receipts/${item.lastPayment.receiptId}`} className="underline underline-offset-2 hover:text-ink">{t("aiWork.collections.receipt", { number: item.lastPayment.receiptNumber ?? "" })}</Link></> : null}</>
          : t("aiWork.collections.noPayment")}
        {item.lastContactAt ? <> · {t("aiWork.collections.lastContact", { at: format.dateTime(item.lastContactAt) })}</> : null}
      </p>
      {item.draft && item.phone ? (
        <div className="flex flex-wrap items-center gap-2">
          <WhatsAppHandoff subject="member" subjectId={item.memberId} recipientName={item.memberName} recipientPreferredLanguage={item.preferredLanguage} phone={item.phone} initialMessage={item.draft.text} />
          <span className="text-[12px] text-ink-3">{t("aiWork.collections.draftReady")}</span>
        </div>
      ) : item.noDraftReason ? <p className="text-[12px] text-ink-3">{t(`aiWork.collections.noDraft.${item.noDraftReason}`)}</p> : null}
    </li>
  );
}

/**
 * "Prepare collection calls" beside the members list's "Owes money" filter.
 * An unsaved list, oldest debt first, with each person's last receipt and
 * contact. RIVET never records a payment or a contact here.
 */
export function CollectionCalls() {
  const { session } = useApp();
  const { data: settings } = useAiSettings();
  const permissions = session?.permissions ?? [];
  if (!permissions.includes("members.read") || !permissions.includes("payments.collect") || !capabilityAvailable(settings, "collections_prep")) return null;
  return <CollectionCallsPanel branchId={session?.activeBranchId} />;
}

function CollectionCallsPanel({ branchId }: { branchId?: string }) {
  const { t } = useLocale();
  const errorText = useAiErrorText();
  const [requested, setRequested] = useState(false);
  const query = useApiQuery(qk.aiCollections({ branchId }), (api) => api.prepareCollections({ ...(branchId ? { branchId } : {}) }), { enabled: requested });
  return (
    <section className="panel px-4 py-3" aria-labelledby="collection-calls-title" data-testid="collection-calls">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="collection-calls-title" className="text-[13.5px] font-semibold">{t("aiWork.collections.title")}</h2>
          <p className="text-[12px] text-ink-3">{t("aiWork.collections.hint")}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" loading={query.isFetching} onClick={() => { if (requested) void query.refetch(); else setRequested(true); }} data-testid="collection-calls-prepare">{t("aiWork.collections.prepare")}</Button>
      </div>
      {!requested ? null : query.isLoading ? <Skeleton className="mt-3 h-24 w-full" /> : query.isError ? <div className="mt-3"><ErrorState layout="section" onRetry={() => query.refetch()} /></div> : query.data && !query.data.available ? (
        <p className="mt-3 text-[12.5px] text-ink-2" role="status">{errorText(query.data.reason)}</p>
      ) : query.data?.available ? (
        <div className="mt-2" role="status">
          {query.data.items.length === 0 ? <p className="text-[12.5px] text-ink-2">{t("aiWork.collections.empty")}</p> : (
            <>
              <p className="text-[12px] text-ink-3">{t("aiWork.collections.considered", { count: query.data.considered })}{query.data.limited ? ` · ${t("aiWork.collections.limited", { count: query.data.items.length })}` : ""}</p>
              <ul className="divide-y divide-line" data-testid="collection-calls-list">{query.data.items.map((item) => <CollectionRow key={item.memberId} item={item} />)}</ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
