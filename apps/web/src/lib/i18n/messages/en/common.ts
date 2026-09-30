import { plural } from "../../dictionary";

/**
 * Vocabulary shared across every surface: actions that appear on more than one
 * screen, the states a panel can be in, and generic labels. Area-specific copy
 * lives in that area's file. Wording follows docs/22_PLAIN_LANGUAGE_GUIDE.md.
 *
 * Deliberately not `as const`: the Arabic catalogue is typed against this
 * object, and literal types would demand identical English strings.
 */
export const common = {
  action: {
    save: "Save",
    saveChanges: "Save changes",
    cancel: "Cancel",
    close: "Close",
    confirm: "Confirm",
    continue: "Continue",
    back: "Back",
    next: "Next",
    done: "Done",
    edit: "Edit",
    delete: "Delete",
    remove: "Remove",
    add: "Add",
    create: "Create",
    search: "Search",
    filter: "Filter",
    clear: "Clear",
    clearFilters: "Clear filters",
    retry: "Try again",
    refresh: "Refresh",
    download: "Download",
    print: "Print",
    copy: "Copy",
    copied: "Copied",
    viewAll: "View all",
    viewDetails: "View details",
    signIn: "Sign in",
    signOut: "Sign out",
    send: "Send",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },

  state: {
    loading: "Loading…",
    saving: "Saving…",
    searching: "Searching…",
    empty: "Nothing here yet",
    error: "Something went wrong",
    noResults: "No results",
    required: "Required",
    optional: "Optional",
    notSet: "Not set",
  },

  /** Shared empty / error / forbidden / not-found panels. */
  states: {
    errorTitle: "Something went wrong",
    errorDescription: "Please try again. If this keeps happening, check your internet connection.",
    forbiddenTitle: "You don't have access",
    forbiddenDescription: "Your role cannot open this page. Ask the owner or a manager if you need it.",
    notFoundTitle: "Not found",
    notFoundDescription: "We could not find this. It may have been removed, or the link is wrong.",
    backToDashboard: "Back to dashboard",
  },

  pagination: {
    showing: "Showing {from} to {to} of {total}",
    page: "Page {page} of {total}",
    previous: "Previous page",
    next: "Next page",
  },

  a11y: {
    closeDialog: "Close dialog",
    loading: "Loading",
  },

  label: {
    name: "Name",
    fullName: "Full name",
    email: "Email",
    phone: "Phone",
    password: "Password",
    date: "Date",
    time: "Time",
    from: "From",
    to: "To",
    status: "Status",
    branch: "Branch",
    allBranches: "All branches",
    amount: "Amount",
    total: "Total",
    notes: "Notes",
    reason: "Reason",
    type: "Type",
    role: "Role",
    details: "Details",
    language: "Language",
  },

  time: {
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
    now: "just now",
    days: plural({ one: "{count} day", other: "{count} days" }),
    hours: plural({ one: "{count} hour", other: "{count} hours" }),
    minutes: plural({ one: "{count} minute", other: "{count} minutes" }),
  },

  count: {
    members: plural({ one: "{count} member", other: "{count} members" }),
    results: plural({ one: "{count} result", other: "{count} results" }),
  },

  language: {
    switchTo: "Switch to {language}",
    label: "Language",
    english: "English",
    arabic: "العربية",
  },

  brand: {
    name: "RIVET",
  },
};
