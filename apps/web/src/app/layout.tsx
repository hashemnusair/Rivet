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
import { getRequestUiPreference } from "@/lib/i18n/server";
import { LocalizedToaster } from "@/components/shared/localized-toaster";
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
  weight: ["400", "500", "600"],
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

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "RIVET — Gym revenue & operations",
    template: "%s · RIVET",
  },
  description:
    "RIVET is the revenue and operations system for gyms: members, memberships, sales pipeline, reception, payments and reconciliation — with full staff accountability.",
  applicationName: "RIVET",
  appleWebApp: {
    capable: true,
    title: "RIVET",
    statusBarStyle: "default",
  },
  openGraph: {
    title: "RIVET — Every member. Every dinar. Every shift.",
    description: "The revenue and operations system for gyms—and one simple membership home for their customers.",
    type: "website",
    images: [{ url: "/brand/rivet-social-preview.png", width: 1200, height: 630, alt: "RIVET gym operations" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RIVET — Gym revenue & operations",
    description: "One operating loop for gym sales, members, entry, payments, and accountability.",
    images: ["/brand/rivet-social-preview.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f4ef",
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
    <html lang={locale} dir={dirFor(locale)} data-scroll-behavior="smooth" className={locale === "ar" ? `${fontClasses} rtl-font` : fontClasses}>
      <body data-demo-auth={DEMO_AUTH_BYPASS ? "true" : undefined}>
        {PRE_PAINT_SIGNED_IN_GUARD ? <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SIGNED_IN_GUARD }} /> : null}
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
        </LocaleProvider>
      </body>
    </html>
  );
}
