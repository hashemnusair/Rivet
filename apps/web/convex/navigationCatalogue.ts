import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";

/**
 * The one catalogue of places a person can go in the gym workspace:
 * destinations, report views, form entry points and Settings sections. Every
 * entry has a stable id, an authored description, its route and the
 * permission and workspace-module requirements that already gate that route.
 *
 * The fast keyword search and Jev's intent suggestion both read this list.
 * Jev is only ever offered the entries the caller is permitted to open (the
 * server filters with the actor, the page filters again with the session),
 * plus prepared clarifications and "no match"; it can name nothing else.
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

export interface NavigationClarification {
  id: string;
  /** The question shown to the person. */
  question: string;
  /** When the model should pick this instead of one destination. */
  description: string;
  /** Catalogue ids the person chooses between. */
  options: string[];
  keywords: string[];
}

export const NAVIGATION_NO_MATCH = "no_match";
export const NAVIGATION_CATALOGUE_VERSION = 1;

const REPORTS = "reports.financial.read";

export const NAVIGATION_ENTRIES: readonly NavigationEntry[] = [
  // Destinations
  { id: "page.dashboard", kind: "destination", label: "Dashboard", description: "Today's queue, revenue, alerts and what needs attention across the gym.", href: "/dashboard", keywords: ["home", "today", "overview", "queue"] },
  { id: "page.reception", kind: "destination", label: "Reception", description: "Front desk: look members up, check them in, see who is in the gym and manage the cash shift.", href: "/reception", keywords: ["front desk", "check-in", "checkin", "entry", "scan", "shift"] },
  { id: "page.checkout", kind: "destination", label: "Checkout", description: "Sell retail products and services at the desk and record the sale against stock.", href: "/checkout", keywords: ["retail", "sale", "pos", "products", "shop"], anyPermission: ["payments.collect"], moduleKey: "operations" },
  { id: "page.checklists", kind: "destination", label: "Daily checklist", description: "Today's opening and closing walkthrough for the branch, with failures turned into maintenance tasks.", href: "/checklists", keywords: ["opening", "closing", "walkthrough", "tasks"], anyPermission: ["members.read"] },
  { id: "page.members", kind: "destination", label: "Members", description: "The member directory: search, filter, open a member's record with their timeline, membership, payments and follow-ups. Member-level actions such as freezing, extending, changing plan or transferring a member's home branch start from the member's record.", href: "/members", keywords: ["directory", "member", "people", "record", "timeline", "transfer", "freeze", "extend"], anyPermission: ["members.read"] },
  { id: "page.members.duplicates", kind: "destination", label: "Duplicate members", description: "Review possible duplicate member records and merge or ignore them.", href: "/members/duplicates", keywords: ["duplicates", "merge", "double"], anyPermission: ["members.write"] },
  { id: "page.memberships", kind: "destination", label: "Memberships", description: "Membership terms across the gym: what is active, expiring, frozen or scheduled, and renewals due.", href: "/memberships", keywords: ["terms", "renewals", "expiring", "frozen", "subscriptions"], anyPermission: ["members.read"], moduleKey: "revenue" },
  { id: "page.classes", kind: "destination", label: "Classes", description: "Group class timetable, bookings, waitlists and attendance.", href: "/classes", keywords: ["timetable", "schedule", "group", "booking", "waitlist"], anyPermission: ["members.read"] },
  { id: "page.pt", kind: "destination", label: "Personal training", description: "Trainer schedules, PT packages, session bookings and credits.", href: "/pt", keywords: ["trainer", "coach", "sessions", "packages", "credits"], anyPermission: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
  { id: "page.operations", kind: "destination", label: "Stock & purchasing", description: "Inventory balances, suppliers, purchase orders and stock movements.", href: "/operations", keywords: ["inventory", "stock", "suppliers", "purchase orders", "products"], anyPermission: ["members.read"], moduleKey: "operations" },
  { id: "page.operations.payables", kind: "destination", label: "Supplier payables", description: "What the gym owes suppliers, and the supplier payments already recorded.", href: "/operations/payables", keywords: ["payables", "suppliers", "bills", "owed"], anyPermission: ["operations.manage", "accounting.post", "reports.financial.read"], moduleKey: "operations" },
  { id: "page.maintenance", kind: "destination", label: "Maintenance", description: "Equipment issues, work orders and facility tasks.", href: "/maintenance", keywords: ["equipment", "repair", "work order", "broken", "facility"], anyPermission: ["members.read"], moduleKey: "operations" },
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
  { id: "page.audit", kind: "destination", label: "Audit log", description: "The immutable history of sensitive actions: refunds, overrides, discounts, permission changes, with who did what and why.", href: "/audit", keywords: ["history", "who did", "accountability", "log", "events"], anyPermission: ["audit.read"] },
  { id: "page.automations", kind: "destination", label: "Automations", description: "Automation rules, provider readiness and the execution history of reminders.", href: "/automations", keywords: ["reminders", "rules", "messages", "whatsapp", "email"], anyPermission: ["automations.manage"] },
  { id: "page.exports", kind: "destination", label: "Data exports", description: "Download portable CSV datasets of members, leads, transactions and more.", href: "/exports", keywords: ["csv", "download", "export", "excel"], anyPermission: ["members.read", "crm.read", REPORTS, "audit.read", "pt.reports.read", "operations.manage"] },
  { id: "page.support", kind: "destination", label: "Support", description: "Open or follow a support case with RIVET.", href: "/support", keywords: ["help", "case", "contact", "problem"] },
  { id: "page.getting_started", kind: "destination", label: "Getting started", description: "The setup checklist for the gym, or the workspace tour for staff.", href: "/getting-started", keywords: ["setup", "onboarding", "checklist", "tour", "start"] },
  { id: "page.plans", kind: "destination", label: "Membership plans", description: "Create and edit the plans the sales team can sell: duration, visits, price and branch availability.", href: "/plans", keywords: ["plans", "pricing", "packages", "tiers", "price"], anyPermission: ["settings.manage"] },
  // Forms and entry points (opening one never submits anything)
  { id: "form.member.new", kind: "form", label: "Create member", description: "Open the new member form to add one person to the directory.", href: "/members/new", keywords: ["add member", "new member", "register", "join"], anyPermission: ["members.write"], opensForm: true },
  { id: "form.members.import", kind: "form", label: "Import members", description: "Upload a CSV or Excel member list, map its columns and review before creating records.", href: "/members/import", keywords: ["import", "upload", "csv", "excel", "migrate", "spreadsheet"], anyPermission: ["members.write"], opensForm: true },
  { id: "form.lead.new", kind: "form", label: "Create lead", description: "Open the new lead form to add a prospect to the pipeline.", href: "/crm/pipeline?new=1", keywords: ["new lead", "prospect", "enquiry", "walk-in"], anyPermission: ["crm.write"], moduleKey: "revenue", opensForm: true },
  { id: "form.payment.collect", kind: "form", label: "Collect a member payment", description: "Find a member and record a payment against their outstanding balance or a new membership.", href: "/payments?collect=1", keywords: ["collect", "member payment", "receipt", "pay", "balance"], anyPermission: ["payments.collect"], opensForm: true },
  { id: "form.checkin.start", kind: "form", label: "Start a check-in", description: "Open the reception lookup to check a member in.", href: "/reception", keywords: ["check in", "checkin", "scan", "entry"], anyPermission: ["members.read"], opensForm: true },
  { id: "form.supplier.payment", kind: "form", label: "Record a supplier payment", description: "Record money paid to a supplier against open payables.", href: "/operations/payables", keywords: ["supplier", "vendor", "bill", "payable", "pay supplier"], anyPermission: ["operations.manage", "accounting.post"], moduleKey: "operations", opensForm: true },
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
  { id: "settings.assist", kind: "settings", label: "Settings: Jev assistance", description: "Whether Jev suggestions are on for this gym, their status and a synthetic check.", href: "/settings?section=assist", keywords: ["jev", "ai", "suggestions", "assist"], anyPermission: ["settings.manage"] },
];

/**
 * Prepared clarifications. The model may pick one when a request fits more
 * than one existing workflow; the person then chooses between real
 * destinations. Nothing here describes behaviour RIVET does not have.
 */
export const NAVIGATION_CLARIFICATIONS: readonly NavigationClarification[] = [
  { id: "clarify.payment", question: "Which payment do you mean?", description: "The request is about recording a payment but does not say whether it is a member paying the gym or the gym paying a supplier.", options: ["form.payment.collect", "form.supplier.payment"], keywords: ["payment", "pay", "record a payment", "paid"] },
  { id: "clarify.member_change", question: "What should change for the member?", description: "The request is about changing something on a member's membership or record (for example moving them, pausing, extending or switching plan); each is an existing action started from the member's record.", options: ["page.members", "page.memberships", "settings.branches"], keywords: ["move", "transfer", "another branch", "switch branch", "freeze", "pause", "change plan", "extend"] },
  { id: "clarify.report_or_ledger", question: "Do you want the report or the ledger?", description: "The request is about money figures and could mean the transaction ledger, the finance overview report or the management statements.", options: ["page.payments", "report.overview", "page.finance"], keywords: ["revenue", "income", "money", "sales figures", "how much"] },
  { id: "clarify.staff_or_roles", question: "People or permissions?", description: "The request is about staff and could mean managing accounts (invite, deactivate) or what a role may do.", options: ["settings.users", "settings.roles"], keywords: ["staff", "team", "employee", "permission", "access"] },
  { id: "clarify.check_in", question: "Check someone in, or review check-ins?", description: "The request is about entry and could mean checking a member in now or looking at attendance and peak hours.", options: ["form.checkin.start", "report.peak_hours"], keywords: ["check in", "entry", "attendance", "came in"] },
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

/** A clarification is offered only when the person could open at least two of its options. */
export function permittedClarifications(entries: readonly NavigationEntry[]): NavigationClarification[] {
  const ids = new Set(entries.map((entry) => entry.id));
  return NAVIGATION_CLARIFICATIONS.map((clarification) => ({ ...clarification, options: clarification.options.filter((option) => ids.has(option)) })).filter((clarification) => clarification.options.length >= 2);
}

export function normalizeNavigationQuery(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}\s&]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalizeNavigationQuery(value).split(" ").filter((token) => token.length >= 2);
}

