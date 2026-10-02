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

export const MESSAGE_TEMPLATE_CATALOGUE_VERSION = "1.1 · 3 October 2026";
/** The version every current template carries; recorded on queued messages. */
export const MESSAGE_TEMPLATE_VERSION = "1.1";

export const MESSAGE_TEMPLATE_CATALOGUE: readonly CatalogueTemplate[] = [
  {
    key: "renewal_7d",
    family: "renewal",
    name: "Renewal reminder · 7 days",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "end_date", "branch_name"],
    bodyEn: "Hi {{member_name}}, your {{gym_name}} membership ends on {{end_date}}. Renew at the {{branch_name}} desk or reply here and we will sort it out. — {{gym_name}}",
    bodyAr: "مرحبًا {{member_name}}، ينتهي اشتراكك في {{gym_name}} بتاريخ {{end_date}}. يمكن تجديد الاشتراك من الاستقبال في فرع {{branch_name}} أو بالرد على هذه الرسالة لنساعدك. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "renewal_3d",
    family: "renewal",
    name: "Renewal reminder · 3 days",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "end_date"],
    bodyEn: "{{member_name}}, 3 days left on your {{gym_name}} membership (ends {{end_date}}). Renew before it ends to keep your access uninterrupted. — {{gym_name}}",
    bodyAr: "{{member_name}}، بقيت 3 أيام على انتهاء اشتراكك في {{gym_name}} (ينتهي في {{end_date}}). يرجى تجديد الاشتراك قبل انتهائه ليبقى دخولك مستمرًا. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "renewal_today",
    family: "renewal",
    name: "Renewal reminder · ends today",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "branch_name"],
    bodyEn: "{{member_name}}, your {{gym_name}} membership ends today. Renew at the {{branch_name}} desk today to keep training tomorrow. — {{gym_name}}",
    bodyAr: "{{member_name}}، ينتهي اشتراكك في {{gym_name}} اليوم. يرجى تجديد الاشتراك من الاستقبال في فرع {{branch_name}} اليوم لمواصلة التمرين غدًا. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "renewal_expired_3d",
    family: "renewal",
    name: "Renewal reminder · 3 days after expiry",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "end_date"],
    bodyEn: "{{member_name}}, your {{gym_name}} membership ended on {{end_date}}. Renew any time at the desk or reply here to pick up where you left off. — {{gym_name}}",
    bodyAr: "{{member_name}}، انتهى اشتراكك في {{gym_name}} بتاريخ {{end_date}}. يمكن تجديد الاشتراك في أي وقت من الاستقبال أو بالرد على هذه الرسالة للعودة إلى التمرين. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "payment_due_3d",
    family: "payment",
    name: "Payment reminder · due in 3 days",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "amount", "due_date"],
    bodyEn: "{{member_name}}, a payment of {{amount}} to {{gym_name}} is due on {{due_date}}. Pay at the desk, by CliQ or bank transfer. — {{gym_name}}",
    bodyAr: "{{member_name}}، تستحق دفعة بقيمة {{amount}} لصالح {{gym_name}} بتاريخ {{due_date}}. يمكن الدفع في الاستقبال أو عبر كليك أو بحوالة بنكية. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "payment_due_today",
    family: "payment",
    name: "Payment reminder · due today",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "amount"],
    bodyEn: "{{member_name}}, your payment of {{amount}} to {{gym_name}} is due today. Thank you for settling it at the desk or by CliQ. — {{gym_name}}",
    bodyAr: "{{member_name}}، تستحق اليوم دفعتك بقيمة {{amount}} لصالح {{gym_name}}. شكرًا لتسديدها في الاستقبال أو عبر كليك. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "payment_overdue_3d",
    family: "payment",
    name: "Payment reminder · 3 days overdue",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "amount"],
    bodyEn: "{{member_name}}, a payment of {{amount}} to {{gym_name}} is 3 days overdue. Please settle it at the desk or reply here if something is wrong. — {{gym_name}}",
    bodyAr: "{{member_name}}، مضت 3 أيام على موعد استحقاق دفعة بقيمة {{amount}} لصالح {{gym_name}}. يرجى تسديدها في الاستقبال أو الرد على هذه الرسالة إن كان هناك خطأ. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "class_booking_confirmation",
    family: "class",
    name: "Class booking confirmed",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "class_name", "class_time", "branch_name"],
    bodyEn: "{{member_name}}, you are booked for {{class_name}} at {{class_time}}, {{branch_name}}. Reply here if you cannot make it so we can free the spot. — {{gym_name}}",
    bodyAr: "{{member_name}}، تم حجز مكانك في حصة {{class_name}} الساعة {{class_time}} في فرع {{branch_name}}. يرجى الرد على هذه الرسالة إذا تعذّر الحضور لنتيح المكان لغيرك. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "class_reminder",
    family: "class",
    name: "Class reminder · 2 hours before",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "class_name", "class_time"],
    bodyEn: "{{member_name}}, {{class_name}} starts at {{class_time}} today. See you there. — {{gym_name}}",
    bodyAr: "{{member_name}}، تبدأ حصة {{class_name}} اليوم الساعة {{class_time}}. بانتظارك. — {{gym_name}}",
    version: "1.1",
  },
  {
    key: "entry_pass",
    family: "entry",
    name: "Entry pass",
    category: "utility",
    channels: ["whatsapp"],
    variables: ["member_name", "gym_name", "pass_link"],
    bodyEn: "{{member_name}}, here is your {{gym_name}} entry pass: {{pass_link}}. Show it at the door; it expires shortly after it is opened. — {{gym_name}}",
    bodyAr: "{{member_name}}، هذا رابط تصريح الدخول إلى {{gym_name}}: {{pass_link}}. يرجى إظهاره عند الدخول؛ تنتهي صلاحيته بعد فتحه بوقت قصير. — {{gym_name}}",
    version: "1.1",
  },
];

