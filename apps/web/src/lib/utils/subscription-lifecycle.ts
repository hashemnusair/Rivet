import type { MarketplaceGym } from "@/lib/public/experience-data";

export type SubscriptionStatus = MarketplaceGym["subscriptionStatus"];

export interface SubscriptionLifecycleValues {
  status?: SubscriptionStatus;
  trialEndsAt: string;
  subscriptionStartedAt: string;
  currentPeriodEndsAt: string;
  cancelledAt: string;
}

export type SubscriptionLifecycleErrors = Partial<Record<keyof Omit<SubscriptionLifecycleValues, "status">, string>>;

const LIFECYCLE_FIELDS = ["trialEndsAt", "subscriptionStartedAt", "currentPeriodEndsAt", "cancelledAt"] as const;

export function dateInputValue(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function validDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateInputTimestamp(value: string): number | undefined {
  if (!validDateInput(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

/** Validate the lifecycle invariants shared by platform subscription forms. */
export function validateSubscriptionLifecycle(values: SubscriptionLifecycleValues): SubscriptionLifecycleErrors {
  const errors: SubscriptionLifecycleErrors = {};
  const dates: Array<[keyof Omit<SubscriptionLifecycleValues, "status">, string]> = [
    ["trialEndsAt", values.trialEndsAt],
    ["subscriptionStartedAt", values.subscriptionStartedAt],
    ["currentPeriodEndsAt", values.currentPeriodEndsAt],
    ["cancelledAt", values.cancelledAt],
  ];
  dates.forEach(([key, value]) => {
    if (value && !validDateInput(value)) errors[key] = "Enter a valid date.";
  });

  if (values.status === "trial" && !values.trialEndsAt) errors.trialEndsAt = "Required when starting a trial.";
  const trialEndsAt = dateInputTimestamp(values.trialEndsAt);
  const subscriptionStartedAt = dateInputTimestamp(values.subscriptionStartedAt);
  const currentPeriodEndsAt = dateInputTimestamp(values.currentPeriodEndsAt);
  const cancelledAt = dateInputTimestamp(values.cancelledAt);
  if (values.status === "trial" && trialEndsAt !== undefined && trialEndsAt <= Date.now() && !errors.trialEndsAt) {
    errors.trialEndsAt = "Must be in the future for a trial.";
  }
  if (trialEndsAt !== undefined && subscriptionStartedAt !== undefined && trialEndsAt < subscriptionStartedAt && !errors.trialEndsAt) {
    errors.trialEndsAt = "Must be on or after the subscription start date.";
  }
  if (subscriptionStartedAt !== undefined && currentPeriodEndsAt !== undefined && currentPeriodEndsAt < subscriptionStartedAt && !errors.currentPeriodEndsAt) {
    errors.currentPeriodEndsAt = "Must be on or after the subscription start date.";
  }
  if (values.status === "cancelled" && cancelledAt !== undefined && subscriptionStartedAt !== undefined && cancelledAt < subscriptionStartedAt && !errors.cancelledAt) {
    errors.cancelledAt = "Must be on or after the subscription start date.";
  }
  return errors;
}

/** Alias kept for detail-form consumers that validate a lifecycle draft. */
export function validateSubscriptionDraft(values: SubscriptionLifecycleValues): SubscriptionLifecycleErrors;
export function validateSubscriptionDraft(_detail: unknown, values: SubscriptionLifecycleValues): SubscriptionLifecycleErrors;
export function validateSubscriptionDraft(first: unknown, second?: SubscriptionLifecycleValues): SubscriptionLifecycleErrors {
  return validateSubscriptionLifecycle((second ?? first) as SubscriptionLifecycleValues);
}

/** Convert API field-error arrays into the field-level shape used by forms. */
export function lifecycleErrorsFromApi(fieldErrors: Record<string, string[]>): SubscriptionLifecycleErrors {
  return LIFECYCLE_FIELDS.reduce<SubscriptionLifecycleErrors>((errors, field) => {
    const message = fieldErrors[field]?.[0];
    if (message) errors[field] = message;
    return errors;
  }, {});
}
