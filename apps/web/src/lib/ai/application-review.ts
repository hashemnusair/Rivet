import { canonicalPhoneKey } from "../utils/contact";
import { normalizeNoteText } from "./relative-dates";

/**
 * A review brief for a pending gym application (AI-4.8), for RIVET operators.
 * It only compares the application with the applications the operator can
 * already see and points at things worth checking; the operator decides.
 */

export interface ReviewableApplication {
  id: string;
  gymName: string;
  gymAddress?: string;
  email: string;
  contactNumber: string;
  plan: string;
  status: string;
  notificationStatus?: string;
  promoCode?: string;
}

export type ReviewNote =
  | { kind: "duplicate"; field: "email" | "phone" | "name"; otherId: string; otherName: string; otherStatus: string }
  | { kind: "missing_address" }
  | { kind: "enterprise_quote" }
  | { kind: "confirmation_failed" }
  | { kind: "promo"; code: string };

function nameKey(value: string): string {
  return normalizeNoteText(value).toLowerCase().replace(/\b(gym|fitness|club|studio|نادي|جيم)\b/gu, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

export function applicationReviewBrief(application: ReviewableApplication, all: readonly ReviewableApplication[]): ReviewNote[] {
  const notes: ReviewNote[] = [];
  const email = application.email.trim().toLowerCase();
  const phone = canonicalPhoneKey(application.contactNumber);
  const name = nameKey(application.gymName);
  for (const other of all) {
    if (other.id === application.id) continue;
    const field = email && other.email.trim().toLowerCase() === email ? "email" : phone && canonicalPhoneKey(other.contactNumber) === phone ? "phone" : name.length >= 4 && nameKey(other.gymName) === name ? "name" : undefined;
    if (field) notes.push({ kind: "duplicate", field, otherId: other.id, otherName: other.gymName, otherStatus: other.status });
  }
  if (!application.gymAddress?.trim()) notes.push({ kind: "missing_address" });
  if (application.plan === "Enterprise") notes.push({ kind: "enterprise_quote" });
  if (application.notificationStatus === "failed") notes.push({ kind: "confirmation_failed" });
  if (application.promoCode) notes.push({ kind: "promo", code: application.promoCode });
  return notes;
}
