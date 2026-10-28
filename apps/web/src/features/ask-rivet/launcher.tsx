"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAskRivet } from "./ask-rivet-context";
import { RivetGlyph } from "./rivet-glyph";

/**
 * Wazen's place on every gym screen: the bottom corner, above the page. The
 * home screen offers a message box there, so asking is the first thing on
 * offer; elsewhere it is a compact button. Both step aside while the window
 * is open. Shown only where the gym can use Wazen.
 */
export function AskRivetLauncher() {
  const context = useAskRivet();
  const pathname = usePathname();
  const { t } = useLocale();
  const [text, setText] = useState("");
  if (!context?.available) return null;
  const hidden = context.open;
  const home = pathname === "/dashboard";

  const shell = cn(
    "ask-launcher fixed bottom-4 end-4 z-40 mb-[env(safe-area-inset-bottom)] transition-[opacity,transform] duration-200 ease-out",
    hidden && "pointer-events-none translate-y-2 opacity-0",
  );

  if (home) {
    const submit = () => {
      const question = text.trim();
      if (!question) {
        context.setOpen(true);
        return;
      }
      context.ask(question, { send: true });
      setText("");
    };
    return (
      <form
        className={cn(shell, "hidden w-[min(380px,calc(100vw-32px))] items-center gap-2 rounded-full border border-line-2 bg-surface py-1.5 pe-1.5 ps-3.5 shadow-pop sm:flex")}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        inert={hidden || undefined}
        data-testid="ask-rivet-chatbox"
      >
        <RivetGlyph className="h-4 text-ink" />
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("askRivet.open")}</span>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder={t("askRivet.launcher.placeholder")} dir="auto" maxLength={4_000} className="h-8 w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" data-testid="ask-rivet-chatbox-input" />
        </label>
        <button type="submit" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" aria-label={t("askRivet.open")} aria-controls="ask-rivet-panel" aria-expanded={context.open} data-ask-launcher>
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
      inert={hidden || undefined}
      className={cn(shell, "group/launch inline-flex size-12 items-center justify-center gap-2 rounded-full bg-ink text-paper shadow-pop hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:h-11 sm:w-auto sm:px-4")}
      data-testid="ask-rivet-launcher"
    >
      <RivetGlyph className="h-[18px] sm:h-4" />
      <span className="hidden text-[13.5px] font-medium sm:inline">{t("askRivet.open")}</span>
    </button>
  );
}

/** The home screen's message box is a desktop and tablet affordance; phones get the round button everywhere. */
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
      className={cn("ask-launcher fixed bottom-4 end-4 z-40 mb-[env(safe-area-inset-bottom)] inline-flex size-12 items-center justify-center rounded-full bg-ink text-paper shadow-pop transition-[opacity,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:hidden", context.open && "pointer-events-none translate-y-2 opacity-0")}
      data-ask-launcher
      data-testid="ask-rivet-launcher"
    >
      <RivetGlyph className="h-[18px]" />
    </button>
  );
}
