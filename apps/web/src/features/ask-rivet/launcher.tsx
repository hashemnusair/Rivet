"use client";

import { usePathname } from "next/navigation";
import { useState, type ChangeEvent, type CompositionEvent } from "react";
import { ArrowUp } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAskRivet } from "./ask-rivet-context";
import { RivetGlyph } from "./rivet-glyph";

/**
 * Wazen's place on every gym screen: the bottom corner, above the page. The
 * home screen offers a message box there, as wide as the window, so asking is
 * the first thing on offer; elsewhere it is a compact button. The window grows
 * out of whichever is showing, so each stays in place and steps aside only
 * once the window covers it, and is back before the window settles into it.
 * Shown only where the gym can use Wazen.
 */
function shell(hidden: boolean) {
  return cn(
    "ask-launcher fixed bottom-4 end-4 z-40 mb-[env(safe-area-inset-bottom)] transition-opacity duration-0",
    hidden && "pointer-events-none opacity-0 delay-150",
  );
}

export function AskRivetLauncher() {
  const context = useAskRivet();
  const pathname = usePathname();
  const { t } = useLocale();
  const [text, setText] = useState("");
  if (!context?.available) return null;
  const hidden = context.open;

  if (pathname === "/dashboard") {
    // The first words typed open the window; they carry on in its message box.
    const handOver = (words: string) => {
      setText("");
      context.ask(words, { send: false });
    };
    const onChange = (event: ChangeEvent<HTMLInputElement>) => {
      const words = event.target.value;
      if (words.trim() && !(event.nativeEvent as InputEvent).isComposing) handOver(words);
      else setText(words);
    };
    const onCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
      if (event.currentTarget.value.trim()) handOver(event.currentTarget.value);
    };
    return (
      <form
        className={cn(shell(hidden), "hidden h-[52px] w-[min(420px,calc(100vw-32px))] items-center gap-2.5 rounded-lg border border-line-2 bg-surface pe-[9px] ps-3.5 shadow-pop sm:flex")}
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) handOver(text);
          else context.setOpen(true);
        }}
        inert={hidden || undefined}
        data-ask-origin
        data-testid="ask-rivet-chatbox"
      >
        <RivetGlyph className="h-4 text-ink" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("askRivet.open")}</span>
          <input value={text} onChange={onChange} onCompositionEnd={onCompositionEnd} placeholder={t("askRivet.launcher.placeholder")} dir="auto" maxLength={4_000} className="h-8 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" data-testid="ask-rivet-chatbox-input" />
        </label>
        <button type="submit" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-ink text-paper transition-colors duration-150 hover:bg-night-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" aria-label={t("askRivet.open")} aria-controls="ask-rivet-panel" aria-expanded={context.open} data-ask-launcher data-ask-origin-arrow>
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={context.toggle}
      aria-expanded={context.open}
      aria-controls="ask-rivet-panel"
      aria-label={t("askRivet.open")}
      title={`${t("askRivet.open")} (⌘J)`}
      data-ask-launcher
      data-ask-origin
      inert={hidden || undefined}
      className={cn(shell(hidden), "inline-flex size-12 items-center justify-center gap-2 rounded-lg bg-ink text-paper shadow-pop hover:bg-night-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-11 sm:w-auto sm:px-4")}
      data-testid="ask-rivet-launcher"
    >
      <RivetGlyph className="h-[18px] sm:h-4" />
      <span className="hidden text-[13.5px] font-medium sm:inline">{t("askRivet.open")}</span>
    </button>
  );
}

/** The home screen's message box is a desktop and tablet affordance; phones get the corner button everywhere. */
export function AskRivetPhoneLauncher() {
  const context = useAskRivet();
  const pathname = usePathname();
  const { t } = useLocale();
  if (!context?.available || pathname !== "/dashboard") return null;
  return (
    <button
      type="button"
      onClick={context.toggle}
      aria-expanded={context.open}
      aria-controls="ask-rivet-panel"
      aria-label={t("askRivet.open")}
      inert={context.open || undefined}
      className={cn(shell(context.open), "inline-flex size-12 items-center justify-center rounded-lg bg-ink text-paper shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:hidden")}
      data-ask-launcher
      data-ask-origin
      data-testid="ask-rivet-launcher"
    >
      <RivetGlyph className="h-[18px]" />
    </button>
  );
}
