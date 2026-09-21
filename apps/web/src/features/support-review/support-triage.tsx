"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextLabel } from "@/components/ui/typography";
import { qk } from "@/lib/api/keys";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import type { SupportReviewContext } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { percent } from "@/features/assist/assist-judgment";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { resolveSupportCategoryReading, resolveSupportClarificationReading, resolveSupportInvoiceReading, supportDestination } from "../../../convex/supportAssist";

export function useSupportReviewContext(caseId: string | undefined, enabled: boolean) {
  return useApiQuery(qk.platformSupportReview(caseId ?? ""), (api) => api.getPlatformSupportReviewContext(caseId ?? ""), { enabled: enabled && Boolean(caseId), staleTime: 15_000, refetchOnWindowFocus: false });
}

const BILLING_CATEGORIES = new Set(["invoice_dispute", "billing_schedule"]);

/**
 * Triage for one case in the platform inbox, on request. Jev suggests a
 * category (feature upgrades, billing-schedule requests and invoice disputes
 * are kept apart), the recorded invoice a billing case refers to, and at
 * most one prepared clarification. The destination is always an existing
 * console page; the clarification is inserted into the reply the operator
 * writes, never sent. Urgency, assignment, status and the subscription are
 * untouched.
 */
export function SupportTriagePanel({ supportCase, onInsertClarification }: { supportCase: PlatformSupportCase; onInsertClarification?: (text: string) => void }) {
  const gymId = supportCase.gymId;
  const subject = { caseId: supportCase.id, updatedAt: supportCase.updatedAt ?? "" };
  const category = useAssistJudgment({ questionKey: "support.category", subject, enabled: Boolean(gymId), auto: false, platformGymId: gymId });
  const asked = category.state.status !== "idle" && category.state.status !== "disabled";
  const context = useSupportReviewContext(supportCase.id, Boolean(gymId) && asked);
  const reading = context.data && category.state.status === "ready" ? resolveSupportCategoryReading(category.state.result.judgment, context.data) : undefined;
  const chosen = reading?.category.id;
  const billing = Boolean(chosen && BILLING_CATEGORIES.has(chosen));
  const invoicesRecorded = (context.data?.facts.invoices.length ?? 0) > 0;
  const invoice = useAssistJudgment({ questionKey: "support.invoice_match", subject, enabled: Boolean(gymId) && billing && invoicesRecorded, auto: true, platformGymId: gymId });
  const clarification = useAssistJudgment({ questionKey: "support.clarification", subject: { ...subject, category: chosen ?? "" }, enabled: Boolean(gymId) && Boolean(chosen) && supportCase.status !== "resolved", auto: true, platformGymId: gymId });

  if (!gymId || !category.status || !category.featureReady) return null;

  const invoiceReading = context.data && invoice.state.status === "ready" ? resolveSupportInvoiceReading(invoice.state.result.judgment, context.data) : undefined;
  const destination = chosen ? supportDestination({ category: chosen, gymId, caseId: supportCase.id, invoiceId: invoiceReading?.invoice?.id }) : undefined;

  return (
    <section aria-label="Jev triage" data-testid="support-triage" className="space-y-3 border-b border-line bg-surface px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-ink-3" aria-hidden />
          <ContextLabel as="span">Jev triage</ContextLabel>
          <span className="text-[12px] text-ink-3">Category, review destination and one clarification. Urgency, assignment and closure stay manual.</span>
        </div>
        <Button type="button" size="sm" variant="secondary" data-testid="support-triage-run" loading={category.state.status === "loading"} onClick={category.request}>
          <Sparkles /> {asked ? "Triage again" : "Triage with Jev"}
        </Button>
      </div>

      <AssistSuggestion
        suggestion={category}
        title="Suggested category"
        testId="support-category"
        render={() => reading ? (
          <div className="space-y-2">
            <p><span className="font-semibold text-ink" data-testid="support-category-label">{reading.category.label}</span> · {reading.category.description}</p>
            {reading.alternatives.length ? <p className="text-[12.5px] text-ink-3">Also possible: {reading.alternatives.map((entry) => `${entry.category.label} (${percent(entry.probability)})`).join(", ")}.</p> : null}
            {supportCase.requestType === "plan_upgrade" && reading.category.id !== "feature_upgrade" ? <p className="text-[12.5px] text-warning-deep">The gym filed this as a plan request; the text reads differently. Keep the structured request in view.</p> : null}
          </div>
        ) : <p>The category could not be read against the current case. Ask again.</p>}
        actions={() => destination ? (
          <Button asChild size="sm" variant="secondary"><Link href={destination.href} data-testid="support-destination">{destination.label} <ArrowUpRight /></Link></Button>
        ) : null}
      />

      {billing ? (
        invoicesRecorded ? (
          <AssistSuggestion
            suggestion={invoice}
            title="Invoice this case refers to"
            testId="support-invoice"
            render={() => invoiceReading?.invoice ? (
              <p data-testid="support-invoice-match"><span className="font-mono text-[12.5px]">{invoiceReading.invoice.id}</span> · <Badge variant="outline">{invoiceReading.invoice.status.replace("_", " ")}</Badge> · {invoiceReading.invoice.amount ?? "amount not recorded"}{invoiceReading.invoice.date ? ` · ${invoiceReading.invoice.date}` : ""}</p>
            ) : <p data-testid="support-invoice-none">No recorded invoice is named in the case. The gym record lists every invoice on file.</p>}
          />
        ) : (
          <p className="text-[12.5px] text-ink-3" data-testid="support-invoice-unavailable">No invoice is recorded for this gym, so there is nothing to match the case against.</p>
        )
      ) : null}

      {chosen && supportCase.status !== "resolved" ? (
        <AssistSuggestion
          suggestion={clarification}
          title="One clarification to ask"
          testId="support-clarification"
          render={(result) => {
            const clarificationReading = context.data ? resolveSupportClarificationReading(result.judgment, context.data) : undefined;
            return clarificationReading?.clarification
              ? <p data-testid="support-clarification-text">“{clarificationReading.clarification.text}”</p>
              : <p data-testid="support-clarification-none">No clarification needed: the case already contains what the team needs to act.</p>;
          }}
          actions={(result) => {
            const clarificationReading = context.data ? resolveSupportClarificationReading(result.judgment, context.data) : undefined;
            return clarificationReading?.clarification && onInsertClarification ? (
              <Button type="button" size="sm" variant="secondary" data-testid="support-clarification-insert" onClick={() => onInsertClarification(clarificationReading.clarification!.text)}>Insert into reply</Button>
            ) : null;
          }}
        />
      ) : null}

      {context.isError ? <p className="text-[12.5px] text-ink-3">The case facts could not be loaded; the suggestion above cannot be read without them.</p> : null}
    </section>
  );
}

export type { SupportReviewContext };
