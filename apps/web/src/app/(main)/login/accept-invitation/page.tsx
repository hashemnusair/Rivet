import type { Metadata } from "next";
import { Suspense } from "react";
import { pageTitle } from "../page-title";
import { LoginLoading, LoginLayout } from "../login-chrome";
import { AcceptInvitation } from "./accept-invitation.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.invitation");

function InvitationFallback() {
  return <LoginLayout><LoginLoading /></LoginLayout>;
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<InvitationFallback />}>
      <AcceptInvitation />
    </Suspense>
  );
}
