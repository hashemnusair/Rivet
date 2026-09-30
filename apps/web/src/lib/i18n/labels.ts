import type { TFunction, TKey } from "./provider";
import { en } from "./messages/en";

/**
 * Label lookups for values stored as string codes. The typed `t()` only takes
 * known keys, but status and method codes arrive as plain strings from the API,
 * so these helpers translate the ones the catalogue knows and show the raw code
 * for anything new instead of crashing or rendering an empty label.
 */
type DomainGroup = keyof typeof en.domain;

function domainLabel(t: TFunction, group: DomainGroup, code: string | undefined): string {
  if (!code) return "";
  const known = Object.prototype.hasOwnProperty.call(en.domain[group], code);
  return known ? t(`domain.${group}.${code}` as TKey) : code;
}

export const paymentMethodLabel = (t: TFunction, code?: string) => domainLabel(t, "paymentMethod", code);
export const transactionTypeLabel = (t: TFunction, code?: string) => domainLabel(t, "transactionType", code);
export const transactionStatusLabel = (t: TFunction, code?: string) => domainLabel(t, "transactionStatus", code);
export const paymentStatusLabel = (t: TFunction, code?: string) => domainLabel(t, "paymentStatus", code);
export const membershipStatusLabel = (t: TFunction, code?: string) => (code ? domainLabel(t, "membershipStatus", code) : t("domain.membershipStatus.none"));
export const leadStageName = (t: TFunction, code?: string) => domainLabel(t, "leadStage", code);
export const leadSourceLabel = (t: TFunction, code?: string) => domainLabel(t, "leadSource", code);
export const checkInDecisionLabel = (t: TFunction, code?: string) => domainLabel(t, "checkInDecision", code);
export const roleLabel = (t: TFunction, code?: string) => domainLabel(t, "role", code);
