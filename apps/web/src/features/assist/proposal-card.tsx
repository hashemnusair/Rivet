"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { AI_APPROVE_ALL_MAX, type AiApproveAllResult, type AiProposalView } from "@/lib/ai/contracts";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { knownPermissionCopy } from "@/lib/i18n/permissions";
import { useLocale } from "@/lib/i18n/provider";

const TITLE_KEYS: Record<string, TKey> = { "shift.propose_variance_review": "aiWork.proposal.varianceReview" };

function statusVariant(status: AiProposalView["status"]): "neutral" | "success" | "warning" | "danger" | "outline" {
  if (status === "executed" || status === "approved") return "success";
  if (status === "pending") return "outline";
  if (status === "invalidated" || status === "failed") return "danger";
  return "warning";
}

/**
 * Prepared changes waiting for a person. What is shown is exactly what runs:
 * the approver confirms the stored changeset by its hash, and RIVET itself can
 * never approve. A changed record invalidates the approval on the server.
 */
function ProposalCard({ proposal }: { proposal: AiProposalView }) {
  const { t } = useLocale();
  const format = useFormat();
  const invalidate = useInvalidate();
  const decide = useApiMutation((api, decision: "approve" | "reject") => api.decideAiProposal({ proposalId: proposal.id, decision, changesetHash: proposal.changesetHash }), {
    onSuccess: async (result) => {
      // An invalidated approval is not a success; the card shows why instead.
      if (result.status === "executed") toast.success(t("aiWork.proposal.approvedToast"));
      else if (result.status === "rejected") toast.success(t("aiWork.proposal.rejectedToast"));
      await invalidate([qk.aiProposals({ runId: proposal.runId }), qk.shifts(), qk.aiRun(proposal.runId)]);
    },
  });
  const permission = knownPermissionCopy(t, proposal.requiredPermissionKey)?.label ?? proposal.requiredPermissionKey;
  const pending = proposal.status === "pending";
  return (
    <article className="rounded-md border border-line bg-surface" data-testid="ai-proposal" data-status={proposal.status}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-3 py-2">
        <h3 className="text-[13.5px] font-semibold text-ink">{t(TITLE_KEYS[proposal.capability] ?? "aiWork.proposal.title")}</h3>
        <Badge variant={statusVariant(proposal.status)} data-testid="ai-proposal-status">{t(`aiWork.proposal.status.${proposal.status}` as TKey, { name: proposal.decidedByName ?? "" })}</Badge>
      </header>
      <dl className="space-y-2 px-3 py-2 text-[12.5px]">
        {proposal.changes.map((change) => (
          <div key={change.field}>
            <dt className="text-ink-3">{t(`aiWork.proposal.field.${change.field}` as TKey)}</dt>
            <dd className="mt-0.5 text-ink">
              {change.field === "note"
                ? <span className="block rounded-sm bg-sunken px-2 py-1" dir="ltr" lang="en">{change.to}</span>
                : <>{change.from ? <><span className="text-ink-3 line-through">{t(`aiWork.proposal.value.${change.from}` as TKey)}</span> <span aria-hidden className="text-ink-3 rtl:inline-block rtl:rotate-180">→</span> </> : null}{t(`aiWork.proposal.value.${change.to}` as TKey)}</>}
            </dd>
          </div>
        ))}
      </dl>
      {pending ? (
        <footer className="space-y-2 border-t border-line px-3 py-2">
          <p className="text-[12px] text-ink-3">{t("aiWork.proposal.hint")} · {t("aiWork.proposal.expires", { at: format.dateTime(proposal.expiresAt) })}</p>
          {proposal.allowed.approve ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" loading={decide.isPending && decide.variables === "approve"} disabled={decide.isPending} onClick={() => decide.mutate("approve")} data-testid="ai-proposal-approve">{t("aiWork.proposal.approve")}</Button>
              <Button type="button" size="sm" variant="secondary" loading={decide.isPending && decide.variables === "reject"} disabled={decide.isPending} onClick={() => decide.mutate("reject")} data-testid="ai-proposal-reject">{t("aiWork.proposal.reject")}</Button>
            </div>
          ) : <p className="text-[12px] text-ink-2" data-testid="ai-proposal-no-access">{t("aiWork.proposal.noAccess", { permission })}</p>}
        </footer>
      ) : null}
    </article>
  );
}

/**
 * Several prepared changes in one run, approved in one step. Each is still
 * checked against the current records on the server, one by one, and the
 * result says what happened to each; nothing is reported as saved unless it was.
 */
function ApproveAll({ runId, proposals, onDone }: { runId: string; proposals: AiProposalView[]; onDone: (result: AiApproveAllResult) => void }) {
  const { t } = useLocale();
  const invalidate = useInvalidate();
  const approveAll = useApiMutation((api, _unused: void) => api.approveAiProposals({ runId, proposals: proposals.map((proposal) => ({ proposalId: proposal.id, changesetHash: proposal.changesetHash })) }), {
    onSuccess: async (next) => {
      onDone(next);
      await invalidate([qk.aiProposals({ runId }), qk.shifts(), qk.aiRun(runId)]);
    },
  });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-sunken/40 px-3 py-2" data-testid="ai-proposals-approve-all">
      <Button type="button" size="sm" loading={approveAll.isPending} onClick={() => approveAll.mutate()} data-testid="ai-proposals-approve-all-button">{t("aiWork.proposal.approveAll", { count: proposals.length })}</Button>
      <p className="text-[12px] text-ink-3">{t("aiWork.proposal.approveAllHint")}</p>
    </div>
  );
}

function ApproveAllResult({ result }: { result: AiApproveAllResult }) {
  const { t } = useLocale();
  const notApproved = result.results.filter((item) => item.outcome !== "approved");
  return (
    <div role="status" className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px]" data-testid="ai-proposals-approve-all-result">
      <p className="font-medium text-ink">{t("aiWork.proposal.approveAllResult", { approved: result.approved, total: result.results.length })}</p>
      {notApproved.length ? (
        <ul className="mt-1 space-y-0.5 text-ink-2">
          {notApproved.map((item) => <li key={item.proposalId}>{t(`aiWork.proposal.approveAllOutcome.${item.outcome}` as TKey)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function AiProposals({ runId }: { runId: string }) {
  const { t } = useLocale();
  const [result, setResult] = useState<AiApproveAllResult>();
  const query = useApiQuery(qk.aiProposals({ runId }), (api) => api.listAiProposals({ runId }));
  if (query.isLoading) return <Skeleton className="h-28 w-full" />;
  if (query.isError) return <ErrorState layout="section" onRetry={() => query.refetch()} />;
  const proposals = query.data ?? [];
  if (proposals.length === 0) return null;
  // Grouped approval only when the reader may approve two or more that are still waiting,
  // and never more than the server takes in one step, so the count on the button is what runs.
  const approvable = proposals.filter((proposal) => proposal.status === "pending" && proposal.allowed.approve).slice(0, AI_APPROVE_ALL_MAX);
  return (
    <div className="space-y-2" data-testid="ai-proposals">
      <p className="context-label">{t("aiWork.proposal.title")}</p>
      {approvable.length >= 2 ? <ApproveAll runId={runId} proposals={approvable} onDone={setResult} /> : null}
      {result ? <ApproveAllResult result={result} /> : null}
      {proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
    </div>
  );
}
