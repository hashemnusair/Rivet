import type { Metadata, Viewport } from "next";
import { getRequestLocale, getRequestUiPreference } from "@/lib/i18n/server";
import { RootDocument, rootMetadata, rootViewport } from "../root-document";

export async function generateMetadata(): Promise<Metadata> {
  return rootMetadata(await getRequestLocale());
}

export const viewport: Viewport = rootViewport;

/**
 * The product's root layout. Language and direction are decided on the server
 * from the locale cookie (and the signed-in account) so the first paint is
 * already correct, which makes every page here render per request. The
 * landing has its own root layout so it can be built ahead and served from
 * the edge (src/app/(site)/[lang]/layout.tsx).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const preference = await getRequestUiPreference();
  return (
    <RootDocument locale={preference.locale} owner={preference.owner} pending={preference.pending}>
      {children}
    </RootDocument>
  );
}
