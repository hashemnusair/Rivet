import { describe, expect, it } from "vitest";
import { createTranslator } from "./core";
import { isPluralForms } from "./dictionary";
import { makeFormatters } from "./formatters";
import { communicationCompletion as en } from "./messages/en/communicationCompletion";
import { communicationCompletion as ar } from "./messages/ar/communicationCompletion";
import { resolveRecipientLanguage } from "./communication";
import {
  isRenderableSystemMessage,
  legacyNotificationMessages,
  legacyTimelineMessages,
  presentNotification,
  presentSystemText,
  presentTimelineEvent,
  renewalReasonMessage,
  systemMessage,
  type SystemTextContext,
} from "./system-messages";

const strip = (value: string) => value.replace(/[⁦-⁩]/g, "");
const context = (locale: "en" | "ar"): SystemTextContext => ({ locale, t: createTranslator(locale), format: makeFormatters(locale, "now", "Asia/Amman") });
const AR = context("ar");
const EN = context("en");

function leaves(node: unknown, path: string[] = []): Array<[string, unknown]> {
  if (typeof node === "string" || isPluralForms(node)) return [[path.join("."), node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) => leaves(child, [...path, key]));
}

function placeholders(leaf: unknown): string[] {
  const texts = typeof leaf === "string" ? [leaf] : Object.values(leaf as Record<string, string>);
  return [...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!)))].sort();
}

describe("recipient language", () => {
  it("prefers the recipient, then the gym default, then English, and ignores anything else", () => {
    expect(resolveRecipientLanguage("ar", "en")).toEqual({ language: "ar", source: "recipient" });
    expect(resolveRecipientLanguage("en", "ar")).toEqual({ language: "en", source: "recipient" });
    expect(resolveRecipientLanguage(undefined, "ar")).toEqual({ language: "ar", source: "organization" });
    expect(resolveRecipientLanguage("fr", undefined)).toEqual({ language: "en", source: "default" });
    expect(resolveRecipientLanguage("", "AR")).toEqual({ language: "en", source: "default" });
  });
});

describe("communication catalogue", () => {
  it("keeps every Arabic leaf's placeholders identical to English, so no value can disappear", () => {
    const arabic = new Map(leaves(ar));
    for (const [path, leaf] of leaves(en)) {
      expect(arabic.has(path), path).toBe(true);
      expect(placeholders(arabic.get(path)), path).toEqual(placeholders(leaf));
    }
  });

  it("gives every Arabic count message all six plural categories", () => {
    for (const [path, leaf] of leaves(ar)) {
      if (!isPluralForms(leaf)) continue;
      expect(Object.keys(leaf).sort(), path).toEqual(["few", "many", "one", "other", "two", "zero"]);
    }
  });

  it("uses the approved terms in their contexts", () => {
    expect(ar.email.kinds.payment_receipt.subject).toBe("إيصال دفعتك");
    expect(ar.email.kinds.payment_receipt.action).toBe("عرض وصل الدفع");
    expect(ar.email.footer.terms).toBe("شروط الاستخدام");
    expect(ar.email.kinds.pt_booking_confirmation.subject).toContain("حصة التدريب الشخصي");
    expect(ar.email.status.pastDue).toBe("تجاوز موعد الدفع");
    expect(ar.email.status.suspended).toBe("معلّق");
    expect(JSON.stringify(ar)).not.toMatch(/عضوية|عضويتك|الكاونتر|كاونتر|جلسة التدريب الشخصي/);
  });
});

