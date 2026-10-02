import { describe, expect, it } from "vitest";
import { createTranslator } from "./core";
import { makeFormatters } from "./formatters";
import { presentTimelineEvent, systemMessage } from "./system-messages";

const context = (locale: "en" | "ar") => ({
  locale,
  t: createTranslator(locale),
  format: makeFormatters(locale, "2026-10-03", "Asia/Amman"),
});

describe("system timeline completion descriptors", () => {
  it("translates known contact outcomes while preserving the stored title, notes and unknown outcomes", () => {
    const event = {
      type: "call_attempt",
      title: "Contact — no answer",
      body: "Call after the school visit",
      titleMessage: systemMessage("communicationCompletion.timeline.contactAttempt", {
        outcome: { enum: "contactOutcome", value: "no_answer" },
      }),
    };
    expect(presentTimelineEvent(event, context("ar"))).toEqual({
      title: "محاولة تواصل — لم يرد",
      body: "Call after the school visit",
    });
    expect(presentTimelineEvent(event, context("en")).title).toBe("Contact — no answer");

    const unknown = {
      ...event,
      title: "Contact — future outcome",
      titleMessage: systemMessage("communicationCompletion.timeline.contactAttempt", {
        outcome: { enum: "contactOutcome", value: "future_outcome" },
      }),
    };
    expect(presentTimelineEvent(unknown, context("ar")).title).toBe("Contact — future outcome");
  });

  it("formats snooze dates and credit counts in Arabic without changing authored refund reasons", () => {
    const snooze = presentTimelineEvent({
      type: "note",
      title: "Retention follow-up snoozed until 2026-10-10",
      titleMessage: systemMessage("communicationCompletion.timeline.retentionSnoozed", {
        date: { date: "2026-10-10" },
      }),
      body: "Member asked us to call next week.",
    }, context("ar"));
    expect(snooze).toEqual({
      title: "تم تأجيل متابعة العضو حتى 10 تشرين الأول 2026",
      body: "Member asked us to call next week.",
    });

    const refund = presentTimelineEvent({
      type: "pt_credit_refunded",
      title: "2 PT credits refunded",
      titleMessage: systemMessage("communicationCompletion.timeline.ptCreditsRefunded", { count: 2 }),
      body: "JOD 40.000 · Member relocating; unused sessions refunded",
      bodyMessage: systemMessage("communicationCompletion.timeline.ptCreditsRefundedBody", {
        amount: { amountMinor: 40_000, currency: "JOD" },
        reason: "Member relocating; unused sessions refunded",
      }),
    }, context("ar"));
    expect(refund.title).toBe("تم استرداد مبلغ حصتين تدريبيتين شخصيتين");
    expect(refund.body).toContain("40.000 د.أ");
    expect(refund.body).toContain("Member relocating; unused sessions refunded");
    expect(refund.body).not.toContain("JOD 40.000");

    const introductory = presentTimelineEvent({
      type: "pt_credit_granted",
      title: "3 introductory PT credits granted",
      titleMessage: systemMessage("communicationCompletion.timeline.ptIntroductoryCreditsGranted", { count: 3 }),
    }, context("ar"));
    expect(introductory.title).toBe("مُنح رصيد 3 حصص تدريب شخصي تمهيدية");
  });

  it("renders imported, membership, task, trial, offer, and lead wrappers as structured Arabic presentation", () => {
    const imported = presentTimelineEvent({
      type: "note",
      title: "Opening balance imported — JOD 12.500",
      titleMessage: systemMessage("communicationCompletion.timeline.openingBalanceImported", {
        amount: { amountMinor: 12_500, currency: "JOD" },
      }),
      body: "Unpaid as of 2026-08-30. No receipt was created.",
      bodyMessage: systemMessage("communicationCompletion.timeline.openingBalanceImportedBody", {
        cutoff: { date: "2026-08-30" },
      }),
    }, context("ar"));
    expect(imported.title).toContain("تم استيراد الرصيد الافتتاحي");
    expect(imported.title).toContain("12.500");
    expect(imported.body).toContain("لم يُسجّل وصل دفع");
    expect(imported.body).toContain("2026");

    const term = presentTimelineEvent({
      type: "membership_sold",
      title: "Monthly membership sold",
      body: "Term 2026-08-13 → 2026-09-12.",
      bodyMessage: systemMessage("communicationCompletion.timeline.membershipTerm", {
        startDate: { date: "2026-08-13" },
        endDate: { date: "2026-09-12" },
      }),
    }, context("ar"));
    expect(term.body).toContain("المدة من");
    expect(term.body).not.toContain("Term ");

    const task = presentTimelineEvent({
      type: "task_created",
      title: "Task: Call after the evening class",
      titleMessage: systemMessage("communicationCompletion.timeline.taskCreated", { title: "Call after the evening class" }),
      body: "Follow-on to: Confirm contact details",
      bodyMessage: systemMessage("communicationCompletion.timeline.taskFollowOn", { title: "Confirm contact details" }),
    }, context("ar"));
    expect(task.title).toContain("مهمة:");
    expect(task.title).toContain("Call after the evening class");
    expect(task.body).toContain("متابعة للمهمة:");
    expect(task.body).toContain("Confirm contact details");

    const trial = presentTimelineEvent({
      type: "trial_confirmed",
      title: "Trial scheduled",
      body: "2030-08-02 · 18:00 · Try the strength equipment",
      bodyMessage: systemMessage("communicationCompletion.timeline.trialScheduledBodyWithGoal", {
        date: { date: "2030-08-02" },
        time: { clock: "18:00" },
        goal: "Try the strength equipment",
      }),
    }, context("ar"));
    expect(trial.body).toContain("Try the strength equipment");
    expect(trial.body).not.toContain("2030-08-02");

    const offer = presentTimelineEvent({
      type: "offer_sent",
      title: "Offer delivery confirmed — Monthly",
      body: "email confirmed · reviewed in person.",
      bodyMessage: systemMessage("communicationCompletion.timeline.offerDeliveryConfirmedBodyWithReference", {
        channel: { enum: "channel", value: "email" },
        reference: "reviewed in person",
      }),
    }, context("ar"));
    expect(offer.body).toContain("البريد الإلكتروني");
    expect(offer.body).toContain("reviewed in person");

    const conversion = presentTimelineEvent({
      type: "lead_converted",
      title: "Membership sold — Monthly",
      body: "A new active membership record was added for MAIN-1003.",
      bodyMessage: systemMessage("communicationCompletion.timeline.leadConvertedExistingMemberBody", { memberNumber: "MAIN-1003" }),
    }, context("ar"));
    expect(conversion.body).toContain("MAIN-1003");
    expect(conversion.body).not.toContain("A new active membership");

    expect(presentTimelineEvent({
      type: "offer_sent",
      title: "Offer delivery confirmed — Monthly",
      body: "email confirmed · reviewed in person.",
      bodyMessage: systemMessage("communicationCompletion.timeline.offerDeliveryConfirmedBodyWithReference", {
        channel: { enum: "channel", value: "email" },
        reference: "reviewed in person",
      }),
    }, context("en")).body).toBe("email confirmed · reviewed in person.");
  });
});
