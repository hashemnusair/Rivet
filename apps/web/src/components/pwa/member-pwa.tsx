"use client";
import { useT } from "@/lib/i18n/provider";

import { Bell, Check, ShieldCheck, SquarePlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useMemberApp } from "@/lib/pwa/use-member-app";
import { useMemberAppInstall } from "./member-app";

export function MemberPwaManager() {
  const app = useMemberApp();
  const invalidate = useInvalidate();
  const onboarding = useApiQuery(qk.onboarding("member"), (api) => api.getOnboardingExperience("member"));
  const markComplete = useApiMutation((api, step: string) => api.updateOnboardingProgress({ audience: "member", completedStepKey: step }), { onSuccess: async () => { await invalidate(); } });
  const reported = useRef(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(registration => registration.active?.postMessage({ type: "rivet:ui-locale", locale: document.documentElement.lang === "ar" ? "ar" : "en" })).catch(() => undefined);
  }, []);

  // Opening RIVET from the home screen (or installing it here) finishes the
  // guide's install step for this account, once.
  const installStepOpen = onboarding.data?.tasks.some((task) => task.key === "member_install" && !task.complete) ?? false;
  useEffect(() => {
    if (reported.current || !installStepOpen || !(app.standalone || app.added)) return;
    reported.current = true;
    markComplete.mutate("member_install");
    // The mutation object is stable for this mounted shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installStepOpen, app.standalone, app.added]);
  return null;
}

export function MemberInstallAndNotifications() {
  const t = useT();
  const invalidate = useInvalidate();
  const { app, start } = useMemberAppInstall();
  const installed = app.standalone || app.added;
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === "undefined" ? "default" : Notification.permission);
  const subscriptions = useApiQuery(qk.pushSubscriptions, (api) => api.listPushSubscriptions());
  const save = useApiMutation((api, input: { endpoint: string; p256dh: string; auth: string; label?: string }) => api.savePushSubscription(input), { onSuccess: async () => { await invalidate(); toast.success(t("setup.remindersOn")); } });
  const revoke = useApiMutation((api, id: string) => api.revokePushSubscription(id), { onSuccess: async () => { await invalidate(); toast.success(t("setup.remindersOff")); } });
  const vapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;

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
          <p className="mt-1 text-[12.5px] text-ink-2">{installed ? t("setup.alreadyInstalled") : t("setup.app.guideDescription")}</p>
          {installed ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-success-deep" role="status"><Check className="size-4" aria-hidden /> {" "}{t("setup.installed")}</p>
          ) : app.ready ? (
            <Button className="mt-3" size="sm" variant="secondary" onClick={start}><SquarePlus /> {" "}{t("setup.app.addToHomeScreen")}</Button>
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
