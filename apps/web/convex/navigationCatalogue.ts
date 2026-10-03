import { searchKey } from "../src/lib/utils/text";

/**
 * The one catalogue of places a person can go in the gym workspace:
 * destinations, report views, form entry points and Settings sections. Every
 * entry has a stable id, an authored description, its route and the
 * permission and workspace-module requirements that already gate that route.
 *
 * The fast keyword search reads this list. The server filters with the actor,
 * and the page filters again with the current session before showing entries.
 * Pure: no Convex or SDK imports.
 */
export type NavigationEntryKind = "destination" | "report" | "form" | "settings";
export type NavigationModuleKey = "revenue" | "operations" | "finance" | "reporting";

export interface NavigationEntry {
  /** Stable id, referenced by pins, tests and judgments. */
  id: string;
  kind: NavigationEntryKind;
  label: string;
  /** What a person can do there, in the words the model and the palette both see. */
  description: string;
  href: string;
  keywords: string[];
  /** Any-of permissions; absent means every gym staff account. */
  anyPermission?: string[];
  /** Server-owned workspace module the route needs. */
  moduleKey?: NavigationModuleKey;
  /** Roles that may open it, when a route is narrower than its permissions. */
  roles?: string[];
  /** Opening it presents a form or dialog; nothing is submitted by navigating. */
  opensForm?: boolean;
}

const REPORTS = "reports.financial.read";