describe("system message descriptors", () => {
  it("shows the stored English to an English reader, whatever the descriptor says", () => {
    const message = systemMessage("communicationCompletion.notifications.emailFailedAttempts", { count: 4 });
    expect(presentSystemText("An email could not be delivered after 4 attempts. Check email settings.", message, EN)).toBe("An email could not be delivered after 4 attempts. Check email settings.");
    expect(presentSystemText("An email could not be delivered after 4 attempts. Check email settings.", message, AR)).toBe("تعذّر توصيل رسالة بريد إلكتروني. عدد المحاولات: 4. يرجى مراجعة إعدادات البريد الإلكتروني.");
  });

  it("falls back to the original for unknown keys, missing or malformed values and unknown enums", () => {
    const original = "Original text";
    expect(presentSystemText(original, { key: "communicationCompletion.notifications.nope" }, AR)).toBe(original);
    expect(presentSystemText(original, { key: "communicationCompletion.notifications.emailFailedAttempts" }, AR)).toBe(original);
    expect(presentSystemText(original, { key: "communicationCompletion.notifications.termEnds", params: { endDate: { date: "3 Oct" } } }, AR)).toBe(original);
    expect(presentSystemText(original, { key: "communicationCompletion.timeline.paymentCollected", params: { amount: { amountMinor: 1.5, currency: "JOD" }, method: { enum: "paymentMethod", value: "cash" } } }, AR)).toBe(original);
    expect(presentSystemText(original, { key: "communicationCompletion.timeline.paymentCollected", params: { amount: { amountMinor: 25000, currency: "JOD" }, method: { enum: "paymentMethod", value: "barter" } } }, AR)).toBe(original);
    expect(presentSystemText(original, systemMessage("communicationCompletion.timeline.value", { value: { enum: "renewalReason", value: "constructor" } }), AR)).toBe(original);
    expect(presentSystemText(original, systemMessage("communicationCompletion.timeline.value", { value: { enum: "renewalReason", value: "toString" } }), AR)).toBe(original);
    expect(presentSystemText(original, { key: "settings.title" }, AR)).toBe(original);
    expect(presentSystemText(original, "not a descriptor", AR)).toBe(original);
    expect(isRenderableSystemMessage(null)).toBe(false);
  });

  it("rejects impossible dates, inherited keys, invalid plural counts and recursive data", () => {
    const original = "Stored source text";
    for (const date of ["2026-02-31", "2026-13-01", "2026-00-00"]) {
      expect(presentSystemText(original, systemMessage("communicationCompletion.notifications.termEnds", { endDate: { date } }), AR)).toBe(original);
    }
    expect(presentSystemText(original, { key: "communicationCompletion.email.footer.terms" }, AR)).toBe(original);
    expect(presentSystemText(original, { key: "communicationCompletion.notifications.toString" }, AR)).toBe(original);
    expect(presentSystemText(original, systemMessage("communicationCompletion.timeline.membershipExtended", { count: "3" }), AR)).toBe(original);
    expect(presentSystemText(original, systemMessage("communicationCompletion.timeline.paymentCollected", { amount: { amountMinor: 1000, currency: "JOD" }, method: { enum: "paymentMethod", value: "constructor" } }), AR)).toBe(original);
    const cyclic: { key: string; params: Record<string, unknown> } = { key: "communicationCompletion.notifications.facts2", params: { a: "authored" } };
    cyclic.params.b = { message: cyclic };
    expect(presentSystemText(original, cyclic, AR)).toBe(original);
    expect(presentSystemText(original, systemMessage("communicationCompletion.notifications.termEnds", { endDate: { date: "2028-02-29" } }), AR)).toContain("29 شباط 2028");
  });

  it("formats exact positive and negative JOD amounts, Jordanian dates, Arabic clocks and approved enums", () => {
    const variance = systemMessage("communicationCompletion.notifications.facts2", { a: { amountMinor: -12_500, currency: "JOD" }, b: "Sami Haddad سامي" });
    expect(strip(presentSystemText("JOD -12.500 · Sami Haddad سامي", variance, AR))).toBe("-12.500 د.أ · Sami Haddad سامي");
    const collected = systemMessage("communicationCompletion.timeline.paymentCollected", { amount: { amountMinor: 25_000, currency: "JOD" }, method: { enum: "paymentMethod", value: "cash" } });
    expect(strip(presentSystemText("Payment collected — JOD 25.000 cash", collected, AR))).toBe("تم استلام دفعة — 25.000 د.أ، كاش");
    const term = systemMessage("communicationCompletion.notifications.termEnds", { endDate: { date: "2026-09-30" } });
    expect(presentSystemText("x", term, AR)).toBe("ينتهي اشتراكك الحالي في 30 أيلول 2026.");
    const trial = systemMessage("communicationCompletion.notifications.facts2", { a: "Forge نادي", b: { message: systemMessage("communicationCompletion.notifications.dateClock", { date: { date: "2026-10-04" }, time: { clock: "18:30" } }) } });
    expect(strip(presentSystemText("x", trial, AR))).toBe("Forge نادي · 4 تشرين الأول 2026، 6:30 م");
    const midnight = systemMessage("communicationCompletion.notifications.dateClock", { date: { date: "2026-10-04" }, time: { clock: "00:00" } });
    expect(presentSystemText("x", midnight, AR)).toBe("4 تشرين الأول 2026، 12:00 ص");
    const booking = systemMessage("communicationCompletion.notifications.ptBookingReminderBody", { startsAt: { at: "2026-10-04T09:00:00.000Z" } });
    expect(presentSystemText("x", booking, AR)).toBe("موعد حصتك: 4 تشرين الأول، 12:00 م.");
    const outcome = systemMessage("communicationCompletion.timeline.messageAccepted", { channel: { enum: "channel", value: "whatsapp" }, context: { enum: "messageContext", value: "renewal" } });
    expect(presentSystemText("WhatsApp renewal reminder accepted by the provider", outcome, AR)).toBe("تذكير التجديد عبر واتساب: تم الإرسال");
  });

  it("localizes only known renewal reasons and class calendar dates", () => {
    const cancelled = renewalReasonMessage("membership_term_changed");
    expect(cancelled).toEqual(systemMessage("communicationCompletion.timeline.value", { value: { enum: "renewalReason", value: "membership_term_changed" } }));
    expect(strip(presentSystemText("membership term changed", cancelled, AR))).toBe("تغيّرت تواريخ الاشتراك");
    expect(renewalReasonMessage("A staff-authored reason")).toBeUndefined();
    expect(renewalReasonMessage("constructor")).toBeUndefined();
    expect(renewalReasonMessage("toString")).toBeUndefined();
    expect(presentSystemText("Gym-specific historical reason", renewalReasonMessage("A staff-authored reason"), AR)).toBe("Gym-specific historical reason");

    const event = {
      type: "class_booked",
      title: "Booked Small group",
      body: "2026-10-12",
      bodyMessage: systemMessage("communicationCompletion.timeline.value", { value: { date: "2026-10-12" } }),
    };
    expect(presentTimelineEvent(event, AR)).toEqual({ title: "Booked Small group", body: "12 تشرين الأول 2026" });
    expect(presentTimelineEvent(event, EN).body).toBe("2026-10-12");
  });

  it("selects all Arabic plural forms from the real count", () => {
    const render = (count: number) => presentSystemText("x", systemMessage("communicationCompletion.timeline.membershipExtended", { count }), AR);
    expect(render(1)).toBe("تم تمديد الاشتراك يومًا واحدًا");
    expect(render(2)).toBe("تم تمديد الاشتراك يومين");
    expect(render(3)).toBe("تم تمديد الاشتراك 3 أيام");
    expect(render(11)).toBe("تم تمديد الاشتراك 11 يومًا");
    expect(render(100)).toBe("تم تمديد الاشتراك 100 يوم");
    expect(render(0)).toBe("تم تمديد الاشتراك 0 يوم");
  });

  it("keeps names, references and reasons exactly as written inside a translated sentence", () => {
    const message = systemMessage("communicationCompletion.notifications.invitationFailedBody", { name: "Lina <b>Khoury</b> لينا" });
    expect(strip(presentSystemText("x", message, AR))).toBe("تعذّر إرسال الدعوة إلى Lina <b>Khoury</b> لينا. يرجى التحقق من البريد الإلكتروني والمحاولة مرة أخرى.");
    const failed = systemMessage("communicationCompletion.timeline.messageFailedAfterReason", { count: 4, reason: "provider_http_500" });
    expect(strip(presentSystemText("x", failed, AR))).toContain("(provider_http_500)");
  });
});

