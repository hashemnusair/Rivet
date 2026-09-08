import type { ReactNode } from "react";
import { CinematicHeader } from "@/components/marketing/cinematic-header";
import styles from "@/components/marketing/landing-cinematic.module.css";
import { PublicFooter } from "@/components/public/public-footer";
import { cn } from "@/lib/utils/cn";

/**
 * The public site's chrome around a document page: the same fixed paper bar
 * and menu as the landing, the document as a quiet reading surface under it,
 * and the site footer. None of the landing's motion runs here; the bar's
 * height is reserved once above the document, and the sheet wrapper is the
 * surface the open menu dims and locks, restored when the menu closes or the
 * page changes.
 */
export function PublicDocumentPage({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className={cn(styles.pageShell, "min-h-screen bg-paper text-ink")}>
      <CinematicHeader page="document" currentPath={path} />
      <div data-landing-sheet className={styles.pageSheet}>
        <main className={styles.documentMain}>{children}</main>
        <PublicFooter />
      </div>
    </div>
  );
}
