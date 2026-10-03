"use client";

import { Languages } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useLocale } from "@/lib/i18n/provider";

function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

/**
 * The one language switch in the product. It names the language you would get,
 * not the one you are in ("العربية" while reading English), because that is the
 * only label a reader who cannot read the current language can act on.
 *
 * Renders nothing unless Arabic is enabled for this deployment
 * (`NEXT_PUBLIC_RIVET_ARABIC=1` or the mock/demo preview).
 * Idea and naming ported from origin/arabic-localisation.
 */
export function LanguageMenuItem() {
  const { locale, setLocale, switchEnabled, t } = useLocale();
  if (!switchEnabled) return null;
  const next = otherLocale(locale);
  return (
    <DropdownMenuItem
      onSelect={() => setLocale(next)}
      aria-label={t("common.language.switchTo", { language: LOCALE_LABELS[next].english })}
      data-testid="language-switch"
    >
      <Languages aria-hidden />
      <span lang={next}>{LOCALE_LABELS[next].native}</span>
    </DropdownMenuItem>
  );
}

/** Stand-alone button for screens with no dropdown (the member app profile). */
export function LanguageButton({ className }: { className?: string }) {
  const { locale, setLocale, switchEnabled, t } = useLocale();
  if (!switchEnabled) return null;
  const next = otherLocale(locale);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      onClick={() => setLocale(next)}
      aria-label={t("common.language.switchTo", { language: LOCALE_LABELS[next].english })}
      data-testid="language-switch"
    >
      <Languages aria-hidden />
      <span lang={next}>{LOCALE_LABELS[next].native}</span>
    </Button>
  );
}
