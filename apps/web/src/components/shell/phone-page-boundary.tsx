"use client";

import { Laptop } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/ui/states";
import { useT } from "@/lib/i18n/provider";
import { PHONE_POINTER_QUERY, deviceIsPhone, phoneAllowsHref } from "@/lib/routing/phone-pages";

function subscribeScreen(onChange: () => void) {
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function readIsPhone(): boolean {
  const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia(PHONE_POINTER_QUERY).matches;
  return deviceIsPhone(window.screen, coarsePointer);
}

/**
 * Whether this device is a phone. Hydration assumes a larger screen; the
 * workspace only renders pages once the session has loaded in the browser,
 * so a phone never sees a page it should not before this settles.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribeScreen, readIsPhone, () => false);
}

/** Navigation filter for phones: true when the href is on the phone list or the device is not a phone. */
export function usePhoneAllows(): (href: string) => boolean {
  const isPhone = useIsPhone();
  return useCallback((href: string) => !isPhone || phoneAllowsHref(href), [isPhone]);
}

/**
 * Route-level phone boundary. Navigation hides the other pages; this catches
 * a link, bookmark or notification that opens one on a phone anyway.
 */
export function PhonePageBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const allows = usePhoneAllows();
  const t = useT();
  if (allows(pathname)) return <>{children}</>;
  return (
    <StatePanel
      icon={Laptop}
      title={t("nav.phone.title")}
      description={t("nav.phone.body")}
      action={<Button asChild><Link href="/reception">{t("nav.phone.goToReception")}</Link></Button>}
    />
  );
}
