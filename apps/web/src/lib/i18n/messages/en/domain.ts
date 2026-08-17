/**
 * The product's own nouns: every status, stage, verdict, tender and role that
 * is stored as a code and rendered as words. Keys match the domain unions in
 * `lib/domain/types`, so a new member of any union is a compile error here.
 */
export const domain = {
  membershipStatus: {
    active: "Active",
    expiring: "Expiring",
    frozen: "Frozen",
    expired: "Expired",
    cancelled: "Cancelled",
    depleted: "Visits used up",
    scheduled: "Scheduled",
    none: "No membership",
  },

  paymentStatus: {
    paid: "Paid",
    partial: "Partial",
    unpaid: "Unpaid",
    refunded: "Refunded",
    void: "Void",
  },

  transactionStatus: {
    completed: "Completed",
    voided: "Voided",
    refunded: "Refunded",
    partially_refunded: "Part-refunded",
  },

  leadStage: {
    new: "New",
    attempted: "Attempted",
    contacted: "Contacted",
    trial_booked: "Trial booked",
    trial_completed: "Trial done",
    offer_sent: "Offer sent",
    won: "Won",
    lost: "Lost",
  },

  checkInDecision: {
    allowed: "Allowed",
    warning: "Warning",
    blocked: "Blocked",
    overridden: "Override",
  },

  leadSource: {
    instagram: "Instagram",
    walk_in: "Walk-in",
    referral: "Referral",
    whatsapp: "WhatsApp",
    google: "Google",
    phone_call: "Phone call",
    other: "Other",
  },

  paymentMethod: {
    cash: "Cash",
    card: "Card",
    bank_transfer: "Bank transfer",
    cliq: "CliQ",
    other: "Other",
  },

  role: {
    owner: "Owner",
    manager: "Manager",
    salesperson: "Sales",
    receptionist: "Reception",
    trainer: "Trainer",
    auditor: "Auditor",
  },
};
