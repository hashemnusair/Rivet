import type { shell as EnShell } from "../en/shell";

/** Approved terminology: docs/arabic/STANDARD.md and DECISIONS.md. */
export const shell: typeof EnShell = {
  demo: {
  "controls": "أدوات العرض التجريبي",
  "description": "تجربة الحالات التي قد تظهر أثناء تشغيل النادي.",
  "latency": "تأخير تجريبي",
  "latencyHint": "محاكاة بطء التطبيق.",
  "latencyLabel": "التأخير",
  "none": "بدون تأخير",
  "normal": "عادي",
  "slow": "بطيء",
  "verySlow": "شديد البطء",
  "failNext": "محاكاة فشل الطلب التالي",
  "failNextHint": "إظهار خطأ عند التحميل أو الحفظ التالي.",
  "failPublic": "محاكاة فشل التحديث العام التالي",
  "failPublicHint": "تتوقف التحديثات المباشرة في الصفحات العامة إلى أن تختار إعادة المحاولة أو توقف هذه المحاكاة.",
  "emptyLists": "محاكاة القوائم الفارغة",
  "emptyListsHint": "إظهار جميع القوائم فارغة.",
  "resetDone": "تمت استعادة البيانات التجريبية الأصلية.",
  "reset": "استعادة البيانات التجريبية",
  "resetFailed": "تعذّرت استعادة البيانات التجريبية. أعد المحاولة.",
  "switchRole": "تغيير الدور التجريبي",
  "role": {
    "owner": "الاطّلاع على جميع الفروع والبيانات المالية والسجلات والإعدادات.",
    "manager": "إدارة النادي والموافقات وجرد الصندوق والموظفين.",
    "salesperson": "متابعة التجارب والمهتمين وبيع الاشتراكات.",
    "receptionist": "البحث عن المشتركين وتسجيل الدخول وتحصيل الدفعات.",
    "trainer": "جدول حصص التدريب الشخصي والمواعيد المتاحة ونتائج الجلسات الخاصة بالمدرّب."
  }
},
  topbar: {
    openMenu: "فتح القائمة",
    searchLabel: "ابحثوا في الأعضاء والفرص والصفحات",
    searchPlaceholder: "بحث…",
    gym: "النادي",
    activeBranch: "الفرع النشط",
    branchUnavailable: "الفرع غير متاح",
    gymCouldNotOpen: "تعذّر فتح هذا النادي.",
    signOutFailed: "تعذّر تسجيل الخروج. يرجى إعادة المحاولة.",
    signingOut: "جارٍ تسجيل الخروج",
    signingOutDetail: "العودة إلى صفحة تسجيل الدخول…",
  },

  account: {
    menu: "قائمة الحساب",
    signedInAs: "تم تسجيل الدخول باسم {email}",
    settings: "الإعدادات",
    gettingStarted: "خطوات البداية",
    signOut: "تسجيل الخروج",
    signOutDemo: "تسجيل الخروج من العرض التجريبي",
  },
};
