import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const baseField =
  "w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-4 transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-bg/30";

/**
 * A field the caller leaves unbounded still gets a ceiling: a pasted page of
 * text would otherwise be saved and then shown in every list, card, receipt
 * and timeline that echoes it. Fields with a product or API limit pass their
 * own `maxLength`, which always wins.
 */
export const INPUT_MAX_LENGTH = 255;
export const URL_INPUT_MAX_LENGTH = 2048;
export const TEXTAREA_MAX_LENGTH = 2000;
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "password"]);

function defaultInputMaxLength(type: string | undefined): number | undefined {
  if (type === "url") return URL_INPUT_MAX_LENGTH;
  return TEXT_INPUT_TYPES.has(type ?? "text") ? INPUT_MAX_LENGTH : undefined;
}

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, maxLength, ...props }, ref) => (
    <input type={type} maxLength={maxLength ?? defaultInputMaxLength(type)} className={cn(baseField, "h-9", className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, maxLength, ...props }, ref) => (
    <textarea maxLength={maxLength ?? TEXTAREA_MAX_LENGTH} className={cn(baseField, "min-h-20 py-2 resize-y", className)} ref={ref} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export { Input, Textarea };
