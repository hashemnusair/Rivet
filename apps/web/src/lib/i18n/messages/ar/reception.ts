import type { reception as EnReception } from "../en/reception";

/**
 * "الدرج" is the cash drawer, and "الوردية" the shift — both are what staff in
 * an Amman gym actually say. "امسح" covers scanning a QR the way a receptionist
 * would phrase it, rather than a literal rendering of "scan".
 */
export const reception: typeof EnReception = {
  forbidden: "تحتاج وحدة الاستقبال إلى صلاحية البحث عن الأعضاء.",
  pickBranch: "اختر فرعًا واحدًا من محدّد الفروع — المكتب يعمل على باب واحد في كل مرة.",

  lookup: {
    placeholder: "امسح الرمز، أو اكتب اسمًا أو رقم هاتف أو رقم عضوية",
    label: "البحث عن عضو",
    clear: "مسح",
    esc: "Esc",
    looking: "جارٍ البحث عن العضو",
    ready: "جاهز للعضو التالي",
    checkSpelling: "تحقّق من الإملاء، أو جرّب رقم الهاتف بدلًا من ذلك.",
  },

  activity: {
    label: "نشاط الفرع",
    checkInsToday: "تسجيلات الدخول اليوم",
    branch: "الفرع",
    peakHour: "ساعة الذروة",
    todayLog: "سجل دخول اليوم",
    noCheckIns: "لا توجد تسجيلات دخول اليوم بعد.",
  },

  shift: {
    none: "لا توجد وردية مفتوحة.",
    history: "سجل الورديات",
    openBeforeCash: "افتح وردية قبل تحصيل النقد",
  },

  member: {
    plan: "الباقة",
    expires: "تنتهي في",
    visitsLeft: "الزيارات المتبقية",
    balance: "الرصيد",
    criticalNote: "ملاحظة حرجة",
    openProfile: "فتح الملف",
    managerCanOverride: "يمكن للمدير تجاوز ذلك.",
  },

  decision: {
    allowed: "مسموح",
    blocked: "ممنوع",
  },
};
