"use client";

import { Download, FileSignature } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AgreementRecord } from "@/features/legal/agreement-record";
import { downloadAgreementPdf } from "@/features/legal/agreement-pdf";
import { SettingsSection } from "@/features/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { QueryErrorState, StatePanel } from "@/components/ui/states";

/** Settings → Agreement: the gym's signed subscription agreement, or why there is none yet. */
export function AgreementSection() {
  const query = useApiQuery(qk.legalAgreement, (api) => api.getSubscriptionAgreementContext());
  if (query.isLoading) {
    return (
      <SettingsSection title="Agreement" description="The subscription agreement between this gym and RIVET, as signed.">
        <Skeleton className="h-64 w-full" />
      </SettingsSection>
    );
  }
  if (query.isError || !query.data) {
    return (
      <SettingsSection title="Agreement" description="The subscription agreement between this gym and RIVET, as signed.">
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SettingsSection>
    );
  }
  const context = query.data;
  if (!context.agreement) {
    return (
      <SettingsSection title="Agreement" description="The subscription agreement between this gym and RIVET, as signed.">
        {context.canSign
          ? <StatePanel icon={FileSignature} title="Your subscription agreement is not signed yet" description="The agreement opens automatically when the gym owner signs in and must be signed before RIVET can be used. The signed copy will appear here." />
          : <StatePanel icon={FileSignature} title="Waiting for the owner's signature" description="Only the owner account can sign RIVET's subscription agreement. The signed copy will appear here." />}
      </SettingsSection>
    );
  }
  const agreement = context.agreement;
  const status = agreement.status === "countersigned"
    ? "Countersigned by RIVET"
    : agreement.status === "void"
      ? "Void"
      : "Signed, awaiting RIVET's countersignature";
  return (
    <SettingsSection
      title="Agreement"
      description={<>Version {agreement.version} · {status}. The signed copy below is the record both parties keep.</>}
      actions={<Button variant="secondary" onClick={() => downloadAgreementPdf(agreement, context.sections)} data-testid="download-agreement-pdf"><Download /> Download PDF</Button>}
    >
      <AgreementRecord agreement={agreement} sections={context.sections} />
    </SettingsSection>
  );
}
