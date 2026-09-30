/**
 * The workspace's own navigation, shared by the desktop sidebar, the mobile
 * drawer and the nav-config entries. `nav-config.ts` keeps the English label
 * (tests and the command palette read it) and points at these keys.
 */
export const nav = {
  section: {
    overview: "Overview",
    dailyWork: "Daily work",
    sales: "Sales",
    finance: "Finance",
    managementLedger: "Management ledger",
    admin: "Admin",
  },

  item: {
    dashboard: "Dashboard",
    reception: "Reception",
    checkout: "Checkout",
    checklists: "Daily checklist",
    members: "Members",
    classes: "Classes",
    personalTraining: "Personal training",
    operations: "Stock & purchasing",
    leads: "Leads",
    followUps: "Follow-ups",
    payments: "Payments",
    reports: "Reports",
    statements: "Statements",
    activityLog: "Activity log",
    downloads: "Downloads",
    support: "Support",
    settings: "Settings",
  },

  sidebar: {
    primary: "Primary navigation",
    home: "{name} home",
    operatedBy: "Operated by RIVET™",
    collapse: "Collapse",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
  },

  drawer: {
    menu: "Menu",
    closeMenu: "Close menu",
    activeBranch: "Active branch",
    branchUnavailable: "Branch unavailable",
  },
};
