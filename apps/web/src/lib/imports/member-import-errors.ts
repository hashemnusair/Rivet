import type { TFunction } from "../i18n/core";
import { memberMigration } from "../i18n/messages/en/memberMigration";

type ErrorLeaf = Extract<keyof typeof memberMigration, `error${string}`>;
export interface MemberImportErrorMessage {
  key: `memberMigration.${ErrorLeaf}`;
  params?: Record<string, string | number>;
}
const staticKeys: Record<string, ErrorLeaf> = {
  "Full name must be between 3 and 120 characters": "errorName",
  "Enter a valid phone number": "errorPhone",
  "Gender must be male or female": "errorGender",
  "Enter a valid email address": "errorEmail",
  "Choose the source plan column for membership data": "errorSourcePlan",
  "The mapped RIVET plan is unavailable": "errorUnavailablePlan",
  "The mapped plan is not available at this branch": "errorBranchPlan",
  "Enter a valid membership start date": "errorStartDate",
  "Enter a valid membership end date": "errorEndDate",
  "Membership end date must be on or after its start date": "errorTermOrder",
  "Only active or scheduled membership terms can be imported": "errorActiveTerm",
  "Visits remaining must be a whole number": "errorVisitsWhole",
  "Enter both current-freeze dates": "errorFreezeDates",
  "Freeze end date must be on or after its start date": "errorFreezeOrder",
  "A current freeze must include the migration cutoff date": "errorFreezeCutoff",
  "Freeze dates must sit inside the membership term": "errorFreezeTerm",
  "Financial migration evidence requires a membership term": "errorFinancialTerm",
  "Historical amount paid requires its last payment date": "errorPaidDate",
  "Historical payment date cannot be after the migration cutoff": "errorPaidCutoff",
  "A member with this phone or email already exists": "errorDuplicate",
  "Review the values in this row.": "errorUnknown"
};
const message = (key: ErrorLeaf, params?: MemberImportErrorMessage["params"]): MemberImportErrorMessage => ({ key: `memberMigration.${key}`, ...(params ? { params } : {}) });

/** Compatibility projection only. Stored errors and immutable import/audit history remain original. */
export function describeMemberImportError(original: string): MemberImportErrorMessage {
  const key = staticKeys[original];
  if (key) return message(key);
  let match = /^Map source plan “(.*)” to a RIVET plan$/s.exec(original);
  if (match) return message("errorMapPlan", { plan: match[1]! });
  match = /^Enter visits remaining between 0 and (\d+)$/.exec(original);
  if (match) return message("errorVisitsRange", { max: Number(match[1]) });
  match = /^Enter ([A-Z]{3}) amounts as positive numbers$/.exec(original);
  if (match) return message("errorMoneyPositive", { currency: match[1]! });
  match = /^([A-Z]{3}) amounts can have at most (\d+) decimal places?$/.exec(original);
  if (match) return message("errorMoneyDecimals", { currency: match[1]!, digits: Number(match[2]) });
  match = /^Enter a valid ([A-Z]{3}) amount$/.exec(original);
  return match ? message("errorMoneyValid", { currency: match[1]! }) : message("errorUnknown");
}

export function memberImportErrors(t: TFunction, row: { errors: string[]; errorMessages?: MemberImportErrorMessage[] }, isolate: (text: string) => string = value => value): string[] {
  return row.errors.map((original, index) => {
    const descriptor = row.errorMessages?.[index] ?? describeMemberImportError(original);
    const key = descriptor.key.startsWith("memberMigration.error") && Object.hasOwn(memberMigration, descriptor.key.slice(16)) ? descriptor.key : "memberMigration.errorUnknown";
    const params = Object.fromEntries(Object.entries(descriptor.params ?? {}).map(([name, value]) => [name, typeof value === "string" ? isolate(value) : value]));
    return t(key, params);
  });
}
