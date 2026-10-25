"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsPanel } from "@/features/settings/settings-layout";
import { useLocale } from "@/lib/i18n/provider";
import { usePermissions } from "@/lib/providers/app-providers";
import { useAiSettings } from "./use-assist";

/**
 * The way into Settings → Assistance from Roles & access. RIVET only ever
 * works with the access of the person who asks it, so the two sit together
 * and the settings rail keeps its fixed height. Shown only once RIVET has
 * made assistance available for the gym.
 */
export function AssistanceLink() {
  const { t } = useLocale();
  const { can } = usePermissions();
  const allowed = can("settings.manage");
  const settings = useAiSettings(allowed);
  // Hidden until RIVET makes assistance available for this gym; the server refuses to turn it on before then.
  if (!allowed || !settings.data?.platformAvailable) return null;
  const mode = settings.data.tenantMode;
  return (
    <SettingsPanel title={t("aiWork.settings.title")} description={t("aiWork.settings.linkDescription")} testId="assistance-link">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant={mode === "off" ? "neutral" : "signal"}>{t("aiWork.settings.linkCurrent", { mode: t(`aiWork.settings.mode.${mode}`) })}</Badge>
        <Link href="/settings?section=assistance" className="inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-accent underline underline-offset-4">
          {t("aiWork.settings.linkAction")}
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </SettingsPanel>
  );
}
