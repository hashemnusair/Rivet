import type { Metadata, MetadataRoute } from "next";
import { createTranslator } from "@/lib/i18n/core";
import { dirFor, type Locale } from "@/lib/i18n/locale";
import { LAUNCH_STARTUP_IMAGES } from "./launch-images";

export const MEMBER_MANIFEST_PATH = "/manifest.webmanifest";

/**
 * What the pages that offer the member app add to the root metadata: its
 * manifest and the iPhone launch images. `appleWebApp` replaces the root's
 * as a whole, so it repeats it; the launch images are drawn for the
 * "default" status bar, which the page sits below.
 */
export const MEMBER_APP_METADATA: Metadata = {
  manifest: MEMBER_MANIFEST_PATH,
  appleWebApp: { capable: true, title: "RIVET", statusBarStyle: "default", startupImage: LAUNCH_STARTUP_IMAGES },
};

const SHORTCUT_ICON = [{ src: "/icons/member-192.png", sizes: "192x192", type: "image/png" }];

/**
 * The member app's identity. Only member pages link it (the customer layout and
 * the member sign-in), so the gym dashboard never offers staff the member app.
 * `origin` lets the app list itself as a related app: Chrome on Android can
 * then tell a browser tab that the app is already installed, and the reminder
 * stops asking.
 */
export function memberManifest(locale: Locale, origin?: string): MetadataRoute.Manifest {
  const t = createTranslator(locale);
  return {
    id: "/customer",
    lang: locale,
    dir: dirFor(locale),
    name: t("setup.manifestName"),
    short_name: "RIVET",
    description: t("setup.manifestDescription"),
    start_url: "/customer/my-gyms",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f5f4ef",
    theme_color: "#f5f4ef",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/member-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/member-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/member-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("setup.myMemberships"), short_name: t("setup.memberships"), url: "/customer/my-gyms", icons: SHORTCUT_ICON },
      { name: t("setup.entryQr"), short_name: t("setup.entryQr"), url: "/customer/my-gyms?entry=1", icons: SHORTCUT_ICON },
      { name: t("setup.paymentsReceipts"), short_name: t("setup.payments"), url: "/customer/finance", icons: SHORTCUT_ICON },
      { name: t("setup.personalTraining"), short_name: t("setup.ptShort"), url: "/customer/my-gyms?section=pt", icons: SHORTCUT_ICON },
    ],
    ...(origin ? { related_applications: [{ platform: "webapp", url: `${origin}${MEMBER_MANIFEST_PATH}` }] } : {}),
    prefer_related_applications: false,
    launch_handler: {
      client_mode: "navigate-existing",
    },
  };
}
