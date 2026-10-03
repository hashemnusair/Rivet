import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/core";
import type { Metadata } from "next";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { PrivacyPolicy } from "@/features/legal/privacy-policy";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: t("publicPrivacy.text124"), description: t("publicDocuments.privacyDescription") };
}

export default function PrivacyPage() {
  return (
    <PublicDocumentPage path="/privacy">
      <PrivacyPolicy />
    </PublicDocumentPage>
  );
}
