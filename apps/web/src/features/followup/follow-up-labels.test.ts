import { describe, expect, it } from "vitest";
import type { FollowUpDelivery } from "@/lib/domain/types";
import { createTranslator } from "@/lib/i18n/core";
import { makeFormatters } from "@/lib/i18n/formatters";
import { followUpDeliveryDetailLabel, followUpDeliveryLabel, followUpOutcomeLabel, followUpStopReasonLabel, followUpSuppressionReasonLabel } from "./follow-up-labels";

const t = createTranslator("ar");
const arClock = makeFormatters("ar", "الآن", "Asia/Amman").clock;
const enClock = makeFormatters("en", "now", "Asia/Amman").clock;

describe("Arabic follow-up labels", () => {
  it("localizes known outcome, journey-stop and suppression values while preserving custom text", () => {
    expect(followUpOutcomeLabel(t, "answered_call_back", "Asked for a callback")).toBe("معاودة اتصال مطلوبة");
    expect(followUpOutcomeLabel(t, "legacy_outcome", "Legacy label")).toBe("legacy_outcome");
    expect(followUpStopReasonLabel(t, "membership_frozen", "membership frozen")).toBe("الاشتراك مجمّد");
    expect(followUpStopReasonLabel(t, "A staff-written reason", "A staff-written reason")).toBe("A staff-written reason");
    expect(followUpStopReasonLabel(t, "legacy_reason_code")).toBe("legacy_reason_code");
    expect(followUpSuppressionReasonLabel(t, "Explicit consent is required for renewal messages")).toBe("تتطلب رسائل التجديد موافقة صريحة");
    expect(followUpSuppressionReasonLabel(t, "Gym-specific note from staff")).toBe("Gym-specific note from staff");
  });

  it("localizes known reminder statuses and generated details but keeps unknown history intact", () => {
    const queued: FollowUpDelivery = {
      id: "delivery-1", checkpointKey: "7_day", channel: "whatsapp", status: "queued",
      label: "WhatsApp reminder (7 days before) queued · not delivered",
      detail: "Waiting for the outbound worker; nothing has reached the member yet.", updatedAt: "2026-10-03T08:00:00.000Z",
    };
    expect(followUpDeliveryLabel(t, queued)).toBe("تذكير واتساب في قائمة الإرسال (قبل 7 أيام) · لم يصل للعضو");
    expect(followUpDeliveryDetailLabel(t, queued, arClock)).toBe("بانتظار عامل الإرسال؛ لم تصل رسالة إلى العضو.");

    const deferred: FollowUpDelivery = { ...queued, status: "deferred", label: "WhatsApp reminder (7 days before) deferred · quiet hours", detail: "Resumes at 09:30." };
    expect(followUpDeliveryLabel(t, deferred)).toContain("تأجّل تذكير");
    expect(followUpDeliveryDetailLabel(t, deferred, arClock)).toBe("يُستأنف عند 9:30 ص.");
    const lateDeferred = { ...deferred, detail: "Resumes at 23:05." };
    expect(followUpDeliveryDetailLabel(t, lateDeferred, arClock)).toBe("يُستأنف عند 11:05 م.");
    expect(followUpDeliveryDetailLabel(createTranslator("en"), lateDeferred, enClock)).toBe("Resumes at 23:05.");

    const authored: FollowUpDelivery = { ...queued, status: "suppressed", label: "WhatsApp reminder (7 days before) not sent", detail: "Staff asked us to wait until next week." };
    expect(followUpDeliveryDetailLabel(t, authored, arClock)).toBe("Staff asked us to wait until next week.");

    const oldStatus: FollowUpDelivery = { ...queued, status: "legacy_status", label: "Legacy recorded status", detail: "Legacy historical detail" };
    expect(followUpDeliveryLabel(t, oldStatus)).toBe("Legacy recorded status");
    expect(followUpDeliveryDetailLabel(t, oldStatus, arClock)).toBe("Legacy historical detail");
  });
});
