"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { OperationalNotification } from "@/lib/api/GymOSApi";
import { groupNotifications } from "../../../convex/branchOpsAssist";

/**
 * The grouped reading of a notification list. Mandatory alerts stay on top
 * and outside every group; groups come from the record a notification is
 * about, then from its kind; everything else stays single. Every row is the
 * same row as in the plain list (open, mark read or unread), unread counts
 * are sums of the originals, and nothing is marked read by grouping.
 */
export function NotificationGroupedView({ notifications, renderRow }: { notifications: OperationalNotification[]; renderRow: (notification: OperationalNotification) => ReactNode }) {
  const grouping = useMemo(() => groupNotifications(notifications), [notifications]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div data-testid="notification-grouped">
      {grouping.mandatory.length ? (
        <div data-testid="notification-mandatory">
          <p className="px-4 pt-3 text-[12px] font-medium text-danger">Important</p>
          {grouping.mandatory.map(renderRow)}
        </div>
      ) : null}
      {grouping.groups.map((group) => {
        const unread = group.unreadCount;
        const open = expanded[group.id] ?? unread > 0;
        return (
          <div key={group.id} className="border-b border-line last:border-b-0" data-testid="notification-group" data-group-id={group.id}>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-sunken" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [group.id]: !open }))}>
              <span className={unread ? "mt-0.5 size-2 shrink-0 rounded-full bg-signal" : "mt-0.5 size-2 shrink-0 rounded-full bg-line-2"} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{group.label}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3" data-testid="notification-group-count">{group.notifications.length} updates · {unread} unread</span>
              </span>
              <ChevronDown className={open ? "size-4 rotate-180 text-ink-3 transition-transform" : "size-4 text-ink-3 transition-transform"} aria-hidden />
            </button>
            {open ? <div className="border-t border-line bg-sunken/30">{group.notifications.map(renderRow)}</div> : null}
          </div>
        );
      })}
      {grouping.singles.map((notification) => (
        <div key={notification.id} data-testid="notification-single">{renderRow(notification)}</div>
      ))}
    </div>
  );
}
