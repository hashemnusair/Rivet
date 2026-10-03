"use client";
import { useLocale } from "@/lib/i18n/provider";

import { Archive, Pencil, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useReplaceSearchParams } from "@/lib/hooks/use-url-state";
import type { MembershipPlan } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { MoneyText } from "@/components/shared/data-display";
import { Gate, PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { planDurationText } from "@/lib/i18n/member-enrollment";
import { PlanFormDialog } from "@/features/plans/plan-form-dialog";

export default function PlansPage() {
  return <Suspense><PlansWorkspace /></Suspense>;
}

function PlansWorkspace() {
  const { t, locale, isolateLtr } = useLocale();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const params = useSearchParams();
  const replaceParams = useReplaceSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | undefined>(undefined);
  // The archived view is URL-backed so a refresh or Back returns to it.
  const showArchived = params.get("status") === "archived";
  const setShowArchived = (archived: boolean) => replaceParams({ status: archived ? "archived" : undefined });

  const query = useApiQuery(qk.plans({ archived: showArchived }), (api) =>
    api.listPlans({ status: showArchived ? "archived" : "active", pageSize: 50 }),
  );

  const archivePlan = useApiMutation((api, plan: MembershipPlan) => api.updatePlan(plan.id, { status: "archived" }), {
    onSuccess: async () => {
      toast.success(t("memberEnrollment.planArchived"));
      await invalidate();
    },
  });

  const branchLabel = (plan: MembershipPlan) =>
    plan.branchAccess === "all"
      ? t("common.label.allBranches")
      : plan.branchIds
          .map((id) => isolateLtr(session?.branches.find((b) => b.id === id)?.code ?? "?"))
          .join(locale === "ar" ? "، " : ", ");

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("memberEnrollment.plansTitle")}
        description={t("memberEnrollment.plansHint")}
        actions={
          <Gate permission="settings.manage">
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus /> {" "}{t("memberEnrollment.addPlan")}{" "}</Button>
          </Gate>
        }
      />

      <div className="flex items-center gap-2" role="group" aria-label={t("memberEnrollment.planStatus")}>
        {(["active", "archived"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShowArchived(s === "archived")}
            aria-pressed={showArchived === (s === "archived")}
            className={
              (showArchived === (s === "archived")
                ? "border-ink bg-ink text-paper "
                : "border-line-2 bg-surface text-ink-2 hover:border-line-3 ") +
              "rounded-full border px-3 py-1 text-[12px] capitalize transition-colors cursor-pointer"
            }
          >
            {t(s === "active" ? "memberEnrollment.activePlan" : "memberEnrollment.archivedPlan")}
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        {query.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => query.refetch()} />
          </div>
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={showArchived ? t("memberEnrollment.noArchivedPlans") : t("memberEnrollment.noPlans")}
            description={showArchived ? t("memberEnrollment.archivedPlansHint") : t("memberEnrollment.addFirstPlan")}
            className="border-0"
          />
        ) : (
          <>
          <ul className="divide-y divide-line lg:hidden" aria-label={t("memberEnrollment.plansTitle")}>
            {query.data!.items.map((plan) => (
              <PlanCompactRow
                key={plan.id}
                plan={plan}
                branchLabel={branchLabel(plan)}
                onEdit={() => { setEditing(plan); setDialogOpen(true); }}
                onArchive={() => archivePlan.mutate(plan)}
              />
            ))}
          </ul>
          <Table className="hidden lg:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("renewFlow.adjust.planChange.rowPlan")}</TableHead>
                <TableHead>{t("memberEnrollment.length")}</TableHead>
                <TableHead className="text-end">{t("renewFlow.adjust.planChange.rowPrice")}</TableHead>
                <TableHead>{t("memberEnrollment.branches")}</TableHead>
                <TableHead className="text-end">{t("memberEnrollment.freezeDays")}</TableHead>
                <TableHead className="text-end">{t("crm.lead.membership.ptSessions")}</TableHead>
                <TableHead className="text-end">{t("members.list.activeMembers")}</TableHead>
                <TableHead aria-label={t("common.label.actions")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.items.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <span className="font-medium"><bdi>{plan.name}</bdi></span>
                    <span className="ms-2 font-mono text-[11px] text-ink-3"><bdi dir="ltr">{plan.code}</bdi></span>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">
                    <span className="tabular">{planDurationText(t, plan)}</span>
                  </TableCell>
                  <TableCell className="text-end">
                    <MoneyText money={plan.basePrice} />
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{branchLabel(plan)}</TableCell>
                  <TableCell className="text-end text-[12.5px] tabular text-ink-2">
                    {plan.freezeAllowanceDays > 0 ? plan.freezeAllowanceDays : "—"}
                  </TableCell>
                  <TableCell className="text-end text-[12.5px] tabular text-ink-2">
                    {plan.includedPtSessions > 0 ? plan.includedPtSessions : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <Badge variant={plan.activeSubscribers > 0 ? "neutral" : "outline"}>{plan.activeSubscribers}</Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <Gate permission="settings.manage">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("memberEnrollment.editPlan", { name: plan.name })}
                          onClick={() => {
                            setEditing(plan);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        {plan.status === "active" ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("memberEnrollment.archivePlan", { name: plan.name })}
                            onClick={() => archivePlan.mutate(plan)}
                          >
                            <Archive />
                          </Button>
                        ) : null}
                      </div>
                    </Gate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </div>

      <PlanFormDialog open={dialogOpen} onOpenChange={setDialogOpen} plan={editing} />
    </div>
  );
}

function PlanCompactRow({ plan, branchLabel, onEdit, onArchive }: { plan: MembershipPlan; branchLabel: string; onEdit: () => void; onArchive: () => void }) {
  const { t } = useLocale();
  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink"><bdi>{plan.name}</bdi></p>
          <p className="mt-0.5 font-mono text-[12px] text-ink-3"><bdi dir="ltr">{plan.code}</bdi></p>
        </div>
        <MoneyText money={plan.basePrice} className="text-[13.5px] font-semibold" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
        <div><dt className="text-ink-3">{t("memberEnrollment.length")}</dt><dd className="mt-0.5 tabular">{planDurationText(t, plan)}</dd></div>
        <div><dt className="text-ink-3">{t("memberEnrollment.branches")}</dt><dd className="mt-0.5">{branchLabel}</dd></div>
        <div><dt className="text-ink-3">{t("members.list.activeMembers")}</dt><dd className="mt-0.5 tabular">{plan.activeSubscribers}</dd></div>
        <div><dt className="text-ink-3">{t("memberEnrollment.freezePt")}</dt><dd className="mt-0.5 tabular">{plan.freezeAllowanceDays > 0 ? t("memberEnrollment.freezeAllowance", { count: plan.freezeAllowanceDays }) : t("memberEnrollment.noFreeze")}{plan.includedPtSessions > 0 ? ` · ${t("memberEnrollment.ptSessions", { count: plan.includedPtSessions })}` : ""}</dd></div>
      </dl>
      <Gate permission="settings.manage">
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="secondary" size="sm" onClick={onEdit}><Pencil />{" "}{t("common.action.edit")}</Button>
          {plan.status === "active" ? <Button variant="ghost" size="sm" onClick={onArchive}><Archive /> {" "}{t("memberEnrollment.archive")}</Button> : null}
        </div>
      </Gate>
    </li>
  );
}
