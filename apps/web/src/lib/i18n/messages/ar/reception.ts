import type { reception as EnReception } from "../en/reception";

/** Approved terminology: docs/arabic/STANDARD.md and DECISIONS.md. */
export const reception: typeof EnReception = {
  forbidden: "تحتاج وحدة الاستقبال إلى صلاحية البحث عن الأعضاء.",
  pickBranch: "اختر فرعًا واحدًا من محدّد الفروع — المكتب يعمل على باب واحد في كل مرة.",

  lookup: {
    placeholder: "امسح الرمز، أو اكتب اسمًا أو رقم هاتف أو رقم اشتراك",
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
    branch: "فرع",
    peakHour: "ساعة الذروة",
    todayLog: "سجل دخول اليوم",
    noCheckIns: "لا توجد تسجيلات دخول اليوم بعد.",
  },

  shift: {
    none: "لا يوجد صندوق مفتوح.",
    history: "سجل الصناديق",
    openBeforeCash: "يرجى فتح الصندوق قبل استلام دفعة كاش",
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
    blocked: "متوقف",
  },
};
