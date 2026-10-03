import type { TFunction } from "./core";
import { memberEnrollment } from "./messages/en/memberEnrollment";

type EnrollmentLeaf = keyof typeof memberEnrollment;
export type EnrollmentMessageKey = `memberEnrollment.${EnrollmentLeaf}`;
/** Store a stable key in form errors so visible errors follow the live locale. */
export const enrollmentKey = (key: EnrollmentLeaf): EnrollmentMessageKey => `memberEnrollment.${key}`;
export function enrollmentErrorText(t: TFunction, message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.startsWith("memberEnrollment.") && Object.hasOwn(memberEnrollment, message.slice(17))
    ? t(message as EnrollmentMessageKey)
    : t("apiErrors.validation");
}

/** Presentation only: plan kind, limits and saved values remain canonical. */
export function planDurationText(t: TFunction, plan: Pick<import("@/lib/domain/types").MembershipPlan, "kind" | "durationDays" | "visitAllowance" | "visitValidityDays">): string {
  if (plan.kind === "time") return t("memberEnrollment.days", { count: plan.durationDays ?? 0 });
  const visits = t("memberEnrollment.visits", { count: plan.visitAllowance ?? 0 });
  return plan.visitValidityDays ? t("memberEnrollment.visitsValidity", { visits, days: t("memberEnrollment.days", { count: plan.visitValidityDays }) }) : visits;
}
