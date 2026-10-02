"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  showLabel?: string;
  hideLabel?: string;
};

/**
 * Password control shared by every first-party auth form. Keeping the toggle
 * next to the input preserves the browser's password manager/autocomplete
 * semantics while making the reveal action keyboard and screen-reader usable.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, id, showLabel, hideLabel, ...props }, ref) => {
    const t = useT();
    const [visible, setVisible] = useState(false);

    return (
      // A password is typed left to right in either language, so the field and its
      // reveal button keep one fixed layout (button on the right) and never overlap.
      <div className="relative" dir="ltr">
        <Input
          {...props}
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          className={cn("pe-10", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/30"
          aria-label={visible ? (hideLabel ?? t("auth.password.hide")) : (showLabel ?? t("auth.password.show"))}
          aria-controls={id}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
