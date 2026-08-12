import { cloneElement, forwardRef, isValidElement, useId, type HTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
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
  const controlId = htmlFor ?? `field-${generatedId.replace(/:/g, "")}`;
  const canAssociate = isValidElement<{ id?: string; value?: unknown; onChange?: unknown; type?: unknown }>(children)
    && (typeof children.type === "string"
      ? ["input", "textarea", "select"].includes(children.type)
      : children.props.value !== undefined || children.props.onChange !== undefined || children.props.type !== undefined);
  const child = canAssociate && isValidElement<{ id?: string }>(children)
    ? cloneElement(children, children.props.id ? {} : { id: controlId })
    : children;
  return (
    <div className={cn("min-w-0", className)}>
      {label ? (
        <Label htmlFor={canAssociate || htmlFor ? controlId : undefined}>
          {label}
          {required ? <span className="text-signal ms-1" aria-hidden>*</span> : null}
        </Label>
      ) : null}
      {child}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
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

export { Label, Field, Separator };
