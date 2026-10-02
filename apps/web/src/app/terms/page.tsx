import type { Metadata } from "next";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { TermsOfService } from "@/features/legal/terms-of-service";

export const metadata: Metadata = {
  title: "Terms of service · RIVET",
  description: "The terms on which RIVET provides its website and platform, including the data processing addendum.",
};

export default function TermsPage() {
  return (
    <PublicDocumentPage path="/terms">
      <TermsOfService />
    </PublicDocumentPage>
  );
}
