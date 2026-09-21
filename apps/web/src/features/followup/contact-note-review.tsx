"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import { CONTACT_OUTCOME_LABELS, completedByContactOutcome, type ContactOutcome } from "@/lib/crm/contact-outcomes";
import type { ContactSubjectKind, Task } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { formatDate, todayISODate } from "@/lib/utils/dates";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import { FOLLOWUP_NOTE_MAX_LENGTH, FOLLOWUP_NOTE_MIN_LENGTH, contactNoteCandidates, previewContactConsequences, resolveContactNoteReading, type ContactConsequences } from "../../../convex/followupAssist";

/**
 * Optional review of a typed contact note. Asked for explicitly, it reads the
 * note for the supported outcome it records and previews exactly what
 * logging that outcome would do (stage, next follow-up, open tasks) before
 * the person accepts it. A note about a third party, a contradictory note or
 * an unclear one gets no outcome at all. Accepting sets the outcome field
 * the way a click would; the note and any date or stage the person set stay
 * as typed. Editing the note drops the review: it was about the old text.
 */
export function ContactNoteReview({
  subject,
  subjectId,
  note,
  currentStage,
  selectedOutcome,
  followUpDate,
  followUpTouched,
  stageFor,
  onApply,
}: {
  subject: ContactSubjectKind;
  subjectId: string;
  note: string;
  currentStage?: string;
  selectedOutcome?: ContactOutcome;
  /** The follow-up date currently in the form (YYYY-MM-DD). */
  followUpDate?: string;
  followUpTouched: boolean;
  /** The stage the form would send for an outcome; undefined when the stage would not change. */
  stageFor: (outcome: ContactOutcome) => string | undefined;
  onApply: (outcome: ContactOutcome) => void;
}) {
  const { session } = useApp();
  const trimmed = note.trim().slice(0, FOLLOWUP_NOTE_MAX_LENGTH);
  const tooShort = trimmed.length < FOLLOWUP_NOTE_MIN_LENGTH;
  const idKey = subject === "lead" ? "leadId" : "memberId";
  const suggestion = useAssistJudgment({ questionKey: "followup.contact_outcome", subject: { subject, [idKey]: subjectId, note: trimmed }, auto: false });
  const canReadTasks = (session?.permissions ?? []).includes("crm.read");
  const ready = suggestion.state.status === "ready";
  const tasksQuery = useApiQuery(
    qk.tasks({ [idKey]: subjectId, open: true, surface: "contact-note-review" }),
    (api) => api.listTasks({ status: "open", [idKey]: subjectId, pageSize: 50 }),
    { enabled: ready && canReadTasks, staleTime: 0 },
  );
  const offered = useMemo(() => contactNoteCandidates(subject).map((candidate) => candidate.id), [subject]);
  const timezone = session?.organization.timezone;
  const today = todayISODate(timezone);
  const roles = session?.roles ?? [];
  const canManageTeam = roles.includes("owner") || roles.includes("manager");

  if (!suggestion.featureReady) return null;

  const consequencesFor = (outcome: ContactOutcome): ContactConsequences => {
    const tasks = (tasksQuery.data?.items ?? []).map((task: Task) => ({ id: task.id, type: task.type, status: task.status, ownerId: task.ownerId, ownerName: task.ownerName, memberId: task.memberId, leadId: task.leadId, dueAt: task.dueAt, title: task.title }));
    return previewContactConsequences({
      subject,
      subjectId,
      outcome,
      typedFollowUpDate: followUpDate || undefined,
      followUpTouched,
      today,
      tasks,
      actorId: session?.user.id ?? "",
      canManageTeam,
      isDue: (dueAt) => todayISODate(timezone, new Date(dueAt)) <= today,
      stageAfter: stageFor,
      currentStage,
    });
  };

  const render = (result: AssistReadyResult) => {
    const reading = resolveContactNoteReading(result.judgment, offered);
    const who = subject === "lead" ? "lead" : "member";
    if (reading.kind === "third_party") {
      return <p data-testid="contact-note-third-party">The note describes speaking with someone other than the {who}, so no outcome is suggested: RIVET has no outcome for a conversation with a relative, friend or colleague. Choose what happened yourself and keep what they said in the note.</p>;
    }
    if (reading.kind === "contradictory") return <p data-testid="contact-note-contradictory">The note says things that cannot all be true. Re-read it and choose the outcome yourself; nothing is suggested.</p>;
    if (reading.kind === "unclear") return <p data-testid="contact-note-unclear">The note does not say which outcome happened. Choose it yourself.</p>;
    const consequences = consequencesFor(reading.outcome);
    return (
      <div className="space-y-2">
        <p>
          Reads as <strong>{reading.label}</strong>.
          {selectedOutcome && selectedOutcome !== reading.outcome ? <span className="text-warning-deep"> You chose {CONTACT_OUTCOME_LABELS[selectedOutcome]}; the note reads differently. Keep yours or use the suggestion.</span> : null}
        </p>
        <p className="context-label">If you log {reading.label}</p>
        <ul className="space-y-1 text-[12.5px]" data-testid="contact-note-consequences">
          {consequences.stage ? <li>Stage: {(consequences.stage.from ?? "current").replaceAll("_", " ")} → <strong>{consequences.stage.to.replaceAll("_", " ")}</strong></li> : null}
          {consequences.followUp.kind === "date" ? (
            <li>Next follow-up: <strong>{formatDate(consequences.followUp.date)}</strong> {consequences.followUp.source === "typed" ? "(your date, kept)" : "(suggested; change it in the form)"}</li>
          ) : (
            <li>No next follow-up date{followUpTouched && followUpDate ? "" : ": follow-ups already due close with this outcome"}.</li>
          )}
          {!canReadTasks ? <li className="text-ink-3">Open tasks are not shown for your role.</li> : tasksQuery.isLoading ? <li className="text-ink-3">Checking open tasks…</li> : null}
          {consequences.tasks.map((effect) => (
            <li key={effect.task.id}>
              {effect.effect === "reschedule" ? <>Moves “{effect.task.title}” ({effect.task.ownerName ?? "unassigned"}) to <strong>{formatDate(effect.to)}</strong></> : null}
              {effect.effect === "complete" ? <>Closes “{effect.task.title}” with <strong>{completedByContactOutcome(reading.outcome)}</strong></> : null}
              {effect.effect === "kept" ? <>Leaves “{effect.task.title}” ({effect.task.ownerName ?? "unassigned"}) untouched: {effect.why === "other_owner" ? "owned by someone else" : "due later"}</> : null}
            </li>
          ))}
          {consequences.createsTask ? <li>Creates a follow-up task for you on the next date.</li> : null}
        </ul>
        <p className="text-[11.5px] text-ink-3">Your note, and any date or stage you set yourself, stay exactly as typed.</p>
      </div>
    );
  };

  const actions = (result: AssistReadyResult) => {
    const reading = resolveContactNoteReading(result.judgment, offered);
    if (reading.kind !== "outcome") return <Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>;
    return (
      <>
        <Button type="button" size="sm" onClick={() => { onApply(reading.outcome); suggestion.dismiss(); }} data-testid="contact-note-apply">Use “{reading.label}”</Button>
        <Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Keep my choice</Button>
      </>
    );
  };

  return (
    <div className="space-y-2" data-testid="contact-note-review-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="xs" variant="secondary" onClick={suggestion.request} disabled={tooShort} loading={suggestion.state.status === "loading"} aria-label="Review note">
          <Sparkles /> {ready ? "Review again" : "Review note"}
        </Button>
        {tooShort ? <span className="text-[12px] text-ink-3">Write a few more words to review the note.</span> : null}
      </div>
      <AssistSuggestion suggestion={suggestion} title="What the note records" render={render} actions={actions} testId="contact-note-review" />
    </div>
  );
}