/**
 * Earlier Arabic bodies, kept so a message queued under an older version
 * still renders the wording it was queued with. English is unchanged across
 * versions. Never edit a released entry; add a new version instead.
 */
const ARCHIVED_ARABIC_BODIES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "1.0": {
    renewal_7d: "مرحباً {{member_name}}، عضويتك في {{gym_name}} تنتهي بتاريخ {{end_date}}. جدّد من كاونتر فرع {{branch_name}} أو رد على هذه الرسالة وسنرتبها لك. — {{gym_name}}",
    renewal_3d: "{{member_name}}، بقي 3 أيام على عضويتك في {{gym_name}} (تنتهي {{end_date}}). جدّد قبل الانتهاء لتبقى دخولك مستمراً. — {{gym_name}}",
    renewal_today: "{{member_name}}، عضويتك في {{gym_name}} تنتهي اليوم. جدّد من كاونتر فرع {{branch_name}} اليوم لتواصل تمرينك غداً. — {{gym_name}}",
    renewal_expired_3d: "{{member_name}}، انتهت عضويتك في {{gym_name}} بتاريخ {{end_date}}. جدّد في أي وقت من الكاونتر أو رد هنا لتكمل من حيث توقفت. — {{gym_name}}",
    payment_due_3d: "{{member_name}}، دفعة بقيمة {{amount}} لـ {{gym_name}} مستحقة بتاريخ {{due_date}}. ادفع من الكاونتر أو عبر كليك أو التحويل البنكي. — {{gym_name}}",
    payment_due_today: "{{member_name}}، دفعتك بقيمة {{amount}} لـ {{gym_name}} مستحقة اليوم. شكراً لتسديدها من الكاونتر أو عبر كليك. — {{gym_name}}",
    payment_overdue_3d: "{{member_name}}، دفعة بقيمة {{amount}} لـ {{gym_name}} متأخرة 3 أيام. يرجى تسديدها من الكاونتر أو الرد هنا إن كان هناك خطأ. — {{gym_name}}",
    class_booking_confirmation: "{{member_name}}، تم حجزك في {{class_name}} الساعة {{class_time}} في فرع {{branch_name}}. رد هنا إن لم تستطع الحضور لنحرر المكان. — {{gym_name}}",
    class_reminder: "{{member_name}}، {{class_name}} تبدأ الساعة {{class_time}} اليوم. نراك هناك. — {{gym_name}}",
    entry_pass: "{{member_name}}، هذا هو تصريح دخولك إلى {{gym_name}}: {{pass_link}}. أظهره عند الباب؛ تنتهي صلاحيته بعد فتحه بوقت قصير. — {{gym_name}}",
  },
};

/**
 * The template as it read at `version`: the current entry when the version
 * matches or is unknown-but-current, the archived Arabic body for a released
 * older version. Unknown keys return undefined.
 */
export function catalogueTemplateAt(key: string, version: string | undefined): CatalogueTemplate | undefined {
  const current = catalogueTemplate(key);
  if (!current || !version || version === current.version) return current;
  const archivedAr = ARCHIVED_ARABIC_BODIES[version]?.[key];
  return archivedAr ? { ...current, bodyAr: archivedAr, version } : current;
}

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
// Both languages name the same keyword: RIVET has no Arabic keyword handler, so
// the Arabic line must not promise one.
export const OPT_OUT_FOOTER = { en: "Reply STOP to stop these messages.", ar: "يمكن إيقاف هذه الرسائل بالرد بكلمة STOP." } as const;
