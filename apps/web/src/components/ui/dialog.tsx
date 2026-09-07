"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, useRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Radix returns focus only to a DialogTrigger. Every dialog in this product
 * opens from component state (a roster row's Remove, a table's Collect, a
 * queue's Done), so without help the operator's focus fell to the page body
 * whenever a dialog closed. The element focused when the dialog opened is the
 * right place to return to; if it has since left the document, the nearest
 * still-open dialog takes focus instead of a removed node or the body.
 */
function restoreFocus(opener: HTMLElement | null): boolean {
  if (opener && opener.isConnected && !opener.matches(":disabled") && opener.tabIndex >= 0) {
    opener.focus({ preventScroll: true });
    return document.activeElement === opener;
  }
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]');
  const parent = dialogs[dialogs.length - 1];
  if (parent) {
    parent.focus({ preventScroll: true });
    return true;
  }
  return false;
}

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-night/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const openerRef = useRef<HTMLElement | null>(null);
  return (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // dvh, not vh: on phones vh is the toolbar-hidden height, so a tall
        // dialog sized by vh keeps its footer (Cancel/Submit) below the fold
        // while the browser chrome or the keyboard is showing.
        "fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-0 rounded-lg border border-line bg-surface shadow-dialog max-h-[calc(100dvh-3rem)] overflow-y-auto data-[state=open]:animate-scale-in",
        className,
      )}
      onOpenAutoFocus={(event) => {
        // Radix fires this before it moves focus into the dialog, so the
        // active element is still the control the operator used to open it.
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        onOpenAutoFocus?.(event);
      }}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        if (event.defaultPrevented) return;
        if (restoreFocus(openerRef.current)) event.preventDefault();
      }}
      {...props}
    >
      {children}
      {!hideClose ? (
        <DialogPrimitive.Close
          className="absolute end-3 top-3 rounded-sm p-1.5 text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
          aria-label="Close dialog"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
  );
});
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-line px-5 py-4", className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-[17px] font-semibold tracking-tight text-ink", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 text-[13px] text-ink-2", className)} {...props} />;
}

function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3.5 rounded-b-lg", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
};
