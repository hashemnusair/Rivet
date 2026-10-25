import { catalogueTemplate, renderMessageTemplate } from "../../../convex/messagingTemplates";
import { makeFormatters } from "../i18n/formatters";
import { diffDays } from "../utils/dates";

/**
 * Collections preparation shared by the Convex query and the preview adapter.
 * It reads recorded charges, receipts and contacts only: nobody is described
 * as having paid without a receipt, and a draft is offered only when an
 * approved payment template's own claim ("due today", "3 days overdue") is
 * true for that balance. Nothing is saved; a person calls or opens the draft.
 */

export const COLLECTION_RECENT_CONTACT_DAYS = 3;
export const COLLECTION_LIST_LIMIT = 50;

export interface CollectionMemberFacts {
  memberId: string;
  memberName: string;
  phone?: string;
  preferredLanguage?: "en" | "ar";
  /** Collectible charges with something still owed. */
  charges: Array<{ id: string; dueDate: string; outstandingMinor: number }>;
  lastPayment?: { receiptId?: string; receiptNumber?: string; at: string; amountMinor: number };
  lastContactAt?: string;
  optedOut: boolean;
}

export type CollectionDraftTemplate = "payment_due_today" | "payment_overdue_3d";
export type CollectionNoDraftReason = "opted_out" | "no_phone" | "no_matching_template";

export interface CollectionItem {
  memberId: string;
  memberName: string;
  phone?: string;
  preferredLanguage?: "en" | "ar";
  outstandingMinor: number;
  chargeCount: number;
  oldestDueDate: string;
  daysOverdue: number;
  lastPayment?: CollectionMemberFacts["lastPayment"];
  lastContactAt?: string;
  recentlyContacted: boolean;
  draft?: { template: CollectionDraftTemplate; language: "en" | "ar"; text: string };
  noDraftReason?: CollectionNoDraftReason;
}

export function prepareCollectionItem(facts: CollectionMemberFacts, context: { today: string; now: string; gymName: string; currency: string }): CollectionItem | undefined {
  const charges = facts.charges.filter((charge) => charge.outstandingMinor > 0 && charge.dueDate <= context.today);
  if (!charges.length) return undefined;
  const outstandingMinor = charges.reduce((sum, charge) => sum + charge.outstandingMinor, 0);
  const oldestDueDate = charges.map((charge) => charge.dueDate).sort()[0]!;
  const daysOverdue = Math.max(0, diffDays(oldestDueDate, context.today));
  const recentlyContacted = Boolean(facts.lastContactAt && Date.parse(context.now) - Date.parse(facts.lastContactAt) < COLLECTION_RECENT_CONTACT_DAYS * 86_400_000);
  const item: CollectionItem = { memberId: facts.memberId, memberName: facts.memberName, ...(facts.phone ? { phone: facts.phone } : {}), ...(facts.preferredLanguage ? { preferredLanguage: facts.preferredLanguage } : {}), outstandingMinor, chargeCount: charges.length, oldestDueDate, daysOverdue, recentlyContacted, ...(facts.lastPayment ? { lastPayment: facts.lastPayment } : {}), ...(facts.lastContactAt ? { lastContactAt: facts.lastContactAt } : {}) };
  // The template's words must be true: one charge, and exactly today or exactly three days late.
  const templateKey: CollectionDraftTemplate | undefined = charges.length === 1 && daysOverdue === 0 ? "payment_due_today" : charges.length === 1 && daysOverdue === 3 ? "payment_overdue_3d" : undefined;
  if (facts.optedOut) item.noDraftReason = "opted_out";
  else if (!facts.phone?.trim()) item.noDraftReason = "no_phone";
  else if (!templateKey) item.noDraftReason = "no_matching_template";
  else {
    const template = catalogueTemplate(templateKey)!;
    const language = facts.preferredLanguage === "ar" ? "ar" : "en";
    const amount = makeFormatters(language, "").money({ amount: outstandingMinor, currency: context.currency });
    const text = renderMessageTemplate(language === "ar" ? template.bodyAr : template.bodyEn, { member_name: facts.memberName.trim().split(/\s+/)[0] || facts.memberName, gym_name: context.gymName, amount });
    item.draft = { template: templateKey, language, text };
  }
  return item;
}

/** Oldest debt first, then the largest; people contacted in the last few days go last but stay listed. */
export function rankCollections(items: CollectionItem[]): CollectionItem[] {
  return [...items].sort((left, right) => Number(left.recentlyContacted) - Number(right.recentlyContacted) || right.daysOverdue - left.daysOverdue || right.outstandingMinor - left.outstandingMinor || left.memberName.localeCompare(right.memberName));
}
