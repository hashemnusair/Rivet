import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { ARABIC_ENABLED, isLocale, type Locale } from "@/lib/i18n/config";
import { LANDING_PATHS, landingLanguagePrePaintScript } from "@/lib/routing/landing";
import { RootDocument, rootMetadata, rootViewport } from "../../root-document";
import { LandingLanguageAddress } from "./landing-language-address";

type Params = Promise<{ lang: string }>;

// Only the built languages exist; anything else under "/" is not found.
export const dynamicParams = false;

export function generateStaticParams() {
  return ARABIC_ENABLED ? [{ lang: "en" }, { lang: "ar" }] : [{ lang: "en" }];
}

async function localeOf(params: Params): Promise<Locale> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return lang;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await localeOf(params);
  return {
    ...rootMetadata(locale),
    alternates: {
      canonical: LANDING_PATHS[locale],
      languages: ARABIC_ENABLED ? { en: LANDING_PATHS.en, ar: LANDING_PATHS.ar, "x-default": LANDING_PATHS.en } : undefined,
    },
  };
}

export const viewport: Viewport = rootViewport;

const LANDING_LANGUAGE_PRE_PAINT = [landingLanguagePrePaintScript()];

/**
 * The landing's root layout. Its language comes from the address, not the
 * request, so both pages are built ahead and Vercel's edge serves them to
 * everyone; nothing on them depends on who asks. Signed-in visitors are sent
 * on by the middleware and, failing that, by the landing's pre-paint check.
 * Moving between this layout and the product's is a full page load.
 */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const locale = await localeOf(params);
  return (
    <RootDocument locale={locale} prePaint={LANDING_LANGUAGE_PRE_PAINT}>
      {children}
      <LandingLanguageAddress />
    </RootDocument>
  );
}
