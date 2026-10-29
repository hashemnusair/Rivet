import type { Metadata } from "next";
import { createTranslator } from "@/lib/i18n/core";
import type { TKey } from "@/lib/i18n/provider";
import { getRequestLocale } from "@/lib/i18n/server";

/** Browser-tab title in the reader's language; English when Arabic is off for the deployment. */
export async function pageTitle(key: TKey): Promise<Metadata> {
  return { title: createTranslator(await getRequestLocale())(key) };
}
