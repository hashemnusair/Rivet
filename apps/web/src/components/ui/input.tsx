import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

const baseField =
  "w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-4 transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-bg/30";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn(baseField, "h-9", className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea className={cn(baseField, "min-h-20 py-2 resize-y", className)} ref={ref} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export { Input, Textarea };