/**
 * The fast path: exact label, then keyword and word overlap. Deterministic
 * and cheap enough to run on every keystroke; Jev is never involved here.
 */
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

export interface NavigationIntentBuild {
  state: JevState;
  candidates: JevCandidate[];
  scopeKey: string;
  sourceVersion: string;
}

export const NAVIGATION_QUERY_MAX_LENGTH = 200;

/**
 * The state for one request: the person's words, where they are, and what
 * they may open. Candidates are the permitted entries, the clarifications
 * that still have two permitted options, and no-match.
 */
export function buildNavigationIntentState(input: { query: string; currentPath?: string; entries: readonly NavigationEntry[]; clarifications: readonly NavigationClarification[]; role?: string }): NavigationIntentBuild {
  const query = input.query.trim().slice(0, NAVIGATION_QUERY_MAX_LENGTH);
  const candidates: JevCandidate[] = [
    ...input.entries.map((entry) => ({ id: entry.id, description: `${entry.label} (${entry.kind}${entry.opensForm ? ", opens a form" : ""}): ${entry.description}` })),
    ...input.clarifications.map((clarification) => ({ id: clarification.id, description: `Ask "${clarification.question}" between ${clarification.options.map((option) => BY_ID.get(option)?.label ?? option).join(" / ")}. ${clarification.description}` })),
    { id: NAVIGATION_NO_MATCH, description: "No page, report, form or setting in RIVET fits this request, or the request is not about going somewhere in RIVET." },
  ];
  const state: JevState = {
    task: "A member of gym staff typed a request into RIVET's workspace search. Pick the one place in RIVET they most plausibly want to open, a prepared clarification when the request fits more than one place, or no_match.",
    request: query,
    currentPage: input.currentPath ?? null,
    role: input.role ?? null,
    permittedPlaces: input.entries.length,
  };
  return { state, candidates, scopeKey: "navigation:intent", sourceVersion: `navigation:${NAVIGATION_CATALOGUE_VERSION}` };
}

