"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { qk } from "@/lib/api/keys";
import type { RecentWorkspaceItem } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";

const PAGE_LABELS: Array<{ prefix: string; id: string; title: string }> = [
  { prefix: "/dashboard", id: "dashboard", title: "Dashboard" },
  { prefix: "/reception", id: "reception", title: "Reception" },
  { prefix: "/members", id: "members", title: "Members" },
  { prefix: "/crm/pipeline", id: "leads", title: "Leads" },
  { prefix: "/crm/queues", id: "followups", title: "Follow-ups" },
  { prefix: "/payments", id: "payments", title: "Payments" },
  { prefix: "/finance", id: "finance", title: "Management ledger" },
  { prefix: "/operations", id: "operations", title: "Operations" },
  { prefix: "/pt", id: "pt", title: "Personal training" },
  { prefix: "/exports", id: "exports", title: "Data exports" },
  { prefix: "/audit", id: "audit", title: "Audit log" },
  { prefix: "/automations", id: "automations", title: "Automation monitoring" },
  { prefix: "/settings", id: "settings", title: "Settings" },
  { prefix: "/support", id: "support", title: "Support" },
];

export function WorkspaceRecentTracker() {
  const pathname = usePathname();
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
    if (leadId && lead.data) return { kind: "lead", id: leadId, title: lead.data.fullName, subtitle: `${lead.data.stage} · ${lead.data.phone}`, href: pathname };
    if (receiptId && receipt.data) return { kind: "receipt", id: receiptId, title: receipt.data.receipt.receiptNumber, subtitle: receipt.data.member?.fullName ?? receipt.data.customer?.fullName ?? "Receipt", href: pathname };
    if (memberId || leadId || receiptId) return undefined;
    const page = PAGE_LABELS.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
    return page ? { kind: "page", id: page.id, title: page.title, href: pathname } : undefined;
  }, [lead.data, leadId, member.data, memberId, pathname, receipt.data, receiptId]);

  useEffect(() => {
    if (!target) return;
    const signature = `${target.kind}:${target.id}:${target.href}`;
    if (lastRecorded.current === signature) return;
    lastRecorded.current = signature;
    record.mutate(target);
  }, [record, target]);
  return null;
}
