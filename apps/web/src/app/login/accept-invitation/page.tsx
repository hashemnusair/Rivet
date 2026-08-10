import { Suspense } from "react";
import { LoginLoading, LoginLayout } from "../login-chrome";
import { AcceptInvitation } from "./accept-invitation.client";

export const metadata = { title: "Accept gym invitation" };

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
