"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { OperationalNotification } from "@/lib/api/GymOSApi";
import { useLocale, type TFunction, type TKey } from "@/lib/i18n/provider";
import { groupNotifications, type NotificationGroup } from "../../../convex/branchOpsAssist";

const FAMILY_LABEL_KEYS: Record<string, TKey> = {
  pt: "palette.notificationGroups.family.pt",
  support: "palette.notificationGroups.family.support",
  members: "palette.notificationGroups.family.members",
  billing: "palette.notificationGroups.family.billing",
  operations: "palette.notificationGroups.family.operations",
};

/**
 * The server builds each group label in English from the record it is about.
 * The group id says which kind of label it is, so the known ones are rebuilt in
 * the reader's language; anything else keeps the server's label.
 */
function groupLabel(t: TFunction, isolate: (value: string | number) => string, isolateLtr: (value: string | number) => string, group: NotificationGroup): string {
  const [scope, kind, ...rest] = group.id.split(":");
  const tail = rest.join(":");
  if (scope === "family" && kind) { const key = FAMILY_LABEL_KEYS[kind]; return key ? t(key) : group.label; }
  if (scope !== "entity") return group.label;
  const named = (prefix: string) => group.label.startsWith(`${prefix}: `) ? group.label.slice(prefix.length + 2) : undefined;
  if (kind === "member") { const name = named("Member"); return name === undefined ? group.label : t("palette.notificationGroups.entity.member", { name: isolate(name) }); }
  if (kind === "lead") { const name = named("Lead"); return name === undefined ? group.label : t("palette.notificationGroups.entity.lead", { name: isolate(name) }); }
  if (kind === "booking") { const name = named("PT booking"); return name === undefined ? group.label : t("palette.notificationGroups.entity.booking", { name: isolate(name) }); }
  if (kind === "case" && group.label === `Support case ${tail}`) return t("palette.notificationGroups.entity.supportCase", { id: isolateLtr(tail) });
  if (kind === "invoice" && group.label === `Invoice ${tail}`) return t("palette.notificationGroups.entity.invoice", { id: isolateLtr(tail) });
  if (kind === "task" && group.label === "Maintenance task") return t("palette.notificationGroups.entity.maintenanceTask");
  return group.label;
}

/**
 * The grouped reading of a notification list. Mandatory alerts stay on top
 * and outside every group; groups come from the record a notification is
 * about, then from its kind; everything else stays single. Every row is the
 * same row as in the plain list (open, mark read or unread), unread counts
 * are sums of the originals, and nothing is marked read by grouping.
 */
export function NotificationGroupedView({ notifications, renderRow }: { notifications: OperationalNotification[]; renderRow: (notification: OperationalNotification) => ReactNode }) {
  const { t, isolate, isolateLtr } = useLocale();
  const grouping = useMemo(() => groupNotifications(notifications), [notifications]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div data-testid="notification-grouped">
      {grouping.mandatory.length ? (
        <div data-testid="notification-mandatory">
          <p className="px-4 pt-3 text-[12px] font-medium text-danger">{t("palette.notificationGroups.important")}</p>
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
                <span className="block text-[13px] font-semibold">{groupLabel(t, isolate, isolateLtr, group)}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3" data-testid="notification-group-count">{t("palette.notificationGroups.updates", { count: group.notifications.length })} · {t("palette.notificationGroups.unread", { count: unread })}</span>
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
