import type { MetadataRoute } from "next";
import { createTranslator } from "@/lib/i18n/core";
import { getRequestLocale } from "@/lib/i18n/server";
import { dirFor, type Locale } from "@/lib/i18n/locale";

export function memberManifest(locale: Locale): MetadataRoute.Manifest {
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
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      { name: t("setup.myMemberships"), short_name: t("setup.memberships"), url: "/customer/my-gyms", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
      { name: t("setup.entryQr"), short_name: t("setup.entryQr"), url: "/customer/my-gyms?entry=1", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
      { name: t("setup.paymentsReceipts"), short_name: t("setup.payments"), url: "/customer/finance", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
      { name: t("setup.personalTraining"), short_name: t("setup.ptShort"), url: "/customer/my-gyms?section=pt", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] },
    ],
    launch_handler: {
      client_mode: "navigate-existing",
    },
  };
}

export default async function manifest(): Promise<MetadataRoute.Manifest> { return memberManifest(await getRequestLocale()); }
