"use client";

import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAskRivet } from "./ask-rivet-context";
import { RivetGlyph } from "./rivet-glyph";

/** Opens Ask RIVET from the top bar; shown only where the gym can use it. */
export function AskRivetLauncher() {
  const context = useAskRivet();
  const { t } = useLocale();
  if (!context?.available) return null;
  return (
    <button
      id="ask-rivet-launcher"
      type="button"
      onClick={context.toggle}
      aria-expanded={context.open}
      aria-controls="ask-rivet-panel"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink",
        context.open && "bg-sunken text-ink",
      )}
      data-testid="ask-rivet-launcher"
    >
      <RivetGlyph className="h-4" />
      <span className="hidden @[56rem]:inline">{t("askRivet.open")}</span>
      <kbd className="hidden h-5 items-center rounded-sm border border-line bg-paper px-1 font-mono text-[10.5px] text-ink-3 @[72rem]:inline-flex" dir="ltr">⌘J</kbd>
    </button>
  );
}
