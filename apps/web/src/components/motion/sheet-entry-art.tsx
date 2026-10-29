import { drawingSvg } from "@/app/(main)/login/sign-in-drawings";
import { svgUrl } from "./sheet-entry";
import type { SheetDock } from "./sheet-store";

/**
 * A door page's own drawing for its pre-paint cover (`sheet-entry`), which
 * otherwise carries the opening drawing: the one the sheet that brought the
 * visitor here played. A style rather than a script; without the cover it
 * draws nothing.
 */
export function SheetEntryArt({ door }: { door: SheetDock }) {
  return <style dangerouslySetInnerHTML={{ __html: `html::before{background-image:${svgUrl(drawingSvg(door))}}` }} />;
}
