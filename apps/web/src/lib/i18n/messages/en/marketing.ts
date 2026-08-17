import { plural } from "../../dictionary";

/** The public site: header, landing page, loop machine, hero mockups, footer. */
export const marketing = {
  nav: {
    product: "Product",
    forMembers: "For members",
    pricing: "Pricing",
    findGym: "Find a gym",
    primary: "Primary",
    mobile: "Mobile",
    home: "RIVET home",
    toggleNav: "Toggle navigation",
  },

  actions: {
    apply: "Send a gym application",
    applyShort: "Send gym application",
    seeHow: "See how it works",
    signIn: "Sign in",
    signInToRivet: "Sign in to RIVET",
    openRivet: "Open RIVET",
    preparingAccount: "Preparing account…",
    preparingAccountLong: "Preparing your account…",
    createFreeAccount: "Create a free account",
    createAccount: "Create account",
    findGym: "Find a gym",
  },

  hero: {
    eyebrow: "Revenue & operations OS · Built in Amman",
    line1: "Every member.",
    line2: "Every dinar.",
    line3: "Every shift.",
    body: "RIVET joins the sales desk, the gym floor, the cash drawer and the member's phone into one record — from the first free trial to the tenth renewal.",
    accessNote: "Gym access is issued after application review and operator onboarding.",
    stats: {
      tenderTerm: "Cash · Card · CliQ",
      tenderDetail: "Every tender receipted",
      branchTerm: "Multi-branch",
      branchDetail: "One ledger, every floor",
      localeTerm: "Arabic / RTL",
      localeDetail: "Native from day one",
      qrTerm: "Member QR",
      qrDetail: "One scan, clear verdict",
    },
  },

  /** Text inside the illustrated laptop and phone in the hero. */
  device: {
    alt: "Illustrative RIVET dashboard and member app preview with no customer or operational data.",
    searchPlaceholder: "Search members, leads and pages",
    allBranches: "All branches",
    today: "Today",
    greeting: "Good morning",
    live: "Live",
    gymOwner: "Gym owner",
    needsAttention: "Needs attention",
    drawerVariance: "Drawer variance awaiting approval",
    revenue30: "Revenue · last 30 days",
    receptionLive: "Reception · live",
    memberEntry: "Member entry",
    kpi: {
      collectedToday: "Collected today",
      collectedTodayValue: "Receipted",
      collectedTodayNote: "cash · card · CliQ",
      thisMonth: "This month",
      thisMonthValue: "On ledger",
      thisMonthNote: "reconciled",
      outstanding: "Outstanding",
      outstandingValue: "Tracked",
      outstandingNote: "unpaid balances",
      newMembers: "New members",
      newMembersValue: "Recorded",
      newMembersNote: "this month",
      renewals: "Renewals ≤ 7d",
      renewalsValue: "Queued",
      renewalsNote: "actionable",
      checkIns: "Check-ins today",
      checkInsValue: "Verified",
      checkInsNote: "at the door",
    },
    verdict: {
      valid: "VALID",
      validNote: "membership active",
      expiring: "EXPIRING",
      expiringNote: "renewal due",
      frozen: "FROZEN",
      frozenNote: "membership frozen",
    },
    phone: {
      member: "RIVET · Member",
      active: "Active",
      membership: "Your membership",
      gymBranch: "Selected gym · branch",
      statusLabel: "Status",
      statusValue: "Current",
      visitsLabel: "Visits",
      visitsValue: "History",
      entryPass: "Entry pass",
      scanAtDesk: "Scan at the desk",
      home: "Home",
      explore: "Explore",
      account: "Account",
    },
  },

  /** The scrolling band of the product's own vocabulary. */
  vocabulary: {
    lead: "Lead",
    freeTrial: "Free trial",
    offer: "Offer",
    membership: "Membership",
    tender: "Cash · Card · CliQ",
    receipt: "Receipt",
    checkIn: "Check-in",
    verdict: "Verdict",
    freeze: "Freeze",
    transfer: "Transfer",
    shiftClose: "Shift close",
    drawerVariance: "Drawer variance",
    overrideReason: "Override reason",
    auditEntry: "Audit entry",
    renewal: "Renewal",
  },

  numbers: {
    liveValue: "Live",
    liveLabel: "branch operations in one workspace",
    oneValue: "One",
    oneLabel: "chronological member timeline",
    auditedValue: "Audited",
    auditedLabel: "payments, shifts and overrides",
    scopedValue: "Scoped",
    scopedLabel: "roles, branches and tenant access",
  },

  /** The weight-stack section: eight plates, one machine. */
  loop: {
    eyebrow: "The commercial loop",
    titleLine1: "Eight plates.",
    titleLine2: "One machine.",
    body: "The RIVET mark is a weight stack, and it runs like one — eight stages of a gym's revenue, all pinned to the same member record. Watch the machine work through them, or pick a plate yourself.",
    stagesLabel: "Loop stages",
    stages: {
      lead: {
        label: "Lead",
        detail:
          "A marketplace booking, a walk-in, a referral — every name lands in one pipeline with an owner and a follow-up time. Nothing lives in a notebook.",
      },
      contact: {
        label: "Contact",
        detail:
          "Sales works a daily queue, not a memory. Every call, reply and promise is stamped onto the member's record the moment it happens.",
      },
      trial: {
        label: "Free trial",
        detail:
          "Trials are booked against real slots and confirmed before the visit, so the desk knows who is walking in and what they came for.",
      },
      offer: {
        label: "Offer",
        detail:
          "Plans and prices come from the catalog, so an offer is priced without guesswork — and every discount carries a reason with a name on it.",
      },
      membership: {
        label: "Membership",
        detail:
          "The sale writes the membership: dates, terms, freezes and transfers live on the record, not on paper taped to the front desk.",
      },
      payment: {
        label: "Payment",
        detail:
          "Cash, card or CliQ — every dinar is receipted the moment it moves, and lands in a drawer that has to reconcile at close.",
      },
      checkIn: {
        label: "Check-in",
        detail:
          "One scan at the door returns a verdict — valid, expiring, frozen or blocked — with the next action already attached to it.",
      },
      renewal: {
        label: "Renewal",
        detail:
          "Expiring members enter the renewal queue before they lapse, and the loop hands the sale straight back to plate one.",
      },
    },
  },

  ops: {
    eyebrow: "RIVET for gyms",
    title: "Depth where gyms lose money.",
    description:
      "Not a wall of dashboards — a working surface for selling, collecting, checking in, reconciling and supervising.",
    member360: {
      label: "Member 360",
      title: "The whole story",
      copy: "Calls, trials, plans, payments, freezes, visits and renewals in one chronological record.",
    },
    reception: {
      label: "Reception",
      title: "A verdict, not a guess",
      copy: "Valid, expiring, frozen, depleted or blocked — with the next action already attached.",
    },
    drawer: {
      label: "Shift & drawer",
      title: "Close in ninety seconds",
      copy: "Expected against counted cash, with every variance named, explained and routed for approval.",
    },
    accountability: {
      label: "Accountability",
      title: "Every override has a name",
      copy: "Discounts, refunds, freezes and voids are reasoned, tiered and written to an append-only log.",
    },
  },

  member: {
    eyebrow: "RIVET for members",
    title: "Their side of the counter.",
    description:
      "One account finds new gyms, books a free trial, and holds every active membership — no app store, no plastic card, no screenshots of old receipts.",
    benefits: {
      status: "Membership status, expiry, visits and balance at a glance",
      qr: "A dedicated QR identity for fast entry at the desk",
      receipts: "Receipts and payment history that survive a lost phone",
      language: "Arabic or English, per member",
    },
    card: {
      badge: "RIVET MEMBER",
      live: "LIVE WORKSPACE",
      eyebrow: "Your gym membership",
      title: "One verified member record",
      meta: "PLAN · BRANCH · MEMBER NUMBER",
      membershipLabel: "Membership",
      membershipValue: "Live gym status",
      visitsLabel: "Visits",
      visitsValue: "Recorded check-ins",
      qrTitle: "Entry QR after activation",
      qrNote: "Issued only from an active persisted membership.",
      footer: "Check-in identity · authorized by the gym",
    },
  },

  network: {
    eyebrow: "The RIVET network",
    title: "Find the gym. Book before you visit.",
    description:
      "Only gyms actually operating on RIVET appear in discovery, so a trial request lands on a real follow-up queue instead of an inbox.",
    emptyTitle: "No RIVET gyms are live yet",
    emptyDescription: "The network directory is ready, but no gym has published a live listing yet.",
    ptCount: "{count} PT",
    fromPrice: "JD {price}+",
  },

  pricing: {
    eyebrow: "Pricing",
    title: "One branch or eight. Same system.",
    description:
      "Every plan includes the marketplace listing, the member app, staff permissions, audit history and the complete revenue loop. Change plans any time before the trial ends.",
    emptyTitle: "Pricing is being prepared",
    emptyDescription: "RIVET pricing is not available from the live catalog yet.",
    mostPopular: "Most popular",
    perMonth: "/ month",
    price: "JD {amount}",
    branches: plural({ one: "{count} branch", other: "{count} branches" }),
    staff: plural({ one: "Up to {formatted} staff account", other: "Up to {formatted} staff accounts" }),
    members: plural({ one: "Up to {formatted} member", other: "Up to {formatted} members" }),
    included: "Member app and marketplace included",
  },

  cta: {
    eyebrow: "First cohort onboarding in Amman",
    title: "See it on your own numbers.",
    body: "We configure a pilot around your own branches, members and operating rules so the team can validate the complete workflow on authoritative data.",
  },

  footer: {
    blurb:
      "The revenue and operations system for gyms — and the simplest way for members to find, join, and enter them.",
    madeIn: "صُنع في عمّان · Made in Amman",
    product: "Product",
    overview: "Overview",
    members: "Members",
    signIn: "Sign in",
    createMemberAccount: "Create a member account",
    myDashboard: "My dashboard",
    copyright: "© 2026 RIVET · Amman, Jordan",
    rivetForGyms: "RIVET for gyms",
    copyrightShort: "© 2026 RIVET · Amman",
  },

  memberShell: {
    member: "Member",
    navigation: "Member navigation",
    home: "Home",
    exploreGyms: "Explore gyms",
    explore: "Explore",
    account: "Account",
    accountMenu: "Open account menu",
    profile: "Profile",
    communicationSettings: "Communication settings",
    signingOut: "Signing you out",
    signingOutDetail: "Returning to secure sign in…",
    openingWorkspace: "Opening your workspace",
    openingWorkspaceDetail: "Taking you to the right RIVET area…",
  },
};
