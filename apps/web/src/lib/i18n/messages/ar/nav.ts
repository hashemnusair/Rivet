import type { nav as EnNav } from "../en/nav";

/**
 * Navigation labels. Dashboard, reception, members, payments, follow-ups,
 * leads, support and settings come from origin/arabic-localisation; sections
 * and the other items are new drafts for the current navigation (the old branch
 * had a different section layout). "Audit log" became "Activity log" in the
 * plain-language pass, so it is re-translated as سجل النشاط.
 */
export const nav: typeof EnNav = {
  section: {
    overview: "نظرة عامة",
    dailyWork: "العمل اليومي",
    sales: "المبيعات",
    finance: "المالية",
    managementLedger: "الدفتر الإداري",
    admin: "الإدارة",
  },

  item: {
    dashboard: "لوحة التحكم",
    reception: "الاستقبال",
    checkout: "نقطة البيع",
    checklists: "قائمة المهام اليومية",
    members: "الأعضاء",
    classes: "الحصص",
    personalTraining: "التدريب الشخصي",
    operations: "المخزون والمشتريات",
    leads: "الفرص",
    followUps: "المتابعات",
    payments: "المدفوعات",
    reports: "التقارير",
    statements: "القوائم المالية",
    activityLog: "سجل النشاط",
    downloads: "التنزيلات",
    support: "الدعم",
    settings: "الإعدادات",
  },

  sidebar: {
    primary: "التنقل الرئيسي",
    home: "الصفحة الرئيسية لـ {name}",
    operatedBy: "بتشغيل RIVET™",
    collapse: "طيّ",
    collapseSidebar: "طيّ الشريط الجانبي",
    expandSidebar: "توسيع الشريط الجانبي",
  },

  drawer: {
    menu: "القائمة",
    closeMenu: "إغلاق القائمة",
    activeBranch: "الفرع النشط",
    branchUnavailable: "الفرع غير متاح",
  },
};
