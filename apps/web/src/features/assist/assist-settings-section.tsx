"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { AssistSimulation, AssistStatus } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { SettingsPanel, SettingsSaveBar, SettingsSection, SettingsToggleRow } from "@/features/settings/settings-layout";
import { FOUNDATION_QUESTIONS } from "../../../convex/jevQuestionsFoundation";
import { AssistSuggestion, JudgmentSummary } from "./assist-suggestion";
import { useAssistJudgment } from "./use-assist-judgment";

const DESCRIPTION = "Jev answers bounded yes/no, pick-one and rating questions about a record so RIVET can suggest a next step. It never writes text or changes anything; people decide, and every action keeps its normal permission check.";

const MODE_LABELS: Record<AssistStatus["mode"], string> = { off: "Off", fixture: "Preview answers", live: "Live" };
const MODE_HINTS: Record<AssistStatus["mode"], string> = {
  off: "No question is asked anywhere. Suggestion surfaces stay hidden.",
  fixture: "Answers come from the built-in synthetic fixtures; nothing is sent outside RIVET.",
  live: "Questions go to Jev through Vercel AI Gateway, within the caps below.",
};
const FREE_TERMS_LABELS: Record<AssistStatus["freeTerms"], string> = {
  confirmed: "Free terms confirmed",
  unconfirmed: "Free terms not confirmed",
  expired: "Free period ended",
  invalid: "Free-terms date invalid",
};
const KIND_LABELS = { choice: "Pick one", score: "Rating", boolean: "Yes / no" } as const;
const SIMULATIONS: Array<{ value: "none" | AssistSimulation; label: string }> = [
  { value: "none", label: "Normal answer" },
  { value: "invalid_output", label: "Simulate an unusable answer" },
  { value: "timeout", label: "Simulate a timeout" },
  { value: "provider_error", label: "Simulate a provider error" },
];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function AssistSettingsSection() {
  const invalidate = useInvalidate();
  const statusQuery = useApiQuery(qk.assistStatus, (api) => api.getAssistStatus());
  const status = statusQuery.data;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const persisted = status?.tenant.enabled;
  const dirty = enabled !== null && persisted !== undefined && enabled !== persisted;
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    // A background refetch must not overwrite an edit the person has not saved yet.
    if (persisted === undefined || dirtyRef.current) return;
    setEnabled(persisted);
  }, [persisted]);

  const save = useApiMutation((api, input: { enabled: boolean; reason: string }) => api.updateAssistPreference({ enabled: input.enabled, reason: input.reason || undefined }), {
    onSuccess: async (next) => {
      toast.success(next.tenant.enabled ? "Jev suggestions are on for this gym." : "Jev suggestions are off for this gym.");
      setReason("");
      await invalidate([qk.assistStatus]);
    },
  });

  if (statusQuery.isError) return <SettingsSection title="Jev assistance" description={DESCRIPTION}><ErrorState layout="section" title="Jev status could not be loaded" onRetry={() => statusQuery.refetch()} /></SettingsSection>;
  if (!status || enabled === null) return <SettingsSection title="Jev assistance" description={DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;

  const readiness = [
    { label: status.keyConfigured ? "Gateway key configured" : "Gateway key missing", variant: status.keyConfigured ? "success" : "outline" },
    { label: status.freeUntil ? `${FREE_TERMS_LABELS[status.freeTerms]} · until ${status.freeUntil}` : FREE_TERMS_LABELS[status.freeTerms], variant: status.freeTerms === "confirmed" ? "success" : "warning" },
    { label: status.breaker.tripped ? "Cost breaker tripped" : "Cost breaker clear", variant: status.breaker.tripped ? "danger" : "success" },
    { label: `Model ${status.modelId}`, variant: "neutral" },
  ] as const;

  return (
    <SettingsSection title="Jev assistance" description={DESCRIPTION} testId="assist-settings">
      <SettingsPanel title="RIVET-wide status" description="Set by RIVET for the whole platform. This gym's own switch below applies on top." bodyClassName="px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-ink-2" data-testid="assist-mode">
          <span className="text-ink-3">Mode</span>
          <Badge variant={status.mode === "live" ? "success" : status.mode === "off" ? "neutral" : "warning"} dot>{MODE_LABELS[status.mode]}</Badge>
          <span className="text-ink-3">{MODE_HINTS[status.mode]}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {readiness.map((item) => <Badge key={item.label} variant={item.variant} dot>{item.label}</Badge>)}
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Requests today, this gym</dt><dd className="tabular text-ink">{status.usage.tenantRequests} of {status.usage.tenantDailyCap}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-ink-3">Requests today, all gyms</dt><dd className="tabular text-ink">{status.usage.globalRequests} of {status.usage.globalDailyCap}</dd></div>
        </dl>
        {status.breaker.tripped && status.breaker.reason ? <p className="mt-2 text-[12px] leading-5 text-danger">{status.breaker.reason}</p> : null}
        {status.warnings.map((warning) => <p key={warning} className="mt-2 text-[12px] leading-5 text-warning-deep">{warning}</p>)}
        {!status.ready && status.blockedMessage ? <p className="mt-2 text-[12px] leading-5 text-ink-2" data-testid="assist-blocked">{status.blockedMessage}</p> : null}
      </SettingsPanel>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingsPanel title="This gym" description="Off for every gym until an owner turns it on. Changes are audited." bodyClassName="px-4 py-1 sm:px-5">
          <div className="divide-y divide-line">
            <SettingsToggleRow
              label="Allow Jev suggestions"
              hint={enabled ? "On. Pages may ask Jev about a record when RIVET's mode allows it." : "Off. No page asks Jev anything about this gym."}
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={!status.canManage}
            />
          </div>
          <div className="py-3">
            <Field label="Reason (optional)" hint="Kept with the audit entry.">
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} disabled={!status.canManage} aria-label="Reason for changing Jev suggestions" />
            </Field>
            {status.tenant.updatedAt ? <p className="mt-2 text-[12px] leading-5 text-ink-3">Last changed {new Date(status.tenant.updatedAt).toLocaleString()}{status.tenant.updatedBy ? ` by ${status.tenant.updatedBy}` : ""}{status.tenant.reason ? ` · ${status.tenant.reason}` : ""}</p> : null}
            {!status.canManage ? <p className="mt-2 text-[12px] leading-5 text-ink-3">Only a role with the Manage settings permission can change this switch.</p> : null}
          </div>
        </SettingsPanel>

        <SettingsPanel title="Questions RIVET may ask" description="Every question is declared in code with a version and the permission a person needs to ask it." bodyClassName="px-4 py-1 sm:px-5">
          <ul className="divide-y divide-line" data-testid="assist-questions">
            {status.features.flatMap((feature) => feature.questions.map((question) => (
              <li key={question.key} className="py-2.5 text-[12.5px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{question.label}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{KIND_LABELS[question.kind]}</Badge>
                    {question.synthetic ? <Badge variant="neutral">Synthetic</Badge> : null}
                    <Badge variant={feature.ready ? "success" : "neutral"} dot>{feature.ready ? "Ready" : "Held"}</Badge>
                  </span>
                </div>
                <p className="mt-0.5 leading-5 text-ink-2">{question.description}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-3">{question.key} · v{question.version} · needs {question.permission}</p>
              </li>
            )))}
          </ul>
        </SettingsPanel>
      </div>

      <SyntheticCheckPanel />

      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        error={save.isError ? errorMessage(save.error, "The Jev switch could not be saved. Try again.") : undefined}
        onSave={async () => { await save.mutateAsync({ enabled, reason: reason.trim() }); }}
        onDiscard={() => { if (persisted !== undefined) setEnabled(persisted); setReason(""); }}
        saveLabel="Save Jev switch"
        guardTitle="Unsaved Jev switch"
      />
    </SettingsSection>
  );
}

