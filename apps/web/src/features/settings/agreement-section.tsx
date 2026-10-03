"use client";
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
  const query = useApiQuery(qk.legalAgreement, (api) => api.getSubscriptionAgreementContext());
  if (query.isLoading) {
    return (
      <SettingsSection title={t("settingsCore.text182")} description={t("settingsDetails.text094")}>
        <Skeleton className="h-64 w-full" />
      </SettingsSection>
    );
  }
  if (query.isError || !query.data) {
    return (
      <SettingsSection title={t("settingsCore.text182")} description={t("settingsDetails.text094")}>
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SettingsSection>
    );
  }
  const context = query.data;
  if (!context.agreement) {
    return (
      <SettingsSection title={t("settingsCore.text182")} description={t("settingsDetails.text094")}>
        {context.canSign
          ? <StatePanel icon={FileSignature} title={t("settingsDetails.text095")} description={t("settingsDetails.text096")} />
          : <StatePanel icon={FileSignature} title={t("settingsDetails.text097")} description={t("settingsDetails.text098")} />}
      </SettingsSection>
    );
  }
  const agreement = context.agreement;
  const status = agreement.status === "countersigned"
    ? t("settingsDetails.text099")
    : agreement.status === "void"
      ? t("renewFlow.adjust.membershipStatus.cancelled")
      : t("settingsDetails.text100");
  return (
    <SettingsSection
      title={t("settingsCore.text182")}
      description={<>{t("settingsDetails.text101")}{" "}{agreement.version} · {status}</>}
      actions={<Button variant="secondary" onClick={() => downloadAgreementPdf(agreement, context.sections)} data-testid="download-agreement-pdf"><Download /> {" "}{t("settingsDetails.text102")}</Button>}
    >
      <AgreementRecord agreement={agreement} sections={context.sections} />
    </SettingsSection>
  );
}
