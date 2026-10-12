import type { Metadata } from "next";
import { SheetEntryArt } from "@/components/motion/sheet-entry-art";
import { pageTitle } from "../page-title";
import { PortalSignIn } from "../portal-sign-in.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.admin");

export default function AdminLoginPage() {
  return (
    <>
      <SheetEntryArt door="admin" />
      <PortalSignIn audience="admin" />
    </>
  );
}
