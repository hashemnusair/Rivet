import type { Metadata } from "next";
import { SheetEntryArt } from "@/components/motion/sheet-entry-art";
import { pageTitle } from "../page-title";
import { PortalSignIn } from "../portal-sign-in.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.member");

export default function MemberLoginPage() {
  return (
    <>
      <SheetEntryArt door="member" />
      <PortalSignIn audience="member" />
    </>
  );
}
