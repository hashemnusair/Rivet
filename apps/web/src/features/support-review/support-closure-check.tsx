"use client";

import { ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import type { SupportPassage, SupportPassageFinding } from "@/lib/domain/types";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { resolveSupportClaimReading, resolveSupportUnansweredReading, supportClaimPassages, supportRequestPassages } from "../../../convex/supportAssist";
import { useSupportReviewContext } from "./support-triage";

function formatWhen(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : value;
}

function FindingList({ findings, kind, onLocate, testId }: { findings: SupportPassageFinding[]; kind: "request" | "claim"; onLocate?: (passage: SupportPassage) => void; testId: string }) {
  return (
    <ul className="space-y-2" data-testid={testId}>
      {findings.map(({ passage, evidence }) => (
        <li key={passage.id} className="rounded-md border border-line bg-sunken/40 p-2.5" data-testid={`${testId}-item`} data-passage-id={passage.id}>
          <blockquote className="border-s-2 border-warning ps-2 text-[13px] leading-5 text-ink">“{passage.text}”</blockquote>
          <p className="mt-1 text-[12px] text-ink-3">{passage.authorType === "platform" ? "RIVET" : "Gym"} · {passage.authorName} · {formatWhen(passage.createdAt)}</p>
          {kind === "claim" && evidence ? <p className="mt-1 text-[12.5px] text-ink-2" data-testid="support-claim-evidence">{evidence}</p> : null}
          {onLocate ? <Button type="button" size="xs" variant="ghost" className="mt-1" onClick={() => onLocate(passage)}>Show in conversation</Button> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Optional checks before a case is closed: explicit gym requests no reply
 * addressed, and passages whose assertions the recorded facts do not support.
 * Both run only when asked, read the case as it is now, and quote the
 * original passages by validated id. Nothing here closes the case, changes
 * its urgency or writes the summary; the Resolve action stays as it was.
 */
export function SupportClosureCheck({ supportCase, summaryDraft, onLocate, onFindings }: { supportCase: PlatformSupportCase; summaryDraft: string; onLocate?: (passage: SupportPassage) => void; onFindings?: (passages: SupportPassage[]) => void }) {
  const gymId = supportCase.gymId;
  const [checked, setChecked] = useState<{ summary: string } | undefined>();
  const context = useSupportReviewContext(supportCase.id, Boolean(gymId) && Boolean(checked));
  const requests = context.data ? supportRequestPassages(context.data.passages) : undefined;
  const claims = context.data ? supportClaimPassages(context.data.passages) : undefined;
  const base = { caseId: supportCase.id, updatedAt: supportCase.updatedAt ?? "" };
  const unanswered = useAssistJudgment({ questionKey: "support.unanswered", subject: { ...base, summary: checked?.summary ?? "" }, enabled: Boolean(gymId) && requests !== undefined && requests.length > 0, auto: Boolean(checked), platformGymId: gymId });
  const claimCheck = useAssistJudgment({ questionKey: "support.claim_check", subject: base, enabled: Boolean(gymId) && claims !== undefined && claims.length > 0, auto: Boolean(checked), platformGymId: gymId });
  const status = useAssistJudgment({ questionKey: "support.category", subject: base, enabled: Boolean(gymId), auto: false, platformGymId: gymId });

  if (!gymId || !status.status || !status.featureReady || supportCase.status === "resolved") return null;

  const unansweredReading = context.data && unanswered.state.status === "ready" ? resolveSupportUnansweredReading(unanswered.state.result.judgment, context.data) : undefined;
  const claimReading = context.data && claimCheck.state.status === "ready" ? resolveSupportClaimReading(claimCheck.state.result.judgment, context.data) : undefined;
  const flagged = [...(unansweredReading?.findings ?? []), ...(claimReading?.findings ?? [])].map((finding) => finding.passage);

  const run = () => {
    const summary = summaryDraft.trim();
    if (checked && checked.summary === summary) {
      if (requests?.length) unanswered.request();
      if (claims?.length) claimCheck.request();
    } else {
      setChecked({ summary });
    }
  };

  return (
    <section aria-label="Checks before closing" data-testid="support-closure-check" className="space-y-3 rounded-md border border-dashed border-line-2 bg-surface/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] leading-5 text-ink-2"><ShieldQuestion className="me-1 inline size-3.5 text-ink-3" aria-hidden />Optional: ask Jev which explicit requests no reply addressed and which claims the ledger, subscription or public-page records do not support. Each check suggests at most one passage; review the full case before closing.</p>
        <Button type="button" size="sm" variant="secondary" data-testid="support-closure-run" loading={unanswered.state.status === "loading" || claimCheck.state.status === "loading" || (Boolean(checked) && context.isLoading)} onClick={run}>{checked ? "Check again" : "Check before closing"}</Button>
      </div>
      {checked && context.data ? (
        <>
          {requests?.length ? (
            <AssistSuggestion
              suggestion={unanswered}
              title="Explicit requests without an answer"
              testId="support-unanswered"
              render={() => unansweredReading?.allAnswered
                ? <p data-testid="support-unanswered-clear">No unanswered request was selected. Review the full case before closing.</p>
                : unansweredReading ? <FindingList findings={unansweredReading.findings} kind="request" onLocate={onLocate} testId="support-unanswered-findings" /> : null}
              actions={() => flagged.length && onFindings ? <Button type="button" size="sm" variant="ghost" onClick={() => onFindings(flagged)}>Highlight in conversation</Button> : null}
            />
          ) : <p className="text-[12.5px] text-ink-3" data-testid="support-unanswered-unavailable">No explicit request was found in the gym&rsquo;s messages, so there is nothing to check for an answer.</p>}
          {claims?.length ? (
            <AssistSuggestion
              suggestion={claimCheck}
              title="Claims the records do not support"
              testId="support-claims"
              render={() => claimReading?.supported
                ? <p data-testid="support-claims-clear">No unsupported claim was selected. This is not verification of every claim.</p>
                : claimReading ? <FindingList findings={claimReading.findings} kind="claim" onLocate={onLocate} testId="support-claim-findings" /> : null}
            />
          ) : <p className="text-[12.5px] text-ink-3" data-testid="support-claims-unavailable">No passage on this case asserts an outcome, so there is no claim to check against the records.</p>}
        </>
      ) : null}
      {checked && context.isError ? <p className="text-[12.5px] text-ink-3">The case facts could not be loaded. Continue as usual; nothing here blocks closing.</p> : null}
    </section>
  );
}
