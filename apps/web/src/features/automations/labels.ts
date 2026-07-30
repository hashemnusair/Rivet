import type { AutomationTriggerKey } from "@/lib/domain/types";

export const TRIGGER_LABELS: Record<AutomationTriggerKey, string> = {
  membership_expiring: "Membership expiring",
  membership_expired: "Membership expired",
  member_inactive: "Member inactive",
  lead_untouched: "New lead untouched",
  follow_up_overdue: "Follow-up overdue",
  payment_outstanding: "Payment outstanding",
};

export const ACTION_LABELS: Record<string, string> = {
  create_task: "Create task",
  queue_message: "Queue message",
  notify_manager: "Notify manager",
};
