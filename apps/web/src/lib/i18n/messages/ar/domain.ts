import type { domain as EnDomain } from "../en/domain";

/** Approved terminology: docs/arabic/STANDARD.md and DECISIONS.md. */
export const domain: typeof EnDomain = {
  membershipStatus: {
    active: "فعّال",
    expiring: "تنتهي قريبًا",
    frozen: "مجمّد",
    expired: "منتهي",
    cancelled: "ملغي",
    depleted: "استُنفدت الزيارات",
    scheduled: "اشتراك قادم",
    none: "لا يوجد اشتراك فعّال حاليًا.",
  },
  paymentStatus: {
    paid: "مدفوع",
    partial: "مدفوع جزئيًا",
    unpaid: "غير مدفوع",
    refunded: "مُسترد",
    void: "ملغي",
  },
  transactionStatus: {
    completed: "مكتملة",
    voided: "ملغي",
    refunded: "مستردة",
    partially_refunded: "مستردة جزئيًا",
  },
  transactionType: {
    payment: "دفعة",
    refund: "استرداد المبلغ",
    void: "دفعة ملغاة",
    retail_sale: "بيع بالتجزئة",
  },
  leadStage: {
    new: "جديدة",
    attempted: "لم يتم الرد",
    contacted: "تم التواصل",
    trial_booked: "تجربة محجوزة",
    trial_completed: "تمت التجربة",
    offer_sent: "أُرسل العرض",
    won: "تم البيع",
    lost: "فرصة بيع مفقودة",
  },
  checkInDecision: {
    allowed: "مسموح",
    warning: "تنبيه",
    blocked: "مرفوض",
    overridden: "السماح بالدخول استثنائيًا",
  },
  leadSource: {
    instagram: "إنستغرام",
    walk_in: "زيارة دون موعد",
    referral: "ترشيح",
    whatsapp: "واتساب",
    google: "جوجل",
    phone_call: "مكالمة هاتفية",
    other: "أخرى",
  },
  paymentMethod: {
    cash: "كاش",
    card: "بطاقة",
    bank_transfer: "حوالة بنكية",
    cliq: "كليك",
    other: "أخرى",
  },
  role: {
    owner: "مالك النادي",
    manager: "المدير",
    salesperson: "المبيعات",
    receptionist: "الاستقبال",
    trainer: "مدرّب",
    auditor: "المدقّق",
  },
};
