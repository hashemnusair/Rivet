import type { TKey } from "@/lib/i18n/provider";
import type { AutomationActionKey, AutomationTriggerKey } from "@/lib/domain/types";

export const TRIGGER_LABEL_KEYS: Record<AutomationTriggerKey, TKey> = {
  membership_expiring: "staffTools.automations.trigger.membership_expiring",
  membership_expired: "staffTools.automations.trigger.membership_expired",
  member_inactive: "staffTools.automations.trigger.member_inactive",
  lead_untouched: "staffTools.automations.trigger.lead_untouched",
  follow_up_overdue: "staffTools.automations.trigger.follow_up_overdue",
  payment_outstanding: "staffTools.automations.trigger.payment_outstanding",
};

export const ACTION_LABEL_KEYS: Record<AutomationActionKey, TKey> = {
  create_task: "staffTools.automations.action.create_task",
  queue_message: "staffTools.automations.action.queue_message",
  notify_manager: "staffTools.automations.action.notify_manager",
};
