import type { AutomationTriggerKey } from "@/lib/domain/types";

export const TRIGGER_LABELS: Record<AutomationTriggerKey, string> = {
  membership_expiring: "Membership ending soon",
  membership_expired: "Membership ended",
  member_inactive: "Member stopped coming",
  lead_untouched: "New lead not contacted",
  follow_up_overdue: "Follow-up overdue",
  payment_outstanding: "Member owes money",
};

export const ACTION_LABELS: Record<string, string> = {
  create_task: "Create task",
  queue_message: "Send message",
  notify_manager: "Alert the manager",
};
