import { getRequestLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/core";
import type { Metadata } from "next";
import PublicOfferClient from "./public-offer.client";

export const dynamicParams = true;

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: t("customerPortal.membershipOffer"), robots: { index: false, follow: false } };
}

export default async function PublicOfferPage({ params }: { params: Promise<{ token: string }> }) {
  return <PublicOfferClient token={(await params).token} />;
}
