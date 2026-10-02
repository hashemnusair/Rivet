import { cloneElement, forwardRef, isValidElement, useId, type HTMLAttributes, type LabelHTMLAttributes } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="field-label"
      className={cn("block text-[13px] font-medium text-ink-2 mb-1.5", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

/** Field wrapper: label + control + description/error slot. */
function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const element = isValidElement<{ id?: string; "aria-describedby"?: string }>(children) ? children : null;
  const childId = typeof element?.props.id === "string" && element.props.id ? element.props.id : undefined;
  const canReceiveGeneratedId = Boolean(element)
    && (typeof element!.type === "string"
      ? ["input", "textarea", "select"].includes(element!.type)
      : element!.type === Input || element!.type === Textarea);
  const controlId = childId ?? htmlFor ?? (canReceiveGeneratedId ? `field-${generatedId.replace(/:/g, "")}` : undefined);
  const describedBy = [
    element?.props["aria-describedby"],
    error && controlId ? `${controlId}-error` : undefined,
    !error && hint && controlId ? `${controlId}-hint` : undefined,
  ].filter(Boolean).join(" ") || undefined;
  const child = canReceiveGeneratedId && element
    ? cloneElement(element, {
        ...(childId || !controlId ? {} : { id: controlId }),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })
    : children;
  return (
    <div data-slot="field" className={cn("min-w-0", className)}>
      {label ? (
        <Label htmlFor={controlId}>
          {label}
          {required ? <span className="text-signal ms-1" aria-hidden>*</span> : null}
        </Label>
      ) : null}
      {child}
      {error ? (
        <p id={controlId ? `${controlId}-error` : undefined} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={controlId ? `${controlId}-hint` : undefined} className="mt-1.5 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const fieldGridLabelAlignment = {
  base: "[&>[data-slot=field]>[data-slot=field-label]]:flex [&>[data-slot=field]>[data-slot=field-label]]:min-h-[2lh] [&>[data-slot=field]>[data-slot=field-label]]:items-end",
  sm: "sm:[&>[data-slot=field]>[data-slot=field-label]]:flex sm:[&>[data-slot=field]>[data-slot=field-label]]:min-h-[2lh] sm:[&>[data-slot=field]>[data-slot=field-label]]:items-end",
  md: "md:[&>[data-slot=field]>[data-slot=field-label]]:flex md:[&>[data-slot=field]>[data-slot=field-label]]:min-h-[2lh] md:[&>[data-slot=field]>[data-slot=field-label]]:items-end",
} as const;

/** Multi-column field group with a shared two-line label rhythm. */
function FieldGrid({
  alignFrom = "sm",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { alignFrom?: keyof typeof fieldGridLabelAlignment }) {
  return (
    <div
      data-slot="field-grid"
      className={cn("grid gap-3", fieldGridLabelAlignment[alignFrom], className)}
      {...props}
    />
  );
}

const Separator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }>(
  ({ className, orientation = "horizontal", ...props }, ref) => (
    <div
      ref={ref}
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-line shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "w-px h-full",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

export { Label, Field, FieldGrid, Separator };
