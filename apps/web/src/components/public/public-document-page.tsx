import type { ReactNode } from "react";
import { CinematicHeader } from "@/components/marketing/cinematic-header";
import styles from "@/components/marketing/landing-cinematic.module.css";
import { PublicFooter } from "@/components/public/public-footer";
import { SignedInGuard } from "@/components/public/signed-in-guard";
import { NightChrome } from "@/components/public/use-night-chrome";
import { cn } from "@/lib/utils/cn";

/**
 * The public site's chrome around any page that is not the landing: the
 * same fixed paper bar and menu, the page as a quiet reading surface under
 * it, and the site footer. None of the landing's motion runs here; the bar's
 * height is reserved once above the content, and the sheet wrapper is the
 * surface the open menu dims and locks, restored when the menu closes or the
 * page changes. A page meant for signed-out visitors only (the application,
 * the doors) sends a signed-in visitor on to their own area.
 *
 * `tone="night"` gives the page the landing's night surface, palette and bar
 * (the application, which a visitor reaches straight from the landing's
 * pricing); the reading pages keep the paper one.
 */
export function PublicDocumentPage({
  path,
  audience = "gym",
  tone = "paper",
  signedOutOnly = false,
  children,
}: {
  path: string;
  audience?: "gym" | "member";
  tone?: "paper" | "night";
  signedOutOnly?: boolean;
  children: ReactNode;
}) {
  const night = tone === "night";
  return (
    <div data-night-page={night ? "" : undefined} className={cn(styles.pageShell, night && [styles.nightPage, "night-tokens marketing-body"], "min-h-screen bg-paper text-ink")}>
      {signedOutOnly ? <SignedInGuard /> : null}
      {night ? <NightChrome /> : null}
      <CinematicHeader page="document" currentPath={path} audience={audience} tone={tone} />
      <div data-landing-sheet className={styles.pageSheet}>
        <main className={styles.documentMain}>{children}</main>
        <PublicFooter />
      </div>
    </div>
  );
}
