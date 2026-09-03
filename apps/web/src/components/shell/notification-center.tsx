"use client";

import { Bell, CheckCheck, Circle, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getApi } from "@/lib/api/client";
import type { OperationalNotification } from "@/lib/api/GymOSApi";

export function NotificationCenter({ tone = "light" }: { tone?: "light" | "dark" }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<OperationalNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const unread = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const onError = () => { if (!cancelled) setLoading(false); };
    void getApi().subscribeNotifications((next) => {
      if (cancelled) return;
      setNotifications(next);
      setLoading(false);
    }, onError).then((disposer) => { if (cancelled) disposer(); else unsubscribe = disposer; }).catch(onError);
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  const openNotification = async (notification: OperationalNotification) => {
    setOpen(false);
    if (!notification.readAt) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      try { await getApi().setNotificationRead(notification.id, true); } catch { /* The live query restores the authoritative state. */ }
    }
    router.push(notification.href);
  };

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? readAt })));
    try { await getApi().markAllNotificationsRead(); } catch { toast.error("Notifications could not be marked read."); }
  };

  const toggleRead = async (notification: OperationalNotification) => {
    const read = !notification.readAt;
    const readAt = read ? new Date().toISOString() : undefined;
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt } : item));
    try { await getApi().setNotificationRead(notification.id, read); } catch { toast.error("Notification status could not be changed."); }
  };

  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant={tone === "dark" ? "night-ghost" : "ghost"} size="icon-sm" className="relative" aria-label={unread ? `${unread} unread notifications` : "Notifications"}><Bell />{unread ? <span className="absolute -end-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 font-mono text-[10.5px] text-white">{unread > 99 ? "99+" : unread}</span> : null}</Button></PopoverTrigger><PopoverContent align="end" className="w-[min(380px,calc(100vw-2rem))] p-0"><div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="text-[13px] font-semibold">Notifications</p><p className="mt-0.5 text-[10.5px] text-ink-3">{unread ? `${unread} unread` : "You are up to date"}</p></div><Button variant="ghost" size="xs" disabled={!unread} onClick={() => void markAllRead()}><CheckCheck /> Mark all read</Button></div><div className="max-h-[420px] overflow-y-auto">{loading ? <p className="px-4 py-8 text-center text-[11px] text-ink-3">Loading notifications…</p> : notifications.length === 0 ? <div className="px-6 py-10 text-center"><Bell className="mx-auto size-5 text-ink-3" /><p className="mt-3 text-[12px] font-medium">No notifications yet</p><p className="mt-1 text-[10.5px] text-ink-3">Operational updates addressed to you will appear here.</p></div> : notifications.map((notification) => <div key={notification.id} className="flex border-b border-line last:border-b-0 hover:bg-sunken"><button type="button" onClick={() => void openNotification(notification)} className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-start"><span className={notification.readAt ? "mt-1.5 size-2 shrink-0 rounded-full bg-line-2" : "mt-1.5 size-2 shrink-0 rounded-full bg-signal"} /><span className="min-w-0 flex-1"><span className="block text-[11.5px] font-semibold">{notification.title}</span><span className="mt-1 block text-[10.5px] leading-relaxed text-ink-2">{notification.body}</span><span className="mt-1.5 block font-mono text-[10.5px] text-ink-3">{relativeTime(notification.createdAt)}</span></span></button><button type="button" onClick={() => void toggleRead(notification)} className="m-2 self-start rounded p-1.5 text-ink-3 hover:bg-surface hover:text-ink" aria-label={notification.readAt ? `Mark ${notification.title} unread` : `Mark ${notification.title} read`} title={notification.readAt ? "Mark unread" : "Mark read"}>{notification.readAt ? <Circle className="size-3.5" /> : <CircleCheck className="size-3.5" />}</button></div>)}</div></PopoverContent></Popover>;
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1_440)}d ago`;
}
