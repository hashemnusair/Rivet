import type { AutomationExecution, AutomationRule } from "@/lib/domain/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ACTION_LABELS, TRIGGER_LABELS } from "./labels";

function valueLabel(value: string | number | number[]): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function automationTriggerDescription(rule: AutomationRule): string {
  const params = Object.entries(rule.triggerParams)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${valueLabel(value)}`)
    .join(" · ");
  return params ? `${TRIGGER_LABELS[rule.trigger]} · ${params}` : TRIGGER_LABELS[rule.trigger];
}

export function automationActionDescription(rule: AutomationRule): string {
  return rule.actions.map((action) => ACTION_LABELS[action.key] ?? action.key.replaceAll("_", " ")).join(", ");
}

/**
 * Saved state and delivery state are different facts. A rule can be saved as
 * enabled while the global pause holds every delivery; a paused rule is off
 * in its own configuration.
 */
export function automationRuleState(rule: Pick<AutomationRule, "enabled">, globallyPaused: boolean): { label: string; variant: BadgeProps["variant"] } {
  if (!rule.enabled) return { label: "paused", variant: "neutral" };
  return globallyPaused ? { label: "enabled · held", variant: "warning" } : { label: "enabled", variant: "success" };
}

export function automationNextRun(rule: Pick<AutomationRule, "enabled">, globallyPaused: boolean): string {
  if (!rule.enabled) return "Paused in saved configuration";
  return globallyPaused ? "Held by the global pause" : "Awaiting scheduler";
}

export function AutomationRuleStateBadge({ rule, globallyPaused }: { rule: Pick<AutomationRule, "enabled">; globallyPaused: boolean }) {
  const state = automationRuleState(rule, globallyPaused);
  return <Badge variant={state.variant} dot>{state.label}</Badge>;
}

function executionVariant(status: AutomationExecution["status"]): BadgeProps["variant"] {
  if (["success", "completed"].includes(status)) return "success";
  if (status === "failed") return "danger";
  if (["suppressed", "skipped_duplicate"].includes(status)) return "warning";
  if (status === "retrying") return "signal";
  return "neutral";
}

const EXECUTION_LABELS: Partial<Record<AutomationExecution["status"], string>> = {
  success: "completed",
  skipped_duplicate: "suppressed · duplicate",
  queued: "pending",
};

export function AutomationExecutionBadge({ status }: { status: AutomationExecution["status"] }) {
  return <Badge variant={executionVariant(status)} dot>{EXECUTION_LABELS[status] ?? status.replaceAll("_", " ")}</Badge>;
}
