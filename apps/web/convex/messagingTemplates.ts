import type { MessagingChannel } from "./messagingMode";

/**
 * Code-owned utility message catalogue, Arabic and English. These are the
 * messages a gym may send its own members through RIVET: operational,
 * never marketing. Each names the gym, keeps to one screen of text, and
 * uses {{variables}} that the sender fills from the member record. Gyms
 * can still write their own templates; the catalogue is the reviewed
 * baseline and the set that must be submitted to Meta for WhatsApp
 * approval before live delivery (see docs/19).
 */
export type MessageTemplateFamily = "renewal" | "payment" | "class" | "entry";

export interface CatalogueTemplate {
  key: string;
  family: MessageTemplateFamily;
  name: string;
  /** Meta category; utility templates are the only ones sent without marketing consent. */
  category: "utility";
  channels: MessagingChannel[];
  variables: string[];
  bodyEn: string;
  bodyAr: string;
  version: string;
}

export const MESSAGE_TEMPLATE_CATALOGUE_VERSION = "1.0 · 3 September 2026";

export const MESSAGE_TEMPLATE_CATALOGUE: readonly CatalogueTemplate[] = [
  {
    key: "renewal_7d",
    family: "renewal",
    name: "Renewal reminder · 7 days",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "end_date", "branch_name"],
    bodyEn: "Hi {{member_name}}, your {{gym_name}} membership ends on {{end_date}}. Renew at the {{branch_name}} desk or reply here and we will sort it out. — {{gym_name}}",
    bodyAr: "مرحباً {{member_name}}، عضويتك في {{gym_name}} تنتهي بتاريخ {{end_date}}. جدّد من كاونتر فرع {{branch_name}} أو رد على هذه الرسالة وسنرتبها لك. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "renewal_3d",
    family: "renewal",
    name: "Renewal reminder · 3 days",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "end_date"],
    bodyEn: "{{member_name}}, 3 days left on your {{gym_name}} membership (ends {{end_date}}). Renew before it ends to keep your access uninterrupted. — {{gym_name}}",
    bodyAr: "{{member_name}}، بقي 3 أيام على عضويتك في {{gym_name}} (تنتهي {{end_date}}). جدّد قبل الانتهاء لتبقى دخولك مستمراً. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "renewal_today",
    family: "renewal",
    name: "Renewal reminder · ends today",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "branch_name"],
    bodyEn: "{{member_name}}, your {{gym_name}} membership ends today. Renew at the {{branch_name}} desk today to keep training tomorrow. — {{gym_name}}",
    bodyAr: "{{member_name}}، عضويتك في {{gym_name}} تنتهي اليوم. جدّد من كاونتر فرع {{branch_name}} اليوم لتواصل تمرينك غداً. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "renewal_expired_3d",
    family: "renewal",
    name: "Renewal reminder · 3 days after expiry",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "end_date"],
    bodyEn: "{{member_name}}, your {{gym_name}} membership ended on {{end_date}}. Renew any time at the desk or reply here to pick up where you left off. — {{gym_name}}",
    bodyAr: "{{member_name}}، انتهت عضويتك في {{gym_name}} بتاريخ {{end_date}}. جدّد في أي وقت من الكاونتر أو رد هنا لتكمل من حيث توقفت. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "payment_due_3d",
    family: "payment",
    name: "Payment reminder · due in 3 days",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "amount", "due_date"],
    bodyEn: "{{member_name}}, a payment of {{amount}} to {{gym_name}} is due on {{due_date}}. Pay at the desk, by CliQ or bank transfer. — {{gym_name}}",
    bodyAr: "{{member_name}}، دفعة بقيمة {{amount}} لـ {{gym_name}} مستحقة بتاريخ {{due_date}}. ادفع من الكاونتر أو عبر كليك أو التحويل البنكي. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "payment_due_today",
    family: "payment",
    name: "Payment reminder · due today",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "amount"],
    bodyEn: "{{member_name}}, your payment of {{amount}} to {{gym_name}} is due today. Thank you for settling it at the desk or by CliQ. — {{gym_name}}",
    bodyAr: "{{member_name}}، دفعتك بقيمة {{amount}} لـ {{gym_name}} مستحقة اليوم. شكراً لتسديدها من الكاونتر أو عبر كليك. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "payment_overdue_3d",
    family: "payment",
    name: "Payment reminder · 3 days overdue",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "amount"],
    bodyEn: "{{member_name}}, a payment of {{amount}} to {{gym_name}} is 3 days overdue. Please settle it at the desk or reply here if something is wrong. — {{gym_name}}",
    bodyAr: "{{member_name}}، دفعة بقيمة {{amount}} لـ {{gym_name}} متأخرة 3 أيام. يرجى تسديدها من الكاونتر أو الرد هنا إن كان هناك خطأ. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "class_booking_confirmation",
    family: "class",
    name: "Class booking confirmed",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "class_name", "class_time", "branch_name"],
    bodyEn: "{{member_name}}, you are booked for {{class_name}} at {{class_time}}, {{branch_name}}. Reply here if you cannot make it so we can free the spot. — {{gym_name}}",
    bodyAr: "{{member_name}}، تم حجزك في {{class_name}} الساعة {{class_time}} في فرع {{branch_name}}. رد هنا إن لم تستطع الحضور لنحرر المكان. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "class_reminder",
    family: "class",
    name: "Class reminder · 2 hours before",
    category: "utility",
    channels: ["whatsapp", "sms"],
    variables: ["member_name", "gym_name", "class_name", "class_time"],
    bodyEn: "{{member_name}}, {{class_name}} starts at {{class_time}} today. See you there. — {{gym_name}}",
    bodyAr: "{{member_name}}، {{class_name}} تبدأ الساعة {{class_time}} اليوم. نراك هناك. — {{gym_name}}",
    version: "1.0",
  },
  {
    key: "entry_pass",
    family: "entry",
    name: "Entry pass",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "pass_link"],
    bodyEn: "{{member_name}}, here is your {{gym_name}} entry pass: {{pass_link}}. Show it at the door; it expires shortly after it is opened. — {{gym_name}}",
    bodyAr: "{{member_name}}، هذا هو تصريح دخولك إلى {{gym_name}}: {{pass_link}}. أظهره عند الباب؛ تنتهي صلاحيته بعد فتحه بوقت قصير. — {{gym_name}}",
    version: "1.0",
  },
];

/** Replace {{variables}}; unknown variables are left visible so a gap is never silent. */
export function renderMessageTemplate(body: string, variables: Record<string, string | number | undefined>): string {
  return body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    const value = variables[key];
    return value === undefined || value === null || value === "" ? match : String(value);
  });
}

export function catalogueTemplate(key: string): CatalogueTemplate | undefined {
  return MESSAGE_TEMPLATE_CATALOGUE.find((template) => template.key === key);
}

/** Opt-out instruction appended to every message a member can decline. */
export const OPT_OUT_FOOTER = { en: "Reply STOP to stop these messages.", ar: "أرسل إيقاف لإيقاف هذه الرسائل." } as const;
