import type { TFunction, TKey } from "./core";
import { navigationCatalogue as english } from "./messages/en/navigationCatalogue";
import { navigationCatalogue as arabic } from "./messages/ar/navigationCatalogue";
import { ARABIC_NAVIGATION_KEYWORDS } from "./navigation-keywords";
import { navigationEntry, type NavigationEntry } from "../../../convex/navigationCatalogue";
import type { WorkspaceSearchResult } from "../domain/qol";
import { parseWorkspaceSubtitle } from "../domain/workspace-subtitle";
import { leadStageName, transactionStatusLabel } from "./labels";
import { isolate, isolateLtr } from "./bidi";

/** Project only known code-owned entries. IDs, routes and access rules are never translated. */
export function localizeNavigationEntry(t: TFunction, entry: NavigationEntry): NavigationEntry {
  const key = entry.id.replace(/[.-]/g, "_") as keyof typeof english;
  if (!Object.hasOwn(english, key)) return entry;
  return {
    ...entry,
    label: t(`navigationCatalogue.${key}.label` as TKey),
    description: t(`navigationCatalogue.${key}.description` as TKey),
    // Either UI language accepts both languages, including existing English aliases.
    keywords: [...entry.keywords, entry.label, arabic[key].label, ...(ARABIC_NAVIGATION_KEYWORDS[entry.id] ?? [])],
  };
}


const PAGE_IDS: Record<string, string> = {
  dashboard: "page.dashboard", reception: "page.reception", members: "page.members", leads: "page.crm.pipeline",
  followups: "page.crm.queues", payments: "page.payments", exports: "page.exports", audit: "page.audit",
  automations: "page.automations", "settings-my-profile": "settings.my-profile", support: "page.support",
  finance: "page.finance", checkout: "page.checkout", payables: "page.operations.payables", operations: "page.operations",
  maintenance: "page.maintenance", pt: "page.pt",
};
const ACTION_IDS: Record<string, string> = {
  "new-member": "form.member.new", "new-lead": "form.lead.new", "collect-payment": "form.payment.collect", "start-checkin": "form.checkin.start",
};

/** Use stable source facts, never translate a person's name or parse an arbitrary historical subtitle. */
export function workspaceTargetCopy(t: TFunction, target: Pick<WorkspaceSearchResult, "kind" | "id" | "href" | "title" | "subtitle" | "subtitleParts">): { title: string; subtitle?: string } {
  const parts = parseWorkspaceSubtitle(target.subtitleParts, target.kind);
  if (parts?.kind === "lead") return { title: target.title, subtitle: `${leadStageName(t, parts.stage)} · ${isolateLtr(parts.phone)}` };
  if (parts?.kind === "receipt") return { title: target.title, subtitle: `${parts.memberName ? isolate(parts.memberName) : t("palette.kind.member")} · ${transactionStatusLabel(t, parts.status)}` };
  if (target.kind === "page" || target.kind === "action") {
    const id = target.kind === "action" ? ACTION_IDS[target.id] : PAGE_IDS[target.id] ?? target.id;
    const known = id ? navigationEntry(id) : undefined;
    if (known?.href === target.href) {
      const entry = localizeNavigationEntry(t, known);
      return { title: entry.label, subtitle: target.subtitle ? entry.description : undefined };
    }
    if (target.kind === "page" && target.id === "settings" && target.href === "/settings") return { title: t("nav.item.settings"), subtitle: target.subtitle ? t("palette.pages.settingsSubtitle") : undefined };
  }
  return { title: target.title, subtitle: target.subtitle };
}
