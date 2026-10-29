import type { Metadata } from "next";
import { SheetEntryArt } from "@/components/motion/sheet-entry-art";
import { pageTitle } from "../page-title";
import { PortalSignIn } from "../portal-sign-in.client";

export const generateMetadata = (): Promise<Metadata> => pageTitle("auth.pageTitle.gym");

export default function GymLoginPage() {
  return (
    <>
      <SheetEntryArt door="staff" />
      <PortalSignIn audience="staff" />
    </>
  );
}
