/**
 * What an edit may change. `members.update` and `plans.update` used to store
 * every field they were sent, so a direct call could rewrite a member's
 * status, member number or account link, or a plan's identity, outside the
 * audited archive, sale and account flows. Both adapters keep only these
 * fields and ignore the rest. No imports: Convex reads this file (the test
 * checks the lists against `UpdateMemberInput` and `UpdatePlanInput`).
 *
 * Not editable after creation on purpose: `referredByMemberId` (it decides who
 * earns the referral reward on the first sale, and no screen changes it).
 */
export const MEMBER_UPDATE_FIELDS = [
  "fullName",
  "fullNameAr",
  "phone",
  "email",
  "gender",
  "dateOfBirth",
  "homeBranchId",
  "preferredLanguage",
  "emergencyContactName",
  "emergencyContactRelationship",
  "emergencyContactPhone",
  "addressLine1",
  "city",
  "source",
  "assignedSalespersonId",
  "tags",
  "notes",
  "marketingOptIn",
  "marketingPreferenceSource",
] as const;

export const PLAN_UPDATE_FIELDS = [
  "name",
  "code",
  "kind",
  "durationDays",
  "visitAllowance",
  "visitValidityDays",
  "basePrice",
  "branchAccess",
  "branchIds",
  "freezeAllowanceDays",
  "includedPtSessions",
  "status",
] as const;

/** The listed fields that are present in `input`; everything else is dropped. */
export function pickFields<K extends string>(input: Record<string, unknown>, fields: readonly K[]): Partial<Record<K, unknown>> {
  const picked: Partial<Record<K, unknown>> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) picked[field] = input[field];
  }
  return picked;
}

/** Values a member or plan edit may hold; anything else is refused. */
export const MEMBER_GENDERS = ["male", "female"] as const;
export const MEMBER_LANGUAGES = ["en", "ar"] as const;
export const PLAN_KINDS = ["time", "visits"] as const;
export const PLAN_BRANCH_ACCESS = ["all", "selected"] as const;
export const PLAN_STATUSES = ["active", "archived"] as const;