export const NAVIGATION_ENTRIES: readonly NavigationEntry[] = [
  // Destinations
  { id: "page.dashboard", kind: "destination", label: "Dashboard", description: "Today's queue, revenue, alerts and what needs attention across the gym.", href: "/dashboard", keywords: ["home", "today", "overview", "queue"] },
  { id: "page.reception", kind: "destination", label: "Reception", description: "Front desk: look members up, check them in, see who is in the gym and manage the cash shift.", href: "/reception", keywords: ["front desk", "check-in", "checkin", "entry", "scan", "shift"] },
  { id: "page.checkout", kind: "destination", label: "Checkout", description: "Sell retail products and services at the desk and record the sale against stock.", href: "/checkout", keywords: ["retail", "sale", "pos", "products", "shop"], anyPermission: ["payments.collect"], moduleKey: "operations" },
  { id: "page.checklists", kind: "destination", label: "Daily checklist", description: "Today's opening and closing walkthrough for the branch, with failures turned into maintenance tasks.", href: "/checklists", keywords: ["opening", "closing", "walkthrough", "tasks"], anyPermission: ["members.read"] },
  { id: "page.members", kind: "destination", label: "Members", description: "The member directory: search, filter, open a member's record with their timeline, membership, payments and follow-ups. Member-level actions such as freezing, extending, changing plan or transferring a member's home branch start from the member's record.", href: "/members", keywords: ["directory", "member", "people", "record", "timeline", "transfer", "freeze", "extend"], anyPermission: ["members.read"] },
  { id: "page.members.duplicates", kind: "destination", label: "Duplicate members", description: "Review possible duplicate member records and merge or ignore them.", href: "/members/duplicates", keywords: ["duplicates", "merge", "double"], anyPermission: ["members.write"] },
  { id: "page.memberships", kind: "destination", label: "Memberships", description: "Membership terms across the gym: what is active, ending, frozen or scheduled, and renewals due.", href: "/memberships", keywords: ["terms", "renewals", "expiring", "frozen", "subscriptions"], anyPermission: ["members.read"], moduleKey: "revenue" },
  { id: "page.classes", kind: "destination", label: "Classes", description: "Group class timetable, bookings, waitlists and attendance.", href: "/classes", keywords: ["timetable", "schedule", "group", "booking", "waitlist"], anyPermission: ["members.read"] },
  { id: "page.pt", kind: "destination", label: "Personal training", description: "Trainer schedules, PT packages, session bookings and credits.", href: "/pt", keywords: ["trainer", "coach", "sessions", "packages", "credits"], anyPermission: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
  { id: "page.operations", kind: "destination", label: "Stock & purchasing", description: "Stock balances, suppliers, purchase orders and stock movements.", href: "/operations", keywords: ["inventory", "stock", "suppliers", "purchase orders", "products"], anyPermission: ["members.read"], moduleKey: "operations" },
  { id: "page.operations.payables", kind: "destination", label: "Supplier bills", description: "What the gym owes suppliers, and the supplier payments already recorded.", href: "/operations/payables", keywords: ["payables", "suppliers", "bills", "owed"], anyPermission: ["operations.manage", "accounting.post", "reports.financial.read"], moduleKey: "operations" },
  { id: "page.maintenance", kind: "destination", label: "Maintenance", description: "Machine problems, repair jobs and maintenance jobs.", href: "/maintenance", keywords: ["equipment", "repair", "repair job", "broken", "facility"], anyPermission: ["members.read"], moduleKey: "operations" },
  { id: "page.crm.pipeline", kind: "destination", label: "Leads", description: "The sales pipeline: every lead by stage, trials, offers and conversions.", href: "/crm/pipeline", keywords: ["pipeline", "prospects", "sales", "trials", "offers"], anyPermission: ["crm.read"], moduleKey: "revenue" },
  { id: "page.crm.queues", kind: "destination", label: "Follow-ups", description: "Due and overdue follow-up work: calls, renewals and tasks assigned to you or your team.", href: "/crm/queues", keywords: ["follow up", "calls", "due", "overdue", "tasks", "queue"], anyPermission: ["crm.read"], moduleKey: "revenue" },
  { id: "page.payments", kind: "destination", label: "Payments", description: "The branch transaction ledger: payments, refunds, voids and receipts.", href: "/payments", keywords: ["transactions", "ledger", "receipts", "refunds", "voids"], anyPermission: [REPORTS] },
  { id: "page.payments.shifts", kind: "destination", label: "Cash shifts", description: "Open and closed cash shifts, drawer counts, variances and their approvals.", href: "/payments/shifts", keywords: ["shift", "drawer", "cash", "variance", "reconcile", "close"], anyPermission: [REPORTS, "reconciliation.open_shift", "reconciliation.close_shift", "reconciliation.approve_variance"] },
  { id: "page.reports", kind: "destination", label: "Reports", description: "Finance overview and the operational report views.", href: "/reports", keywords: ["analytics", "statistics", "numbers", "overview"], anyPermission: [REPORTS] },
  { id: "page.finance", kind: "destination", label: "Management ledger", description: "Financial statements home: income statement, balance sheet and cash flow.", href: "/finance", keywords: ["statements", "accounting", "ledger", "profit", "loss"], anyPermission: [REPORTS], moduleKey: "reporting" },
  { id: "page.finance.income", kind: "report", label: "Income statement", description: "Revenue and expenses for a period, as a management statement.", href: "/finance/income-statement", keywords: ["profit", "loss", "p&l", "revenue", "expenses"], anyPermission: [REPORTS], moduleKey: "reporting" },
  { id: "page.finance.balance", kind: "report", label: "Balance sheet", description: "Assets, liabilities and equity at a date.", href: "/finance/balance-sheet", keywords: ["assets", "liabilities", "equity"], anyPermission: [REPORTS], moduleKey: "reporting" },
  { id: "page.finance.cashflow", kind: "report", label: "Cash flow statement", description: "Cash in and out for a period.", href: "/finance/cash-flow", keywords: ["cash", "flow", "liquidity"], anyPermission: [REPORTS], moduleKey: "reporting" },
  { id: "page.finance.controls", kind: "destination", label: "Financial controls", description: "Accounting periods, posting policies, journal entries and source postings.", href: "/finance/controls", keywords: ["journal", "posting", "periods", "accounting"], anyPermission: ["accounting.post", REPORTS], moduleKey: "finance" },
  { id: "page.audit", kind: "destination", label: "Activity log", description: "The immutable history of sensitive actions: refunds, overrides, discounts, permission changes, with who did what and why.", href: "/audit", keywords: ["history", "who did", "accountability", "log", "events"], anyPermission: ["audit.read"] },
  { id: "page.automations", kind: "destination", label: "Automations", description: "Automation rules, provider readiness and the execution history of reminders.", href: "/automations", keywords: ["reminders", "rules", "messages", "whatsapp", "email"], anyPermission: ["automations.manage"] },
  { id: "page.exports", kind: "destination", label: "Downloads", description: "Download portable CSV datasets of members, leads, transactions and more.", href: "/exports", keywords: ["csv", "download", "export", "excel"], anyPermission: ["members.read", "crm.read", REPORTS, "audit.read", "pt.reports.read", "operations.manage"] },
  { id: "page.support", kind: "destination", label: "Support", description: "Open or follow a support case with RIVET.", href: "/support", keywords: ["help", "case", "contact", "problem"] },
  { id: "page.getting_started", kind: "destination", label: "Getting started", description: "The setup checklist for the gym, or the workspace tour for staff.", href: "/getting-started", keywords: ["setup", "onboarding", "checklist", "tour", "start"] },
  { id: "page.plans", kind: "destination", label: "Membership plans", description: "Create and edit the plans the sales team can sell: duration, visits, price and branch availability.", href: "/plans", keywords: ["plans", "pricing", "packages", "tiers", "price"], anyPermission: ["settings.manage"] },
  // Forms and entry points (opening one never submits anything)
  { id: "form.member.new", kind: "form", label: "Create member", description: "Open the new member form to add one person to the directory.", href: "/members/new", keywords: ["add member", "new member", "register", "join"], anyPermission: ["members.write"], opensForm: true },
  { id: "form.members.import", kind: "form", label: "Import members", description: "Upload a CSV or Excel member list, map its columns and review before creating records.", href: "/members/import", keywords: ["import", "upload", "csv", "excel", "migrate", "spreadsheet"], anyPermission: ["members.write"], opensForm: true },
  { id: "form.lead.new", kind: "form", label: "Create lead", description: "Open the new lead form to add a prospect to the pipeline.", href: "/crm/pipeline?new=1", keywords: ["new lead", "prospect", "enquiry", "walk-in"], anyPermission: ["crm.write"], moduleKey: "revenue", opensForm: true },
  { id: "form.payment.collect", kind: "form", label: "Collect a member payment", description: "Find a member and record a payment against their unpaid amount or a new membership.", href: "/payments?collect=1", keywords: ["collect", "member payment", "receipt", "pay", "balance"], anyPermission: ["payments.collect"], opensForm: true },
  { id: "form.checkin.start", kind: "form", label: "Start a check-in", description: "Open the reception lookup to check a member in.", href: "/reception", keywords: ["check in", "checkin", "scan", "entry"], anyPermission: ["members.read"], opensForm: true },
  { id: "form.supplier.payment", kind: "form", label: "Record a supplier payment", description: "Record money paid to a supplier against open supplier bills.", href: "/operations/payables", keywords: ["supplier", "vendor", "bill", "payable", "pay supplier"], anyPermission: ["operations.manage", "accounting.post"], moduleKey: "operations", opensForm: true },
  // Report views (calculations, dates and branch filters are chosen on the page, never by a suggestion)
  { id: "report.overview", kind: "report", label: "Finance overview", description: "What came in, by which method and branch, and what is still unresolved.", href: "/reports", keywords: ["income", "collections", "methods", "cash", "card"], anyPermission: [REPORTS] },
  { id: "report.peak_hours", kind: "report", label: "Peak hours", description: "When the floor is busiest and when it is empty, by hour and weekday.", href: "/reports?view=peak-hours", keywords: ["busy", "busiest", "quiet", "hours", "attendance", "traffic"], anyPermission: [REPORTS] },
  { id: "report.classes", kind: "report", label: "Classes report", description: "Which classes fill and where seats and members go to waste.", href: "/reports?view=classes", keywords: ["class", "utilization", "capacity", "waitlist", "attendance"], anyPermission: [REPORTS] },
  { id: "report.retention", kind: "report", label: "Retention", description: "Whether the members who join actually stay: retention and churn.", href: "/reports?view=retention", keywords: ["churn", "stay", "leave", "cancel", "retention", "at risk"], anyPermission: [REPORTS] },
  { id: "report.renewals", kind: "report", label: "Renewals forecast", description: "What expires in the next thirty days and what it is worth.", href: "/reports?view=renewals", keywords: ["expiring", "renewal", "forecast", "upcoming", "expire"], anyPermission: [REPORTS] },
  { id: "report.collections", kind: "report", label: "Collections", description: "Whether the gym collected what it charged, and what is still owed.", href: "/reports?view=collections", keywords: ["owed", "outstanding", "collected", "debt", "unpaid"], anyPermission: [REPORTS] },
  { id: "report.crm", kind: "report", label: "CRM funnel", description: "How fast new leads are answered and whether they buy.", href: "/reports?view=crm", keywords: ["funnel", "conversion", "leads", "response time", "sales"], anyPermission: [REPORTS] },
  { id: "report.controls", kind: "report", label: "Controls", description: "Who is refunding, voiding, discounting and overriding, and why.", href: "/reports?view=controls", keywords: ["refunds", "voids", "discounts", "overrides", "controls"], anyPermission: [REPORTS] },
  // Settings sections (ids mirror the Settings rail)
  { id: "settings.organization", kind: "settings", label: "Settings: Organization", description: "Gym name, timezone, locale, language, phone country and tax.", href: "/settings?section=organization", keywords: ["gym name", "timezone", "locale", "language", "identity"], anyPermission: ["settings.manage"] },
  { id: "settings.my-profile", kind: "settings", label: "Settings: My profile", description: "Change your display name and phone number without changing anyone else's access.", href: "/settings?section=my-profile", keywords: ["profile", "account", "display name", "name", "phone", "personal"] },
  { id: "settings.brand", kind: "settings", label: "Settings: Brand kit", description: "Logo, palette and the colours the workspace and documents use.", href: "/settings?section=brand", keywords: ["logo", "colour", "color", "brand", "theme"], anyPermission: ["settings.manage"] },
  { id: "settings.profile", kind: "settings", label: "Settings: Public profile", description: "The gym's public page in member discovery: photos, amenities, publishing.", href: "/settings?section=profile", keywords: ["public page", "website", "directory", "publish", "photos"], anyPermission: ["profiles.manage"] },
  { id: "settings.branches", kind: "settings", label: "Settings: Branches", description: "The gym's locations, their codes, addresses and status.", href: "/settings?section=branches", keywords: ["branch", "location", "address", "site"], anyPermission: ["settings.manage"] },
  { id: "settings.spaces", kind: "settings", label: "Settings: Gym spaces", description: "The rooms and zones inside a branch used for maintenance and equipment.", href: "/settings?section=spaces", keywords: ["zones", "rooms", "studio", "floor"], anyPermission: ["settings.manage"] },
  { id: "settings.agreement", kind: "settings", label: "Settings: Agreement", description: "The signed subscription agreement between the gym and RIVET.", href: "/settings?section=agreement", keywords: ["contract", "signature", "legal", "terms"], anyPermission: ["settings.manage"] },
  { id: "settings.subscription", kind: "settings", label: "Settings: Subscription & invoices", description: "What the gym pays RIVET, its plan, invoices and payment status.", href: "/settings?section=subscription", keywords: ["rivet invoice", "rivet plan", "billing", "fees"], anyPermission: ["settings.manage"] },
  { id: "settings.users", kind: "settings", label: "Settings: Users", description: "Who can sign in, their role and branches; invite, change access or deactivate staff.", href: "/settings?section=users", keywords: ["staff", "team", "invite", "accounts", "deactivate", "employees"], anyPermission: ["users.manage"] },
  { id: "settings.roles", kind: "settings", label: "Settings: Roles & permissions", description: "What each role may do: who can refund, discount, void, freeze, override check-ins, manage settings, and the discount limits per role.", href: "/settings?section=roles", keywords: ["permissions", "roles", "who can", "refund", "discount", "override", "authority", "access"], anyPermission: ["users.manage"] },
  { id: "settings.payments", kind: "settings", label: "Settings: Payments", description: "Accepted payment methods and the discount each role may give without approval.", href: "/settings?section=payments", keywords: ["payment methods", "cash", "card", "cliq", "discount limit"], anyPermission: ["settings.manage"] },
  { id: "settings.receipts", kind: "settings", label: "Settings: Receipts & tax", description: "Receipt numbering, prefix, footer and tax rate.", href: "/settings?section=receipts", keywords: ["receipt", "tax", "vat", "numbering", "invoice"], anyPermission: ["settings.manage"] },
  { id: "settings.notifications", kind: "settings", label: "Settings: Notifications", description: "Manager alerts, renewal reminders, external delivery and quiet hours.", href: "/settings?section=notifications", keywords: ["alerts", "reminders", "whatsapp", "quiet hours", "delivery"], anyPermission: ["settings.manage"] },
  { id: "settings.email", kind: "settings", label: "Settings: Operational email", description: "Which member service emails the gym sends.", href: "/settings?section=email", keywords: ["email", "sender", "service email"], anyPermission: ["settings.manage"] },
  { id: "settings.operations", kind: "settings", label: "Settings: Operational rules", description: "Entry rules, freezes, referrals, renewals, class booking and retention policies.", href: "/settings?section=operations", keywords: ["policies", "freeze rules", "entry rules", "referral", "booking rules"], anyPermission: ["settings.manage"] },
  { id: "settings.hours", kind: "settings", label: "Settings: Hours & trials", description: "Opening hours per branch and the windows for free trials.", href: "/settings?section=hours", keywords: ["opening hours", "trial", "schedule", "closing"], anyPermission: ["settings.manage"] },
  { id: "settings.checklists", kind: "settings", label: "Settings: Daily checklists", description: "The opening and closing checklist templates per branch.", href: "/settings?section=checklists", keywords: ["checklist template", "opening", "closing"], anyPermission: ["operations.manage"] },
];

export interface NavigationAccess {
  permissions: readonly string[];
  role?: string;
  /** Workspace module status from the session or the server; absent means no module gating is known. */
  modules?: ReadonlyArray<{ key: string; entitled: boolean; enabled: boolean }>;
}

const BY_ID = new Map(NAVIGATION_ENTRIES.map((entry) => [entry.id, entry] as const));

export function navigationEntry(id: string): NavigationEntry | undefined {
  return BY_ID.get(id);
}

/** The same rule the sidebar applies: permission first, then the server-owned module boundary. */
export function navigationEntryVisible(entry: NavigationEntry, access: NavigationAccess): boolean {
  if (entry.anyPermission && !entry.anyPermission.some((permission) => access.permissions.includes(permission))) return false;
  if (entry.roles && (!access.role || !entry.roles.includes(access.role))) return false;
  if (!entry.moduleKey || !access.modules) return true;
  const status = access.modules.find((candidate) => candidate.key === entry.moduleKey);
  return Boolean(status?.entitled && status.enabled);
}

export function permittedNavigationEntries(access: NavigationAccess): NavigationEntry[] {
  return NAVIGATION_ENTRIES.filter((entry) => navigationEntryVisible(entry, access));
}

export function normalizeNavigationQuery(value: string): string {
  return searchKey(value).replace(/[^\p{L}\p{N}\s&]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalizeNavigationQuery(value).split(" ").filter((token) => token.length >= 2);
}

/** The fast path: exact label, then keyword and word overlap. */
export function keywordSearchNavigation(entries: readonly NavigationEntry[], query: string, limit = 8): NavigationEntry[] {
  const normalized = normalizeNavigationQuery(query);
  if (normalized.length < 2) return [];
  const queryTokens = tokens(normalized);
  const scored = entries.map((entry) => {
    const label = normalizeNavigationQuery(entry.label);
    const keywords = entry.keywords.map(normalizeNavigationQuery);
    let score = 0;
    if (label === normalized) score += 100;
    else if (label.startsWith(normalized)) score += 60;
    else if (label.includes(normalized)) score += 40;
    if (keywords.some((keyword) => keyword === normalized)) score += 50;
    else if (keywords.some((keyword) => keyword.startsWith(normalized) || normalized.includes(keyword))) score += 25;
    const words = new Set([...tokens(label), ...keywords.flatMap(tokens)]);
    for (const token of queryTokens) if (words.has(token)) score += 8;
    return { entry, score };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));
  return scored.slice(0, limit).map((item) => item.entry);
}

export const NAVIGATION_QUERY_MAX_LENGTH = 200;

export function reportEntries(entries: readonly NavigationEntry[]): NavigationEntry[] {
  return entries.filter((entry) => entry.id.startsWith("report."));
}
