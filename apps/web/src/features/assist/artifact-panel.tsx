"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import type { AiArtifactView } from "@/lib/ai/contracts";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAiErrorText, useAiMessage } from "./ai-message";

/**
 * A saved report or handover. Figures come from domain services; the panel
 * says which totals were checked and which sources were missing, so a gap
 * never reads as "nothing to report". Access is rechecked by the server on
 * every read, and the artifact expires.
 */
export function AiArtifactPanel({ artifactId, className }: { artifactId: string; className?: string }) {
  const { t } = useLocale();
  const format = useFormat();
  const present = useAiMessage();
  const errorText = useAiErrorText();
  const query = useApiQuery<AiArtifactView>(qk.aiArtifact(artifactId), (api) => api.getAiArtifact(artifactId), { refetchOnWindowFocus: false, retry: false });
  if (query.isLoading) return <Skeleton className={cn("h-40 w-full", className)} />;
  if (query.isError || !query.data) return <p className={cn("text-[12.5px] text-ink-3", className)} role="status">{query.error?.message ?? errorText("internal")}</p>;
  const artifact = query.data;
  const title = present({ key: artifact.title, ...(artifact.titleParams ? { params: artifact.titleParams } : {}) });
  return (
    <section className={cn("space-y-3 rounded-lg border border-line bg-surface px-4 py-3", className)} aria-label={title} data-testid="ai-artifact" data-kind={artifact.kind}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">{title}{artifact.branchName ? <span className="font-normal text-ink-3"> · <bdi>{artifact.branchName}</bdi></span> : null}</h3>
          <p className="text-[12px] text-ink-3">{t("aiWork.report.expires", { at: format.dateTime(artifact.expiresAt) })}</p>
        </div>
        {artifact.kind === "management_report" ? <Badge variant={artifact.verification.verified ? "success" : "warning"} data-testid="ai-artifact-verification">{artifact.verification.verified ? t("aiWork.report.verified") : t("aiWork.report.notVerified")}</Badge> : null}
      </header>
      {artifact.sections.map((section) => (
        <div key={section.key} data-testid={`ai-artifact-section-${section.key}`}>
          <p className="context-label">{t(section.titleKey as TKey)}</p>
          {section.items.length ? (
            <ul className="mt-1 space-y-1">
              {section.items.map((item) => {
                const source = item.sources.find((candidate) => candidate.href);
                return (
                  <li key={item.key} className={cn("flex flex-wrap items-baseline gap-x-2 text-[12.5px] text-ink-2", item.tone === "attention" && "text-ink", item.tone === "positive" && "text-success-deep")}>
                    <span dir="auto">{present(item.message)}</span>
                    {source?.href ? <Link href={source.href} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">{t("aiWork.brief.viewSource")}</Link> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-1 text-[12.5px] text-ink-3">{t("aiWork.handover.nothing")}</p>}
        </div>
      ))}
      {artifact.verification.checks.length ? (
        <div data-testid="ai-artifact-checks">
          <p className="context-label">{t("aiWork.report.checks")}</p>
          <ul className="mt-1 space-y-0.5">{artifact.verification.checks.map((check) => <li key={check.key} className={cn("text-[12.5px]", check.ok ? "text-ink-2" : "text-warning-deep")}>{present(check.message)}</li>)}</ul>
        </div>
      ) : null}
      <div data-testid="ai-artifact-coverage">
        <p className="context-label">{t("aiWork.artifact.coverage")}</p>
        <ul className="mt-1 space-y-0.5">{artifact.coverage.map((item) => <li key={item.key} className={cn("text-[12px]", item.complete ? "text-ink-3" : "text-warning-deep")}>{present(item.message)}</li>)}</ul>
      </div>
    </section>
  );
}
