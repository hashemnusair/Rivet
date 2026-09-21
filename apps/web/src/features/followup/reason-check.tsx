"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReasonActionKey } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import { FOLLOWUP_NOTE_MAX_LENGTH, REASON_ACTIONS, reasonCheckReading } from "../../../convex/followupAssist";

/**
 * Optional clarification for the reason typed into a sensitive-action form.
 * It asks for the factual detail an auditor would need (what happened, who
 * confirmed it, when) and never proposes wording or a justification. The
 * action's own permission gates the check on the server, nothing here
 * blocks submitting, and editing the reason drops the old reading.
 */
export function ReasonCheck({ action, reason, className }: { action: ReasonActionKey; reason: string; className?: string }) {
  const trimmed = reason.trim().slice(0, FOLLOWUP_NOTE_MAX_LENGTH);
  const suggestion = useAssistJudgment({ questionKey: "followup.reason_check", subject: { action, reason: trimmed }, auto: false });
  if (!suggestion.featureReady) return null;
  const tooShort = trimmed.length < 3;
  const render = (result: AssistReadyResult) => {
    const reading = reasonCheckReading(result.judgment, action);
    return (
      <div data-testid={`reason-check-level-${reading.level}`}>
        <p className="font-medium text-ink">{reading.label}.</p>
        {reading.prompt ? <p className="mt-1">{reading.prompt}</p> : <p className="mt-1">An auditor can check this. Nothing to add.</p>}
        <p className="mt-1 text-[11.5px] text-ink-3">The {REASON_ACTIONS[action].label.toLowerCase()} stays yours to submit; this only asks for detail.</p>
      </div>
    );
  };
  return (
    <div className={cn("space-y-2", className)} data-testid="reason-check-panel">
      <Button type="button" size="xs" variant="ghost" onClick={suggestion.request} disabled={tooShort} loading={suggestion.state.status === "loading"} aria-label="Check reason">
        <Sparkles /> {suggestion.state.status === "ready" ? "Check again" : "Check reason"}
      </Button>
      <AssistSuggestion suggestion={suggestion} title="Reason detail" render={render} actions={<Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>} testId="reason-check" />
    </div>
  );
}
