import type { TFunction, TKey } from "./core";
import type { Locale } from "./locale";
import { en } from "./messages/en";

/**
 * Presentation helpers for activity logs: the gym's Activity log, the
 * platform console's operator history and every other list of audit events.
 *
 * Audit records are append-only, so nothing here rewrites them. A record keeps
 * its action code and its stored sentence; these helpers only decide what a
 * reader sees: a plain label instead of `gym.provisioning.workspace_created`,
 * and a short reference instead of a 36-character id. Pure: no React, no
 * Convex.
 */

const ACTION_LABELS = en.activityLog.action;

/** `gym_application.under_review` → `gymApplicationUnderReview`, the catalogue key. */
export function activityActionKey(action: string): string {
  const [first = "", ...rest] = action.trim().split(/[._]/).filter(Boolean);
  return first + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function catalogueKey(action: string): TKey | undefined {
  const key = activityActionKey(action);
  return Object.hasOwn(ACTION_LABELS, key) ? (`activityLog.action.${key}` as TKey) : undefined;
}

/** True when the catalogue has a plain label for this exact code. */
export function hasActivityActionLabel(action: string): boolean {
  return catalogueKey(action) !== undefined;
}

/**
 * Spells an unknown code out as words: `gym.provisioning.workspace_created`
 * → "Gym provisioning workspace created". Used only when the catalogue has no
 * label, so a new or historical code still reads as English, never as a code.
 */
export function humaniseActivityCode(code: string): string {
  const words = code
    .split(/[._\-\s]+/)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .map((word) => word.toLowerCase())
    .filter(Boolean)
    .filter((word, index, all) => word !== all[index - 1]);
  const sentence = words.join(" ");
  return sentence ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : "";
}

const DECISION_SUFFIX = /^(.+)\.(approved|rejected|denied)$/;

/**
 * The plain label for an action code, in the reader's language.
 *
 * Order: the catalogue label; then an approval decision on a known action
 * ("Approved: Refund"); then a fallback. English spells the code out. Arabic
 * shows a generic "a change was recorded" instead of English words, because
 * the row's stored sentence already says what happened.
 */
export function activityActionLabel(t: TFunction, action: string, locale: Locale): string {
  const key = catalogueKey(action);
  if (key) return t(key);
  const decision = DECISION_SUFFIX.exec(action.trim());
  const baseKey = decision ? catalogueKey(decision[1]!) : undefined;
  if (decision && baseKey) {
    return t(decision[2] === "approved" ? "activityLog.approvedAction" : "activityLog.rejectedAction", { action: t(baseKey) });
  }
  const spelled = humaniseActivityCode(action);
  return locale === "ar" || !spelled ? t("activityLog.unknownAction") : spelled;
}

export type ActivityTextPart =
  | { kind: "text"; text: string }
  | { kind: "reference"; text: string; full: string };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
/** An optional upper-case prefix (`INV-`) and a UUID. Lower-case prefixes stay text. */
const REFERENCE = new RegExp(`(?<![0-9A-Za-z])([A-Z]{2,6}-)?(${UUID})(?![0-9A-Za-z])`, "g");

/**
 * The short form people can read and type: "INV-" and the first eight
 * characters, upper case. Matches `paymentNoteReference` for invoices, so the
 * log names an invoice the same way the billing page and the gym's payment
 * note do.
 */
export function shortActivityReference(prefix: string | undefined, uuid: string): string {
  return `${prefix ?? ""}${uuid.slice(0, 8).toUpperCase()}`;
}

/** Splits stored text so long ids can be shown short, with the full id kept for hover. */
export function activityTextParts(text: string): ActivityTextPart[] {
  const parts: ActivityTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(REFERENCE)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "reference", text: shortActivityReference(match[1], match[2]!), full: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/** The same text as one string, ids shortened; for CSV cells and accessible names. */
export function shortenActivityText(text: string): string {
  return activityTextParts(text).map((part) => part.text).join("");
}

/**
 * True for a label that is only an id (a UUID, a Convex document id or a
 * public id like `mem_8f3a…`). Such labels are hidden: they name nothing a
 * person would recognise.
 */
export function isOpaqueActivityLabel(label: string | undefined): boolean {
  const value = label?.trim() ?? "";
  if (!value) return true;
  if (new RegExp(`^([A-Za-z]{2,6}[-_])?${UUID}$`).test(value)) return true;
  return !/\s/.test(value) && value.length >= 20 && /\d/.test(value) && /^[A-Za-z0-9_-]+$/.test(value);
}
