import { plural } from "../../dictionary";

/**
 * The owner dashboard, the Needs attention panel and the Today list.
 *
 * The `needsAttention.line.*` and `today.item.*` groups rebuild, on the client,
 * sentences the server also sends as English text. They use the same wording as
 * the server so English output is unchanged; any server text the client cannot
 * rebuild is shown as the server wrote it.
 */
export const dashboard = {
  greeting: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    withName: "{greeting}, {name}",
  },

  scope: {
    selectedNamed: "Showing {branch} only.",
    selectedUnnamed: "Showing selected branch only.",
    loading: "Loading your branches.",
    single: "Showing {branch}.",
    consolidated: "All {count} branches together.",
  },

  owner: {
    keyNumbers: "Key numbers",
    collectedToday: "Collected today",
    collectedThisMonth: "Collected this month",
    monthUp: "Up {percent} on last month",
    monthDown: "Down {percent} on last month",
    unpaid: "Unpaid",
    owedByMembers: "owed by members",
    newMembers: "New members",
    joinedThisMonth: "joined this month",
    endingThisWeek: "Ending this week",
    memberships: "memberships",
    checkInsToday: "Check-ins today",
    openLeads: plural({ one: "{count} open leads", other: "{count} open leads" }),
    collectedByBranch: "Collected by branch, last 30 days",
    salesTeam: "Sales team this month",
    leads: "Leads",
    salesperson: "Salesperson",
    collected: "Collected",
    renewals: "Renewals",
    followUpsDone: "Follow-ups done",
    lateFollowUps: "Late follow-ups",
    recentActivity: "Recent activity",
  },

  chart: {
    collectedLast30: "Collected in the last 30 days",
    averagePrefix: "avg",
    averageSuffix: "/ day",
    refunded: "{amount} refunded",
    activeMembers: plural({ one: "{count} active members", other: "{count} active members" }),
    checkInsToday: plural({ one: "{count} check-ins today", other: "{count} check-ins today" }),
    funnelNote: "Percentages are stage-to-stage of the current pipeline snapshot.",
  },

  needsAttention: {
    title: "Needs attention",
    updated: "Updated {time}.",
    checking: "Checking your gym…",
    stale: "Could not update. These numbers are from {time}.",
    error: "This could not be loaded.",
    clear: "All clear. Nothing needs attention right now.",
    urgent: "Urgent",
    missing: "Could not load {list}. Press Refresh to try again.",
    truncated: "Very long lists stop at 2,000 items, so some numbers may be higher.",
    listSeparator: ", ",

    /** Names of the sources the server could not read. */
    source: {
      queue: "today's work",
      expired: "ended memberships",
      equipment: "machine reports",
      stock: "stock levels",
      support: "RIVET support requests",
    },

    /** One sentence per kind of work. Keys are the server's line keys in camelCase. */
    line: {
      machinesDoNotUse: plural({ one: '{count} machine is marked "do not use"', other: '{count} machines are marked "do not use"' }),
      cashDifferences: plural({ one: "{count} cash difference to check", other: "{count} cash differences to check" }),
      entryRefused: plural({ one: "{count} member was refused entry today", other: "{count} members were refused entry today" }),
      checklistsFailed: plural({ one: "{count} daily checklist has failed items", other: "{count} daily checklists have failed items" }),
      supportUrgent: plural({ one: "{count} urgent request with RIVET support", other: "{count} urgent requests with RIVET support" }),
      approvals: plural({ one: "{count} request is waiting for your approval", other: "{count} requests are waiting for your approval" }),
      unpaid: plural({ one: "{count} member owes money", other: "{count} members owe money" }),
      renewalsEnding: plural({ one: "{count} membership ends in the next 7 days", other: "{count} memberships end in the next 7 days" }),
      renewalsEnded: plural({
        one: "{count} membership ended in the last 30 days and was not renewed",
        other: "{count} memberships ended in the last 30 days and were not renewed",
      }),
      followupsLate: plural({ one: "{count} follow-up is late", other: "{count} follow-ups are late" }),
      followupsLateAndToday: plural({ one: ", and {count} more is due today", other: ", and {count} more are due today" }),
      followupsToday: plural({ one: "{count} follow-up is due today", other: "{count} follow-ups are due today" }),
      atRisk: plural({ one: "{count} member may not come back", other: "{count} members may not come back" }),
      machinesOpen: plural({ one: "{count} machine problem is not fixed yet", other: "{count} machine problems are not fixed yet" }),
      maintenance: plural({ one: "{count} maintenance job is open", other: "{count} maintenance jobs are open" }),
      checklistsDue: plural({ one: "{count} daily checklist is not finished", other: "{count} daily checklists are not finished" }),
      stock: plural({ one: "{count} product is running low", other: "{count} products are running low" }),
      supportOpen: plural({ one: "{count} open request with RIVET support", other: "{count} open requests with RIVET support" }),
    },
  },

  today: {
    title: "Today",
    intro: "Start at the top. The most important work comes first.",
    urgent: plural({ one: "{count} urgent", other: "{count} urgent" }),
    itemsLeft: "items left",
    loadingAria: "Loading today's work",
    emptyTitle: "Nothing to do right now",
    emptyDescription: "New work shows up here by itself.",
    listAria: "Today's work, most important first",
    doFirst: "Do this first",
    showMore: plural({ one: "Show {count} more", other: "Show {count} more" }),
    showLess: "Show less",
    showingTop: "Showing the top {shown} of {total}",
    showingMostImportant: plural({ one: "Showing the {count} most important items.", other: "Showing the {count} most important items." }),
    completeAria: "Complete {title}",
    actionAria: "{action}: {title}",
    doneToast: "Done.",

    kind: {
      follow_up: "Follow-up",
      at_risk: "At risk",
      renewal: "Renewal",
      outstanding_balance: "Unpaid",
      access_denial: "Entry refused",
      approval: "Approval",
      cash_variance: "Cash difference",
      facility_task: "Maintenance",
      branch_checklist: "Checklist",
      equipment_issue: "Machine",
      low_stock: "Stock",
      support_case: "RIVET support",
    },

    /** The server's button words. Anything not listed here is shown as the server wrote it. */
    action: {
      done: "Done",
      open: "Open",
      logContact: "Log contact",
      renew: "Renew",
      collect: "Collect",
      review: "Review",
      followUp: "Follow up",
      openCase: "Open case",
    },

    /** Titles and details the server builds from a known pattern around a name. */
    item: {
      collectFrom: "Collect from {name}",
      renew: "Renew {name}",
      winBack: "Win back {name}",
      contact: "Contact {name}",
      refusedEntry: "{name} was refused entry",
      followUpLead: "Follow up — {name}",
      cashDifferenceAt: "Check the cash difference at {branch}",
      cashDifferenceAtBranch: "Check the cash difference at the branch",
      checklistDue: "Due: {name}",
      checklistLate: "Late: {name}",
      checklistFailed: plural({ one: "Fix {count} failed {name} item", other: "Fix {count} failed {name} items" }),
      reorder: "Reorder {name}",
      owesMoney: "Owes money",
      leadNotContacted: "Lead · not contacted yet",
      planEndsToday: "{plan} · ends today",
      planDaysLeft: plural({ one: "{plan} · {count} day left", other: "{plan} · {count} days left" }),
      planEndedToday: "{plan} · ended today, not renewed",
      planEndedDaysAgo: plural({ one: "{plan} · ended {count} day ago, not renewed", other: "{plan} · ended {count} days ago, not renewed" }),
      stockAvailable: "{available} available · reorder at {reorderAt}",
    },

    dialog: {
      title: "What happened?",
      description: "{title}. Say how it went. This finishes the follow-up or moves it to a new date.",
      saveAndFinish: "Save and finish",
      doneNothingToRecord: "Done, nothing to record",
    },
  },
};
