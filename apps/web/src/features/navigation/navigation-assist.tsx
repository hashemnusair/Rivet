"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { qk } from "@/lib/api/keys";
import type { OnboardingTaskState } from "@/lib/domain/qol";
import type { Session } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import {
  NAVIGATION_QUERY_MAX_LENGTH,
  permittedClarifications,
  permittedNavigationEntries,
  reportEntries,
  resolveNavigationIntent,
  type NavigationAccess,
  type NavigationEntry,
  type NavigationIntentOutcome,
} from "../../../convex/navigationCatalogue";

/**
 * Intent-aware navigation surfaces. The catalogue is filtered with the
 * session on the page and again with the actor on the server; a suggestion
 * only ever opens a place the person could have reached by hand, and opening
 * a form never submits it.
 */
export function navigationAccessFromSession(session: Pick<Session, "permissions" | "roles" | "workspace"> | undefined): NavigationAccess {
  return {
    permissions: session?.permissions ?? [],
    role: session?.roles[0],
    modules: session?.workspace?.modules.map((module) => ({ key: module.key, entitled: module.entitled, enabled: module.enabled })),
  };
}

export function useNavigationAssist(enabled = true): { ready: boolean } {
  const statusQuery = useApiQuery(qk.assistStatus, (api) => api.getAssistStatus(), { enabled, staleTime: 60_000, refetchOnWindowFocus: false });
  const feature = statusQuery.data?.features.find((candidate) => candidate.key === "navigation");
  return { ready: enabled && Boolean(feature?.ready) };
}

/** The outcome of an intent judgment, re-checked against what this session may open. */
export function intentOutcomeForSession(result: AssistReadyResult, session: Pick<Session, "permissions" | "roles" | "workspace"> | undefined): NavigationIntentOutcome {
  const entries = permittedNavigationEntries(navigationAccessFromSession(session));
  return resolveNavigationIntent(result.judgment, entries, permittedClarifications(entries));
}

const KIND_LABEL: Record<NavigationEntry["kind"], string> = { destination: "Page", report: "Report", form: "Form", settings: "Setting" };

export function NavigationEntryLine({ entry }: { entry: NavigationEntry }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-medium text-ink">{entry.label}</span>
      <Badge variant="outline">{KIND_LABEL[entry.kind]}</Badge>
      {entry.opensForm ? <span className="text-[11.5px] text-ink-3">opens a form, submits nothing</span> : null}
    </span>
  );
}

/**
 * Suggested next setup step. Every step stays on the checklist below; this
 * only lifts one of the open steps, with the same link the list already has.
 */
export function OnboardingNextStep({ audience, tasks }: { audience: "owner" | "staff"; tasks: OnboardingTaskState[] }) {
  const assist = useNavigationAssist();
  const open = tasks.filter((task) => !task.complete && !task.unavailableReason);
  const suggestion = useAssistJudgment({ questionKey: "navigation.next_step", subject: { audience }, enabled: assist.ready && open.length > 1 });
  if (!assist.ready || open.length <= 1) return null;
  return (
    <AssistSuggestion
      suggestion={suggestion}
      title="Suggested next step"
      testId="onboarding-next-step"
      render={(result) => {
        const choice = result.judgment.kind === "choice" ? result.judgment.choice : "";
        const task = open.find((candidate) => candidate.key === choice);
        if (!task) return <p>No single step stands out. Work through the required steps in order.</p>;
        return <p><span className="font-medium text-ink">{task.title}</span> <span className="text-ink-3">· {task.category}</span><br />{task.description}</p>;
      }}
      actions={(result) => {
        const choice = result.judgment.kind === "choice" ? result.judgment.choice : "";
        const task = open.find((candidate) => candidate.key === choice);
        return task ? <Button asChild size="sm"><Link href={task.href}><ArrowRight /> Open step</Link></Button> : null;
      }}
    />
  );
}

/**
 * "Which report answers this?" on the Reports page. The answer is a view; the
 * dates and branch stay whatever the page's scope bar says.
 */
export function ReportFinder({ session, hrefForView }: { session: Session | undefined; hrefForView: (href: string) => string }) {
  const assist = useNavigationAssist();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const suggestion = useAssistJudgment({ questionKey: "navigation.report_view", subject: { question }, enabled: Boolean(question), auto: true });
  if (!assist.ready) return null;
  const reports = reportEntries(permittedNavigationEntries(navigationAccessFromSession(session)));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim().slice(0, NAVIGATION_QUERY_MAX_LENGTH);
    if (next.length < 2) return;
    if (next === question) suggestion.request();
    else setQuestion(next);
  };
  return (
    <section className="space-y-2" aria-label="Find a report" data-testid="report-finder">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask which report answers a question, for example “who is about to leave?”" aria-label="Question for the reports" maxLength={NAVIGATION_QUERY_MAX_LENGTH} className="sm:max-w-xl" />
        <Button type="submit" variant="secondary" loading={suggestion.state.status === "loading"} disabled={draft.trim().length < 2}><Sparkles /> Find report</Button>
      </form>
      <AssistSuggestion
        suggestion={suggestion}
        title="Report for your question"
        testId="report-finder-card"
        render={(result) => {
          const choice = result.judgment.kind === "choice" ? result.judgment.choice : "";
          const entry = reports.find((candidate) => candidate.id === choice);
          if (!entry) return <p>No report view answers that directly. The views below each answer one operating question.</p>;
          return <p><span className="font-medium text-ink">{entry.label}</span><br />{entry.description} <span className="text-ink-3">Dates and branch stay as set above.</span></p>;
        }}
        actions={(result) => {
          const choice = result.judgment.kind === "choice" ? result.judgment.choice : "";
          const entry = reports.find((candidate) => candidate.id === choice);
          return entry ? <Button asChild size="sm"><Link href={hrefForView(entry.href)}><ArrowRight /> Open {entry.label}</Link></Button> : null;
        }}
      />
    </section>
  );
}