export type NavigationIntentOutcome =
  | { kind: "destination"; entry: NavigationEntry; probability: number }
  | { kind: "clarify"; clarification: NavigationClarification; options: NavigationEntry[]; probability: number }
  | { kind: "no_match"; probability: number };

/**
 * A judgment becomes an outcome only through the permitted lists supplied by
 * the caller: an id that is not in them is a no-match, whatever it was.
 */
export function resolveNavigationIntent(judgment: JevJudgment, entries: readonly NavigationEntry[], clarifications: readonly NavigationClarification[]): NavigationIntentOutcome {
  if (judgment.kind !== "choice") return { kind: "no_match", probability: 0 };
  const probability = judgment.probabilities[judgment.choice] ?? 0;
  const entry = entries.find((candidate) => candidate.id === judgment.choice);
  if (entry) return { kind: "destination", entry, probability };
  const clarification = clarifications.find((candidate) => candidate.id === judgment.choice);
  if (clarification) {
    const options = clarification.options.map((id) => entries.find((candidate) => candidate.id === id)).filter((candidate): candidate is NavigationEntry => Boolean(candidate));
    if (options.length >= 2) return { kind: "clarify", clarification, options, probability };
  }
  return { kind: "no_match", probability };
}

function distribution(candidates: readonly JevCandidate[] | undefined, choice: string, confidence: number): JevJudgment {
  const ids = (candidates ?? []).map((candidate) => candidate.id);
  const others = ids.filter((id) => id !== choice);
  const rest = others.length ? (1 - confidence) / others.length : 0;
  return { kind: "choice", choice, probabilities: Object.fromEntries(ids.map((id) => [id, id === choice ? (others.length ? confidence : 1) : rest])), confidence };
}

