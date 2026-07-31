import type { Metadata } from "next";
import { PortalSignIn } from "../../portal-sign-in.client";

export const metadata: Metadata = { title: "Create a member account" };

export default function MemberSignUpPage() {
  return <PortalSignIn audience="member" mode="sign-up" />;
}
