import { plural } from "../../dictionary";

/**
 * The global search dialog, the notification bell, the keyboard shortcuts
 * dialog, the module lock panel and the workspace loading label. Page titles
 * that already exist in the navigation reuse `nav.item.*`.
 *
 * Search results, navigation catalogue entries and notification text are
 * generated on the server and are not in this file.
 */
export const palette = {
  search: {
    dialogLabel: "Global search",
    closeLabel: "Close search",
    inputLabel: "Search RIVET",
    placeholder: "Name, phone, receipt number, page or action…",
    searching: "Searching…",
    errorMessage: "Search is not working right now.",
    errorRetry: "Search again",
    noMatches: "Nothing matches “{query}”.",
  },

  groups: {
    members: "Members",
    leads: "Leads",
    receipts: "Receipts",
    pages: "Pages",
    actions: "Actions",
    places: "Places",
    pinned: "Pinned",
    quickActions: "Quick actions",
    recent: "Recent",
    goTo: "Go to",
    clearRecent: "Clear",
  },

  kind: {
    member: "Member",
    lead: "Lead",
    receipt: "Receipt",
    page: "Page",
    action: "Action",
    report: "Report",
    form: "Form",
    setting: "Setting",
  },

  pinned: {
    loadError: "Your pinned and recent items could not load.",
    subtitle: "Pinned action",
    pin: "Pin {name}",
    unpin: "Unpin {name}",
  },

  pages: {
    dashboardSubtitle: "Today’s work",
    leadsSubtitle: "People who may join",
    followUpsSubtitle: "Calls and messages due",
    membersSubtitle: "All members",
    receptionSubtitle: "Check-ins",
    personalTrainingSubtitle: "Schedule and packages",
    paymentsSubtitle: "Payments and receipts",
    managementLedgerSubtitle: "Statements",
    supportSubtitle: "Help from RIVET",
    settingsSubtitle: "Your profile, gym and staff",
    supplierBills: "Supplier bills",
    maintenance: "Maintenance",
    automations: "Automations",
  },

  actions: {
    newMember: { title: "Add member", subtitle: "Add a new member" },
    newLead: { title: "Add lead", subtitle: "Add someone who may join" },
    collectPayment: { title: "Collect payment", subtitle: "Take a payment from a member" },
    startCheckin: { title: "Check in a member", subtitle: "Open Reception" },
  },

  hints: {
    opensForm: "opens a form. Nothing is saved yet",
    move: "move",
    open: "open",
    close: "close",
  },

  shortcuts: {
    button: "Keyboard shortcuts",
    title: "Keyboard shortcuts",
    description: "Work faster without the mouse.",
    openSearch: "Open search",
    moveThroughResults: "Move through search results",
    openResult: "Open selected result",
    closeWindow: "Close the open window",
    showShortcuts: "Show this list of shortcuts",
    otherSystems: "On Windows and Linux, press {ctrl} instead of {cmd}.",
  },

  notifications: {
    title: "Notifications",
    unreadLabel: plural({ one: "{count} unread notifications", other: "{count} unread notifications" }),
    unreadSummary: plural({ one: "{count} unread", other: "{count} unread" }),
    upToDate: "You are up to date",
    viewList: "List",
    viewGrouped: "Grouped",
    markAllRead: "Mark all as read",
    savedOffline: "Showing saved notifications. Trying to reconnect…",
    retry: "Retry",
    loading: "Loading notifications…",
    loadFailedTitle: "Notifications could not load",
    loadFailedBody: "Your work is safe. Check your internet connection and try again.",
    emptyTitle: "No notifications yet",
    emptyBody: "Updates for you will appear here.",
    markAllFailed: "Could not mark notifications as read.",
    changeFailed: "Could not change this notification.",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    markReadFor: "Mark {title} as read",
    markUnreadFor: "Mark {title} as unread",
    timeUnknown: "Time not known",
    justNow: "Just now",
    minutesAgo: plural({ one: "{count} min ago", other: "{count} min ago" }),
    hoursAgo: plural({ one: "{count} hour ago", other: "{count} hours ago" }),
    daysAgo: plural({ one: "{count} day ago", other: "{count} days ago" }),
  },

  notificationGroups: {
    important: "Important",
    updates: plural({ one: "{count} updates", other: "{count} updates" }),
    unread: plural({ one: "{count} unread", other: "{count} unread" }),
    family: {
      pt: "Personal training",
      support: "Support",
      members: "Member follow-up",
      billing: "RIVET billing",
      operations: "Operations",
    },
    entity: {
      member: "Member: {name}",
      lead: "Lead: {name}",
      booking: "PT booking: {name}",
      supportCase: "Support case {id}",
      invoice: "Invoice {id}",
      maintenanceTask: "Maintenance task",
    },
  },

  moduleBoundary: {
    notIncludedTitle: "{name} is not included in your plan",
    notIncludedBody: "Your gym’s plan does not include this feature. To add it, ask RIVET on the Support page.",
    turnedOffTitle: "{name} is turned off",
    turnedOffBody: "This feature is turned off for your gym. Ask RIVET on the Support page if you need it.",
    name: {
      foundation: "Foundation",
      revenue: "Revenue",
      operations: "Operations",
      finance: "Finance",
      reporting: "Reporting",
    },
    label: {
      foundation: "Gym foundation",
      revenue: "Revenue protection",
      operations: "Daily operations",
      finance: "Financial operating system",
      reporting: "Management reporting",
    },
  },

  layout: {
    loadingGym: "Loading your gym",
  },
};
