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

function executionVariant(status: AutomationExecution["status"]): BadgeProps["variant"] {
  if (["success", "completed"].includes(status)) return "success";
  if (status === "failed") return "danger";
  if (["suppressed", "skipped_duplicate"].includes(status)) return "warning";
  if (status === "retrying") return "signal";
  return "neutral";
}

export function AutomationExecutionBadge({ status }: { status: AutomationExecution["status"] }) {
  return <Badge variant={executionVariant(status)} dot>{status.replaceAll("_", " ")}</Badge>;
}
