"use client";

import { FileSignature, Printer } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AgreementRecord } from "@/features/legal/agreement-record";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { QueryErrorState, StatePanel } from "@/components/ui/states";

/** Settings → Agreement: the gym's signed subscription agreement, or why there is none yet. */
export function AgreementSection() {
  const query = useApiQuery(qk.legalAgreement, (api) => api.getSubscriptionAgreementContext());
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const context = query.data;
  if (!context.agreement) {
    return context.canSign
      ? <StatePanel icon={FileSignature} title="Your subscription agreement is not signed yet" description="The agreement opens automatically when the gym owner signs in and must be signed before RIVET can be used. The signed copy will appear here." />
      : <StatePanel icon={FileSignature} title="Waiting for the owner's signature" description="Only the owner account can sign RIVET's subscription agreement. The signed copy will appear here." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-3">Version {context.agreement.version} · {context.agreement.status === "countersigned" ? "countersigned by RIVET" : "awaiting RIVET's countersignature"}</p>
        <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer /> Print or save as PDF</Button>
      </div>
      <AgreementRecord agreement={context.agreement} sections={context.sections} />
    </div>
  );
}
