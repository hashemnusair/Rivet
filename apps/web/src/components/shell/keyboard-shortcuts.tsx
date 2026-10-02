"use client";

import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS: Array<{ id: string; keys: string[]; label: TKey }> = [
  { id: "open-search", keys: ["⌘", "K"], label: "palette.shortcuts.openSearch" },
  { id: "move", keys: ["↑", "↓"], label: "palette.shortcuts.moveThroughResults" },
  { id: "open-result", keys: ["Enter"], label: "palette.shortcuts.openResult" },
  { id: "close", keys: ["Esc"], label: "palette.shortcuts.closeWindow" },
  { id: "show", keys: ["?"], label: "palette.shortcuts.showShortcuts" },
];

export function KeyboardShortcuts() {
  const { t, isolateLtr } = useLocale();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || target?.matches("input, textarea, select, [contenteditable=true]")) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <><Button variant="ghost" size="icon-sm" aria-label={t("palette.shortcuts.button")} onClick={() => setOpen(true)}><Keyboard /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t("palette.shortcuts.title")}</DialogTitle><DialogDescription>{t("palette.shortcuts.description")}</DialogDescription></DialogHeader><DialogBody><dl className="divide-y divide-line">{SHORTCUTS.map((shortcut) => <div key={shortcut.id} className="flex items-center justify-between gap-4 py-3"><dt className="text-[12.5px] text-ink-2">{t(shortcut.label)}</dt><dd dir="ltr" className="flex gap-1">{shortcut.keys.map((key) => <kbd key={key} className="min-w-7 rounded border border-line-2 bg-sunken px-1.5 py-1 text-center font-mono text-[10.5px] text-ink-2">{key}</kbd>)}</dd></div>)}</dl><p className="mt-4 text-[12px] leading-5 text-ink-3">{t("palette.shortcuts.otherSystems", { ctrl: isolateLtr("Ctrl"), cmd: isolateLtr("⌘") })}</p></DialogBody></DialogContent></Dialog></>;
}
