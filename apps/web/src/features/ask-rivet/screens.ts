"use client";

import type { ChatContextItem, ChatContextParams } from "@/lib/ai/chat/contracts";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { useAskRivetScreen } from "./ask-rivet-context";

/**
 * What each screen tells Ask RIVET, from data the screen already loaded: the
 * record in focus, the lists worth attaching, and questions to start from.
 * One hook per screen keeps each page's change to a single line.
 */

type Prompts = "default" | "member" | "members" | "dashboard" | "lead" | "leads" | "queues" | "payments" | "shifts" | "classes" | "reports" | "plans";
const PROMPT_COUNT: Record<Prompts, number> = { default: 3, member: 3, members: 3, dashboard: 3, lead: 3, leads: 3, queues: 3, payments: 3, shifts: 2, classes: 3, reports: 3, plans: 2 };

function usePrompts(): (set: Prompts, vars?: Record<string, string>) => string[] {
  const { t } = useLocale();
  return (set, vars) => Array.from({ length: PROMPT_COUNT[set] }, (_, index) => t(`askRivet.prompts.${set}.p${index + 1}` as TKey, vars));
}

/** Report names read mid-sentence in English ("the collections report"); a chip starts with a capital. */
function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function defined(params: Record<string, string | number | boolean | undefined>): ChatContextParams | undefined {
  const out = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== "" && value !== "all")) as ChatContextParams;
  return Object.keys(out).length ? out : undefined;
}

export function useMemberScreen(member: { id: string; fullName: string } | undefined): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen(member ? {
    title: member.fullName,
    focus: { kind: "member", id: member.id, label: member.fullName },
    suggestions: [
      { kind: "member_payments", id: member.id, label: t("askRivet.context.member_payments") },
      { kind: "member_timeline", id: member.id, label: t("askRivet.context.member_timeline") },
    ],
    prompts: prompts("member", { name: firstName(member.fullName) }),
  } : undefined);
}

export function useLeadScreen(lead: { id: string; fullName: string } | undefined): void {
  const prompts = usePrompts();
  useAskRivetScreen(lead ? { title: lead.fullName, focus: { kind: "lead", id: lead.id, label: lead.fullName }, prompts: prompts("lead", { name: firstName(lead.fullName) }) } : undefined);
}

/** The members list: the list as filtered, and the people ticked on it. */
export function useMembersScreen(filters: { search?: string; membershipStatus?: string; planId?: string; status?: string }, total: number | undefined, selected: Array<{ id: string; fullName: string }>): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  const list: ChatContextItem = { kind: "member_list", ...(defined(filters) ? { params: defined(filters) } : {}), label: total !== undefined ? t("askRivet.context.member_list_count", { count: total }) : t("askRivet.context.member_list") };
  useAskRivetScreen({
    suggestions: [list, ...selected.slice(0, 6).map((member): ChatContextItem => ({ kind: "member", id: member.id, label: member.fullName }))],
    prompts: prompts("members"),
  });
}

export function useDashboardScreen(): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({
    suggestions: [{ kind: "today", label: t("askRivet.context.today") }, { kind: "renewals", label: t("askRivet.context.renewals") }, { kind: "tasks", params: { overdueOnly: true }, label: t("askRivet.context.tasks") }],
    prompts: prompts("dashboard"),
  });
}

export function useLeadsScreen(filters: { search?: string; stage?: string }): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({ suggestions: [{ kind: "lead_list", ...(defined(filters) ? { params: defined(filters) } : {}), label: t("askRivet.context.lead_list") }], prompts: prompts("leads") });
}

export function useQueuesScreen(view: "renewals" | "at-risk", bucket?: "expiring" | "expired"): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({
    suggestions: view === "renewals"
      ? [{ kind: "renewals", ...(bucket === "expired" ? { params: { bucket } } : {}), label: t("askRivet.context.renewals") }, { kind: "at_risk", label: t("askRivet.context.at_risk") }]
      : [{ kind: "at_risk", label: t("askRivet.context.at_risk") }, { kind: "renewals", label: t("askRivet.context.renewals") }],
    prompts: prompts("queues"),
  });
}

export function usePaymentsScreen(filters: { from?: string; method?: string }): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({ suggestions: [{ kind: "payments", ...(defined(filters) ? { params: defined(filters) } : {}), label: t("askRivet.context.payments") }, { kind: "shifts", label: t("askRivet.context.shifts") }], prompts: prompts("payments") });
}

export function useShiftsScreen(): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({ suggestions: [{ kind: "shifts", label: t("askRivet.context.shifts") }], prompts: prompts("shifts") });
}

export function useClassesScreen(from?: string): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({ suggestions: [{ kind: "classes", ...(from ? { params: { from } } : {}), label: t("askRivet.context.classes") }], prompts: prompts("classes") });
}

export function useReportsScreen(range?: { from: string; to: string }): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  const window: ChatContextParams = range ? { from: range.from, to: range.to } : {};
  useAskRivetScreen({
    suggestions: [
      { kind: "report", params: { report: "collections", ...window }, label: capitalized(t("askRivet.report.collections")) },
      { kind: "report", params: { report: "retention" }, label: capitalized(t("askRivet.report.retention")) },
      { kind: "report", params: { report: "peak_hours", ...window }, label: capitalized(t("askRivet.report.peak_hours")) },
      { kind: "payments", ...(range ? { params: window } : {}), label: t("askRivet.context.payments") },
    ],
    prompts: prompts("reports"),
  });
}

export function usePlansScreen(): void {
  const { t } = useLocale();
  const prompts = usePrompts();
  useAskRivetScreen({ suggestions: [{ kind: "plans", label: t("askRivet.context.plans") }], prompts: prompts("plans") });
}
