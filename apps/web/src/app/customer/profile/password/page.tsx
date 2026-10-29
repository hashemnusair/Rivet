"use client";
import { useT } from "@/lib/i18n/provider";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { MemberAccountLoading, MemberAccountSubpage } from "@/components/public/member-account";
import { useMemberGate } from "@/lib/hooks/use-member-gate";

export default function MemberPasswordPage() {
  const t = useT();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  if (!ready || !identitySignedIn) return <MemberAccountLoading />;
  if (!profileSelected) return null;
  return (
    <MemberAccountSubpage title={t("auth.changePassword.title")} description={t("auth.changePassword.description")}>
      <div className="panel p-4 sm:p-5"><ChangePasswordForm idPrefix="member-password" /></div>
    </MemberAccountSubpage>
  );
}
