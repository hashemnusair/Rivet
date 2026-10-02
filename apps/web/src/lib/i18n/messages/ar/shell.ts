import type { shell as EnShell } from "../en/shell";

/** Approved terminology: docs/arabic/STANDARD.md and DECISIONS.md. */
export const shell: typeof EnShell = {
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
