"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memberFilterPlan, type MemberFilterNote, type MemberFilterPlan, type MemberListMembershipFilter } from "@/lib/ai/list-filters";
import { useApiMutation } from "@/lib/hooks/use-api";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { useAiErrorText } from "./ai-message";
import { capabilityAvailable, useAiSettings } from "./use-assist";

const MEMBERSHIP_LABEL: Record<MemberListMembershipFilter, TKey> = {
  active: "members.list.filters.membershipActive",
  expiring: "members.list.filters.expiring",
  expired: "members.list.filters.expired",
  frozen: "members.list.filters.frozen",
  outstanding: "members.list.filters.outstanding",
};

function NoteText({ note }: { note: MemberFilterNote }) {
  const { t } = useLocale();
  const { session } = useApp();
  const branchName = (id: string) => session?.branches.find((branch) => branch.id === id)?.name ?? "";
  switch (note.kind) {
    case "expiringWindow": return <>{t("aiWork.filters.expiringWindow", { days: note.days })}</>;
    case "membershipNone": return <>{t("aiWork.filters.membershipNone")}</>;
    case "owesConflict": return <>{t("aiWork.filters.owesConflict")}</>;
    case "notVisited": return <>{t("aiWork.filters.notVisited", { days: note.days })} <Link href="/crm/queues?view=at-risk" className="font-medium text-accent underline underline-offset-4">{t("aiWork.filters.notVisitedLink")}</Link></>;
    case "branchShown": return <>{t("aiWork.filters.branchShown", { branch: branchName(note.branchId) })}</>;
    case "branchSwitch": return <>{t("aiWork.filters.branchSwitch", { branch: branchName(note.branchId) })}</>;
    case "unrecognised": return <>{t("aiWork.filters.unrecognised", { text: note.text })}</>;
  }
}

/**
 * "Describe who you're looking for" above the members list. RIVET reads the
 * request into the list's own filters; the person sees them, applies them,
 * and can change them in the ordinary controls. Nothing is saved.
 */
export function NaturalMemberFilters({ onApply }: { onApply: (filters: { membership?: MemberListMembershipFilter }) => void }) {
  const { session } = useApp();
  const { data: settings } = useAiSettings();
  if (!(session?.permissions ?? []).includes("members.read") || !capabilityAvailable(settings, "nl_filters")) return null;
  return <NaturalMemberFiltersForm onApply={onApply} activeBranchId={session?.activeBranchId} />;
}

function NaturalMemberFiltersForm({ onApply, activeBranchId }: { onApply: (filters: { membership?: MemberListMembershipFilter }) => void; activeBranchId?: string }) {
  const { t } = useLocale();
  const errorText = useAiErrorText();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<MemberFilterPlan | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const interpret = useApiMutation((api, value: string) => api.interpretListFilters({ surface: "members", text: value }), {
    onSuccess: (result) => {
      if (result.ok) { setPlan(memberFilterPlan(result.filters, { activeBranchId })); setFailure(undefined); }
      else { setPlan(undefined); setFailure(errorText(result.reason)); }
    },
  });
  const hasFilter = Boolean(plan?.apply.membership);
  return (
    <section className="panel space-y-2 px-3 py-2.5" aria-labelledby="natural-filters-label" data-testid="natural-filters">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) interpret.mutate(text.trim()); }}>
        <label id="natural-filters-label" htmlFor="natural-filters-input" className="text-[12.5px] font-medium text-ink-2">{t("aiWork.filters.label")}</label>
        <Input id="natural-filters-input" value={text} onChange={(event) => { setText(event.target.value); setPlan(undefined); setFailure(undefined); }} placeholder={t("aiWork.filters.placeholder")} dir="auto" maxLength={300} className="h-9 min-w-0 flex-1 basis-56" data-testid="natural-filters-input" />
        <Button type="submit" size="sm" variant="secondary" loading={interpret.isPending} disabled={!text.trim()} data-testid="natural-filters-interpret">{t("aiWork.filters.interpret")}</Button>
      </form>
      {failure ? <p className="text-[12.5px] text-danger" role="alert">{failure}</p> : null}
      {plan ? (
        <div className="space-y-1.5 text-[12.5px]" role="status" data-testid="natural-filters-plan">
          {hasFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-3">{t("aiWork.filters.understood")}</span>
              <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-medium text-ink" data-testid="natural-filters-membership">{t("aiWork.filters.membership", { status: t(MEMBERSHIP_LABEL[plan.apply.membership!]) })}</span>
              <Button type="button" size="xs" onClick={() => { onApply(plan.apply); setPlan(undefined); setText(""); }} data-testid="natural-filters-apply">{t("aiWork.filters.apply")}</Button>
            </div>
          ) : <p className="text-ink-2">{t("aiWork.filters.nothing")}</p>}
          {plan.notes.map((note, index) => <p key={`note-${index}`} className="text-ink-2"><NoteText note={note} /></p>)}
          {plan.notApplied.length ? (
            <div data-testid="natural-filters-not-applied">
              <p className="text-ink-3">{t("aiWork.filters.notApplied")}</p>
              <ul className="ms-4 list-disc text-ink-2">{plan.notApplied.map((note, index) => <li key={`skip-${index}`}><NoteText note={note} /></li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
