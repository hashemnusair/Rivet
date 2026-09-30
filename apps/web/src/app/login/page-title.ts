import type { Metadata } from "next";
import { translate, type MessageTree } from "@/lib/i18n/dictionary";
import type { TKey } from "@/lib/i18n/provider";
import { ar, en } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

/** Browser-tab title in the reader's language; English when Arabic is off for the deployment. */
export async function pageTitle(key: TKey): Promise<Metadata> {
  const locale = await getRequestLocale();
  const catalogues = { en, ar } as unknown as Record<"en" | "ar", MessageTree>;
  return { title: translate({ messages: catalogues[locale], fallback: catalogues.en, locale }, key) };
}
