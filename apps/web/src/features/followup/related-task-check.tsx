"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RelativeText } from "@/components/shared/data-display";
import { qk } from "@/lib/api/keys";
import type { ContactSubjectKind, FollowUpRelatedTask, Task } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";

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
 * Open work for a task that is about to be created. The current records are
 * shown verbatim so staff can choose what to do. A follow-on link is allowed
 * only when the selected task is still open with the same owner and due date.
 * Nothing is closed, merged, moved, or inferred automatically.
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
  const [stale, setStale] = useState<string>();

  const verifyUnchanged = async (task: FollowUpRelatedTask): Promise<FollowUpRelatedTask | undefined> => {
    const fresh = await tasksQuery.refetch();
    const latest = (fresh.data?.items ?? []).find((candidate) => candidate.id === task.id);
    if (!latest || latest.status !== "open" || latest.ownerId !== task.ownerId || latest.dueAt !== task.dueAt) {
      setStale(`“${task.title}” has changed (owner, date or status). Check the open tasks again.`);
      return undefined;
    }
    return toRelated(latest, session?.user.id);
  };

  return (
    <div className="space-y-2" data-testid="related-work">
      {tasks.length > 0 ? (
        <div className="rounded-md border border-line bg-sunken/40 px-3 py-2">
          <p className="context-label">Open tasks for {personName}</p>
          <p className="mt-1 text-[12px] text-ink-3">New task: {draft.title.trim() || "Untitled task"}</p>
          <ul className="mt-2 space-y-2 text-[12.5px]">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-md border border-line-2 px-2 py-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{task.title}</span>
                  <span className="text-ink-3">{task.ownerName} · due <RelativeText iso={task.dueAt} /></span>
                  {task.relatedTaskTitle ? <span className="text-ink-3">· after “{task.relatedTaskTitle}”</span> : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button type="button" size="xs" variant="secondary" onClick={() => onKeepExisting(task)} disabled={pending}>Keep the existing task</Button>
                  <Button type="button" size="xs" onClick={() => { setStale(undefined); void verifyUnchanged(task).then((verified) => { if (verified) onLinkAndCreate(verified); }); }} loading={pending} data-testid="related-task-link">Create as next step</Button>
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" size="xs" variant="ghost" className="mt-2" onClick={onCreateSeparately} disabled={pending}>Create separately</Button>
        </div>
      ) : tasksQuery.isLoading ? null : (
        <>
          <p className="text-[12px] text-ink-3">No open tasks for {personName}.</p>
          <Button type="button" size="xs" variant="secondary" onClick={onCreateSeparately} loading={pending}>Create task</Button>
        </>
      )}
      {stale ? <p role="status" className="text-[12.5px] text-warning-deep" data-testid="related-task-stale">{stale}</p> : null}
    </div>
  );
}
