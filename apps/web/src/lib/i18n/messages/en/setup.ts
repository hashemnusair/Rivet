import { plural } from "../../dictionary";

export const setup = {
  stepDone: "Step marked as done.",
  memberSetup: "Finish setting up your member account",
  finishStarted: "Finish getting started",
  continueSetup: "Continue setup",
  hide: "Hide",
  progress: "Progress",
  startOver: "Start over",
  recommended: "Recommended",
  markDone: "Mark as done",
  remindersOn: "Reminders are on for this device.",
  remindersOff: "Reminders are off for that device.",
  installFailed: "Could not install RIVET. Use Add to Home Screen in your browser menu instead.",
  permissionNotGranted: "Reminders are still off. You can turn them on later in your browser settings.",
  pushFailed: "Reminders could not be turned on. Check your browser's notification settings and try again.",
  pushUnavailable: "Reminders are not available yet.",
  pushDenied: "Your browser blocks notifications from RIVET. Allow them in your browser settings to get reminders.",
  ownedDevicesOnly: "Only turn on reminders on your own devices.",
  installTitle: "Install and notifications",
  installDescription: "Add RIVET to your home screen to open it in one tap. You can turn reminders on or off for each device.",
  homeScreenApp: "Home-screen app",
  alreadyInstalled: "RIVET is installed on this device.",
  canInstall: "You can install RIVET on this device.",
  installHint: "Use Add to Home Screen in your browser menu.",
  installed: "Installed",
  install: "Install RIVET",
  enableDevice: "Turn on for this device",
  reminderDevices: "Devices with reminders",
  disable: "Turn off",
  noOfflineData: "The installed app does not keep your membership details, receipts or entry codes for offline use.",
  getGymReady: "Get your gym ready",
  learnRivet: "Learn how to use RIVET",
  ownerGuideDescription: "Finish the required steps first. Optional steps can wait. You can stop and come back any time.",
  staffGuideDescription: "What your role can do, how to find things, and how to handle money and access.",
  staffMember: "Staff member",
  access: "Your access",
  roleHint: "This is what your account can do. If your job changes, ask the owner or a manager to change your role.",
  openProfile: "Open my profile",
  loadingRole: "Loading what your role can do. Refresh the page if nothing appears.",
  navigation: "Finding your way",
  navigationTitle: "Use the menu to move around, and search when you know what you need",
  navigationDescription: "Use the menu to move between pages. To record work for a member, open their page. Their timeline keeps calls, visits, memberships, payments and staff actions together.",
  searchTitle: "Find a member, receipt, or page",
  checkBranch: "Check the branch first",
  checkBranchDescription: "Check the branch and filters before you save. If you change branch, make sure the member or payment belongs to that branch.",
  moneyAccess: "Money and access",
  reasonTitle: "Give a clear reason when you change money or access",
  reasonDescription: "Take extra care with discounts, refunds, cancelled payments and freezes. Also take care with membership date changes, letting someone in anyway, cash differences and access changes. Check the request first. Give a clear reason when asked. Never use another person's account.",
  changesAudited: "Each of these changes is saved with your name and your reason.",
  openAudit: "Open activity log",
  managerAudit: "Managers can check them in the activity log.",
  providerUnavailable: "Email provider delivery is not configured yet.",
  ownerSetup: "Finish setting up {gym}",
  yourGym: "your gym",
  stepsDone: "{done} of {total} steps done",
  percentReady: "{percent}% ready",
  requiredDone: "{done} of {total} required steps done. Optional steps can wait.",
  signedInRole: "You are signed in as {role}",
  deviceBrowser: "{platform} browser",
  device: "Device",
  offline: "You're offline",
  reconnect: "Reconnect to open RIVET",
  offlineDescription: "Your membership, payments and entry code need an internet connection. Your entry code does not work offline.",
  devicesOn: plural({"zero": "Reminders are on for {count} devices. You can turn them off at any time.", "one": "Reminders are on for {count} device. You can turn them off at any time.", "two": "Reminders are on for {count} devices. You can turn them off at any time.", "few": "Reminders are on for {count} devices. You can turn them off at any time.", "many": "Reminders are on for {count} devices. You can turn them off at any time.", "other": "Reminders are on for {count} devices. You can turn them off at any time."}),
  accessNeeded: "{task} needs the “{permission}” access. Ask the owner if you need it.",
  changeSettings: "Changing gym settings",
  changeStaff: "Changing staff and roles",
  changePublicPage: "Changing the public gym page",
  changeChecklists: "Changing daily checklists",
  rolesDescription: "What each role can do. The owner always has full access. Staff get changes the next time they sign in.",
  accessUpdated: "Access updated.",
  accessUpdateFailed: "Could not update access.",
  rolesTitle: "Roles & access",
  accessByRole: "Access by role",
  roleToEdit: "Role to edit",
  chooseRole: "Choose a role",
  eachRole: "What each role can do",
  accessHint: "Tick a box to give a role that access. Each change saves right away.",
  accessColumn: "Access",
  roleOwner: "Full access to every branch, setting and report.",
  roleManager: "Operational control: sales, finance, reconciliation, audit.",
  roleSalesperson: "Leads, pipeline, member sales and collections within limits.",
  roleReceptionist: "Front desk: lookup, check-in, collect, open/close own shift.",
  roleTrainer: "Read-only member directory for coaching context.",
  searchPress: "Press",
  searchMac: "on a Mac or",
  searchWindows: "on Windows. Then type a name, phone number, receipt number, page or action.",
  manifestName: "RIVET Member",
  manifestDescription: "Your RIVET memberships, entry passes, visits, and gym discovery.",
  myMemberships: "My memberships",
  memberships: "Memberships",
  entryQr: "Entry QR",
  paymentsReceipts: "Payments and receipts",
  payments: "Payments",
  personalTraining: "Personal training",
  ptShort: "PT",
  tasks: {
  "member_profile": {
    "title": "Complete your profile",
    "description": "Add your contact and emergency details so your gyms can support you."
  },
  "member_memberships": {
    "title": "Open My Gyms",
    "description": "Review your membership, balance, branch, and validity dates."
  },
  "member_entry": {
    "title": "Learn the entry QR",
    "description": "See how to create a short-lived front-desk entry pass."
  },
  "member_finance": {
    "title": "Find payments and receipts",
    "description": "Know where balances, refunds, and printable receipts live."
  },
  "member_install": {
    "title": "Install RIVET",
    "description": "Add the member app to your home screen for quicker access."
  },
  "owner_identity": {
    "title": "Confirm organization identity",
    "description": "Review the gym name, timezone, currency, and receipt identity."
  },
  "owner_branch": {
    "title": "Configure your first branch",
    "description": "Set the branch address and operating hours used by reception."
  },
  "owner_payments": {
    "title": "Configure payments and receipts",
    "description": "Enable accepted methods and review receipt numbering."
  },
  "owner_plan": {
    "title": "Create a membership plan",
    "description": "Publish at least one plan the sales team can sell."
  },
  "owner_staff": {
    "title": "Invite your team",
    "description": "Add managers, sales, reception, or trainers with the right scope."
  },
  "owner_members": {
    "title": "Add or import members",
    "description": "Start with CSV import or create the first live member."
  },
  "owner_reception": {
    "title": "Prepare reception",
    "description": "Open a first shift and verify the front-desk workflow."
  },
  "owner_public_profile": {
    "title": "Publish the gym profile",
    "description": "Review what prospective members see in discovery."
  },
  "owner_provider": {
    "title": "Review provider readiness",
    "description": "Understand which email and messaging features remain unavailable before activation."
  },
  "staff_navigation": {
    "title": "Learn navigation and search",
    "description": "Use the sidebar and ⌘K search to move without losing your place."
  },
  "staff_member": {
    "title": "Open a member record",
    "description": "Find the timeline, membership, payment, and follow-up actions."
  },
  "staff_tasks": {
    "title": "Find your follow-up queue",
    "description": "Review overdue and upcoming work assigned to you."
  },
  "staff_reception": {
    "title": "Practice the front desk",
    "description": "Learn check-in and cash-shift rules for your branch."
  },
  "staff_training": {
    "title": "Learn your PT workspace",
    "description": "Review your schedule, member bookings, and package credits."
  },
  "staff_audit": {
    "title": "Review accountability tools",
    "description": "Find approvals and immutable records for sensitive actions."
  },
  "staff_security": {
    "title": "Review safe handling",
    "description": "Know why sensitive changes require reasons and leave audit events."
  },
  "staff_role": {
    "title": "Understand your role",
    "description": "Review what the {role} role can see and change."
  }
},
};
