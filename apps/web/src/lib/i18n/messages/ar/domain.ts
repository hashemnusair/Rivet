import type { domain as EnDomain } from "../en/domain";

/**
 * Status words are read at speed by a receptionist with a member waiting, so
 * they are short. Membership statuses agree with the feminine noun عضوية.
 * Most entries come from origin/arabic-localisation; the lead stages won/lost
 * and the check-in decisions were re-translated because the English changed in
 * the plain-language pass (Sold / Not sold, Refused / Let in anyway).
 * See docs/arabic/GLOSSARY.md.
 */
export const domain: typeof EnDomain = {
  membershipStatus: {
    active: "سارية",
    expiring: "تنتهي قريبًا",
    frozen: "مجمّدة",
    expired: "منتهية",
    cancelled: "ملغاة",
    depleted: "استُنفدت الزيارات",
    scheduled: "لم تبدأ بعد",
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
  transactionType: {
    payment: "دفعة",
    refund: "استرداد",
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
    lost: "لم يتم البيع",
  },
  checkInDecision: {
    allowed: "مسموح",
    warning: "تنبيه",
    blocked: "مرفوض",
    overridden: "سُمح بالدخول رغم ذلك",
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
