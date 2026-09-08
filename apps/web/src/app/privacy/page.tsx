import type { Metadata } from "next";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { PrivacyPolicy } from "@/features/legal/privacy-policy";

export const metadata: Metadata = {
  title: "Privacy policy · RIVET",
  description: "What RIVET collects, why, who it is shared with, how long it is kept, and what you can do about it.",
};

export default function PrivacyPage() {
  return (
    <PublicDocumentPage path="/privacy">
      <PrivacyPolicy />
    </PublicDocumentPage>
  );
}
