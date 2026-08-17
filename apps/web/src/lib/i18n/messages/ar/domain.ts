import type { domain as EnDomain } from "../en/domain";

/**
 * Status words are read at speed by a receptionist with a member waiting, so
 * they are short and unambiguous rather than literal. "استُنفدت الزيارات" for a
 * depleted visit pack, not a translation of "used up"; "كليك" for CliQ, which
 * is what the Jordanian instant-payment service is actually called in Arabic.
 */
export const domain: typeof EnDomain = {
  membershipStatus: {
    active: "سارية",
    expiring: "تقارب الانتهاء",
    frozen: "مجمّدة",
    expired: "منتهية",
    cancelled: "ملغاة",
    depleted: "استُنفدت الزيارات",
    scheduled: "مجدولة",
    none: "لا توجد عضوية",
  },

  paymentStatus: {
    paid: "مدفوع",
    partial: "مدفوع جزئيًا",
    unpaid: "غير مدفوع",
    refunded: "مُسترد",
    void: "ملغى",
  },

  transactionStatus: {
    completed: "مكتملة",
    voided: "ملغاة",
    refunded: "مستردة",
    partially_refunded: "مستردة جزئيًا",
  },

  leadStage: {
    new: "جديدة",
    attempted: "محاولة اتصال",
    contacted: "تم التواصل",
    trial_booked: "تجربة محجوزة",
    trial_completed: "تمت التجربة",
    offer_sent: "أُرسل العرض",
    won: "مكسوبة",
    lost: "خاسرة",
  },

  checkInDecision: {
    allowed: "مسموح",
    warning: "تنبيه",
    blocked: "ممنوع",
    overridden: "تجاوز",
  },

  leadSource: {
    instagram: "إنستغرام",
    walk_in: "زيارة مباشرة",
    referral: "ترشيح",
    whatsapp: "واتساب",
    google: "جوجل",
    phone_call: "مكالمة هاتفية",
    other: "أخرى",
  },

  paymentMethod: {
    cash: "نقدًا",
    card: "بطاقة",
    bank_transfer: "حوالة بنكية",
    cliq: "كليك",
    other: "أخرى",
  },

  role: {
    owner: "المالك",
    manager: "المدير",
    salesperson: "المبيعات",
    receptionist: "الاستقبال",
    trainer: "المدرّب",
    auditor: "المدقّق",
  },
};
