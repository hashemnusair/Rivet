import type { AutomationExecution, AutomationRule } from "@/lib/domain/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ACTION_LABELS, TRIGGER_LABELS } from "./labels";

function valueLabel(value: string | number | number[]): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** Known trigger settings read as a short phrase; anything else keeps its raw key. */
function triggerParamLabel(trigger: AutomationRule["trigger"], key: string, value: string): string | undefined {
  if (key === "daysBefore") return `${value} days before it ends`;
  if (key === "daysAfter") return value === "0" ? "on the day it ended" : `${value} days after it ended`;
  if (key === "days") return trigger === "member_inactive" ? `no visit for ${value} days` : trigger === "payment_outstanding" ? `unpaid for ${value} days` : `${value} days`;
  if (key === "hours") return trigger === "lead_untouched" ? `no contact for ${value} hours` : trigger === "follow_up_overdue" ? `overdue by ${value} hours` : `${value} hours`;
  return undefined;
}

export function automationTriggerDescription(rule: AutomationRule): string {
  const params = Object.entries(rule.triggerParams)
    .map(([key, value]) => triggerParamLabel(rule.trigger, key, valueLabel(value)) ?? `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${valueLabel(value)}`)
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
  if (!rule.enabled) return { label: "off", variant: "neutral" };
  return globallyPaused ? { label: "on · on hold", variant: "warning" } : { label: "on", variant: "success" };
}

export function automationNextRun(rule: Pick<AutomationRule, "enabled">, globallyPaused: boolean): string {
  if (!rule.enabled) return "Turned off";
  return globallyPaused ? "Waiting for the pause to end" : "Waiting for the next run";
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

const EXECUTION_LABELS: Record<AutomationExecution["status"], string> = {
  queued: "waiting",
  running: "running",
  completed: "done",
  success: "done",
  suppressed: "not sent",
  skipped_duplicate: "skipped · already done",
  retrying: "trying again",
  failed: "failed",
};

export function automationExecutionLabel(status: AutomationExecution["status"]): string {
  return EXECUTION_LABELS[status] ?? String(status).replaceAll("_", " ");
}

type ActionResult = NonNullable<AutomationExecution["actionResults"]>[number];

const ACTION_RESULT_LABELS: Record<ActionResult["status"], string> = {
  queued: "waiting",
  completed: "done",
  suppressed: "not sent",
  retrying: "trying again",
  failed: "failed",
};

/** One action's result in plain words, for example "Send message · not sent". */
export function automationActionResultLabel(action: Pick<ActionResult, "key" | "status">): string {
  return `${ACTION_LABELS[action.key] ?? action.key.replaceAll("_", " ")} · ${ACTION_RESULT_LABELS[action.status] ?? String(action.status).replaceAll("_", " ")}`;
}

const SUBJECT_LABELS: Record<AutomationExecution["subjectType"], string> = {
  member: "member",
  membership: "membership",
  lead: "lead",
  task: "task",
  charge: "unpaid charge",
};

export function automationSubjectLabel(subjectType: AutomationExecution["subjectType"]): string {
  return SUBJECT_LABELS[subjectType] ?? String(subjectType).replaceAll("_", " ");
}

export function AutomationExecutionBadge({ status }: { status: AutomationExecution["status"] }) {
  return <Badge variant={executionVariant(status)} dot>{automationExecutionLabel(status)}</Badge>;
}
