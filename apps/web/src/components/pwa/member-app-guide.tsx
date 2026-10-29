"use client";

import { Copy, EllipsisVertical, MonitorDown, Share, SquarePlus, type LucideIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT, type TKey } from "@/lib/i18n/provider";
import type { InstallDevice } from "@/lib/pwa/member-app-install";
import type { MemberAppState } from "@/lib/pwa/use-member-app";

type Step = { title: TKey; detail: TKey; keys?: LucideIcon[] };

export function guideSteps(device: Exclude<InstallDevice, "computer">, safari: boolean): Step[] {
  if (device === "iphone") {
    return [
      { title: "setup.app.iosShareTitle", detail: safari ? "setup.app.iosShareSafari" : "setup.app.iosShareOther", keys: [Share] },
      { title: "setup.app.iosAddTitle", detail: "setup.app.iosAddDetail", keys: [SquarePlus] },
      { title: "setup.app.iosConfirmTitle", detail: "setup.app.iosConfirmDetail" },
    ];
  }
  return [
    { title: "setup.app.androidMenuTitle", detail: "setup.app.androidMenuDetail", keys: [EllipsisVertical] },
    { title: "setup.app.androidAddTitle", detail: "setup.app.androidAddDetail" },
    { title: "setup.app.androidConfirmTitle", detail: "setup.app.androidConfirmDetail" },
  ];
}

/** Where an installed member app starts; also what the QR and copied link open. */
function memberHomeUrl() {
  return `${window.location.origin}/customer/my-gyms`;
}

/**
 * The steps that put RIVET on a home screen, written for the phone and browser
 * in the member's hand. Another phone is one tab away, an in-app browser is
 * told to step out first, and a computer gets a code to open RIVET on the
 * phone instead.
 */
export function MemberAppGuide({ app, onPrompt }: { app: MemberAppState; onPrompt: () => void }) {
  const t = useT();
  const { device, safari, inApp } = app.platform;
  const [phone, setPhone] = useState<Exclude<InstallDevice, "computer">>(device === "android" ? "android" : "iphone");
  const promptHere = app.canPrompt && !inApp;

  return (
    <div className="space-y-4">
      {device === "computer" ? <ComputerHandoff canPrompt={promptHere} onPrompt={onPrompt} /> : null}
      {inApp ? <InAppNotice /> : null}

      {device !== "computer" && promptHere ? (
        <div className="rounded-lg border border-line bg-sunken/40 p-4">
          <p className="text-[13.5px] font-semibold text-ink">{t("setup.app.oneTap")}</p>
          <Button className="mt-3 w-full sm:w-auto" onClick={onPrompt}><SquarePlus />{" "}{t("setup.app.addToHomeScreen")}</Button>
          <p className="mt-3 text-[12.5px] text-ink-2">{t("setup.app.orByHand")}</p>
        </div>
      ) : null}

      <Tabs value={phone} onValueChange={(value) => setPhone(value === "android" ? "android" : "iphone")}>
        <TabsList aria-label={t("setup.app.phoneChoice")}>
          <TabsTrigger value="iphone">{t("setup.app.iphone")}</TabsTrigger>
          <TabsTrigger value="android">{t("setup.app.android")}</TabsTrigger>
        </TabsList>
        {(["iphone", "android"] as const).map((value) => (
          <TabsContent key={value} value={value} className="mt-4">
            <StepList steps={guideSteps(value, value === "iphone" && (device !== "iphone" || safari))} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function StepList({ steps }: { steps: Step[] }) {
  const t = useT();
  return (
    <ol className="space-y-3" aria-label={t("setup.app.steps")}>
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3" data-install-step={step.title}>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-ink text-[12px] font-semibold text-paper tabular" aria-hidden>{index + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13.5px] font-semibold text-ink">{t(step.title)}</p>
              {step.keys?.map((Icon, keyIndex) => (
                <span key={keyIndex} className="inline-flex size-7 items-center justify-center rounded-md border border-line-2 bg-surface text-ink" aria-hidden>
                  <Icon className="size-4" strokeWidth={2.25} />
                </span>
              ))}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t(step.detail)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function InAppNotice() {
  const t = useT();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(memberHomeUrl());
      toast.success(t("setup.app.linkCopied"));
    } catch {
      toast.info(memberHomeUrl());
    }
  };
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-bg/50 p-4" data-install-in-app>
      <p className="text-[13.5px] font-semibold text-ink">{t("setup.app.inAppTitle")}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t("setup.app.inAppDetail")}</p>
      <Button className="mt-3" size="sm" variant="secondary" onClick={() => void copy()}><Copy />{" "}{t("setup.app.copyLink")}</Button>
      <p className="mt-3 text-[12.5px] text-ink-2">{t("setup.app.inAppThen")}</p>
    </div>
  );
}

function ComputerHandoff({ canPrompt, onPrompt }: { canPrompt: boolean; onPrompt: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-sunken/40 p-4 sm:flex-row sm:items-center">
      <div className="w-fit shrink-0 rounded-md border border-line bg-white p-2.5">
        <QRCodeSVG value={memberHomeUrl()} size={128} level="M" role="img" aria-label={t("setup.app.qrLabel")} />
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">{t("setup.app.computerTitle")}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{t("setup.app.computerDetail")}</p>
        {canPrompt ? <Button className="mt-3" size="sm" variant="secondary" onClick={onPrompt}><MonitorDown />{" "}{t("setup.app.computerInstall")}</Button> : null}
      </div>
    </div>
  );
}
