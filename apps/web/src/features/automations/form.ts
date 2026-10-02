import type { AutomationTriggerKey } from "@/lib/domain/types";
import { createTranslator } from "@/lib/i18n/core";
import type { TFunction } from "@/lib/i18n/provider";
import { latinDigits } from "@/lib/utils/text";

export type AutomationTriggerParams = Record<string, number | number[] | string>;

export function normalizeAutomationNumbers(raw: string): string {
  return latinDigits(raw).replace(/[،٬]/g, ",");
}

export function parseAutomationNumbers(raw: string, allowZero = false): number[] {
  const tokens = normalizeAutomationNumbers(raw).split(",").map((value) => value.trim());
  if (tokens.length === 0 || tokens.some((value) => !/^\d+$/.test(value))) return [];
  const values = tokens.map((value) => Number(value));
  if (values.some((value) => !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0))) return [];
  return [...new Set(values)];
}

export function parseAutomationInteger(raw: string, allowZero = false): number | undefined {
  const value = normalizeAutomationNumbers(raw).trim();
  if (!/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && (allowZero ? number >= 0 : number > 0) ? number : undefined;
}

const ENGLISH = createTranslator("en");

export function automationTriggerParameterLabel(trigger: AutomationTriggerKey, t: TFunction = ENGLISH): string {
  switch (trigger) {
    case "membership_expiring":
      return t("staffTools.automations.editor.daysBeforeEnds");
    case "membership_expired":
      return t("staffTools.automations.editor.daysAfterEnded");
    case "member_inactive":
      return t("staffTools.automations.editor.daysWithoutCheckIn");
    case "payment_outstanding":
      return t("staffTools.automations.editor.daysUnpaid");
    case "lead_untouched":
      return t("staffTools.automations.editor.hoursWithoutContact");
    case "follow_up_overdue":
      return t("staffTools.automations.editor.hoursOverdue");
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
