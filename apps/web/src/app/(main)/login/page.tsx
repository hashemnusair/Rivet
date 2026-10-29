import type { Metadata } from "next";
import { pageTitle } from "./page-title";
import { PortalSignIn } from "./portal-sign-in.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.signIn");

/** One identity form; the authenticated Convex role chooses the destination. */
export default function LoginPage() {
  return <PortalSignIn audience="account" />;
}
