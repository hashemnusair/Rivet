import { plural } from "../../dictionary";
import type { common as EnCommon } from "../en/common";

/**
 * Modern Standard Arabic drafts (see docs/arabic/GLOSSARY.md). The action
 * words, time words and plural groups come from origin/arabic-localisation and
 * are re-checked against current English; dialect words from that branch
 * (شيفت, كاش) are replaced by MSA.
 */
export const common: typeof EnCommon = {
  action: {
    save: "حفظ",
    saveChanges: "حفظ التغييرات",
    cancel: "إلغاء",
    close: "إغلاق",
    confirm: "تأكيد",
    continue: "مواصلة",
    back: "رجوع",
    next: "التالي",
    done: "تم",
    edit: "تعديل",
    delete: "حذف",
    remove: "إزالة",
    add: "إضافة",
    create: "إنشاء",
    search: "بحث",
    filter: "تصفية",
    clear: "مسح",
    clearFilters: "مسح التصفية",
    retry: "إعادة المحاولة",
    refresh: "تحديث",
    download: "تنزيل",
    print: "طباعة",
    copy: "نسخ",
    copied: "تم النسخ",
    viewAll: "عرض الكل",
    viewDetails: "عرض التفاصيل",
    signIn: "تسجيل الدخول",
    signOut: "تسجيل الخروج",
    send: "إرسال",
    openMenu: "فتح القائمة",
    closeMenu: "إغلاق القائمة",
  },

  state: {
    loading: "جارٍ التحميل…",
    saving: "جارٍ الحفظ…",
    searching: "جارٍ البحث…",
    empty: "لا يوجد شيء هنا بعد",
    error: "حدث خطأ ما",
    noResults: "لا توجد نتائج",
    required: "مطلوب",
    optional: "اختياري",
    notSet: "غير محدد",
  },

  states: {
    errorTitle: "حدث خطأ ما",
    errorDescription: "يرجى إعادة المحاولة. إذا استمرت المشكلة، تحققوا من اتصال الإنترنت.",
    forbiddenTitle: "لا تملكون صلاحية الوصول",
    forbiddenDescription: "لا يمكن لدوركم فتح هذه الصفحة. اطلبوا ذلك من المالك أو المدير عند الحاجة.",
    notFoundTitle: "غير موجود",
    notFoundDescription: "لم نعثر على هذا العنصر. ربما أُزيل، أو أن الرابط غير صحيح.",
    backToDashboard: "العودة إلى لوحة التحكم",
  },

  pagination: {
    showing: "عرض {from} إلى {to} من {total}",
    page: "الصفحة {page} من {total}",
    previous: "الصفحة السابقة",
    next: "الصفحة التالية",
  },

  label: {
    name: "الاسم",
    fullName: "الاسم الكامل",
    email: "البريد الإلكتروني",
    phone: "الهاتف",
    password: "كلمة المرور",
    date: "التاريخ",
    time: "الوقت",
    from: "من",
    to: "إلى",
    status: "الحالة",
    branch: "الفرع",
    allBranches: "كل الفروع",
    amount: "المبلغ",
    total: "الإجمالي",
    notes: "ملاحظات",
    reason: "السبب",
    type: "النوع",
    role: "الدور",
    details: "التفاصيل",
    language: "اللغة",
  },

  time: {
    today: "اليوم",
    yesterday: "أمس",
    tomorrow: "غدًا",
    now: "الآن",
    days: plural({ zero: "لا أيام", one: "يوم واحد", two: "يومان", few: "{count} أيام", many: "{count} يومًا", other: "{count} يوم" }),
    hours: plural({ zero: "لا ساعات", one: "ساعة واحدة", two: "ساعتان", few: "{count} ساعات", many: "{count} ساعة", other: "{count} ساعة" }),
    minutes: plural({ zero: "لا دقائق", one: "دقيقة واحدة", two: "دقيقتان", few: "{count} دقائق", many: "{count} دقيقة", other: "{count} دقيقة" }),
  },

  count: {
    members: plural({ zero: "لا أعضاء", one: "عضو واحد", two: "عضوان", few: "{count} أعضاء", many: "{count} عضوًا", other: "{count} عضو" }),
    results: plural({ zero: "لا نتائج", one: "نتيجة واحدة", two: "نتيجتان", few: "{count} نتائج", many: "{count} نتيجة", other: "{count} نتيجة" }),
  },

  language: {
    switchTo: "التبديل إلى {language}",
    label: "اللغة",
    english: "English",
    arabic: "العربية",
  },

  brand: {
    name: "RIVET",
  },
};
