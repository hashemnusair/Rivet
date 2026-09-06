"use client";

import { Check, RotateCcw, Save } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";
import { cn } from "@/lib/utils/cn";

/**
 * One section of Settings: the heading that matches the rail label, one
 * sentence of context, the section's primary action, then its panels.
 * Every section starts the same way so the rail, the phone picker and the
 * content always agree on where the reader is.
 */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("space-y-4 pb-4", className)} data-testid={testId}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-display text-[20px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-[13.5px] leading-5 text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** A panel inside a section: optional title row, then its fields or rows. */
export function SettingsPanel({
  title,
  description,
  control,
  children,
  className,
  bodyClassName,
  testId,
  ariaLabel,
}: {
  title?: string;
  description?: ReactNode;
  control?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)} data-testid={testId} aria-label={ariaLabel}>
      {title || control ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? <h3 className="font-display text-[15px] font-semibold leading-[1.4] text-ink">{title}</h3> : null}
            {description ? <p className="mt-0.5 max-w-3xl text-[12.5px] leading-5 text-ink-3">{description}</p> : null}
          </div>
          {control ? <div className="max-w-full shrink-0">{control}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A setting that is on or off. The whole row is the target, so it stays easy
 * to hit on a phone; the hint says what the switch changes.
 */
export function SettingsToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2.5", disabled && "cursor-not-allowed", className)}>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[12px] leading-5 text-ink-3">{hint}</span> : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

/** A field whose unit sits inside the control, so labels stay short. */
export function SettingsUnitInput({ unit, className, ...props }: ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className={cn("relative", className)}>
      <Input {...props} className={cn("w-full tabular", unit.length > 2 ? "pe-14" : "pe-9")} />
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-[12px] text-ink-3" aria-hidden>{unit}</span>
    </div>
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
  error,
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
  /** The last save failure, kept in view until the next save or discard. */
  error?: string;
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
    // A new edit dismisses the "saved" confirmation straight away; otherwise
    // it stays for a moment after a successful save and then clears itself.
    if (dirty || saving) setSavedVisible(false);
    if (wasSaving.current && !saving && !dirty) {
      setSavedVisible(true);
      const timeout = window.setTimeout(() => setSavedVisible(false), 2200);
      wasSaving.current = false;
      return () => window.clearTimeout(timeout);
    }
    wasSaving.current = saving;
  }, [dirty, saving]);

  if (!dirty && !saving && !savedVisible) return null;

  const saved = savedVisible && !dirty && !saving;
  const title = saved ? "Changes saved" : saving ? "Saving changes…" : "Unsaved changes";
  const detail = saved
    ? "The new settings are now active."
    : saving
      ? "Keep this page open until the save completes."
      : error ?? saveDisabledReason ?? "Save before leaving this section, or discard the edits.";

  return (
    <div
      className="sticky bottom-3 z-20 mt-5 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3 text-ink shadow-pop"
      role="status"
      aria-live="polite"
      data-testid="settings-save-bar"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2" aria-hidden>
          {saved ? <Check className="size-4" /> : <Save className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium">{title}</p>
          <p className={cn("mt-0.5 text-[12px] leading-4", error && !saved && !saving ? "text-danger" : "text-ink-3")}>{detail}</p>
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
