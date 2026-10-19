import type { Metadata } from "next";
import { createTranslator } from "@/lib/i18n/core";
import { getRequestLocale } from "@/lib/i18n/server";
import { BillingCheckoutPage } from "@/features/billing/billing-checkout";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getRequestLocale());
  return { title: t("commerce.checkout.title.renewal"), robots: { index: false, follow: false } };
}

export default function BillingPage() {
  return <BillingCheckoutPage />;
}
