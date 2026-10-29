"use client";
import { useT } from "@/lib/i18n/provider";

import { CustomerCommunicationPreferences } from "@/components/public/customer-communication-preferences";
import { MemberAccountLoading, MemberAccountSubpage } from "@/components/public/member-account";
import { useMemberGate } from "@/lib/hooks/use-member-gate";

export default function MemberOffersPage() {
  const t = useT();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  if (!ready || !identitySignedIn) return <MemberAccountLoading />;
  if (!profileSelected) return null;
  return (
    <MemberAccountSubpage title={t("customerPortal.marketingTitle")}>
      <CustomerCommunicationPreferences />
    </MemberAccountSubpage>
  );
}
