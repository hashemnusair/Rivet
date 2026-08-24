"use client";

import { useLocale, useSetLocale } from "gt-next";
import { Languages } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type GeneralTranslationLocale = "en" | "ar";

export function normalizeGeneralTranslationLocale(locale: string): GeneralTranslationLocale {
  return locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}

function directionForLocale(locale: GeneralTranslationLocale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function GeneralTranslationLocaleToggle({
  dir,
  setDir,
}: {
  dir: "ltr" | "rtl";
  setDir: (dir: "ltr" | "rtl") => void;
}) {
  const locale = normalizeGeneralTranslationLocale(useLocale());
  const setLocale = useSetLocale();
  const nextLocale: GeneralTranslationLocale = locale === "ar" ? "en" : "ar";
  const nextDirection = directionForLocale(nextLocale);
  const nextLanguageName = nextLocale === "ar" ? "Arabic" : "English";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setLocale(nextLocale);
        document.documentElement.lang = nextLocale;
        if (dir !== nextDirection) setDir(nextDirection);
      }}
      aria-label={`Switch language to ${nextLanguageName}`}
      aria-pressed={locale === "ar"}
      data-testid="gt-locale-toggle"
      data-locale={locale}
      title={`Switch language to ${nextLanguageName}`}
      className={cn(locale === "ar" && "bg-sunken text-ink")}
    >
      <Languages aria-hidden />
      <span>{locale === "ar" ? "English" : "العربية"}</span>
    </Button>
  );
}
