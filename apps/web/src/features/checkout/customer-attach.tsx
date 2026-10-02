"use client";
import { useT } from "@/lib/i18n/provider";

import { Check, ChevronDown, Search, UserRound, UserRoundPlus, X } from "lucide-react";
import { useState } from "react";
import { qk } from "@/lib/api/keys";
import type { MemberSummary } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import type { CustomerAttachment } from "./checkout-model";

function MemberSearch({ branchId, onPick, onCancel }: { branchId: string; onPick: (member: MemberSummary) => void; onCancel: () => void }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 220);
  const query = useApiQuery(qk.members({ checkout: true, branchId, search: debounced }), (api) => api.listMembers({ branchId, search: debounced || undefined, status: "active", pageSize: 8, sort: "fullName" }));
  return (
    <div className="space-y-3" data-testid="member-attach">
      <div className="relative">
        <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("salesWorkspace.memberSearchPlaceholder")} className="h-11 ps-8 sm:h-9" aria-label={t("salesWorkspace.searchMember")} />
      </div>
      {query.isLoading ? <div className="space-y-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-12 w-full" />)}</div>
        : query.isError ? <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
          : query.data?.items.length ? (
            <ul className="divide-y divide-line rounded-md border border-line" aria-label={t("salesWorkspace.memberResults")}>
              {query.data.items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-start hover:bg-sunken/50" onClick={() => onPick(item)}>
                    <UserRound className="size-4 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{item.fullName}</span><span className="block font-mono text-[11px] text-ink-3"><bdi dir="ltr">{item.memberNumber}</bdi> · <bdi dir="ltr">{item.phone}</bdi></span></span>
                    <ChevronDown className="size-3.5 -rotate-90 rtl:rotate-90 text-ink-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title={search ? t("salesWorkspace.noActiveMembers") : t("salesWorkspace.searchMember")} description={search ? t("salesWorkspace.tryMemberSearch") : undefined} className="border-0" />}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>{t("salesWorkspace.keepWalkIn")}</Button>
    </div>
  );
}

/**
 * Anonymous by default. A member can be attached so the sale lands on their
 * timeline; receipt details are a secondary path for a guest who wants a
 * name on the paper. Neither creates a profile of any kind.
 */
export function CustomerAttach({ value, onChange, branchId }: { value: CustomerAttachment; onChange: (next: CustomerAttachment) => void; branchId: string }) {
  const t = useT();
  const [searching, setSearching] = useState(false);
  return (
    <section className="panel p-4" aria-labelledby="customer-heading" data-testid="customer-attach">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="customer-heading" className="text-[15px] font-semibold">{t("salesWorkspace.customer")}</h2>
          <p className="text-[12px] text-ink-3">{value.kind === "walk_in" ? t("salesWorkspace.anonymousHint") : value.kind === "member" ? t("salesWorkspace.memberHint") : t("salesWorkspace.guestHint")}</p>
        </div>
        {value.kind === "walk_in" && !searching ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" className="h-11 sm:h-8" onClick={() => setSearching(true)} disabled={!branchId}><UserRound /> {" "}{t("salesWorkspace.chooseMember")}</Button>
            <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-8" onClick={() => onChange({ kind: "guest", fullName: "", phone: "" })}><UserRoundPlus /> {" "}{t("salesWorkspace.addGuest")}</Button>
          </div>
        ) : null}
      </div>
      {value.kind === "walk_in" && searching ? <div className="mt-3"><MemberSearch branchId={branchId} onPick={(member) => { onChange({ kind: "member", member }); setSearching(false); }} onCancel={() => setSearching(false)} /></div> : null}
      {value.kind === "member" ? (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-success/30 bg-success-bg/40 p-3" data-testid="selected-member">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-hidden><Check className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{value.member.fullName}</p><p className="font-mono text-[11px] text-ink-3"><bdi dir="ltr">{value.member.memberNumber}</bdi> · <bdi dir="ltr">{value.member.phone}</bdi></p></div>
          <Button type="button" variant="ghost" size="sm" className="h-11 sm:h-8" onClick={() => onChange({ kind: "walk_in" })} aria-label={t("salesWorkspace.removeMember")}><X />{" "}{t("common.action.remove")}</Button>
        </div>
      ) : null}
      {value.kind === "guest" ? (
        <div className="mt-3 space-y-3" data-testid="receipt-details">
          <FieldGrid className="sm:grid-cols-2">
            <Field label={t("salesWorkspace.guestName")} required><Input value={value.fullName} onChange={(event) => onChange({ ...value, fullName: event.target.value })} placeholder={t("common.label.fullName")} autoComplete="name" className="h-11 sm:h-9" /></Field>
            <Field label={t("memberProfile.whatsapp.phoneNumber")} required hint={t("salesWorkspace.printedOnReceipt")}><Input dir="ltr" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} placeholder="07…" autoComplete="tel" inputMode="tel" className="h-11 sm:h-9" /></Field>
          </FieldGrid>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ kind: "walk_in" })}><X /> {" "}{t("salesWorkspace.removeGuest")}</Button>
        </div>
      ) : null}
    </section>
  );
}
