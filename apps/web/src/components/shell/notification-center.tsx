"use client";

import { Bell, CheckCheck, Circle, CircleCheck, Layers, List, RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getApi } from "@/lib/api/client";
import { useLocale, type TFunction } from "@/lib/i18n/provider";
import type { OperationalNotification } from "@/lib/api/GymOSApi";
import { NotificationGroupedView } from "@/features/branch-ops/notification-groups";
import { groupNotifications } from "../../../convex/branchOpsAssist";
import { useFormat } from "@/lib/i18n/format";
import { presentNotification } from "@/lib/i18n/system-messages";

export function NotificationCenter({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const { t, locale, isolate } = useLocale();
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [view, setView] = useState<"list" | "grouped">("list");
  const notificationsRef = useRef<OperationalNotification[]>([]);
  // Groups are a way of reading the same list; they exist only when at least one group would form.
  const groupable = useMemo(() => groupNotifications(notifications).groups.length > 0, [notifications]);
  const unread = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);

  const replaceNotifications = (next: OperationalNotification[]) => {
    notificationsRef.current = next;
    setNotifications(next);
  };

  const updateNotifications = (update: (current: OperationalNotification[]) => OperationalNotification[]) => {
    replaceNotifications(update(notificationsRef.current));
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    if (notificationsRef.current.length === 0) setLoading(true);
    setError(false);

    const onValue = (next: OperationalNotification[]) => {
      if (cancelled) return;
      replaceNotifications(next);
      setLoading(false);
      setError(false);
    };
    const onError = () => {
      if (cancelled) return;
      setLoading(false);
      setError(true);
    };

    void getApi().listNotifications()
      .then(onValue)
      .then(() => getApi().subscribeNotifications(onValue, onError))
      .then((disposer) => { if (cancelled) disposer(); else unsubscribe = disposer; })
      .catch(onError);

    return () => { cancelled = true; unsubscribe?.(); };
  }, [retryAttempt]);

  const openNotification = async (notification: OperationalNotification) => {
    setOpen(false);
    if (!notification.readAt) {
      updateNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      try { await getApi().setNotificationRead(notification.id, true); } catch { /* The live query restores the authoritative state. */ }
    }
    router.push(notification.href);
  };

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    updateNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })));
    try { await getApi().markAllNotificationsRead(); } catch { toast.error(t("palette.notifications.markAllFailed")); }
  };

  const toggleRead = async (notification: OperationalNotification) => {
    const read = !notification.readAt;
    const readAt = read ? new Date().toISOString() : undefined;
    updateNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
    try { await getApi().setNotificationRead(notification.id, read); } catch { toast.error(t("palette.notifications.changeFailed")); }
  };

  const liveUpdatesPaused = error && notifications.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={tone === "dark" ? "night-ghost" : "ghost"} size="icon-sm" className="relative" aria-label={unread ? t("palette.notifications.unreadLabel", { count: unread }) : t("palette.notifications.title")}>
          <Bell />
          {unread ? <span className="absolute -end-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 font-mono text-[10.5px] text-white">{unread > 99 ? "99+" : unread}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold">{t("palette.notifications.title")}</p>
            <p className="mt-0.5 text-[12px] text-ink-3">{unread ? t("palette.notifications.unreadSummary", { count: unread }) : t("palette.notifications.upToDate")}</p>
          </div>
          <div className="flex items-center gap-1">
            {groupable ? <Button variant="ghost" size="xs" aria-pressed={view === "grouped"} data-testid="notifications-view-toggle" onClick={() => setView((current) => (current === "grouped" ? "list" : "grouped"))}>{view === "grouped" ? <><List /> {t("palette.notifications.viewList")}</> : <><Layers /> {t("palette.notifications.viewGrouped")}</>}</Button> : null}
            <Button variant="ghost" size="xs" disabled={!unread} onClick={() => void markAllRead()}><CheckCheck /> {t("palette.notifications.markAllRead")}</Button>
          </div>
        </div>
        {liveUpdatesPaused && notifications.length > 0 ? (
          <div className="flex items-center gap-2 border-b border-warning/25 bg-warning-bg px-4 py-2 text-[12px] text-warning-deep" role="status">
            <WifiOff className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{t("palette.notifications.savedOffline")}</span>
            <Button variant="ghost" size="xs" onClick={() => setRetryAttempt((current) => current + 1)}><RefreshCw /> {t("palette.notifications.retry")}</Button>
          </div>
        ) : null}
        <div className="max-h-[420px] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-ink-3" role="status">{t("palette.notifications.loading")}</p>
          ) : error && notifications.length === 0 ? (
            <div className="px-6 py-9 text-center" role="alert">
              <WifiOff className="mx-auto size-5 text-warning-deep" />
              <p className="mt-3 text-[13px] font-semibold">{t("palette.notifications.loadFailedTitle")}</p>
              <p className="mx-auto mt-1 max-w-[30ch] text-[12px] leading-relaxed text-ink-3">{t("palette.notifications.loadFailedBody")}</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => setRetryAttempt((current) => current + 1)}><RefreshCw /> {t("common.action.retry")}</Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Bell className="mx-auto size-5 text-ink-3" />
              <p className="mt-3 text-[13px] font-medium">{t("palette.notifications.emptyTitle")}</p>
              <p className="mx-auto mt-1 max-w-[30ch] text-[12px] leading-relaxed text-ink-3">{t("palette.notifications.emptyBody")}</p>
            </div>
          ) : view === "grouped" && groupable ? (
            <NotificationGroupedView notifications={notifications} renderRow={renderRow} />
          ) : notifications.map(renderRow)}
        </div>
      </PopoverContent>
    </Popover>
  );

  function renderRow(notification: OperationalNotification) {
    const display = presentNotification(notification, { locale, t, format });
    return (
            <div key={notification.id} className="flex border-b border-line last:border-b-0 hover:bg-sunken" data-testid="notification-row" data-notification-id={notification.id}>
              <button type="button" onClick={() => void openNotification(notification)} aria-label={`${t("common.action.viewDetails")}: ${isolate(display.title)}`} className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-start">
                <span className={notification.readAt ? "mt-1.5 size-2 shrink-0 rounded-full bg-line-2" : "mt-1.5 size-2 shrink-0 rounded-full bg-signal"} />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block text-[13px] font-semibold">{display.title}</span>
                  <span dir="auto" className="mt-1 block text-[12px] leading-relaxed text-ink-2">{display.body}</span>
                  <span className="mt-1.5 block text-[12px] text-ink-3">{relativeTime(t, notification.createdAt)}</span>
                </span>
              </button>
              <button type="button" onClick={() => void toggleRead(notification)} className="m-2 self-start rounded p-2 text-ink-3 hover:bg-surface hover:text-ink" aria-label={t(notification.readAt ? "palette.notifications.markUnreadFor" : "palette.notifications.markReadFor", { title: isolate(display.title) })} title={t(notification.readAt ? "palette.notifications.markUnread" : "palette.notifications.markRead")}>
                {notification.readAt ? <Circle className="size-3.5" /> : <CircleCheck className="size-3.5" />}
              </button>
            </div>
    );
  }
}

function relativeTime(t: TFunction, value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return t("palette.notifications.timeUnknown");
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return t("palette.notifications.justNow");
  if (minutes < 60) return t("palette.notifications.minutesAgo", { count: minutes });
  if (minutes < 1_440) return t("palette.notifications.hoursAgo", { count: Math.floor(minutes / 60) });
  return t("palette.notifications.daysAgo", { count: Math.floor(minutes / 1_440) });
}
