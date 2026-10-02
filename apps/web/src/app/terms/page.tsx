import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/core";
import type { Metadata } from "next";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { TermsOfService } from "@/features/legal/terms-of-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: t("publicTerms.text092"), description: t("publicDocuments.termsDescription") };
}

export default function TermsPage() {
  return (
    <PublicDocumentPage path="/terms">
      <TermsOfService />
    </PublicDocumentPage>
  );
}
