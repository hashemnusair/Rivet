"use client";
import type { TKey } from "@/lib/i18n/core";
import { useFormat } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";

import { useState } from "react";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { CustomerMarketingPreference } from "@/lib/public/experience-data";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";

export function CustomerCommunicationPreferences() {
  const t = useT();
  const f = useFormat();
  const customer = useCustomerPersona();
  const { updateMarketingPreference } = useExperience();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<TKey>();
  const preference: CustomerMarketingPreference = customer?.marketingPreference ?? {
    optedIn: false,
    status: "unknown",
    source: "system_default",
  };
  const history = customer?.marketingPreferenceHistory?.length ? customer.marketingPreferenceHistory : [preference];

  const toggle = async (optedIn: boolean) => {
    if (saving) return;
    setSaving(true);
    setSaveMessage(undefined);
    try {
      await updateMarketingPreference(optedIn);
      setSaveMessage(optedIn ? "customerPortal.marketingOptedIn" : "customerPortal.marketingOptedOut");
    } catch {
      setSaveMessage("customerPortal.preferenceFailed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="communication" aria-labelledby="communication-heading" className="panel scroll-mt-24 p-4 sm:p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="communication-heading" className="text-[13px] font-semibold">{t("customerPortal.marketingTitle")}</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t("customerPortal.marketingDescription")}</p>
        </div>
        <Switch checked={preference.optedIn} onCheckedChange={(checked) => void toggle(checked)} disabled={saving} aria-label={t("customerPortal.marketingToggle")} />
      </div>
      <p className="mt-3 text-[12.5px] text-ink-3">
        {preference.status === "unknown" || preference.source === "system_default"
          ? t("customerPortal.marketingUnknown")
          : t("customerPortal.lastChanged", { date: f.date(preference.changedAt) })}
      </p>
      {saveMessage ? <p className="mt-2 text-[12.5px] text-ink-2" role="status">{t(saveMessage)}</p> : null}
      <button type="button" onClick={() => setHistoryOpen(true)} className="mt-3 inline-flex min-h-8 items-center text-[12.5px] font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:decoration-ink">
        {t("customerPortal.pastChoices", { count: history.length })}
      </button>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("customerPortal.marketingHistory")}</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-[12.5px] leading-relaxed text-ink-2">{t("customerPortal.marketingHistoryHint")}</p>
            <ol className="mt-5 divide-y divide-line rounded-md border border-line">
              {[...history].reverse().map((entry, index) => (
                <li key={`${entry.changedAt ?? "default"}-${index}`} className="flex items-start justify-between gap-4 px-3 py-3">
                  <span>
                    <span className="block text-[13px] font-medium">{entry.status === "unknown" ? t("customerPortal.noChoice") : entry.optedIn ? t("customerPortal.marketingOn") : t("customerPortal.marketingOff")}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">{entry.source === "system_default" ? t("customerPortal.defaultSetting") : t("customerPortal.chosenByYou")}{entry.changedAt ? ` · ${f.date(entry.changedAt)}` : ""}</span>
                  </span>
                  {index === 0 ? <span className="rounded-sm bg-sunken px-1.5 py-0.5 text-[12px] font-medium text-ink-3">{t("marketing.device.phone.statusValue")}</span> : null}
                </li>
              ))}
            </ol>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}
