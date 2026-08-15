import type { AutomationTriggerKey } from "@/lib/domain/types";

export type AutomationTriggerParams = Record<string, number | number[] | string>;

export function parseAutomationNumbers(raw: string, allowZero = false): number[] {
  return [...new Set(raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && (allowZero ? value >= 0 : value > 0)))];
}

export function automationTriggerParameterLabel(trigger: AutomationTriggerKey): string {
  switch (trigger) {
    case "membership_expiring":
      return "Days before expiry";
    case "membership_expired":
      return "Days after expiry";
    case "member_inactive":
    case "payment_outstanding":
      return "Days";
    case "lead_untouched":
      return "Hours without first contact";
    case "follow_up_overdue":
      return "Hours overdue";
  }
}

export function automationTriggerParams(trigger: AutomationTriggerKey, raw: string): AutomationTriggerParams {
  const values = parseAutomationNumbers(raw, trigger === "membership_expired");
  if (trigger === "membership_expiring") return { daysBefore: values };
  if (trigger === "membership_expired") return { daysAfter: values[0] ?? 0 };
  if (trigger === "member_inactive" || trigger === "payment_outstanding") return { days: values[0] ?? 0 };
  return { hours: values[0] ?? 0 };
}

export function automationTriggerFieldValue(trigger: AutomationTriggerKey, params: Record<string, unknown>): string {
  if (trigger === "membership_expiring") {
    const daysBefore = params.daysBefore;
    return Array.isArray(daysBefore) ? daysBefore.join(", ") : "";
  }
  if (trigger === "membership_expired") return String(params.daysAfter ?? "");
  if (trigger === "member_inactive" || trigger === "payment_outstanding") return String(params.days ?? "");
  return String(params.hours ?? "");
}

export function hasValidAutomationTriggerParams(trigger: AutomationTriggerKey, raw: string): boolean {
  return parseAutomationNumbers(raw, trigger === "membership_expired").length > 0;
}
