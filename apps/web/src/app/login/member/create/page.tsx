import type { Metadata } from "next";
import { SignedInGuard } from "@/components/public/signed-in-guard";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CustomerSignupClient } from "../../../customer/signup/customer-signup.client";
import { PreviewMemberSignupNotice } from "../../../customer/signup/preview-signup-notice";

export const metadata: Metadata = { title: "Create a member account" };

/**
 * A signed-in visitor has an account already. In a real build the middleware
 * sends them on before this renders; the guard covers the demo personas, and
 * stays out of a Clerk sign-up that is still completing on this page.
 */
export default function MemberSignUpPage() {
  return (
    <>
      <SignedInGuard demoOnly />
      {DEMO_AUTH_BYPASS ? <PreviewMemberSignupNotice /> : <CustomerSignupClient />}
    </>
  );
}