/**
 * The preview's stand-in for the model: keyword overlap against the offered
 * candidates' descriptions, a clarification when the request matches one and
 * no single entry clearly wins, no-match otherwise. Deterministic.
 */
/** Function words carry no intent; the preview resolver ignores them on both sides. */
const STOPWORDS = new Set(["what", "when", "where", "which", "who", "whom", "whose", "why", "how", "does", "do", "did", "have", "has", "had", "still", "this", "that", "these", "those", "with", "from", "into", "your", "their", "there", "about", "more", "some", "want", "need", "open", "show", "find", "please", "next", "month", "week", "today", "tonight", "can", "the", "and", "for", "you", "our", "they", "them", "will", "should", "could", "would", "also", "just", "like", "much", "many", "very"]);

const ACTION_VERBS = ["record", "create", "add", "new", "collect", "start", "book", "sell", "import", "invite", "register", "upload", "log"];

/** Whole-word or stem overlap: "collect" matches "collections" and "collected", "life" matches nothing. */
function tokenMatches(left: string, right: string): boolean {
  return left === right || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

function requestMentions(requestTokens: ReadonlySet<string>, token: string): boolean {
  if (STOPWORDS.has(token)) return false;
  for (const candidate of requestTokens) if (!STOPWORDS.has(candidate) && tokenMatches(candidate, token)) return true;
  return false;
}

export function resolveNavigationIntentFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  if (typeof input.state !== "object" || input.state === null || Array.isArray(input.state)) return undefined;
  const request = typeof input.state.request === "string" ? normalizeNavigationQuery(input.state.request) : "";
  const requestTokens = new Set(tokens(request));
  const offered = new Map((input.candidates ?? []).map((candidate) => [candidate.id, candidate] as const));
  if (!request || !offered.size) return distribution(input.candidates, NAVIGATION_NO_MATCH, 0.7);
  const scoreEntry = (entry: NavigationEntry): number => {
    let score = 0;
    const label = normalizeNavigationQuery(entry.label);
    if (request.includes(label)) score += 6;
    for (const keyword of entry.keywords.map(normalizeNavigationQuery)) if (request.includes(keyword)) score += 4;
    for (const token of new Set(tokens(`${entry.label} ${entry.keywords.join(" ")} ${entry.description}`))) if (token.length >= 4 && requestMentions(requestTokens, token)) score += 1;
    // "Record …", "Create …": a request that starts with an action verb leans towards an entry point over a page.
    if (entry.opensForm && ACTION_VERBS.some((verb) => request === verb || request.startsWith(`${verb} `))) score += 1;
    return score;
  };
  const entries = NAVIGATION_ENTRIES.filter((entry) => offered.has(entry.id)).map((entry) => ({ id: entry.id, entry, score: scoreEntry(entry) })).sort((left, right) => right.score - left.score);
  const clarifications = NAVIGATION_CLARIFICATIONS.filter((clarification) => offered.has(clarification.id)).map((clarification) => ({ clarification, score: clarification.keywords.map(normalizeNavigationQuery).filter((keyword) => request.includes(keyword)).length })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  const clarification = clarifications[0]?.clarification;
  if (clarification) {
    // A clarification's trigger words are shared by all its options; only a
    // word that belongs to exactly one option (its label or keywords, not the
    // shared triggers) settles the request without asking.
    const shared = new Set(clarification.keywords.flatMap(tokens));
    const optionWords = clarification.options.map((id) => {
      const entry = BY_ID.get(id);
      return { id, words: new Set(entry ? tokens(`${entry.label} ${entry.keywords.join(" ")}`).filter((word) => word.length >= 4 && ![...shared].some((trigger) => tokenMatches(trigger, word))) : []) };
    });
    const distinguishing = optionWords.map(({ id, words }) => ({ id, words: [...words].filter((word) => optionWords.every((other) => other.id === id || !other.words.has(word))) }));
    const mentioned = distinguishing.filter(({ words }) => words.some((word) => requestMentions(requestTokens, word))).map(({ id }) => id);
    if (mentioned.length === 1 && offered.has(mentioned[0]!)) return distribution(input.candidates, mentioned[0]!, 0.86);
    return distribution(input.candidates, clarification.id, 0.74);
  }
  const best = entries[0];
  const second = entries[1];
  if (!best || best.score === 0) return distribution(input.candidates, NAVIGATION_NO_MATCH, 0.72);
  if (second && second.score === best.score) return distribution(input.candidates, best.id, 0.55);
  return distribution(input.candidates, best.id, best.score >= 6 ? 0.9 : 0.7);
}

// --- Onboarding next step -------------------------------------------------------

export interface OnboardingStepCandidate {
  key: string;
  title: string;
  description: string;
  category: "required" | "recommended" | "optional";
  href: string;
  complete: boolean;
  unavailableReason?: string;
}

export const ONBOARDING_NO_STEP = "no_step";

/** Which incomplete setup step to take next; every step stays listed on the page regardless. */
export function buildOnboardingNextStepState(input: { audience: string; organizationName?: string; tasks: readonly OnboardingStepCandidate[]; facts: Record<string, number | boolean> }): NavigationIntentBuild {
  const open = input.tasks.filter((task) => !task.complete && !task.unavailableReason);
  const candidates: JevCandidate[] = [
    ...open.map((task) => ({ id: task.key, description: `${task.title} (${task.category}): ${task.description}` })),
    { id: ONBOARDING_NO_STEP, description: "Nothing stands out: the remaining steps are equally reasonable, or none is left." },
  ];
  const state: JevState = {
    task: "A gym is setting up RIVET. Given what is already in place and the steps still open, pick the single step that unblocks the most day-to-day operation next. Required steps come before recommended and optional ones unless a recommended step is a prerequisite for daily work.",
    audience: input.audience,
    completedSteps: input.tasks.filter((task) => task.complete).map((task) => task.title),
    openSteps: open.map((task) => ({ title: task.title, category: task.category })),
    facts: input.facts,
  };
  return { state, candidates, scopeKey: `onboarding:${input.audience}`, sourceVersion: "onboarding:1" };
}

export function resolveOnboardingNextStepFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const offered = (input.candidates ?? []).map((candidate) => candidate.id).filter((id) => id !== ONBOARDING_NO_STEP);
  if (!offered.length) return distribution(input.candidates, ONBOARDING_NO_STEP, 0.8);
  // Required first, in the checklist's own order.
  const required = (input.candidates ?? []).find((candidate) => candidate.id !== ONBOARDING_NO_STEP && candidate.description.includes("(required)"));
  return distribution(input.candidates, required?.id ?? offered[0]!, required ? 0.86 : 0.7);
}

