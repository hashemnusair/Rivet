"use client";

import { Languages } from "lucide-react";
import { LOCALE_LABELS, otherLocale } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * The one language switch in the product. It names the language you would get,
 * not the one you are in — "العربية" while reading English — because that is
 * the only label a reader who cannot read the current language can act on.
 */
export function LanguageToggle({
  variant = "ghost",
  showLabel = true,
  className,
}: {
  variant?: "ghost" | "secondary" | "night";
  /** Icon-only in tight chrome like the member dock. */
  showLabel?: boolean;
  className?: string;
}) {
  const { locale, setLocale, t } = useLocale();
  const next = otherLocale(locale);
  const label = LOCALE_LABELS[next].native;

  return (
    <Button
      variant={variant}
      size={showLabel ? "sm" : "icon"}
      onClick={() => setLocale(next)}
      aria-label={t("common.language.switchTo", { language: LOCALE_LABELS[next].english })}
      className={cn("shrink-0", className)}
      // The label is the *other* language, so it must render in that language's
      // script regardless of the page direction.
      lang={next}
    >
      <Languages aria-hidden />
      {showLabel ? <span>{label}</span> : null}
    </Button>
  );
}
