import type { Metadata } from "next";
import { pageTitle } from "../page-title";
import { PortalSignIn } from "../portal-sign-in.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.gym");

export default function GymLoginPage() {
  return <PortalSignIn audience="staff" />;
}
