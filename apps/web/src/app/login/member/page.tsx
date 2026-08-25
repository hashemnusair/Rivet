import type { Metadata } from "next";
import { PortalSignIn } from "../portal-sign-in.client";

export const metadata: Metadata = { title: "Member sign-in" };

export default function MemberLoginPage() {
  return <PortalSignIn audience="member" />;
}
