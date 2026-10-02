import type { ReactNode } from "react";
import { CinematicHeader } from "@/components/marketing/cinematic-header";
import styles from "@/components/marketing/landing-cinematic.module.css";
import { PublicFooter } from "@/components/public/public-footer";
import { SignedInGuard } from "@/components/public/signed-in-guard";
import { cn } from "@/lib/utils/cn";

/**
 * The public site's chrome around any page that is not the landing: the
 * same fixed paper bar and menu, the page as a quiet reading surface under
 * it, and the site footer. None of the landing's motion runs here; the bar's
 * height is reserved once above the content, and the sheet wrapper is the
 * surface the open menu dims and locks, restored when the menu closes or the
 * page changes. A page meant for signed-out visitors only (the application,
 * the doors) sends a signed-in visitor on to their own area.
 */
export function PublicDocumentPage({
  path,
  audience = "gym",
  signedOutOnly = false,
  children,
}: {
  path: string;
  audience?: "gym" | "member";
  signedOutOnly?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn(styles.pageShell, "min-h-screen bg-paper text-ink")}>
      {signedOutOnly ? <SignedInGuard /> : null}
      <CinematicHeader page="document" currentPath={path} audience={audience} />
      <div data-landing-sheet className={styles.pageSheet}>
        <main className={styles.documentMain}>{children}</main>
        <PublicFooter />
      </div>
    </div>
  );
}