// --- Report finder ------------------------------------------------------------

export function reportEntries(entries: readonly NavigationEntry[]): NavigationEntry[] {
  return entries.filter((entry) => entry.id.startsWith("report."));
}

export function buildReportFinderState(input: { question: string; entries: readonly NavigationEntry[] }): NavigationIntentBuild {
  const question = input.question.trim().slice(0, NAVIGATION_QUERY_MAX_LENGTH);
  const reports = reportEntries(input.entries);
  const candidates: JevCandidate[] = [
    ...reports.map((entry) => ({ id: entry.id, description: `${entry.label}: ${entry.description}` })),
    { id: NAVIGATION_NO_MATCH, description: "No report view answers this question." },
  ];
  const state: JevState = {
    task: "A gym owner or manager asked a question about their gym. Pick the report view that answers it, or no_match if none does. The report's dates and branch filter are chosen on the page, never here.",
    question,
    permittedReports: reports.length,
  };
  return { state, candidates, scopeKey: "navigation:report", sourceVersion: `navigation:${NAVIGATION_CATALOGUE_VERSION}` };
}

export function resolveReportFinderFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  if (typeof input.state !== "object" || input.state === null || Array.isArray(input.state)) return undefined;
  const question = typeof input.state.question === "string" ? input.state.question : "";
  return resolveNavigationIntentFixture({ state: { request: question }, candidates: input.candidates });
}
