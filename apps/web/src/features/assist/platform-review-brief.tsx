"use client";

import Link from "next/link";
import { applicationReviewBrief, type ReviewNote, type ReviewableApplication } from "@/lib/ai/application-review";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useLocale } from "@/lib/i18n/provider";

/** Whether operators may see assistance here: the deployment is not off and the platform stop is not on. */
export function usePlatformAssistance(): boolean {
  const status = useApiQuery(qk.aiPlatformStatus, (api) => api.getPlatformAiStatus());
  return Boolean(status.data && status.data.adapterMode !== "off" && !status.data.stopped);
}

function NoteText({ note }: { note: ReviewNote }) {
  const { t, isolate } = useLocale();
  switch (note.kind) {
    case "duplicate":
      return <>{t(`aiWork.platformReview.duplicate.${note.field}`, { name: isolate(note.otherName), status: t(`aiWork.platformReview.status.${note.otherStatus === "approved" || note.otherStatus === "rejected" ? note.otherStatus : "pending"}`) })} <Link href={`/platform/applications?application=${encodeURIComponent(note.otherId)}`} className="underline underline-offset-2">{t("aiWork.platformReview.open")}</Link></>;
    case "missing_address": return <>{t("aiWork.platformReview.missingAddress")}</>;
    case "enterprise_quote": return <>{t("aiWork.platformReview.enterpriseQuote")}</>;
    case "confirmation_failed": return <>{t("aiWork.platformReview.confirmationFailed")}</>;
    case "promo": return <>{t("aiWork.platformReview.promo", { code: note.code })}</>;
  }
}

/**
 * Things worth checking before deciding a gym application: earlier
 * applications with the same email, phone or name, missing details, and
 * decisions the operator must record. RIVET decides nothing here.
 */
export function PlatformReviewBrief({ application, all }: { application: ReviewableApplication; all: readonly ReviewableApplication[] }) {
  const { t } = useLocale();
  const available = usePlatformAssistance();
  if (!available || application.status !== "pending") return null;
  const notes = applicationReviewBrief(application, all);
  return (
    <section className="rounded-md border border-line bg-surface px-4 py-3 text-[12.5px]" aria-labelledby={`review-brief-${application.id}`} data-testid="platform-review-brief">
      <h3 id={`review-brief-${application.id}`} className="text-[13px] font-semibold text-ink">{t("aiWork.platformReview.title")}</h3>
      {notes.length ? <ul className="ms-4 mt-1.5 list-disc space-y-1 text-ink-2">{notes.map((note, index) => <li key={index}><NoteText note={note} /></li>)}</ul> : <p className="mt-1 text-ink-2">{t("aiWork.platformReview.nothing")}</p>}
      <p className="mt-2 text-[12px] text-ink-3">{t("aiWork.platformReview.youDecide")}</p>
    </section>
  );
}
