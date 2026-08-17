import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Instrument_Sans, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import { RivetIdentityProvider } from "@/lib/auth/rivet-identity";
import { LocaleProvider } from "@/lib/i18n/provider";
import { DEFAULT_LOCALE, LOCALE_COOKIE, dirFor, isLocale } from "@/lib/i18n/config";
import { AppProviders } from "@/lib/providers/app-providers";
import { ConvexClientProvider } from "@/lib/providers/convex-client-provider";
import { ExperienceProvider } from "@/lib/providers/experience-provider";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { Toaster } from "sonner";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language choice is mirrored to a cookie by the locale provider, so the
  // first painted frame already carries the right direction and font stack
  // instead of flipping after hydration.
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={dirFor(locale)} data-scroll-behavior="smooth" className={`${locale === "ar" ? "rtl-font " : ""}${manrope.variable} ${plexMono.variable} ${plexArabic.variable} ${archivo.variable} ${instrumentSans.variable}`}>
      <body data-demo-auth={DEMO_AUTH_BYPASS ? "true" : undefined}>
        <ClerkProvider>
          <ConvexClientProvider>
            <RivetIdentityProvider>
              <LocaleProvider initialLocale={locale}>
              <AppProviders>
                <ExperienceProvider>
                  {children}
                </ExperienceProvider>
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    style: {
                      background: "#15140f",
                      color: "#f2f0e6",
                      border: "1px solid #2e2c22",
                      borderRadius: "6px",
                      fontSize: "13px",
                    },
                  }}
                />
              </AppProviders>
              </LocaleProvider>
            </RivetIdentityProvider>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
