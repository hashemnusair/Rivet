import type { Metadata } from "next";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CustomerSignupClient } from "../../../customer/signup/customer-signup.client";
import { PreviewMemberSignupNotice } from "../../../customer/signup/preview-signup-notice";

export const metadata: Metadata = { title: "Create a member account" };

export default function MemberSignUpPage() {
  if (DEMO_AUTH_BYPASS) return <PreviewMemberSignupNotice />;
  return <CustomerSignupClient />;
}
