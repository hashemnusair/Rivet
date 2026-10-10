import { createTranslator } from "@/lib/i18n/core";
import type { Metadata, Viewport } from "next";
import { HostRouteGuard } from "@/components/auth/host-route-guard";
import { RIVET_HOSTS, RIVET_ORIGINS } from "@/lib/routing/host-routing";
import { ClerkProvider } from "@clerk/nextjs";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans, Manrope } from "next/font/google";
import { RivetIdentityProvider } from "@/lib/auth/rivet-identity";
import { AppProviders } from "@/lib/providers/app-providers";
import { ConvexClientProvider } from "@/lib/providers/convex-client-provider";
import { ExperienceProvider } from "@/lib/providers/experience-provider";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { clerkFrontendApiOrigin, prePaintSignedInGuardScript } from "@/lib/auth/pre-paint-signed-in-guard";
import { LocaleProvider } from "@/lib/i18n/provider";
import { dirFor } from "@/lib/i18n/config";
import { getRequestLocale, getRequestUiPreference } from "@/lib/i18n/server";
import { LocalizedToaster } from "@/components/shared/localized-toaster";
import { PageSheet } from "@/components/motion/page-sheet";
import { PAPER_CHROME } from "@/lib/ui/chrome-colors";
import { SIGN_IN_ART_PRE_PAINT } from "./login/sign-in-art-pre-paint";
import "./globals.css";

/**
 * One Latin family for headings and body. Manrope carries enough character at
 * display sizes to not need a second face, and its tabular figures keep money
 * columns aligned — so mono is reserved for system records (IDs, receipt
 * numbers, references), not for every number on screen.
 */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  // 700 carries the landing's display headings; without it they are synthesised.
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://rivet.jo");

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  return {
  metadataBase,
  title: {
    default: t("publicDocuments.siteTitle"),
    template: "%s · RIVET",
  },
  description:
    t("publicDocuments.siteDescription"),
  applicationName: "RIVET",
  appleWebApp: {
    capable: true,
    title: "RIVET",
    statusBarStyle: "default",
  },
  openGraph: {
    locale: locale === "ar" ? "ar_JO" : "en_JO",
    alternateLocale: locale === "ar" ? "en_JO" : "ar_JO",
    title: t("publicDocuments.socialTitle"),
    description: t("publicDocuments.socialDescription"),
    type: "website",
    images: [{ url: "/brand/rivet-social-preview.png", width: 1200, height: 630, alt: t("publicDocuments.socialAlt") }],
  },
  twitter: {
    card: "summary_large_image",
    title: t("publicDocuments.siteTitle"),
    description: t("publicDocuments.twitterDescription"),
    images: ["/brand/rivet-social-preview.png"],
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PAPER_CHROME,
};

const PRE_PAINT_FRONTEND_API = clerkFrontendApiOrigin(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
/** Only a real Clerk build carries the guard; the mock preview has no sessions to ask about. */
const PRE_PAINT_SIGNED_IN_GUARD = !DEMO_AUTH_BYPASS && PRE_PAINT_FRONTEND_API
  ? prePaintSignedInGuardScript({ frontendApi: PRE_PAINT_FRONTEND_API, appHosts: [RIVET_HOSTS.gym, RIVET_HOSTS.member, RIVET_HOSTS.platform] })
  : null;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Language and direction are decided on the server from the locale cookie so
  // the first paint is already correct. Without the Arabic gate this returns
  // "en" without touching the request, which keeps the layout static.
  const preference = await getRequestUiPreference();
  const locale = preference.locale;
  const fontClasses = `${manrope.variable} ${plexMono.variable} ${plexArabic.variable} ${archivo.variable} ${instrumentSans.variable}`;
  return (
    <html lang={locale} dir={dirFor(locale)} style={{ "--font-manrope-primary": manrope.style.fontFamily.split(",")[0] } as React.CSSProperties} data-scroll-behavior="smooth" className={locale === "ar" ? `${fontClasses} rtl-font` : fontClasses}>
      <body data-demo-auth={DEMO_AUTH_BYPASS ? "true" : undefined}>
        {PRE_PAINT_SIGNED_IN_GUARD ? <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SIGNED_IN_GUARD }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: SIGN_IN_ART_PRE_PAINT }} />
        <LocaleProvider initialLocale={locale} initialOwner={preference.owner} initialPending={preference.pending}>
        <ClerkProvider allowedRedirectOrigins={RIVET_ORIGINS} signInUrl="/login" signUpUrl="/login/member/create" signInFallbackRedirectUrl="/login" signUpFallbackRedirectUrl="/login">
          <HostRouteGuard />
          <ConvexClientProvider>
            <RivetIdentityProvider>
              <AppProviders>
                <ExperienceProvider>
                  {children}
                </ExperienceProvider>
                <LocalizedToaster />
              </AppProviders>
            </RivetIdentityProvider>
          </ConvexClientProvider>
        </ClerkProvider>
        <PageSheet />
        </LocaleProvider>
      </body>
    </html>
  );
}
