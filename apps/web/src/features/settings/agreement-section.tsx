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
      <SettingsSection title="Agreement" description="Your signed agreement with RIVET.">
        <Skeleton className="h-64 w-full" />
      </SettingsSection>
    );
  }
  if (query.isError || !query.data) {
    return (
      <SettingsSection title="Agreement" description="Your signed agreement with RIVET.">
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SettingsSection>
    );
  }
  const context = query.data;
  if (!context.agreement) {
    return (
      <SettingsSection title="Agreement" description="Your signed agreement with RIVET.">
        {context.canSign
          ? <StatePanel icon={FileSignature} title="Your agreement is not signed yet" description="The owner must sign the agreement before your gym can use RIVET. It opens when the owner signs in. The signed copy will show here." />
          : <StatePanel icon={FileSignature} title="Waiting for the owner's signature" description="Only the owner can sign the agreement with RIVET. The signed copy will show here." />}
      </SettingsSection>
    );
  }
  const agreement = context.agreement;
  const status = agreement.status === "countersigned"
    ? "Signed by you and RIVET"
    : agreement.status === "void"
      ? "Cancelled"
      : "Signed by you, waiting for RIVET";
  return (
    <SettingsSection
      title="Agreement"
      description={<>Version {agreement.version} · {status}</>}
      actions={<Button variant="secondary" onClick={() => downloadAgreementPdf(agreement, context.sections)} data-testid="download-agreement-pdf"><Download /> Download PDF</Button>}
    >
      <AgreementRecord agreement={agreement} sections={context.sections} />
    </SettingsSection>
  );
}
