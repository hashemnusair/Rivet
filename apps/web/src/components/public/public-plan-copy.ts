import { money } from "@/lib/utils/money";
import type { TFunction, TKey } from "@/lib/i18n/core";
import type { Formatters } from "@/lib/i18n/formatters";
import type { Locale } from "@/lib/i18n/locale";
import { formatJodMinor, type PublicPricingPlan } from "@/lib/public/pricing";
import { entitledModulesForPlanSelection } from "@/lib/domain/workspace-modules";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import type { ViewerArea } from "@/lib/auth/public-viewer";

const MODULE_MESSAGES = {
  foundation: "publicCompletion.landing.pricing.module.foundation",
  revenue: "publicCompletion.landing.pricing.module.revenue",
  operations: "publicCompletion.landing.pricing.module.operations",
  finance: "publicCompletion.landing.pricing.module.finance",
  reporting: "publicCompletion.landing.pricing.module.reporting",
} satisfies Record<WorkspaceModuleKey, TKey>;

/** Keep the plan contract intact while presenting its counts in the active locale. */
export function localizedPublicPlanFeatures(plan: PublicPricingPlan, f: Formatters, t: TFunction): string[] {
  const modules = entitledModulesForPlanSelection(plan.name, plan.entitledModules);
  return [
    t("publicCompletion.landing.pricing.branchLimit", { count: plan.branches, formatted: f.number(plan.branches) }),
    t("publicCompletion.landing.pricing.staffLimit", { count: plan.staff, formatted: f.number(plan.staff) }),
    t("publicCompletion.landing.pricing.memberLimit", { count: plan.members, formatted: f.number(plan.members) }),
    ...modules.map((key) => t(MODULE_MESSAGES[key])),
    ...(plan.name === "Enterprise" ? [t("publicCompletion.landing.pricing.prioritySupport")] : []),
    t("publicCompletion.landing.pricing.memberApp"),
    t("publicCompletion.landing.pricing.staffPermissions"),
  ];
}

/** Public JOD keeps the established English `JD` style and the approved Arabic notation. */
export function formatPublicJod(amountMinor: number, f: Formatters, locale: Locale): string {
  return locale === "ar" ? f.money(money(amountMinor, "JOD")) : `JD ${formatJodMinor(amountMinor)}`;
}

const DESTINATION_MESSAGES = {
  gym: { label: "publicCompletion.authHandoff.destinations.gym.label", action: "publicCompletion.authHandoff.destinations.gym.action" },
  reception: { label: "publicCompletion.authHandoff.destinations.reception.label", action: "publicCompletion.authHandoff.destinations.reception.action" },
  member: { label: "publicCompletion.authHandoff.destinations.member.label", action: "publicCompletion.authHandoff.destinations.member.action" },
  platform: { label: "publicCompletion.authHandoff.destinations.platform.label", action: "publicCompletion.authHandoff.destinations.platform.action" },
  resolving: { label: "publicCompletion.authHandoff.destinations.resolving.label", action: "publicCompletion.authHandoff.destinations.resolving.action" },
} satisfies Record<ViewerArea, { label: TKey; action: TKey }>;

export function publicDestinationCopy(area: ViewerArea, t: TFunction): { label: string; action: string } {
  const messages = DESTINATION_MESSAGES[area];
  return { label: t(messages.label), action: t(messages.action) };
}
