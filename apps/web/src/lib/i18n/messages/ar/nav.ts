import type { nav as EnNav } from "../en/nav";

export const nav: typeof EnNav = {
  section: {
    overview: "نظرة عامة",
    workspace: "مساحة العمل",
    sales: "المبيعات",
    finance: "المالية",
    system: "النظام",
  },

  item: {
    dashboard: "لوحة التحكم",
    reception: "الاستقبال",
    members: "الأعضاء",
    personalTraining: "التدريب الشخصي",
    leads: "الفرص",
    followUps: "المتابعات",
    payments: "المدفوعات",
    auditLog: "سجل التدقيق",
    support: "الدعم",
    settings: "الإعدادات",
  },

  aria: {
    primary: "التنقل الرئيسي",
    openMenu: "فتح قائمة التنقل",
    home: "الصفحة الرئيسية لـ RIVET",
    collapse: "طيّ الشريط الجانبي",
    expand: "توسيع الشريط الجانبي",
    search: "ابحث في الأعضاء والفرص والصفحات",
    activeWorkspace: "مساحة العمل النشطة",
    activeBranch: "الفرع النشط",
    accountMenu: "قائمة الحساب",
    notifications: "الإشعارات",
  },
};
