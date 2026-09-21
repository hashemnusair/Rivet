"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OperationalNotification } from "@/lib/api/GymOSApi";
import type { NotificationGroup } from "@/lib/domain/types";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { groupNotifications, resolveNotificationTopicReading } from "../../../convex/branchOpsAssist";

function TopicCheck({ notification, groups, onPlace }: { notification: OperationalNotification; groups: NotificationGroup[]; onPlace: (groupId: string) => void }) {
  const suggestion = useAssistJudgment({ questionKey: "branchops.notification_topic", subject: { notificationId: notification.id }, enabled: groups.length > 0, auto: false });
  if (!groups.length || !suggestion.status || !suggestion.featureReady) return null;
  const reading = suggestion.state.status === "ready" ? resolveNotificationTopicReading(suggestion.state.result.judgment, { groups }) : undefined;
  return (
    <div className="px-4 pb-2">
      {suggestion.state.status === "idle" ? <Button type="button" size="xs" variant="ghost" data-testid={`notification-place-${notification.id}`} onClick={suggestion.request}><Sparkles /> Suggest a group</Button> : null}
      <AssistSuggestion
        suggestion={suggestion}
        title="Belongs with"
        testId={`notification-topic-${notification.id}`}
        className="mt-1"
        render={() => reading?.group ? <p data-testid="notification-topic-group">{reading.group.label}</p> : <p data-testid="notification-topic-none">No existing group fits. It stays on its own.</p>}
        actions={() => reading?.group ? <Button type="button" size="xs" variant="secondary" onClick={() => onPlace(reading.group!.id)}>Show under {reading.group.label}</Button> : null}
      />
    </div>
  );
}

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
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const byId = useMemo(() => new Map(notifications.map((notification) => [notification.id, notification] as const)), [notifications]);
  const placedInto = (groupId: string) => Object.entries(placements).filter(([, target]) => target === groupId).map(([id]) => byId.get(id)).filter((notification): notification is OperationalNotification => Boolean(notification) && grouping.singles.some((single) => single.id === notification!.id));
  const singles = grouping.singles.filter((notification) => !placements[notification.id] || !grouping.groups.some((group) => group.id === placements[notification.id]));
  return (
    <div data-testid="notification-grouped">
      {grouping.mandatory.length ? (
        <div data-testid="notification-mandatory">
          <p className="px-4 pt-3 text-[11.5px] font-medium uppercase tracking-wide text-danger">Always shown</p>
          {grouping.mandatory.map(renderRow)}
        </div>
      ) : null}
      {grouping.groups.map((group) => {
        const placed = placedInto(group.id);
        const unread = group.unreadCount + placed.filter((notification) => !notification.readAt).length;
        const open = expanded[group.id] ?? unread > 0;
        return (
          <div key={group.id} className="border-b border-line last:border-b-0" data-testid="notification-group" data-group-id={group.id}>
            <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-sunken" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [group.id]: !open }))}>
              <span className={unread ? "mt-0.5 size-2 shrink-0 rounded-full bg-signal" : "mt-0.5 size-2 shrink-0 rounded-full bg-line-2"} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{group.label}</span>
                <span className="mt-0.5 block text-[12px] text-ink-3" data-testid="notification-group-count">{group.notifications.length + placed.length} updates · {unread} unread</span>
              </span>
              <ChevronDown className={open ? "size-4 rotate-180 text-ink-3 transition-transform" : "size-4 text-ink-3 transition-transform"} aria-hidden />
            </button>
            {open ? <div className="border-t border-line bg-sunken/30">{group.notifications.map(renderRow)}{placed.map((notification) => <div key={notification.id} data-testid="notification-placed"><p className="px-4 pt-2 text-[11px] text-ink-3"><Badge variant="outline">suggested placement</Badge></p>{renderRow(notification)}</div>)}</div> : null}
          </div>
        );
      })}
      {singles.map((notification) => (
        <div key={notification.id} data-testid="notification-single">
          {renderRow(notification)}
          <TopicCheck notification={notification} groups={grouping.groups} onPlace={(groupId) => setPlacements((current) => ({ ...current, [notification.id]: groupId }))} />
        </div>
      ))}
    </div>
  );
}
