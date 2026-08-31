"use client";

import { Check, RotateCcw, Save } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";
import { cn } from "@/lib/utils/cn";

export function SettingsPanel({
  title,
  description,
  control,
  children,
  className,
}: {
  title: string;
  description?: string;
  control?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-ink-3">{description}</p> : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SettingsSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  saveDisabled = false,
  saveDisabledReason,
  guardTitle = "Unsaved settings changes",
  guardDescription = "Save these settings before leaving, discard the local edits, or stay on this page.",
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void | Promise<void>;
  saveLabel?: string;
  saveDisabled?: boolean;
  saveDisabledReason?: string;
  guardTitle?: string;
  guardDescription?: string;
}) {
  const { setGuard } = useUnsavedChanges();
  const actions = useRef({ onSave, onDiscard });
  const wasSaving = useRef(false);
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    actions.current = { onSave, onDiscard };
  }, [onDiscard, onSave]);

  useEffect(() => {
    if (!dirty) {
      setGuard(null);
      return;
    }
    setGuard({
      title: guardTitle,
      description: guardDescription,
      detail: saveDisabledReason ?? "Your saved settings remain active until you confirm these edits.",
      saveDisabledReason,
      save: () => actions.current.onSave(),
      discard: async () => { await actions.current.onDiscard(); },
    });
    return () => setGuard(null);
  }, [dirty, guardDescription, guardTitle, saveDisabledReason, setGuard]);

  useEffect(() => {
    const saveFromKeyboard = (event: KeyboardEvent) => {
      if (!dirty || saving || saveDisabled || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void actions.current.onSave().catch(() => undefined);
    };
    window.addEventListener("keydown", saveFromKeyboard);
    return () => window.removeEventListener("keydown", saveFromKeyboard);
  }, [dirty, saveDisabled, saving]);

  useEffect(() => {
    if (wasSaving.current && !saving && !dirty) {
      setSavedVisible(true);
      const timeout = window.setTimeout(() => setSavedVisible(false), 2200);
      wasSaving.current = saving;
      return () => window.clearTimeout(timeout);
    }
    wasSaving.current = saving;
  }, [dirty, saving]);

  if (!dirty && !saving && !savedVisible) return null;

  return (
    <div className="sticky bottom-3 z-20 mt-5 flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3 text-ink shadow-pop" role="status" aria-live="polite">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2" aria-hidden>
          {savedVisible && !dirty ? <Check className="size-4" /> : <Save className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium">{savedVisible && !dirty ? "Changes saved" : "Unsaved changes"}</p>
          <p className="mt-0.5 text-[11px] text-ink-3">{savedVisible && !dirty ? "The new settings are now active." : (saveDisabledReason ?? "Save before leaving this section.")}</p>
        </div>
      </div>
      {dirty || saving ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void actions.current.onDiscard()}><RotateCcw /> Discard</Button>
          <Button type="button" loading={saving} disabled={saveDisabled} title={saveDisabledReason} onClick={() => void actions.current.onSave().catch(() => undefined)}><Save /> {saveLabel}</Button>
        </div>
      ) : null}
    </div>
  );
}
