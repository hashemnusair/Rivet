"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RelativeText } from "@/components/shared/data-display";
import { qk } from "@/lib/api/keys";
import type { ContactSubjectKind, FollowUpRelatedTask, Task } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import { TASK_TYPE_LABELS, resolveRelatedTaskReading } from "../../../convex/followupAssist";

export interface RelatedTaskDraftInput {
  type: string;
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
  ownerName?: string;
}

function toRelated(task: Task, me: string | undefined): FollowUpRelatedTask {
  return { id: task.id, type: task.type, title: task.title, ownerId: task.ownerId, ownerName: task.ownerName, dueAt: task.dueAt, priority: task.priority, status: task.status, mine: !task.ownerId || task.ownerId === me, createdById: task.createdById, relatedTaskId: task.relatedTaskId, relatedTaskTitle: task.relatedTaskTitle };
}

/**
 * Related work for a task that is about to be created. The person's open
 * tasks are always listed (no model involved); on request Jev points at the
 * one that already covers the same work, or at none. The only ways forward
 * are explicit: keep the existing task, create the new one as a follow-on
 * linked to it, or create it separately. Nothing is closed, merged or moved,
 * and a task that changed hands or date since the suggestion is not linked.
 */
export function RelatedTaskCheck({
  subject,
  subjectId,
  personName,
  draft,
  onKeepExisting,
  onLinkAndCreate,
  onCreateSeparately,
  pending,
}: {
  subject: ContactSubjectKind;
  subjectId: string;
  personName: string;
  draft: RelatedTaskDraftInput;
  onKeepExisting: (task: FollowUpRelatedTask) => void;
  onLinkAndCreate: (task: FollowUpRelatedTask) => void;
  onCreateSeparately: () => void;
  pending?: boolean;
}) {
  const { session } = useApp();
  const idKey = subject === "lead" ? "leadId" : "memberId";
  const tasksQuery = useApiQuery(
    qk.tasks({ [idKey]: subjectId, open: true, surface: "related-task-check" }),
    (api) => api.listTasks({ status: "open", [idKey]: subjectId, pageSize: 50 }),
    { staleTime: 0 },
  );
  const tasks = (tasksQuery.data?.items ?? []).map((task) => toRelated(task, session?.user.id));
  const title = draft.title.trim();
  const suggestion = useAssistJudgment({
    questionKey: "followup.related_task",
    subject: { subject, [idKey]: subjectId, type: draft.type, title: title.slice(0, 200), dueDate: draft.dueDate, ...(draft.ownerName ? { ownerName: draft.ownerName } : {}) },
    auto: false,
  });
  // What the suggestion was judged against: the card reads that list, and a task that changes hands, date or status afterwards is not the one Jev saw.
  const [judged, setJudged] = useState<FollowUpRelatedTask[]>([]);
  const [stale, setStale] = useState<string>();
  useEffect(() => {
    if (suggestion.state.status === "ready") setJudged(tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion.state.status]);

  const canAsk = title.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate) && tasks.length > 0;

  const verifyUnchanged = async (task: FollowUpRelatedTask): Promise<FollowUpRelatedTask | undefined> => {
    const fresh = await tasksQuery.refetch();
    const latest = (fresh.data?.items ?? []).find((candidate) => candidate.id === task.id);
    const seen = judged.find((candidate) => candidate.id === task.id);
    if (!latest || latest.status !== "open" || !seen || latest.ownerId !== seen.ownerId || latest.dueAt !== seen.dueAt) {
      setStale(`“${task.title}” changed since the suggestion (owner, date or status). Check for related work again.`);
      suggestion.dismiss();
      return undefined;
    }
    return toRelated(latest, session?.user.id);
  };

  const render = (result: AssistReadyResult) => {
    const reading = resolveRelatedTaskReading(result.judgment, judged);
    if (reading.kind === "none") return <p data-testid="related-task-none">No open task covers this work. Creating it adds separate work for {personName}.</p>;
    const task = reading.task;
    return (
      <div data-testid="related-task-match">
        <p>This looks like the same work as <strong>“{task.title}”</strong> ({TASK_TYPE_LABELS[task.type] ?? task.type}, owner {task.ownerName}, due <RelativeText iso={task.dueAt} />).</p>
        <p className="mt-1 text-[12px] text-ink-3">Nothing changes by itself: keep that task, create this one as a follow-on linked to it, or create it separately.</p>
      </div>
    );
  };

  const actions = (result: AssistReadyResult) => {
    const reading = resolveRelatedTaskReading(result.judgment, judged);
    if (reading.kind === "none") return <Button type="button" size="sm" onClick={onCreateSeparately} loading={pending}>Create task</Button>;
    const task = reading.task;
    return (
      <>
        <Button type="button" size="sm" variant="secondary" onClick={() => onKeepExisting(task)} disabled={pending}>Keep the existing task</Button>
        <Button type="button" size="sm" onClick={() => { void verifyUnchanged(task).then((verified) => { if (verified) onLinkAndCreate(verified); }); }} loading={pending} data-testid="related-task-link">Create as follow-on</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCreateSeparately} disabled={pending}>Create separately</Button>
      </>
    );
  };

  return (
    <div className="space-y-2" data-testid="related-work">
      {tasks.length > 0 ? (
        <div className="rounded-md border border-line bg-sunken/40 px-3 py-2">
          <p className="context-label">Open work for {personName}</p>
          <ul className="mt-1 space-y-1 text-[12.5px]">
            {tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{task.title}</span>
                <span className="text-ink-3">{task.ownerName} · due <RelativeText iso={task.dueAt} /></span>
                {task.relatedTaskTitle ? <span className="text-ink-3">· follow-on to “{task.relatedTaskTitle}”</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : tasksQuery.isLoading ? null : <p className="text-[12px] text-ink-3">No open work for {personName}.</p>}
      {suggestion.featureReady && tasks.length > 0 ? (
        <Button type="button" size="xs" variant="secondary" onClick={() => { setStale(undefined); suggestion.request(); }} disabled={!canAsk} loading={suggestion.state.status === "loading"} aria-label="Check for related work">
          <Sparkles /> {suggestion.state.status === "ready" ? "Check again" : "Is this the same work?"}
        </Button>
      ) : null}
      {stale ? <p role="status" className="text-[12.5px] text-warning-deep" data-testid="related-task-stale">{stale}</p> : null}
      <AssistSuggestion suggestion={suggestion} title="Related open task" render={render} actions={actions} testId="related-task-card" />
    </div>
  );
}