/**
 * Runs one registered synthetic question the way a page would, through the
 * same hook and card. Only the built-in sample state is sent, never gym data,
 * so this is safe against the live model and doubles as the connectivity check.
 */
function SyntheticCheckPanel() {
  const [questionKey, setQuestionKey] = useState(FOUNDATION_QUESTIONS[0]?.key ?? "foundation.refund_detected");
  const [simulate, setSimulate] = useState<"none" | AssistSimulation>("none");
  const question = FOUNDATION_QUESTIONS.find((candidate) => candidate.key === questionKey) ?? FOUNDATION_QUESTIONS[0];
  const suggestion = useAssistJudgment({ questionKey, subject: simulate === "none" ? {} : { simulate }, auto: false });
  const running = suggestion.state.status === "loading";

  return (
    <SettingsPanel title="Synthetic check" description="Asks one built-in question about its sample state, exactly as a page would, and shows the answer. Gym data is never sent." bodyClassName="px-4 py-4 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Question">
          <Select value={questionKey} onValueChange={setQuestionKey}>
            <SelectTrigger aria-label="Synthetic question"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FOUNDATION_QUESTIONS.map((candidate) => <SelectItem key={candidate.key} value={candidate.key}>{candidate.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Outcome">
          <Select value={simulate} onValueChange={(value) => setSimulate(value as "none" | AssistSimulation)}>
            <SelectTrigger aria-label="Simulated outcome"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIMULATIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Button type="button" variant="secondary" onClick={suggestion.request} loading={running} disabled={!suggestion.status}>
          <Play /> Run check
        </Button>
      </div>
      {question ? <p className="mt-2 text-[12px] leading-5 text-ink-3">{question.description}</p> : null}
      <div className="mt-3 space-y-2">
        {suggestion.state.status === "disabled" ? (
          <p className="rounded-md bg-sunken/60 px-3 py-2 text-[12.5px] text-ink-2" role="status" data-testid="assist-check-blocked">{suggestion.state.message ?? "Jev suggestions are switched off."}</p>
        ) : null}
        <AssistSuggestion suggestion={suggestion} title={question?.label ?? "Synthetic check"} render={(result) => <JudgmentSummary result={result} />} testId="assist-check" />
      </div>
    </SettingsPanel>
  );
}
