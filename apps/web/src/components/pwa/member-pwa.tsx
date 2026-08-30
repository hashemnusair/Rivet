"use client";

import { Bell, Download, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let installPrompt: InstallPromptEvent | undefined;

export function MemberPwaManager() {
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    const capture = (event: Event) => { event.preventDefault(); installPrompt = event as InstallPromptEvent; window.dispatchEvent(new Event("rivet:install-ready")); };
    const installed = () => { installPrompt = undefined; window.dispatchEvent(new Event("rivet:installed")); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed); };
  }, []);
  return null;
}

export function MemberInstallAndNotifications() {
  const invalidate = useInvalidate();
  const [canInstall, setCanInstall] = useState(Boolean(installPrompt));
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === "undefined" ? "default" : Notification.permission);
  const subscriptions = useApiQuery(qk.pushSubscriptions, (api) => api.listPushSubscriptions());
  const save = useApiMutation((api, input: { endpoint: string; p256dh: string; auth: string; label?: string }) => api.savePushSubscription(input), { onSuccess: async () => { await invalidate(); toast.success("Notifications enabled for this device."); } });
  const revoke = useApiMutation((api, id: string) => api.revokePushSubscription(id), { onSuccess: async () => { await invalidate(); toast.success("Device notifications disabled."); } });
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
      toast.error("RIVET could not open the install prompt. Use your browser’s Add to Home Screen command instead.");
    }
  };
  const enablePush = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) return;
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") { toast.info("Notifications remain off. You can enable them later in browser settings."); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(vapidKey) });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Incomplete push subscription");
      save.mutate({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() });
    } catch {
      toast.error("This browser could not enable reminders. Check its notification settings and try again.");
    }
  };

  return <section id="install" className="panel mt-5 p-4"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-signal-bg text-signal-deep"><MonitorSmartphone /></span><div><h2 className="text-[14px] font-semibold">Install and notifications</h2><p className="mt-1 text-[12px] text-ink-2">Install the member app for fast access. Notifications always require browser consent and can be revoked per device.</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-line p-3"><p className="text-[12.5px] font-semibold">Home-screen app</p><p className="mt-1 text-[11.5px] text-ink-3">{installed ? "RIVET is running as an installed app." : canInstall ? "Your browser is ready to install RIVET." : "Use your browser’s Add to Home Screen command if no install button appears."}</p><Button className="mt-3" size="sm" variant="secondary" disabled={!canInstall || installed} onClick={() => void install()}><Download /> {installed ? "Installed" : "Install RIVET"}</Button></div><div className="rounded-lg border border-line p-3"><p className="text-[12.5px] font-semibold">Reminder notifications</p><p className="mt-1 text-[11.5px] text-ink-3">{!vapidKey ? "Push delivery is not configured yet. Nothing will be requested from your browser." : permission === "denied" ? "Your browser has blocked notifications for RIVET." : "Enable reminders only on devices you control."}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!vapidKey || permission === "denied" || save.isPending} onClick={() => void enablePush()}><Bell /> Enable</Button>{(subscriptions.data ?? []).map((item) => <Button key={item.id} size="sm" variant="ghost" loading={revoke.isPending} onClick={() => revoke.mutate(item.id)}><Trash2 /> {item.label}</Button>)}</div></div></div><p className="mt-3 flex gap-2 text-[11px] text-ink-3"><ShieldCheck className="size-3.5 shrink-0" />The service worker caches only the public offline screen and brand assets. It never caches member records, receipts, or entry passes.</p></section>;
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> { const padding = "=".repeat((4 - value.length % 4) % 4); const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (character) => character.charCodeAt(0)); }
function deviceLabel() { const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "Device"; return `${platform} browser`.slice(0, 80); }

declare global { interface Navigator { userAgentData?: { platform?: string } } }
