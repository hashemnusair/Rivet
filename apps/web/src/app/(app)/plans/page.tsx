"use client";
import { useT } from "@/lib/i18n/provider";

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
import { PlanFormDialog } from "@/features/plans/plan-form-dialog";

export default function PlansPage() {
  return <Suspense><PlansWorkspace /></Suspense>;
}

function PlansWorkspace() {
  const t = useT();
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
      toast.success("Plan archived. Memberships already sold on it do not change.");
      await invalidate();
    },
  });

  const branchLabel = (plan: MembershipPlan) =>
    plan.branchAccess === "all"
      ? t("common.label.allBranches")
      : plan.branchIds
          .map((id) => session?.branches.find((b) => b.id === id)?.code ?? "?")
          .join(", ");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Membership plans"
        description="The plans you sell. Changing a plan does not change memberships already sold."
        actions={
          <Gate permission="settings.manage">
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <Plus /> Add plan
            </Button>
          </Gate>
        }
      />

      <div className="flex items-center gap-2" role="group" aria-label="Plan status">
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
            {s}
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
            title={showArchived ? "No archived plans" : "No plans yet"}
            description={showArchived ? "Plans you archive are kept here." : "Add your first plan to start selling memberships."}
            className="border-0"
          />
        ) : (
          <>
          <ul className="divide-y divide-line lg:hidden" aria-label="Membership plans">
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
                <TableHead>Length</TableHead>
                <TableHead className="text-end">{t("renewFlow.adjust.planChange.rowPrice")}</TableHead>
                <TableHead>Branches</TableHead>
                <TableHead className="text-end">Freeze days</TableHead>
                <TableHead className="text-end">{t("crm.lead.membership.ptSessions")}</TableHead>
                <TableHead className="text-end">{t("members.list.activeMembers")}</TableHead>
                <TableHead aria-label={t("common.label.actions")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.items.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <span className="font-medium">{plan.name}</span>
                    <span className="ms-2 font-mono text-[11px] text-ink-3">{plan.code}</span>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">
                    {plan.kind === "time" ? (
                      <span className="tabular">{plan.durationDays} days</span>
                    ) : (
                      <span className="tabular">
                        {plan.visitAllowance} visits{plan.visitValidityDays ? ` in ${plan.visitValidityDays} days` : ""}
                      </span>
                    )}
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
                          aria-label={`Edit ${plan.name}`}
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
                            aria-label={`Archive ${plan.name}`}
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
  const t = useT();
  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink">{plan.name}</p>
          <p className="mt-0.5 font-mono text-[12px] text-ink-3">{plan.code}</p>
        </div>
        <MoneyText money={plan.basePrice} className="text-[13.5px] font-semibold" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
        <div><dt className="text-ink-3">Length</dt><dd className="mt-0.5 tabular">{plan.kind === "time" ? `${plan.durationDays} days` : `${plan.visitAllowance} visits${plan.visitValidityDays ? ` in ${plan.visitValidityDays} days` : ""}`}</dd></div>
        <div><dt className="text-ink-3">Branches</dt><dd className="mt-0.5">{branchLabel}</dd></div>
        <div><dt className="text-ink-3">{t("members.list.activeMembers")}</dt><dd className="mt-0.5 tabular">{plan.activeSubscribers}</dd></div>
        <div><dt className="text-ink-3">Freeze and PT</dt><dd className="mt-0.5 tabular">{plan.freezeAllowanceDays > 0 ? `${plan.freezeAllowanceDays} freeze days` : "No freeze"}{plan.includedPtSessions > 0 ? ` · ${plan.includedPtSessions} PT sessions` : ""}</dd></div>
      </dl>
      <Gate permission="settings.manage">
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="secondary" size="sm" onClick={onEdit}><Pencil />{" "}{t("common.action.edit")}</Button>
          {plan.status === "active" ? <Button variant="ghost" size="sm" onClick={onArchive}><Archive /> Archive</Button> : null}
        </div>
      </Gate>
    </li>
  );
}
