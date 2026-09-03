"use client";

import { Download, FileSignature } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { QueryErrorState, StatePanel } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { AgreementRecord } from "./agreement-record";
import { downloadAgreementPdf } from "./agreement-pdf";

/**
 * The gym's signed subscription agreement, with a print action. Signing
 * itself happens in the blocking modal (`SubscriptionAgreementGate`) that
 * the app shell opens for an owner who has not signed yet, so this page only
 * ever shows the record or the reason there is none.
 */
export function SubscriptionAgreementSigning({ embedded = false }: { embedded?: boolean }) {
  const query = useApiQuery(qk.legalAgreement, (api) => api.getSubscriptionAgreementContext());
  const context = query.data;

  if (query.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError || !context) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;

  if (context.agreement) {
    return (
      <div className="space-y-5">
        {!embedded ? <PageHeader title="Your subscription agreement" description={context.agreement.status === "countersigned" ? "Signed by you and countersigned by RIVET. Keep a copy for your records." : "Signed. RIVET will countersign and confirm the completed agreement by email."} actions={<Button variant="secondary" onClick={() => downloadAgreementPdf(context.agreement!, context.sections)} data-testid="download-agreement-pdf"><Download /> Download PDF</Button>} /> : null}
        <AgreementRecord agreement={context.agreement} sections={context.sections} />
        {!embedded ? <p className="text-[12.5px] text-ink-3">Questions about the agreement? WhatsApp RIVET on <a href={RIVET_CONTACT.whatsappHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.phoneDisplay}</a>.</p> : null}
      </div>
    );
  }

  if (!context.canSign) {
    return <StatePanel icon={FileSignature} title="The gym owner signs this agreement" description="Only the owner account can sign RIVET's subscription agreement. Ask the owner to sign in and complete onboarding." />;
  }

  return <StatePanel icon={FileSignature} title="Sign the agreement to continue" description="The agreement opens automatically for the gym owner and must be signed before RIVET can be used." />;
}
