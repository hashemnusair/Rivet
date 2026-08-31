"use client";

import { useRouter } from "next/navigation";
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface UnsavedChangesGuard {
  save: () => Promise<void>;
  discard: () => Promise<void>;
  title?: string;
  description?: string;
  detail?: string;
  saveDisabledReason?: string;
}

interface UnsavedChangesContextValue {
  setGuard: (guard: UnsavedChangesGuard | null) => void;
  requestNavigation: (navigate: () => void) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

function internalHref(anchor: HTMLAnchorElement): string | null {
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = `${url.pathname}${url.search}${url.hash}`;
  return next === current ? null : next;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [guard, setGuard] = useState<UnsavedChangesGuard | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [resolving, setResolving] = useState<"save" | "discard" | null>(null);

  const requestNavigation = useCallback((navigate: () => void) => {
    if (!guard) {
      navigate();
      return;
    }
    setPendingNavigation(() => navigate);
  }, [guard]);

  useEffect(() => {
    if (!guard) return;
    const intercept = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = internalHref(anchor);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      requestNavigation(() => router.push(href));
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [guard, requestNavigation, router]);

  useEffect(() => {
    if (!guard) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guard]);

  const continueNavigation = useCallback(() => {
    const navigate = pendingNavigation;
    setPendingNavigation(null);
    setGuard(null);
    startTransition(() => navigate?.());
  }, [pendingNavigation]);

  const resolve = async (choice: "save" | "discard") => {
    if (!guard || resolving) return;
    setResolving(choice);
    try {
      if (choice === "save") await guard.save();
      else await guard.discard();
      continueNavigation();
    } catch {
      // The owning mutation reports the actionable error. Keep the dialog open
      // so the user can retry, discard, or stay without losing local edits.
      return;
    } finally {
      setResolving(null);
    }
  };

  const value = useMemo(() => ({ setGuard, requestNavigation }), [requestNavigation]);

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <Dialog open={pendingNavigation !== null} onOpenChange={(open) => { if (!open && !resolving) setPendingNavigation(null); }}>
        <DialogContent hideClose onEscapeKeyDown={(event) => { if (resolving) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{guard?.title ?? "Unsaved public profile changes"}</DialogTitle>
            <DialogDescription>{guard?.description ?? "Save the draft before leaving, discard the local edits and unreferenced uploads, or stay on this page."}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-[12.5px] text-ink-2">{guard?.detail ?? "Publishing remains unavailable until these edits are saved."}</p>
          </DialogBody>
          <DialogFooter className="flex-wrap">
            <Button type="button" variant="ghost" disabled={Boolean(resolving)} onClick={() => setPendingNavigation(null)}>Stay</Button>
            <Button type="button" variant="secondary" loading={resolving === "discard"} disabled={Boolean(resolving)} onClick={() => void resolve("discard")}>Discard and leave</Button>
            <Button type="button" loading={resolving === "save"} disabled={Boolean(resolving) || Boolean(guard?.saveDisabledReason)} title={guard?.saveDisabledReason} onClick={() => void resolve("save")}>Save and leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const value = useContext(UnsavedChangesContext);
  if (!value) throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  return value;
}
