import type { AutomationExecution, AutomationRule } from "@/lib/domain/types";
import type { AutomationMonitoringSummary } from "@/lib/domain/qol";
import { createTranslator } from "@/lib/i18n/core";
import { useT, type TFunction } from "@/lib/i18n/provider";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ACTION_LABEL_KEYS, TRIGGER_LABEL_KEYS } from "./labels";

const ENGLISH = createTranslator("en");
type NumberLabel = (value: number) => string;
const englishNumber: NumberLabel = String;

function valueLabel(value: string | number | number[], numberLabel: NumberLabel): string {
  return Array.isArray(value) ? value.map(numberLabel).join(", ") : typeof value === "number" ? numberLabel(value) : value;
}

/** Known parameters are translated; unknown saved values remain visible verbatim. */
function triggerParamLabel(trigger: AutomationRule["trigger"], key: string, value: string, t: TFunction): string | undefined {
  if (key === "daysBefore") return t("staffTools.automations.param.daysBefore", { value });
  if (key === "daysAfter") return value === "0" ? t("staffTools.automations.param.daysAfterToday") : t("staffTools.automations.param.daysAfter", { value });
  if (key === "days") {
    if (trigger === "member_inactive") return t("staffTools.automations.param.noVisit", { value });
    if (trigger === "payment_outstanding") return t("staffTools.automations.param.unpaid", { value });
    return t("staffTools.automations.param.days", { value });
  }
  if (key === "hours") {
    if (trigger === "lead_untouched") return t("staffTools.automations.param.noContact", { value });
    if (trigger === "follow_up_overdue") return t("staffTools.automations.param.overdue", { value });
    return t("staffTools.automations.param.hours", { value });
  }
  return undefined;
}

export function automationTriggerDescription(rule: AutomationRule, t: TFunction = ENGLISH, numberLabel: NumberLabel = englishNumber): string {
  const triggerKey = TRIGGER_LABEL_KEYS[rule.trigger];
  const triggerName = triggerKey ? t(triggerKey) : String(rule.trigger);
  const params = Object.entries(rule.triggerParams)
    .map(([key, value]) => {
      const displayValue = valueLabel(value, numberLabel);
      return triggerParamLabel(rule.trigger, key, displayValue, t) ?? t("staffTools.automations.param.unknown", { key, value: displayValue });
    })
    .join(" · ");
  return params ? `${triggerName} · ${params}` : triggerName;
}

export function automationActionDescription(rule: AutomationRule, t: TFunction = ENGLISH): string {
  return rule.actions.map((action) => {
    const key = ACTION_LABEL_KEYS[action.key];
    return key ? t(key) : String(action.key);
  }).join(", ");
}

/** Saved state and delivery state are separate facts; the canonical flags stay unchanged. */
export function automationRuleState(rule: Pick<AutomationRule, "enabled">, globallyPaused: boolean, t: TFunction = ENGLISH): { label: string; variant: BadgeProps["variant"] } {
  if (!rule.enabled) return { label: t("staffTools.automations.state.off"), variant: "neutral" };
  return globallyPaused
    ? { label: t("staffTools.automations.state.onHold"), variant: "warning" }
    : { label: t("staffTools.automations.state.on"), variant: "success" };
}

export function automationNextRun(rule: Pick<AutomationRule, "enabled">, globallyPaused: boolean, t: TFunction = ENGLISH): string {
  if (!rule.enabled) return t("staffTools.automations.next.turnedOff");
  return globallyPaused ? t("staffTools.automations.next.pause") : t("staffTools.automations.next.run");
}

export function AutomationRuleStateBadge({ rule, globallyPaused }: { rule: Pick<AutomationRule, "enabled">; globallyPaused: boolean }) {
  const t = useT();
  const state = automationRuleState(rule, globallyPaused, t);
  return <Badge variant={state.variant} dot>{state.label}</Badge>;
}

function executionVariant(status: AutomationExecution["status"]): BadgeProps["variant"] {
  if (["success", "completed"].includes(status)) return "success";
  if (status === "failed") return "danger";
  if (["suppressed", "skipped_duplicate"].includes(status)) return "warning";
  if (status === "retrying") return "signal";
  return "neutral";
}

export function automationExecutionLabel(status: AutomationExecution["status"], t: TFunction = ENGLISH): string {
  const known = ["queued", "running", "completed", "success", "suppressed", "skipped_duplicate", "retrying", "failed"] as const;
  return known.includes(status as (typeof known)[number])
    ? t(`staffTools.automations.execution.${status}`)
    : String(status);
}

type ActionResult = NonNullable<AutomationExecution["actionResults"]>[number];

export function automationActionResultLabel(action: Pick<ActionResult, "key" | "status">, t: TFunction = ENGLISH): string {
  const actionKey = ACTION_LABEL_KEYS[action.key];
  const actionLabel = actionKey ? t(actionKey) : String(action.key);
  const statusKey = ["queued", "completed", "suppressed", "retrying", "failed"].includes(action.status)
    ? `staffTools.automations.actionResult.${action.status}` as const
    : undefined;
  const statusLabel = statusKey ? t(statusKey) : String(action.status);
  return `${actionLabel} · ${statusLabel}`;
}

export function automationSubjectLabel(subjectType: AutomationExecution["subjectType"], t: TFunction = ENGLISH): string {
  const known = ["member", "membership", "lead", "task", "charge"] as const;
  return known.includes(subjectType as (typeof known)[number])
    ? t(`staffTools.automations.subject.${subjectType}`)
    : String(subjectType);
}

type Provider = AutomationMonitoringSummary["providers"][number];

export function automationProviderLabel(provider: Provider, t: TFunction): string {
  const keys: Record<string, Parameters<TFunction>[0]> = {
    internal_tasks: "staffTools.automations.provider.internalTasks",
    email: "staffTools.automations.provider.email",
    sms_whatsapp: "staffTools.automations.provider.whatsapp",
  };
  return keys[provider.key] ? t(keys[provider.key]!) : provider.label;
}

export function automationProviderDetail(provider: Provider, globallyPaused: boolean, t: TFunction): string {
  if (!Object.hasOwn({ internal_tasks: true, email: true, sms_whatsapp: true }, provider.key)) return provider.detail;
  if (!provider.configured) {
    if (provider.key === "email") return provider.detail.includes("preview mode") ? t("staffTools.automations.provider.emailPreview") : t("staffTools.automations.provider.emailMissing");
    if (provider.key === "sms_whatsapp") return provider.detail.includes("preview mode") ? t("staffTools.automations.provider.whatsappPreview") : t("staffTools.automations.provider.whatsappMissing");
    return provider.detail;
  }
  if (globallyPaused) return t("staffTools.automations.provider.heldByPause");
  if (provider.live) return provider.key === "internal_tasks" ? t("staffTools.automations.provider.internalReady") : t("staffTools.automations.provider.ready");
  return t("staffTools.automations.provider.configuredPaused");
}

export function automationPauseReasonLabel(reason: string | undefined, t: TFunction): string | undefined {
  if (!reason) return undefined;
  if (reason === "Automated delivery remains paused until providers, consent policy, and production verification are approved.") return t("staffTools.automations.pauseReason.approvals");
  if (reason === "Automation delivery is enabled for this environment.") return t("staffTools.automations.pauseReason.enabled");
  return reason;
}

export function AutomationExecutionBadge({ status }: { status: AutomationExecution["status"] }) {
  const t = useT();
  return <Badge variant={executionVariant(status)} dot>{automationExecutionLabel(status, t)}</Badge>;
}