describe("historical records", () => {
  it("projects only exact system wording for the matching kind", () => {
    expect(legacyNotificationMessages({ kind: "operational_email_failed", title: "A gym email could not be delivered", body: "An email could not be delivered after 4 attempts. Check email settings." })).toEqual({
      titleMessage: { key: "communicationCompletion.notifications.emailFailed" },
      bodyMessage: { key: "communicationCompletion.notifications.emailFailedAttempts", params: { count: 4 } },
    });
    // Same words under another kind, or with one character changed, stay original.
    expect(legacyNotificationMessages({ kind: "support_reply", title: "A gym email could not be delivered", body: "" })).toEqual({});
    expect(legacyNotificationMessages({ kind: "operational_email_failed", title: "A gym email could not be delivered!", body: "An email could not be delivered after 4 attempts. Check email settings" })).toEqual({});
    // A body made of a name and a subject is never parsed.
    expect(legacyNotificationMessages({ kind: "support_assignment", title: "Support case assigned to you", body: "Forge · Charged twice" })).toEqual({ titleMessage: { key: "communicationCompletion.notifications.supportAssigned" } });
  });

  it("renders a historical notification in Arabic only where it is unambiguous", () => {
    const legacy = presentNotification({ kind: "renewal_reminder", title: "Membership renewal approaching", body: "Your current membership term ends 2026-10-12." }, AR);
    expect(legacy).toEqual({ title: "اقترب موعد تجديد الاشتراك", body: "ينتهي اشتراكك الحالي في 12 تشرين الأول 2026." });
    const authored = presentNotification({ kind: "automation_attention", title: "Call everyone who missed a week", body: "Rania Odeh" }, AR);
    expect(authored).toEqual({ title: "Call everyone who missed a week", body: "Rania Odeh" });
  });

  it("projects wholly system-written message outcomes, and keeps authored timeline bodies untouched", () => {
    expect(legacyTimelineMessages({ type: "message", title: "SMS message failed", body: "Failed after 1 attempt (provider_http_500). Managers were notified; follow up by phone." })).toEqual({
      titleMessage: { key: "communicationCompletion.timeline.messageFailed", params: { channel: { enum: "channel", value: "sms" }, context: { enum: "messageContext", value: "message" } } },
      bodyMessage: { key: "communicationCompletion.timeline.messageFailedAfterReason", params: { count: 1, reason: "provider_http_500" } },
    });
    const note = presentTimelineEvent({ type: "note", title: "Note added", body: "Member travels until 12 Oct" }, AR);
    expect(note).toEqual({ title: "تمت إضافة ملاحظة", body: "Member travels until 12 Oct" });
    const unknown = presentTimelineEvent({ type: "payment_collected", title: "Payment collected — JOD 25.000 cash" }, AR);
    expect(unknown).toEqual({ title: "Payment collected — JOD 25.000 cash" });
    const sandboxed = presentTimelineEvent({ type: "renewal_message_sandboxed", title: "Renewal message prepared in sandbox", body: "A whatsapp reminder was prepared but not sent." }, AR);
    expect(sandboxed).toEqual({ title: "تم تجهيز رسالة التجديد في وضع الاختبار", body: "تم تجهيز تذكير عبر واتساب دون إرساله." });
  });

  it("recovers exact historical renewal and class bodies even when the title already has a descriptor", () => {
    const stopped = presentTimelineEvent({
      type: "renewal_journey_cancelled",
      title: "Renewal follow-up stopped",
      titleMessage: systemMessage("communicationCompletion.timeline.renewalStopped"),
      body: "membership term changed",
      meta: { reason: "membership_term_changed" },
    }, AR);
    expect(stopped).toEqual({ title: "توقفت متابعة التجديد", body: "تغيّرت تواريخ الاشتراك" });

    const suppressed = presentTimelineEvent({
      type: "renewal_message_suppressed",
      title: "Renewal message suppressed",
      body: "Explicit consent is required for renewal messages",
    }, AR);
    expect(suppressed.body).toBe("تتطلب رسائل التجديد موافقة صريحة");

    const unknown = presentTimelineEvent({
      type: "renewal_journey_cancelled",
      title: "Renewal follow-up stopped",
      body: "A gym-specific reason with details",
      meta: { reason: "A gym-specific reason with details" },
    }, AR);
    expect(unknown.body).toBe("A gym-specific reason with details");

    const authoredCollision = presentTimelineEvent({
      type: "renewal_journey_cancelled",
      title: "Renewal follow-up stopped",
      body: "member requested no contact",
      meta: { reason: "member requested no contact" },
    }, AR);
    expect(authoredCollision.body).toBe("member requested no contact");

    const classDate = presentTimelineEvent({ type: "class_waitlisted", title: "Joined the HIIT waitlist", body: "2026-10-12" }, AR);
    expect(classDate.body).toBe("12 تشرين الأول 2026");
  });

  it("prefers a stored descriptor over projection and never invents a body", () => {
    const event = presentTimelineEvent({ type: "membership_extended", title: "Membership extended by 2 days", titleMessage: systemMessage("communicationCompletion.timeline.membershipExtended", { count: 2 }) }, AR);
    expect(event).toEqual({ title: "تم تمديد الاشتراك يومين" });
  });
});
