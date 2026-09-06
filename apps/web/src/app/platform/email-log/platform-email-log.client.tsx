"use client";

import { MailX } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { PlatformEmailDelivery } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils/dates";
import { PageHeader } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS: Record<PlatformEmailDelivery["status"], { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  queued: { label: "Queued", variant: "neutral" },
  leased: { label: "Sending", variant: "neutral" },
  provider_accepted: { label: "Accepted by provider", variant: "success" },
  delivered: { label: "Delivered", variant: "success" },
  retrying: { label: "Retrying", variant: "warning" },
  failed: { label: "Failed", variant: "danger" },
  suppressed: { label: "Not sent", variant: "neutral" },
};

/** What happened to a message, in one line a person can act on. */
function outcome(delivery: PlatformEmailDelivery): string {
  if (delivery.status === "suppressed") return delivery.suppressionReason ?? "Suppressed";
  const last = delivery.attempts.at(-1);
  if (delivery.status === "failed" || delivery.status === "retrying") return `${last?.errorCode ?? delivery.lastErrorCode ?? "Provider error"}${last?.statusCode ? ` (HTTP ${last.statusCode})` : ""}`;
  if (last?.deliveredTo && last.deliveredTo !== delivery.recipientEmail) return `Redirected to ${last.deliveredTo} (${last.mode} mode)`;
  if (delivery.status === "queued") return "Waiting for the worker; it runs every minute";
  return last?.mode ? `Sent in ${last.mode} mode` : "";
}

/**
 * Platform console: the last hundred operational emails and what became of
 * each one. Every suppression carries its reason and every provider failure
 * its code, so a missing message is explained here rather than guessed at.
 */
export function PlatformEmailLog() {
  const query = useApiQuery(qk.platformEmailDeliveries, (api) => api.listPlatformEmailDeliveries());
  if (query.isLoading) return <PlatformPage><div className="space-y-3" role="status" aria-label="Loading email log"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></PlatformPage>;
  if (query.isError || !query.data) return <PlatformPage><QueryErrorState error={query.error} onRetry={() => void query.refetch()} /></PlatformPage>;
  const rows = query.data;
  const sent = rows.filter((row) => row.status === "delivered" || row.status === "provider_accepted").length;
  return (
    <PlatformPage className="space-y-5" data-testid="platform-email-log">
      <PageHeader
        title="Email log"
        description="The last hundred messages RIVET queued, across every gym, and what happened to each. A message that was not sent says why; one the provider refused shows its error."
        actions={<Badge variant={sent > 0 ? "success" : "neutral"} dot>{sent} of {rows.length} sent</Badge>}
      />
      {rows.length === 0 ? <EmptyState layout="page" icon={MailX} title="Nothing queued yet" description="Messages appear here the moment RIVET queues them, before the worker runs." /> : (
        <PlatformPanel className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queued</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Gym</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>What happened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = STATUS[row.status];
                return (
                  <TableRow key={row.id} data-testid="email-log-row">
                    <TableCell className="whitespace-nowrap text-[12px] text-ink-3">{formatDateTime(row.createdAt)}</TableCell>
                    <TableCell><span className="block max-w-[320px] truncate text-[13px]" title={row.subject}>{row.subject ?? row.kind}</span><span className="block font-mono text-[11px] text-ink-3">{row.kind}{row.attachments.length ? ` · ${row.attachments.length} PDF` : ""}</span></TableCell>
                    <TableCell dir="ltr" className="text-[12.5px]">{row.recipientEmail ?? "—"}</TableCell>
                    <TableCell className="text-[12.5px]">{row.gym}</TableCell>
                    <TableCell><Badge variant={status.variant} dot>{status.label}</Badge></TableCell>
                    <TableCell className="max-w-[360px] text-[12px] text-ink-2" data-testid="email-log-outcome">{outcome(row)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </PlatformPanel>
      )}
    </PlatformPage>
  );
}
