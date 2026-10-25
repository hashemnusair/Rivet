import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { paymentNoteReference } from "../../../convex/firstPayment";
import {
  activityActionKey,
  activityActionLabel,
  activityTextParts,
  hasActivityActionLabel,
  humaniseActivityCode,
  isOpaqueActivityLabel,
  shortenActivityText,
} from "./activity-log";
import { createTranslator } from "./core";
import { en } from "./messages/en";
import { ar } from "./messages/ar";

const tEn = createTranslator("en");
const tAr = createTranslator("ar");

/**
 * Every literal action code Convex writes to an audit table, plus the codes
 * it builds from a template (`gym_application.${decision}` and the like),
 * spelled out here because a source scan cannot see them.
 */
function convexActionCodes(): string[] {
  const dir = join(process.cwd(), "convex");
  const codes = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.includes(".test."))) {
    const source = readFileSync(join(dir, file), "utf8");
    for (const match of source.matchAll(/\baction(?:\s*:\s*|\s*=\s*)((?:[^;,{}\n]*?\?\s*)?"[a-z_]+(?:\.[a-z_]+)+"(?:\s*:\s*[^;,{}\n]*?"[a-z_]+(?:\.[a-z_]+)+")*)/g)) {
      for (const code of match[1]!.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)) codes.add(code[1]!);
    }
  }
  return [...codes].sort();
}

const TEMPLATED_CODES = [
  "gym_application.under_review", "gym_application.approved", "gym_application.rejected",
  "checklists.item.fail", "checklists.item.skip",
  "pt.booking.completed", "pt.booking.no_show",
  "membership.freeze_request.approved", "membership.freeze_request.denied",
  "trial.confirmed", "trial.completed", "trial.no_show", "trial.cancelled",
  "offer.accepted", "offer.declined",
  "shift.variance.approved", "shift.variance.rejected",
  "bulk.members_add_tags", "bulk.members_remove_tags", "bulk.members_assign_branch", "bulk.members_create_follow_up", "bulk.members_archive",
  "bulk.leads_assign_owner", "bulk.leads_create_follow_up", "bulk.leads_close_lost",
  "ai.standing.pause", "ai.standing.resume", "ai.standing.revoke", "ai.standing.transfer",
];

