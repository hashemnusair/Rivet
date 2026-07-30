import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Manrope } from "next/font/google";
import { AppProviders } from "@/lib/providers/app-providers";
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

export const metadata: Metadata = {
  title: {
    default: "RIVET — Gym revenue & operations",
    template: "%s · RIVET",
  },
  description:
    "RIVET is the revenue and operations system for gyms: members, memberships, sales pipeline, reception, payments and reconciliation — with full staff accountability.",
  applicationName: "RIVET",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15140f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${manrope.variable} ${plexMono.variable} ${plexArabic.variable}`}>
      <body>
        <AppProviders>
          {children}
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
      </body>
    </html>
  );
}
