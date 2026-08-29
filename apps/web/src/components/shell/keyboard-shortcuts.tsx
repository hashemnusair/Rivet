"use client";

import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Open workspace search" },
  { keys: ["↑", "↓"], label: "Move through search results" },
  { keys: ["Enter"], label: "Open selected result" },
  { keys: ["Esc"], label: "Close the active dialog" },
  { keys: ["?"], label: "Open this shortcut reference" },
];

export function KeyboardShortcuts() {
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
  return <><Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" onClick={() => setOpen(true)}><Keyboard /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Move through daily work without reaching for the mouse.</DialogDescription></DialogHeader><DialogBody><dl className="divide-y divide-line">{SHORTCUTS.map((shortcut) => <div key={shortcut.label} className="flex items-center justify-between gap-4 py-3"><dt className="text-[12.5px] text-ink-2">{shortcut.label}</dt><dd className="flex gap-1">{shortcut.keys.map((key) => <kbd key={key} className="min-w-7 rounded border border-line-2 bg-sunken px-1.5 py-1 text-center font-mono text-[10.5px] text-ink-2">{key}</kbd>)}</dd></div>)}</dl><p className="mt-4 text-[11px] leading-5 text-ink-3">On Windows and Linux, use Ctrl instead of Command for workspace search.</p></DialogBody></DialogContent></Dialog></>;
}
