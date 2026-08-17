/**
 * The front desk. This copy is read at speed with a member standing there, so
 * it stays short and states the verdict before the reason.
 */
export const reception = {
  forbidden: "The reception console needs member lookup permission.",
  pickBranch: "Pick a single branch from the branch selector — the desk works one door at a time.",

  lookup: {
    placeholder: "Scan, or type a name, phone or number",
    label: "Member lookup",
    clear: "Clear",
    esc: "Esc",
    looking: "Looking up member",
    ready: "Ready for the next member",
    checkSpelling: "Check the spelling, or try the phone number instead.",
  },

  activity: {
    label: "Branch activity",
    checkInsToday: "Check-ins today",
    branch: "Branch",
    peakHour: "Peak hour",
    todayLog: "Today's check-in log",
    noCheckIns: "No check-ins yet today.",
  },

  shift: {
    none: "No shift open.",
    history: "Shift history",
    openBeforeCash: "Open a shift before collecting cash",
  },

  member: {
    plan: "Plan",
    expires: "Expires",
    visitsLeft: "Visits left",
    balance: "Balance",
    criticalNote: "Critical note",
    openProfile: "Open profile",
    managerCanOverride: "A manager can override this.",
  },

  decision: {
    allowed: "Allowed",
    blocked: "Blocked",
  },
};
