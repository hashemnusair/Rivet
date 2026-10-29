"use client";
import { useT } from "@/lib/i18n/provider";

import { Bell, SquarePlus, Trash2 } from "lucide-react";
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

/**
 * Reminders for this device. Installing lives in the guide's install step;
 * where web push is not configured there is nothing to offer, so nothing shows.
 */
export function MemberReminders() {
  const t = useT();
  const invalidate = useInvalidate();
  const vapidKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === "undefined" ? "default" : Notification.permission);
  const subscriptions = useApiQuery(qk.pushSubscriptions, (api) => api.listPushSubscriptions(), { enabled: Boolean(vapidKey) });
  const save = useApiMutation((api, input: { endpoint: string; p256dh: string; auth: string; label?: string }) => api.savePushSubscription(input), { onSuccess: async () => { await invalidate(); toast.success(t("setup.remindersOn")); } });
  const revoke = useApiMutation((api, id: string) => api.revokePushSubscription(id), { onSuccess: async () => { await invalidate(); toast.success(t("setup.remindersOff")); } });
  if (!vapidKey) return null;

  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
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
  const copy = permission === "denied" ? t("setup.pushDenied") : deviceCount > 0 ? t("setup.devicesOn", { count: deviceCount }) : undefined;

  return (
    <section className="panel mt-4 p-4 sm:p-5" aria-labelledby="reminders-title">
      <h2 id="reminders-title" className="text-[15px] font-semibold">{t("setup.reminders")}</h2>
      {copy ? <p className="mt-1 text-[12.5px] text-ink-2">{copy}</p> : null}
      {permission !== "denied" ? (
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
    </section>
  );
}

/**
 * The guide's install step is done in place: it opens the add-to-home-screen
 * flow and finishes by itself once RIVET opens from the home screen.
 */
export function MemberInstallStepAction({ complete }: { complete: boolean }) {
  const t = useT();
  const { app, start } = useMemberAppInstall();
  if (complete || app.standalone || app.added || !app.ready) return null;
  return <div className="mt-3"><Button size="sm" variant="secondary" onClick={start}><SquarePlus /> {" "}{t("setup.app.addToHomeScreen")}</Button></div>;
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> { const padding = "=".repeat((4 - value.length % 4) % 4); const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (character) => character.charCodeAt(0)); }
function deviceLabel() { const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "Device"; return `${platform} browser`.slice(0, 80); }

declare global { interface Navigator { userAgentData?: { platform?: string } } }
