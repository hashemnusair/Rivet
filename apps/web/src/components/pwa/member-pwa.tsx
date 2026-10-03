"use client";
import { useT } from "@/lib/i18n/provider";

import { Bell, Check, Download, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let installPrompt: InstallPromptEvent | undefined;

export function MemberPwaManager() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(registration => registration.active?.postMessage({ type: "rivet:ui-locale", locale: document.documentElement.lang === "ar" ? "ar" : "en" })).catch(() => undefined);
    const capture = (event: Event) => { event.preventDefault(); installPrompt = event as InstallPromptEvent; window.dispatchEvent(new Event("rivet:install-ready")); };
    const installed = () => { installPrompt = undefined; window.dispatchEvent(new Event("rivet:installed")); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed); };
  }, []);
  return null;
}

export function MemberInstallAndNotifications() {
  const t = useT();
  const invalidate = useInvalidate();
  const [canInstall, setCanInstall] = useState(Boolean(installPrompt));
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === "undefined" ? "default" : Notification.permission);
  const subscriptions = useApiQuery(qk.pushSubscriptions, (api) => api.listPushSubscriptions());
  const save = useApiMutation((api, input: { endpoint: string; p256dh: string; auth: string; label?: string }) => api.savePushSubscription(input), { onSuccess: async () => { await invalidate(); toast.success(t("setup.remindersOn")); } });
  const revoke = useApiMutation((api, id: string) => api.revokePushSubscription(id), { onSuccess: async () => { await invalidate(); toast.success(t("setup.remindersOff")); } });
  const markComplete = useApiMutation((api, step: string) => api.updateOnboardingProgress({ audience: "member", completedStepKey: step }));
  const vapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;

  useEffect(() => {
    const ready = () => setCanInstall(Boolean(installPrompt));
    const complete = () => { setInstalled(true); setCanInstall(false); markComplete.mutate("member_install"); };
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    window.addEventListener("rivet:install-ready", ready);
    window.addEventListener("rivet:installed", complete);
    return () => { window.removeEventListener("rivet:install-ready", ready); window.removeEventListener("rivet:installed", complete); };
    // The mutation object is stable for this mounted guide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") { setInstalled(true); setCanInstall(false); markComplete.mutate("member_install"); }
    } catch {
      toast.error(t("setup.installFailed"));
    }
  };
  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) return;
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") { toast.info(t("setup.permissionNotGranted")); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(vapidKey) });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Incomplete push subscription");
      save.mutate({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() });
    } catch {
      toast.error(t("setup.pushFailed"));
    }
  };

  const deviceCount = subscriptions.data?.length ?? 0;
  const notificationsCopy = !vapidKey
    ? t("setup.pushUnavailable")
    : permission === "denied"
      ? t("setup.pushDenied")
      : deviceCount > 0
        ? t("setup.devicesOn", { count: deviceCount })
        : t("setup.ownedDevicesOnly");

  return (
    <section id="install" className="panel mt-4 scroll-mt-24 p-4 sm:p-5" aria-labelledby="install-title">
      <h2 id="install-title" className="text-[15px] font-semibold">{t("setup.installTitle")}</h2>
      <p className="mt-1 text-[13px] text-ink-2">{t("setup.installDescription")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-line p-4">
          <h3 className="text-[13.5px] font-semibold">{t("setup.homeScreenApp")}</h3>
          <p className="mt-1 text-[12.5px] text-ink-2">{installed ? t("setup.alreadyInstalled") : canInstall ? t("setup.canInstall") : t("setup.installHint")}</p>
          {installed ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success-deep" role="status"><Check className="size-4" aria-hidden /> {" "}{t("setup.installed")}</p>
          ) : canInstall ? (
            <Button className="mt-3" size="sm" variant="secondary" onClick={() => void install()}><Download /> {" "}{t("setup.install")}</Button>
          ) : null}
        </div>
        <div className="rounded-md border border-line p-4">
          <h3 className="text-[13.5px] font-semibold">{t("memberProfile.followUp.rowReminders")}</h3>
          <p className="mt-1 text-[12.5px] text-ink-2">{notificationsCopy}</p>
          {vapidKey && permission !== "denied" ? (
            <Button className="mt-3" size="sm" variant="secondary" loading={save.isPending} onClick={() => void enablePush()}><Bell /> {" "}{t("setup.enableDevice")}</Button>
          ) : null}
          {deviceCount > 0 ? (
            <ul className="mt-3 divide-y divide-line border-t border-line" aria-label={t("setup.reminderDevices")}>
              {(subscriptions.data ?? []).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                  <span className="min-w-0 truncate text-ink">{item.label?.endsWith(" browser") ? t("setup.deviceBrowser", { platform: item.label.slice(0, -8) }) : item.label || t("setup.device")}</span>
                  <Button size="sm" variant="ghost" loading={revoke.isPending} onClick={() => revoke.mutate(item.id)}><Trash2 /> {" "}{t("setup.disable")}</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="mt-3 flex gap-2 text-[12px] leading-relaxed text-ink-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("setup.noOfflineData")}</p>
    </section>
  );
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> { const padding = "=".repeat((4 - value.length % 4) % 4); const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (character) => character.charCodeAt(0)); }
function deviceLabel() { const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "Device"; return `${platform} browser`.slice(0, 80); }

declare global { interface Navigator { userAgentData?: { platform?: string } } }
