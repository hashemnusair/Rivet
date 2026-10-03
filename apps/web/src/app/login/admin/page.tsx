import type { Metadata } from "next";
import { pageTitle } from "../page-title";
import { PortalSignIn } from "../portal-sign-in.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.admin");

export default function AdminLoginPage() {
  return <PortalSignIn audience="admin" />;
}