describe("activity action catalogue", () => {
  it("turns a code into its catalogue key", () => {
    expect(activityActionKey("payment.refund")).toBe("paymentRefund");
    expect(activityActionKey("gym.provisioning.workspace_created")).toBe("gymProvisioningWorkspaceCreated");
    expect(activityActionKey("gym_application.under_review")).toBe("gymApplicationUnderReview");
  });

  it("has a plain label for every action code Convex records", () => {
    const codes = [...convexActionCodes(), ...TEMPLATED_CODES];
    // The scan must keep finding the codes; an empty list would pass vacuously.
    expect(codes.length).toBeGreaterThan(150);
    expect(codes.filter((code) => !hasActivityActionLabel(code))).toEqual([]);
  });

  it("gives every label an Arabic translation that is not English", () => {
    const enLabels = en.activityLog.action as Record<string, string>;
    const arLabels = ar.activityLog.action as Record<string, string>;
    expect(Object.keys(arLabels).sort()).toEqual(Object.keys(enLabels).sort());
    const untranslated = Object.entries(arLabels).filter(([, label]) => !/[؀-ۿ]/.test(label)).map(([key]) => key);
    expect(untranslated).toEqual([]);
  });

  it("shows the plain label instead of the code, in both languages", () => {
    expect(activityActionLabel(tEn, "payment.refund", "en")).toBe("Refund");
    expect(activityActionLabel(tAr, "payment.refund", "ar")).toBe("استرداد المبلغ");
    expect(activityActionLabel(tEn, "gym.provisioning.workspace_created", "en")).toBe("Gym workspace created");
    expect(activityActionLabel(tEn, "gym_application.under_review", "en")).toBe("Application moved to review");
    expect(activityActionLabel(tAr, "gym_application.under_review", "ar")).toBe("نقل الطلب إلى المراجعة");
    expect(activityActionLabel(tEn, "prospects.imported", "en")).toBe("Prospects imported");
  });

  it("uses the approved Arabic terms for money, cash and member records", () => {
    expect(activityActionLabel(tAr, "payment.void", "ar")).toBe("إلغاء تسجيل الدفعة");
    expect(activityActionLabel(tAr, "shift.open", "ar")).toBe("فتح الصندوق");
    expect(activityActionLabel(tAr, "member.merge", "ar")).toBe("دمج سجل المشتركين");
    expect(activityActionLabel(tAr, "member.import_commit", "ar")).toBe("رفع قائمة المشتركين");
    expect(activityActionLabel(tAr, "checkin.override", "ar")).toBe("السماح بالدخول استثنائيًا");
    expect(activityActionLabel(tAr, "operations.supplier_payment.reverse", "ar")).toBe("عكس دفعة المورّد");
  });

  it("labels an approval decision on a known action", () => {
    expect(activityActionLabel(tEn, "payment.refund.approved", "en")).toBe("Approved: Refund");
    expect(activityActionLabel(tEn, "membership.discount.rejected", "en")).toBe("Rejected: Discount given");
    expect(activityActionLabel(tAr, "payment.refund.approved", "ar")).toBe("تمت الموافقة: استرداد المبلغ");
  });

  it("spells an unknown code out in English and never shows it raw", () => {
    const label = activityActionLabel(tEn, "gym.provisioning.dns_verified", "en");
    expect(label).toBe("Gym provisioning dns verified");
    expect(label).not.toContain(".");
    expect(label).not.toContain("_");
    expect(activityActionLabel(tEn, "", "en")).toBe("Change recorded");
  });

  it("shows a generic Arabic label for an unknown code instead of English words", () => {
    expect(activityActionLabel(tAr, "gym.provisioning.dns_verified", "ar")).toBe("تم تسجيل تغيير");
  });

  it("humanises codes and field names", () => {
    expect(humaniseActivityCode("settings.receipt_footer")).toBe("Settings receipt footer");
    expect(humaniseActivityCode("varianceApprovalStatus")).toBe("Variance approval status");
    expect(humaniseActivityCode("member.member_update")).toBe("Member update");
  });
});

describe("activity text references", () => {
  const invoiceId = "INV-c234d937-c2c4-48f3-a0d9-6f1afd8f1121";

  it("shows an invoice the same way the billing page and payment note do", () => {
    const text = `Updated gym subscription controls and issued ${invoiceId} for the new term`;
    expect(shortenActivityText(text)).toBe(`Updated gym subscription controls and issued ${paymentNoteReference(invoiceId)} for the new term`);
    expect(shortenActivityText(text)).toContain("INV-C234D937");
    expect(activityTextParts(text)).toEqual([
      { kind: "text", text: "Updated gym subscription controls and issued " },
      { kind: "reference", text: "INV-C234D937", full: invoiceId },
      { kind: "text", text: " for the new term" },
    ]);
  });

  it("shortens bare ids and leaves human references alone", () => {
    expect(shortenActivityText("Reversed journal entry 3f2a9c1b-0000-4a00-8a00-000000000bd4")).toBe("Reversed journal entry 3F2A9C1B");
    expect(shortenActivityText("Countersigned subscription agreement RVT-20260927-CU4U6 for Test Gym")).toBe("Countersigned subscription agreement RVT-20260927-CU4U6 for Test Gym");
    expect(shortenActivityText("Voided JOD 40.000 (card) · R-2479")).toBe("Voided JOD 40.000 (card) · R-2479");
    expect(shortenActivityText("seed-audit-10000000-0000-4a00-8a00-000000000bd4")).toBe("seed-audit-10000000");
  });

  it("hides labels that are only an id", () => {
    expect(isOpaqueActivityLabel("10000000-0000-4a00-8a00-000000000669")).toBe(true);
    expect(isOpaqueActivityLabel("jd7f8g9h0k1l2m3n4p5q6r7s8t9v0w1x")).toBe(true);
    expect(isOpaqueActivityLabel("")).toBe(true);
    expect(isOpaqueActivityLabel("Nasser Najjar")).toBe(false);
    expect(isOpaqueActivityLabel("R-2479 · Nasser Najjar")).toBe(false);
    expect(isOpaqueActivityLabel("Forge Fitness Club")).toBe(false);
  });
});
