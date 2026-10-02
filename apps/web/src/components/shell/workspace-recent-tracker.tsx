"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { qk } from "@/lib/api/keys";
import type { RecentWorkspaceItem } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useLocale, type TFunction, type TKey } from "@/lib/i18n/provider";
import { leadStageName } from "@/lib/i18n/labels";

const PAGE_LABELS: Array<{ prefix: string; id: string }> = [
  { prefix: "/dashboard", id: "dashboard" },
  { prefix: "/reception", id: "reception" },
  { prefix: "/members", id: "members" },
  { prefix: "/crm/pipeline", id: "leads" },
  { prefix: "/crm/queues", id: "followups" },
  { prefix: "/payments", id: "payments" },
  { prefix: "/finance", id: "finance" },
  { prefix: "/checkout", id: "checkout" },
  { prefix: "/operations/payables", id: "payables" },
  { prefix: "/operations", id: "operations" },
  { prefix: "/maintenance", id: "maintenance" },
  { prefix: "/pt", id: "pt" },
  { prefix: "/exports", id: "exports" },
  { prefix: "/audit", id: "audit" },
  { prefix: "/automations", id: "automations" },
  { prefix: "/settings", id: "settings" },
  { prefix: "/support", id: "support" },
];

/** Catalogue keys for the page titles, so recents and the search list show the reader's language. */
const PAGE_TITLE_KEYS: Record<string, TKey> = {
  dashboard: "nav.item.dashboard",
  reception: "nav.item.reception",
  members: "nav.item.members",
  leads: "nav.item.leads",
  followups: "nav.item.followUps",
  payments: "nav.item.payments",
  finance: "nav.section.managementLedger",
  checkout: "nav.item.checkout",
  payables: "palette.pages.supplierBills",
  operations: "nav.item.operations",
  maintenance: "palette.pages.maintenance",
  pt: "nav.item.personalTraining",
  exports: "nav.item.downloads",
  audit: "nav.item.activityLog",
  automations: "palette.pages.automations",
  settings: "nav.item.settings",
  support: "nav.item.support",
};

/** The translated title of a known page id, or undefined for an id this list does not know. */
export function workspacePageTitle(t: TFunction, id: string): string | undefined {
  const key = PAGE_TITLE_KEYS[id];
  return key ? t(key) : undefined;
}

export function WorkspaceRecentTracker() {
  const pathname = usePathname();
  const { t } = useLocale();
  const lastRecorded = useRef("");
  const memberId = pathname.match(/^\/members\/([^/]+)$/)?.[1];
  const leadId = pathname.match(/^\/crm\/leads\/([^/]+)$/)?.[1];
  const receiptId = pathname.match(/^\/payments\/receipts\/([^/]+)$/)?.[1];
  const member = useApiQuery(qk.member(memberId ?? "none"), (api) => api.getMember(memberId!), { enabled: Boolean(memberId) });
  const lead = useApiQuery(qk.lead(leadId ?? "none"), (api) => api.getLead(leadId!), { enabled: Boolean(leadId) });
  const receipt = useApiQuery(qk.receipt(receiptId ?? "none"), (api) => api.getReceipt(receiptId!), { enabled: Boolean(receiptId) });
  const record = useApiMutation((api, item: Omit<RecentWorkspaceItem, "viewedAt">) => api.recordRecentWorkspaceItem(item));
  const target = useMemo<Omit<RecentWorkspaceItem, "viewedAt"> | undefined>(() => {
    if (memberId && member.data) return { kind: "member", id: memberId, title: member.data.fullName, subtitle: member.data.memberNumber, href: pathname };
    if (leadId && lead.data) return { kind: "lead", id: leadId, title: lead.data.fullName, subtitle: `${leadStageName(t, lead.data.stage)} · ${lead.data.phone}`, subtitleParts: { kind: "lead", stage: lead.data.stage, phone: lead.data.phone }, href: pathname };
    if (receiptId && receipt.data) return { kind: "receipt", id: receiptId, title: receipt.data.receipt.receiptNumber, subtitle: receipt.data.member?.fullName ?? receipt.data.customer?.fullName ?? t("palette.kind.receipt"), href: pathname };
    if (memberId || leadId || receiptId) return undefined;
    const page = PAGE_LABELS.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
    return page ? { kind: "page", id: page.id, title: workspacePageTitle(t, page.id) ?? page.id, href: pathname } : undefined;
  }, [lead.data, leadId, member.data, memberId, pathname, receipt.data, receiptId, t]);

  useEffect(() => {
    if (!target) return;
    const signature = `${target.kind}:${target.id}:${target.href}`;
    if (lastRecorded.current === signature) return;
    lastRecorded.current = signature;
    record.mutate(target);
  }, [record, target]);
  return null;
}
