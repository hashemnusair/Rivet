import type { Metadata } from "next";
import { PortalSignIn } from "./portal-sign-in.client";

export const metadata: Metadata = { title: "Sign in" };

/** One identity form; the authenticated Convex role chooses the destination. */
export default function LoginPage() {
  return <PortalSignIn audience="account" />;
}
