import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";
import type { FollowUpRelatedTask } from "./followupAssist";

/**
 * Member resolution workspace: the pure logic shared by the server query,
 * the preview adapter and the member page.
 *
 * A staff member types what they are helping the member with. Jev may pick
 * one approved panel (or a prepared clarification, or no match), one plan
 * attribute to emphasise, one class the member may actually join, or one
 * trainer with recorded availability. Everything that decides what is true
 * or allowed is computed here from records that already exist: which
 * payment belongs to which service, what is still owed (never netted across
 * services), whether a class is joinable (membership, plan, audience,
 * capacity, waitlist, schedule), whether a trainer has an open slot, what a
 * trainer's profile records (a missing language stays "not recorded"), and
 * what every plan's terms are. Nothing here writes, books or collects.
 *
 * No Convex or path-alias imports: the browser preview adapter shares it.
 */
type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’'`]/g, "").replace(/[^\p{L}\p{N}\s-]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(/[\s-]+/).filter((token) => token.length >= 2))];
}

function stemMatch(left: string, right: string): boolean {
  return left === right || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word or stem matches only: "late" never matches inside "pilates". Arabic keywords match as substrings so prefixes such as بال and وال still count. */
function mentions(goal: string, keyword: string): boolean {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return false;
  if (!/[a-z]/.test(normalizedKeyword)) return goal.includes(normalizedKeyword);
  if (new RegExp(`(^|\\s)${escapeRegExp(normalizedKeyword)}(\\s|$)`).test(goal)) return true;
  const goalTokens = tokens(goal);
  return tokens(normalizedKeyword).every((token) => goalTokens.some((candidate) => stemMatch(candidate, token)));
}

type ChoiceJudgment = Extract<JevJudgment, { kind: "choice" }>;

function spread(ids: readonly string[], choice: string, weight: number): ChoiceJudgment {
  const others = ids.filter((id) => id !== choice);
  const rest = others.length ? (1 - weight) / others.length : 0;
  const probabilities: Record<string, number> = {};
  for (const id of ids) probabilities[id] = id === choice ? (others.length ? weight : 1) : rest;
  return { kind: "choice", choice, probabilities, confidence: Math.min(0.96, weight + 0.04) };
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / DAY_MS);
}

export function resolutionDaysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function resolutionAddDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** "Sun 27 Sep · 07:00" in the gym's timezone; falls back to UTC for an invalid zone. */
export function describeInstant(iso: string, timezone: string, withTime = true): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", weekday: "short", day: "numeric", month: "short" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    const day = `${part("weekday")} ${part("day")} ${part("month")}`;
    if (!withTime) return day;
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    return `${day} · ${time}`;
  } catch {
    return iso.slice(0, 16).replace("T", " · ");
  }
}

export function formatResolutionMoney(amountMinor: number, currency: string): string {
  const exponent = currency === "JOD" || currency === "KWD" || currency === "BHD" ? 3 : 2;
  return `${(amountMinor / 10 ** exponent).toFixed(exponent)} ${currency}`;
}

// ---------------------------------------------------------------------------
// Panels, clarifications and access
// ---------------------------------------------------------------------------

export type ResolutionPanelId = "panel.training_payment" | "panel.balance" | "panel.membership_terms" | "panel.plan_compare" | "panel.classes" | "panel.trainers" | "panel.open_work";

export interface ResolutionPanel {
  id: ResolutionPanelId;
  label: string;
  description: string;
  /** Any one of these permissions opens the panel; the server decides. */
  anyPermission: readonly string[];
  keywords: readonly string[];
}

export const RESOLUTION_PANELS: readonly ResolutionPanel[] = [
  { id: "panel.training_payment", label: "Training payment", description: "The member says they already paid for personal training: the PT package orders, the payments recorded against them and the membership charges still open, with dates and service types, never netted against each other.", anyPermission: ["members.read"], keywords: ["paid for training", "paid for pt", "personal training", "pt package", "pt sessions", "training package", "sessions paid", "trainer package", "دفعت للتدريب", "تدريب شخصي", "باقة تدريب", "باقة"] },
  { id: "panel.balance", label: "Balance and payments", description: "What the member owes and what was collected: open charges by service, payments, refunds and receipts.", anyPermission: ["members.read"], keywords: ["balance", "owe", "owes", "outstanding", "receipt", "refund", "invoice", "double charged", "charged twice", "overpaid", "رصيد", "إيصال", "استرجاع", "مديون"] },
  { id: "panel.membership_terms", label: "Membership terms", description: "The current term: plan, dates, freeze allowance used and remaining, visits, payment status, and the existing actions (renew, freeze, extend, transfer, change plan).", anyPermission: ["members.read"], keywords: ["freeze", "pause", "unfreeze", "extend", "expire", "expiring", "renew", "renewal", "transfer", "term", "end date", "start date", "visits left", "تجميد", "تمديد", "تجديد", "نقل", "انتهاء"] },
  { id: "panel.plan_compare", label: "Compare plans", description: "The gym's active plans side by side with the member's current plan: branch access, freezing, included training, visits, duration and price.", anyPermission: ["members.read"], keywords: ["plan", "plans", "upgrade", "downgrade", "switch", "compare", "cheaper", "both branches", "all branches", "unlimited", "annual", "yearly", "خطة", "خطط", "ترقية", "أرخص"] },
  { id: "panel.classes", label: "Classes", description: "Upcoming group classes the member can actually join, with eligibility, audience, capacity and schedule enforced.", anyPermission: ["members.read"], keywords: ["class", "classes", "yoga", "hiit", "boxing", "pilates", "group", "timetable", "spin", "zumba", "حصة", "حصص", "كلاس", "يوغا"] },
  { id: "panel.trainers", label: "Trainers", description: "Personal trainers with recorded profiles and open availability, and the member's PT credit balance.", anyPermission: ["members.read"], keywords: ["trainer", "trainers", "coach", "personal trainer", "female trainer", "male trainer", "arabic speaking", "english speaking", "one to one", "مدرب", "مدربة", "كوتش"] },
  { id: "panel.open_work", label: "Open work", description: "Open tasks about the member, their follow-on links and the recent task events, so nothing unresolved is repeated or lost.", anyPermission: ["crm.read"], keywords: ["task", "tasks", "follow up", "follow-up", "callback", "promised", "who is handling", "open work", "pending", "مهمة", "مهام", "متابعة"] },
];

export interface ResolutionClarification {
  id: string;
  question: string;
  options: readonly ResolutionPanelId[];
  keywords: readonly string[];
}

export const RESOLUTION_CLARIFICATIONS: readonly ResolutionClarification[] = [
  { id: "clarify.payment", question: "Which money question is this about?", options: ["panel.training_payment", "panel.balance"], keywords: ["paid", "payment", "pay", "charge", "money", "دفع", "دفعة"] },
  { id: "clarify.session", question: "A group class, or a personal trainer?", options: ["panel.classes", "panel.trainers"], keywords: ["session", "sessions", "workout", "training", "book", "جلسة", "تمرين"] },
  { id: "clarify.plan", question: "Change the plan, or adjust the current term?", options: ["panel.plan_compare", "panel.membership_terms"], keywords: ["membership", "subscription", "change", "اشتراك", "عضوية"] },
];

export const RESOLUTION_NO_MATCH = "no_match";
export const RESOLUTION_GOAL_MAX_LENGTH = 300;

const PANEL_BY_ID = new Map(RESOLUTION_PANELS.map((panel) => [panel.id, panel] as const));

export function resolutionPanel(id: string): ResolutionPanel | undefined {
  return PANEL_BY_ID.get(id as ResolutionPanelId);
}

export function isResolutionPanelId(value: unknown): value is ResolutionPanelId {
  return typeof value === "string" && PANEL_BY_ID.has(value as ResolutionPanelId);
}

/** The panels this actor may open; hiding a panel elsewhere is not authorization, this is what the server decides. */
export function permittedResolutionPanels(permissions: readonly string[]): ResolutionPanel[] {
  return RESOLUTION_PANELS.filter((panel) => panel.anyPermission.some((permission) => permissions.includes(permission)));
}

export function permittedResolutionClarifications(panels: readonly ResolutionPanel[]): ResolutionClarification[] {
  const ids = new Set(panels.map((panel) => panel.id));
  return RESOLUTION_CLARIFICATIONS.filter((clarification) => clarification.options.every((option) => ids.has(option)));
}

// ---------------------------------------------------------------------------
// The deterministic context the panels and the questions read
// ---------------------------------------------------------------------------

export type ResolutionService = "membership" | "personal_training" | "retail" | "other";

export interface ResolutionMoney {
  amount: number;
  currency: string;
}

export interface ResolutionCharge {
  id: string;
  description: string;
  service: ResolutionService;
  membershipId?: string;
  ptOrderId?: string;
  total: ResolutionMoney;
  paidAmount: ResolutionMoney;
  outstandingAmount: ResolutionMoney;
  status: string;
  issueDate?: string;
  dueDate?: string;
  collectible: boolean;
  createdAt: string;
}

export interface ResolutionPayment {
  id: string;
  type: string;
  amount: ResolutionMoney;
  method: string;
  status: string;
  receiptId: string;
  receiptNumber: string;
  occurredAt: string;
  chargeId?: string;
  /** What the charge the payment settled was for; never inferred from the amount. */
  service: ResolutionService;
  chargeDescription?: string;
  collectedByName: string;
  originalPaymentId?: string;
}

export interface ResolutionPtOrder {
  id: string;
  packageName: string;
  sessionCount: number;
  totalPrice: ResolutionMoney;
  status: string;
  chargeId: string;
  paidAt?: string;
  createdAt: string;
  entitlementId?: string;
}

export interface ResolutionEvidence {
  /** The timeline event id: link target on the member's timeline. */
  id: string;
  type: string;
  title: string;
  body?: string;
  occurredAt: string;
  actorName?: string;
  receiptId?: string;
  chargeId?: string;
  orderId?: string;
  membershipId?: string;
}

export interface ResolutionMembership {
  id: string;
  planId: string;
  planName: string;
  kind: string;
  startDate: string;
  endDate: string;
  status: string;
  daysUntilExpiry: number;
  freezeAllowanceDays: number;
  frozenDaysUsed: number;
  activeFreeze?: { startDate: string; endDate: string; status: string };
  totalVisits?: number;
  remainingVisits?: number;
  salePrice: ResolutionMoney;
  outstanding: ResolutionMoney;
  paymentStatus: string;
  includedPtSessions: number;
  branchAccess: "all" | "selected";
  previousMembershipId?: string;
}

export interface ResolutionPlan {
  id: string;
  name: string;
  code: string;
  kind: string;
  durationDays?: number;
  visitAllowance?: number;
  visitValidityDays?: number;
  price: ResolutionMoney;
  branchAccess: "all" | "selected";
  branchIds: string[];
  branchNames: string[];
  freezeAllowanceDays: number;
  includedPtSessions: number;
  status: string;
}

export interface ResolutionClassOption {
  id: string;
  name: string;
  date: string;
  startsAt: string;
  endsAt: string;
  branchId: string;
  branchName: string;
  coachName?: string;
  audience: string;
  capacity: number;
  spotsRemaining: number;
  waitlistCount: number;
  status: string;
  /** Whether staff may add the member now (a full class with waitlist room counts, as a waitlist place). */
  eligible: boolean;
  wouldWaitlist: boolean;
  blockReason?: string;
  alreadyBooked: boolean;
}

export interface ResolutionTrainerOption {
  id: string;
  displayName: string;
  specialties: string[];
  /** Recorded on the profile only; an empty list means "not recorded", never a guess. */
  languages: string[];
  branchIds: string[];
  branchNames: string[];
  published: boolean;
  /** First open 60-minute slot at the member's home branch within the window, if any. */
  nextSlotAt?: string;
  openSlots: number;
  slotsCheckedUntil: string;
}

export interface ResolutionFacts {
  outstandingMinor: number;
  openCharges: number;
  ptOrdersPending: number;
  ptOrdersPaid: number;
  ptCreditsAvailable: number;
  ptCreditsReserved: number;
  membershipStatus?: string;
  daysUntilExpiry?: number;
  openTasks: number;
  joinableClasses: number;
  bookableTrainers: number;
  activePlans: number;
}

export interface MemberResolutionContext {
  memberId: string;
  memberName: string;
  gender?: "male" | "female";
  preferredLanguage: "en" | "ar";
  homeBranchId: string;
  homeBranchName: string;
  currency: string;
  timezone: string;
  generatedAt: string;
  /** Server-decided; the page shows only what is listed here. */
  panels: ResolutionPanelId[];
  access: { payments: boolean; tasks: boolean; roster: boolean; sell: boolean; collect: boolean };
  facts: ResolutionFacts;
  membership?: ResolutionMembership;
  charges: ResolutionCharge[];
  payments: ResolutionPayment[];
  ptOrders: ResolutionPtOrder[];
  pt: { available: number; reserved: number; upcomingBookings: Array<{ id: string; trainerName: string; startsAt: string; branchName: string; status: string }> };
  evidence: ResolutionEvidence[];
  tasks: FollowUpRelatedTask[];
  taskEvents: ResolutionEvidence[];
  plans: ResolutionPlan[];
  classes: { policyEnabled: boolean; horizonDays: number; options: ResolutionClassOption[] };
  trainers: { credits: number; options: ResolutionTrainerOption[] };
}

/** What a charge paid for, from its links, never from its amount. */
export function chargeService(charge: { membershipId?: string; description?: string }, ptOrderChargeIds: ReadonlySet<string>, chargeId: string): ResolutionService {
  if (ptOrderChargeIds.has(chargeId)) return "personal_training";
  if (charge.membershipId) return "membership";
  return "other";
}

export const SERVICE_LABELS: Record<ResolutionService, string> = { membership: "Membership", personal_training: "Personal training", retail: "Retail", other: "Other" };

/**
 * "I already paid for training": the PT payments and the membership charges
 * side by side. A payment settles only the charge it was recorded against;
 * an open membership charge stays open whatever was paid for training.
 */
export interface TrainingPaymentReading {
  ptPayments: ResolutionPayment[];
  ptOrders: ResolutionPtOrder[];
  openMembershipCharges: ResolutionCharge[];
  openPtCharges: ResolutionCharge[];
  paidMembershipCharges: ResolutionCharge[];
  /** Whether a PT payment exists while a membership charge is still open: the two must not be confused. */
  crossedServices: boolean;
}

export function readTrainingPayment(context: Pick<MemberResolutionContext, "payments" | "ptOrders" | "charges">): TrainingPaymentReading {
  const ptPayments = context.payments.filter((payment) => payment.service === "personal_training");
  const openMembershipCharges = context.charges.filter((charge) => charge.service === "membership" && charge.outstandingAmount.amount > 0);
  const openPtCharges = context.charges.filter((charge) => charge.service === "personal_training" && charge.outstandingAmount.amount > 0);
  const paidMembershipCharges = context.charges.filter((charge) => charge.service === "membership" && charge.outstandingAmount.amount <= 0);
  return { ptPayments, ptOrders: context.ptOrders, openMembershipCharges, openPtCharges, paidMembershipCharges, crossedServices: ptPayments.length > 0 && openMembershipCharges.length > 0 };
}

const EVIDENCE_TYPES = new Set(["payment_collected", "payment_refunded", "payment_voided", "membership_sold", "membership_renewed", "membership_plan_changed", "membership_frozen", "membership_unfrozen", "membership_extended", "membership_cancelled", "membership_transferred", "pt_package_requested", "pt_package_activated", "pt_package_cancelled", "pt_credit_granted", "pt_credit_refunded", "pt_booking_reserved", "class_booked", "class_waitlisted"]);
const TASK_EVENT_TYPES = new Set(["task_created", "task_completed"]);
export const RESOLUTION_EVIDENCE_LIMIT = 40;

/** Typed evidence read from the whole record, not the first page of the timeline. */
export function selectResolutionEvidence(events: readonly { id: string; type: string; title: string; body?: string; occurredAt: string; actorName?: string; meta?: Data }[]): { evidence: ResolutionEvidence[]; taskEvents: ResolutionEvidence[] } {
  const project = (event: (typeof events)[number]): ResolutionEvidence => {
    const meta = record(event.meta);
    return {
      id: event.id,
      type: event.type,
      title: event.title,
      body: event.body,
      occurredAt: event.occurredAt,
      actorName: event.actorName,
      receiptId: text(meta.receiptId) || undefined,
      chargeId: text(meta.chargeId) || undefined,
      orderId: text(meta.orderId) || undefined,
      membershipId: text(meta.membershipId) || undefined,
    };
  };
  const sorted = [...events].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return {
    evidence: sorted.filter((event) => EVIDENCE_TYPES.has(event.type)).slice(0, RESOLUTION_EVIDENCE_LIMIT).map(project),
    taskEvents: sorted.filter((event) => TASK_EVENT_TYPES.has(event.type)).slice(0, 10).map(project),
  };
}

// ---------------------------------------------------------------------------
// Class eligibility (staff view of the same rules the booking mutation applies)
// ---------------------------------------------------------------------------

export interface ClassBookingPolicyLike {
  enabled: boolean;
  eligibilityMode: string;
  eligiblePlanIds: readonly string[];
  maxActiveBookingsPerMember: number;
  waitlistEnabled: boolean;
  waitlistSize: number;
  bookingHorizonDays: number;
}

export interface ClassEligibilityInput {
  occurrence: { id: string; date: string; startsAt: string; endsAt: string; status: string; audience: string; capacity: number; bookedCount: number; waitlistCount: number; branchId: string };
  policy: ClassBookingPolicyLike;
  member: { id: string; gender?: string };
  membership?: { planId: string; startDate: string; endDate: string; cancelledAt?: string; activeFreeze?: { startDate?: string; endDate?: string; status?: string }; homeBranchId: string; remainingVisits?: number; totalVisits?: number };
  plan?: { branchAccess: string; branchIds: readonly string[] };
  activeBookings: number;
  alreadyBooked: boolean;
  now: number;
}

function membershipUsableOn(membership: NonNullable<ClassEligibilityInput["membership"]>, date: string): boolean {
  if (membership.cancelledAt) return false;
  if (membership.startDate > date || membership.endDate < date) return false;
  if (membership.totalVisits !== undefined && (membership.remainingVisits ?? 0) <= 0) return false;
  const freeze = membership.activeFreeze;
  if (freeze?.status === "active" && freeze.startDate && freeze.endDate && freeze.startDate <= date && freeze.endDate >= date) return false;
  return true;
}

/** Mirrors `createBooking` for a staff add: the reason names what the mutation would refuse. */
export function classEligibility(input: ClassEligibilityInput): { eligible: boolean; wouldWaitlist: boolean; reason?: string } {
  const { occurrence, policy } = input;
  const seated = occurrence.bookedCount;
  const full = seated >= occurrence.capacity;
  const waitlistFull = !policy.waitlistEnabled || occurrence.waitlistCount >= policy.waitlistSize;
  if (input.alreadyBooked) return { eligible: false, wouldWaitlist: false, reason: "Already booked or waitlisted." };
  if (!policy.enabled) return { eligible: false, wouldWaitlist: false, reason: "Class booking is paused for this gym." };
  if (occurrence.status === "cancelled") return { eligible: false, wouldWaitlist: false, reason: "This class was cancelled." };
  if (occurrence.status !== "scheduled" || Date.parse(occurrence.endsAt) <= input.now) return { eligible: false, wouldWaitlist: false, reason: "This class has ended." };
  if (Date.parse(occurrence.startsAt) <= input.now) return { eligible: false, wouldWaitlist: false, reason: "This class has started." };
  if (!input.membership) return { eligible: false, wouldWaitlist: false, reason: "No membership to book against." };
  if (!membershipUsableOn(input.membership, occurrence.date)) return { eligible: false, wouldWaitlist: false, reason: "The membership is not active on that date." };
  if (policy.eligibilityMode === "selected_plans" && !policy.eligiblePlanIds.includes(input.membership.planId)) return { eligible: false, wouldWaitlist: false, reason: "This membership plan does not include classes." };
  const planBranchOk = !input.plan || input.plan.branchAccess === "all" || input.plan.branchIds.includes(occurrence.branchId) || input.membership.homeBranchId === occurrence.branchId;
  if (!planBranchOk) return { eligible: false, wouldWaitlist: false, reason: "The plan does not cover this branch." };
  const audienceGender = occurrence.audience === "women" ? "female" : occurrence.audience === "men" ? "male" : undefined;
  if (audienceGender && input.member.gender !== audienceGender) return { eligible: false, wouldWaitlist: false, reason: input.member.gender ? `This class is for ${occurrence.audience}; a staff override needs a reason.` : `This class is for ${occurrence.audience} and the member's gender is not recorded.` };
  if (input.activeBookings >= policy.maxActiveBookingsPerMember) return { eligible: false, wouldWaitlist: false, reason: `Already at the limit of ${policy.maxActiveBookingsPerMember} active class bookings.` };
  if (full && waitlistFull) return { eligible: false, wouldWaitlist: false, reason: policy.waitlistEnabled ? "This class and its waitlist are full." : "This class is full." };
  return { eligible: true, wouldWaitlist: full };
}

// ---------------------------------------------------------------------------
// Plan comparison
// ---------------------------------------------------------------------------

export type PlanAttributeId = "attr.branch_access" | "attr.freeze" | "attr.included_pt" | "attr.visits" | "attr.duration" | "attr.price";
export const PLAN_PRIORITY_NONE = "none";

export interface PlanAttribute {
  id: PlanAttributeId;
  label: string;
  description: string;
  keywords: readonly string[];
}

export const PLAN_ATTRIBUTES: readonly PlanAttribute[] = [
  { id: "attr.branch_access", label: "Branch access", description: "Which branches the plan admits: every branch or selected ones.", keywords: ["branch", "branches", "both branches", "all branches", "every branch", "other branch", "location", "locations", "فرع", "فروع", "كل الفروع"] },
  { id: "attr.freeze", label: "Freezing", description: "How many freeze days a term allows, for pausing the membership during travel or injury.", keywords: ["freeze", "freezing", "pause", "pausing", "travel", "travelling", "holiday", "vacation", "injury", "away", "تجميد", "سفر", "إيقاف"] },
  { id: "attr.included_pt", label: "Included training", description: "Personal-training sessions included with each new term.", keywords: ["pt", "personal training", "trainer", "training included", "sessions included", "coach", "تدريب", "مدرب"] },
  { id: "attr.visits", label: "Visits", description: "Visit-based plans: how many visits a term includes and how long they stay valid.", keywords: ["visits", "visit", "times a week", "twice a week", "once a week", "occasional", "few times", "pass", "زيارة", "زيارات"] },
  { id: "attr.duration", label: "Duration", description: "How long a term lasts.", keywords: ["month", "months", "monthly", "year", "annual", "yearly", "quarter", "short term", "long term", "commit", "شهر", "سنة", "سنوي", "شهري"] },
  { id: "attr.price", label: "Price", description: "The term price.", keywords: ["price", "cheap", "cheaper", "cheapest", "expensive", "budget", "afford", "cost", "discount", "سعر", "أرخص", "غالي", "ميزانية"] },
];

const ATTRIBUTE_BY_ID = new Map(PLAN_ATTRIBUTES.map((attribute) => [attribute.id, attribute] as const));

export function isPlanAttributeId(value: unknown): value is PlanAttributeId {
  return typeof value === "string" && ATTRIBUTE_BY_ID.has(value as PlanAttributeId);
}

export function planAttributeCandidates(): JevCandidate[] {
  return [
    ...PLAN_ATTRIBUTES.map((attribute) => ({ id: attribute.id, description: `${attribute.label}: ${attribute.description}` })),
    { id: PLAN_PRIORITY_NONE, description: "The request states no plan priority to emphasise." },
  ];
}

export function buildPlanPriorityState(input: { goal: string; memberId: string; current?: ResolutionMembership; planCount: number }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const goal = input.goal.trim().slice(0, RESOLUTION_GOAL_MAX_LENGTH);
  const state: JevState = {
    purpose: "Gym staff are comparing membership plans for a member and wrote what the member said matters. Choose the one plan attribute that request most explicitly prioritises. Choose none when the request names no priority.",
    goal,
    ...(input.current ? { currentPlan: { name: input.current.planName, kind: input.current.kind, branchAccess: input.current.branchAccess, freezeAllowanceDays: input.current.freezeAllowanceDays, includedPtSessions: input.current.includedPtSessions } } : {}),
    activePlans: input.planCount,
  };
  return { state, candidates: planAttributeCandidates(), scopeKey: `plan-priority:${input.memberId}`, sourceVersion: "plan-priority:1" };
}

function attributeScores(goal: string): Map<PlanAttributeId, number> {
  const scores = new Map<PlanAttributeId, number>();
  for (const attribute of PLAN_ATTRIBUTES) {
    let score = 0;
    for (const keyword of attribute.keywords) if (mentions(goal, keyword)) score += keyword.includes(" ") ? 3 : 2;
    if (score) scores.set(attribute.id, score);
  }
  return scores;
}

export function resolvePlanPriorityFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const goal = normalize(text(record(input.state).goal));
  const scores = attributeScores(goal);
  const ranked = [...scores.entries()].filter(([id]) => ids.includes(id)).sort((left, right) => right[1] - left[1]);
  if (!ranked.length) return spread(ids, PLAN_PRIORITY_NONE, 0.8);
  const total = ranked.reduce((sum, [, score]) => sum + score, 0) + 1;
  const probabilities: Record<string, number> = {};
  for (const id of ids) probabilities[id] = 0;
  for (const [id, score] of ranked) probabilities[id] = score / total;
  probabilities[PLAN_PRIORITY_NONE] = 1 / total;
  const chosen = ranked[0]![0];
  return { kind: "choice", choice: chosen, probabilities, confidence: ranked.length === 1 ? 0.86 : 0.7 };
}

export interface PlanPriorityReading {
  primary?: PlanAttributeId;
  /** Every attribute the judgment weighted at 20 % or more, primary first. */
  emphasized: PlanAttributeId[];
}

export function resolvePlanPriorityReading(judgment: JevJudgment): PlanPriorityReading {
  if (judgment.kind !== "choice" || !isPlanAttributeId(judgment.choice)) return { emphasized: [] };
  const others = Object.entries(judgment.probabilities)
    .filter(([id, probability]) => id !== judgment.choice && isPlanAttributeId(id) && probability >= 0.2)
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id as PlanAttributeId);
  return { primary: judgment.choice, emphasized: [judgment.choice, ...others] };
}

export interface PlanComparisonCell {
  attribute: PlanAttributeId;
  text: string;
  /** Compared with the member's current plan: same, better-or-more, less, or not comparable. */
  versusCurrent: "same" | "more" | "less" | "n/a";
}

export interface PlanComparisonRow {
  plan: ResolutionPlan;
  current: boolean;
  cells: PlanComparisonCell[];
}

function planCell(plan: ResolutionPlan, attribute: PlanAttributeId, current?: ResolutionPlan): PlanComparisonCell {
  const compare = (left: number | undefined, right: number | undefined, higherIsMore = true): PlanComparisonCell["versusCurrent"] => {
    if (!current || left === undefined || right === undefined) return "n/a";
    if (left === right) return "same";
    return (left > right) === higherIsMore ? "more" : "less";
  };
  switch (attribute) {
    case "attr.branch_access": {
      const textValue = plan.branchAccess === "all" ? "All branches" : plan.branchNames.length ? plan.branchNames.join(", ") : "Selected branches";
      const rank = (candidate: ResolutionPlan) => (candidate.branchAccess === "all" ? 1_000 : candidate.branchIds.length);
      return { attribute, text: textValue, versusCurrent: compare(rank(plan), current ? rank(current) : undefined) };
    }
    case "attr.freeze":
      return { attribute, text: plan.freezeAllowanceDays > 0 ? `${plan.freezeAllowanceDays} freeze day${plan.freezeAllowanceDays === 1 ? "" : "s"} per term` : "No freezing", versusCurrent: compare(plan.freezeAllowanceDays, current?.freezeAllowanceDays) };
    case "attr.included_pt":
      return { attribute, text: plan.includedPtSessions > 0 ? `${plan.includedPtSessions} PT session${plan.includedPtSessions === 1 ? "" : "s"} included` : "No PT included", versusCurrent: compare(plan.includedPtSessions, current?.includedPtSessions) };
    case "attr.visits":
      return { attribute, text: plan.kind === "visits" ? `${plan.visitAllowance ?? 0} visits${plan.visitValidityDays ? ` · valid ${plan.visitValidityDays} days` : ""}` : "Unlimited visits", versusCurrent: plan.kind === "visits" && current?.kind === "visits" ? compare(plan.visitAllowance, current.visitAllowance) : plan.kind === current?.kind ? "same" : "n/a" };
    case "attr.duration":
      return { attribute, text: plan.kind === "time" ? `${plan.durationDays ?? 0} days` : plan.visitValidityDays ? `${plan.visitValidityDays} days validity` : "—", versusCurrent: compare(plan.kind === "time" ? plan.durationDays : plan.visitValidityDays, current ? (current.kind === "time" ? current.durationDays : current.visitValidityDays) : undefined) };
    case "attr.price":
      return { attribute, text: formatResolutionMoney(plan.price.amount, plan.price.currency), versusCurrent: compare(plan.price.amount, current?.price.amount, false) === "n/a" ? "n/a" : plan.price.amount === current?.price.amount ? "same" : plan.price.amount < (current?.price.amount ?? 0) ? "more" : "less" };
  }
}

/** Every plan with every attribute; the caller decides which columns to emphasise. Prices and full terms are always present. */
export function comparePlans(plans: readonly ResolutionPlan[], currentPlanId: string | undefined, emphasized: readonly PlanAttributeId[]): { rows: PlanComparisonRow[]; columns: PlanAttributeId[] } {
  const current = plans.find((plan) => plan.id === currentPlanId);
  const columns: PlanAttributeId[] = [...emphasized, ...PLAN_ATTRIBUTES.map((attribute) => attribute.id).filter((id) => !emphasized.includes(id))];
  const rows = plans.map((plan) => ({ plan, current: plan.id === currentPlanId, cells: columns.map((attribute) => planCell(plan, attribute, current)) }));
  const score = (row: PlanComparisonRow) => row.cells.filter((cell, index) => index < emphasized.length && cell.versusCurrent === "more").length;
  rows.sort((left, right) => Number(right.current) - Number(left.current) || score(right) - score(left) || left.plan.name.localeCompare(right.plan.name));
  return { rows, columns };
}

// ---------------------------------------------------------------------------
// Resolution intent: which panel
// ---------------------------------------------------------------------------

export function resolutionIntentCandidates(panels: readonly ResolutionPanel[], clarifications: readonly ResolutionClarification[]): JevCandidate[] {
  return [
    ...panels.map((panel) => ({ id: panel.id, description: `${panel.label}: ${panel.description}` })),
    ...clarifications.map((clarification) => ({ id: clarification.id, description: `Ask "${clarification.question}" because the request fits both: ${clarification.options.map((option) => resolutionPanel(option)?.label ?? option).join(" / ")}.` })),
    { id: RESOLUTION_NO_MATCH, description: "No panel on this page helps with the request, or the request is not about this member." },
  ];
}

export function buildResolutionIntentState(input: { goal: string; memberId: string; facts: ResolutionFacts; panels: readonly ResolutionPanel[]; clarifications: readonly ResolutionClarification[] }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const goal = input.goal.trim().slice(0, RESOLUTION_GOAL_MAX_LENGTH);
  const state: JevState = {
    purpose: "Gym staff opened a member's record and wrote what they are helping the member with. Choose the one offered panel that helps, a clarification when two panels fit equally, or no_match.",
    goal,
    facts: {
      outstandingBalance: input.facts.outstandingMinor > 0,
      openCharges: input.facts.openCharges,
      ptOrdersPending: input.facts.ptOrdersPending,
      ptOrdersPaid: input.facts.ptOrdersPaid,
      ptCreditsAvailable: input.facts.ptCreditsAvailable,
      membershipStatus: input.facts.membershipStatus ?? "none",
      daysUntilExpiry: input.facts.daysUntilExpiry ?? null,
      openTasks: input.facts.openTasks,
      joinableClasses: input.facts.joinableClasses,
      bookableTrainers: input.facts.bookableTrainers,
      activePlans: input.facts.activePlans,
    },
  };
  return { state, candidates: resolutionIntentCandidates(input.panels, input.clarifications), scopeKey: `resolution-intent:${input.memberId}`, sourceVersion: "resolution-intent:1" };
}

export function resolveResolutionIntentFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const goal = normalize(text(record(input.state).goal));
  if (!goal) return spread(ids, RESOLUTION_NO_MATCH, 0.8);
  const scores = new Map<string, number>();
  for (const panel of RESOLUTION_PANELS) {
    if (!ids.includes(panel.id)) continue;
    let score = 0;
    for (const keyword of panel.keywords) if (mentions(goal, keyword)) score += keyword.includes(" ") ? 4 : 2;
    if (score) scores.set(panel.id, score);
  }
  for (const clarification of RESOLUTION_CLARIFICATIONS) {
    if (!ids.includes(clarification.id)) continue;
    const triggered = clarification.keywords.some((keyword) => mentions(goal, keyword));
    if (!triggered) continue;
    const optionScores = clarification.options.map((option) => scores.get(option) ?? 0);
    const best = Math.max(...optionScores);
    const distinct = optionScores.filter((score) => score === best).length;
    const strongestElsewhere = Math.max(0, ...[...scores.entries()].filter(([id]) => !clarification.options.includes(id as ResolutionPanelId)).map(([, score]) => score));
    // Ask only when the trigger words are all there is: a panel that already scored on its own words settles the request.
    if ((best === 0 && strongestElsewhere === 0) || (best > 0 && distinct > 1)) scores.set(clarification.id, 5 + best);
  }
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  if (!ranked.length) return spread(ids, RESOLUTION_NO_MATCH, 0.74);
  const [choice, score] = ranked[0]!;
  const runnerUp = ranked[1]?.[1] ?? 0;
  const weight = runnerUp === 0 ? 0.86 : score >= runnerUp * 2 ? 0.74 : 0.58;
  const judgment = spread(ids, choice, weight);
  if (ranked[1]) judgment.probabilities[ranked[1][0]] = Math.max(judgment.probabilities[ranked[1][0]] ?? 0, Math.min(0.35, runnerUp / (score + runnerUp)));
  const total = Object.values(judgment.probabilities).reduce((sum, value) => sum + value, 0);
  for (const key of Object.keys(judgment.probabilities)) judgment.probabilities[key] = (judgment.probabilities[key] ?? 0) / total;
  return judgment;
}

export type ResolutionIntentReading =
  | { kind: "panel"; panel: ResolutionPanel }
  | { kind: "clarify"; clarification: ResolutionClarification; options: ResolutionPanel[] }
  | { kind: "no_match" };

/** Anything outside the permitted panels and clarifications reads as no match, whatever the model said. */
export function resolveResolutionIntentReading(judgment: JevJudgment, permitted: readonly ResolutionPanel[]): ResolutionIntentReading {
  if (judgment.kind !== "choice" || judgment.choice === RESOLUTION_NO_MATCH) return { kind: "no_match" };
  const panel = permitted.find((candidate) => candidate.id === judgment.choice);
  if (panel) return { kind: "panel", panel };
  const clarification = RESOLUTION_CLARIFICATIONS.find((candidate) => candidate.id === judgment.choice);
  if (clarification) {
    const options = clarification.options.map((option) => permitted.find((candidate) => candidate.id === option)).filter((option): option is ResolutionPanel => Boolean(option));
    if (options.length >= 2) return { kind: "clarify", clarification, options };
  }
  return { kind: "no_match" };
}

// ---------------------------------------------------------------------------
// Class pick
// ---------------------------------------------------------------------------

export const RESOLUTION_NONE = "none";
export const RESOLUTION_CLASS_HORIZON_DAYS = 14;
export const RESOLUTION_TRAINER_HORIZON_DAYS = 14;

const AUDIENCE_LABEL: Record<string, string> = { mixed: "everyone", women: "women only", men: "men only" };

export function describeClassOption(option: ResolutionClassOption, timezone: string): string {
  const spots = option.spotsRemaining > 0 ? `${option.spotsRemaining} of ${option.capacity} spots left` : `full · ${option.waitlistCount} waiting`;
  return `${describeInstant(option.startsAt, timezone)} · ${option.name} · coach ${option.coachName ?? "not assigned"} · ${AUDIENCE_LABEL[option.audience] ?? option.audience} · ${spots} · ${option.branchName}`;
}

export function classPickCandidates(options: readonly ResolutionClassOption[], timezone: string): JevCandidate[] {
  return [
    ...options.filter((option) => option.eligible).map((option) => ({ id: option.id, description: describeClassOption(option, timezone) })),
    { id: RESOLUTION_NONE, description: "No offered class fits what was asked." },
  ];
}

export function buildClassPickState(input: { goal: string; memberId: string; context: Pick<MemberResolutionContext, "classes" | "gender" | "timezone"> }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const goal = input.goal.trim().slice(0, RESOLUTION_GOAL_MAX_LENGTH);
  const state: JevState = {
    purpose: "Gym staff want to put a member into a group class and wrote what the member asked for. Only classes the member may join are offered. Choose the one that best fits the request (type of class, day, time of day, coach); choose none when nothing offered fits or the request names nothing to match on.",
    goal,
    memberAudience: input.context.gender === "female" ? "women or everyone" : input.context.gender === "male" ? "men or everyone" : "everyone (gender not recorded)",
    horizonDays: input.context.classes.horizonDays,
    joinableClasses: input.context.classes.options.filter((option) => option.eligible).length,
  };
  return { state, candidates: classPickCandidates(input.context.classes.options, input.context.timezone), scopeKey: `class-pick:${input.memberId}`, sourceVersion: "class-pick:1" };
}

const MORNING = ["morning", "early", "before work", "صباح", "الصبح"];
const EVENING = ["evening", "after work", "night", "late", "مساء", "بالليل"];
const AFTERNOON = ["afternoon", "lunch", "midday", "noon", "بعد الظهر", "الظهر"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAYS_AR: Record<string, string> = { "الأحد": "sunday", "الاثنين": "monday", "الإثنين": "monday", "الثلاثاء": "tuesday", "الأربعاء": "wednesday", "الخميس": "thursday", "الجمعة": "friday", "السبت": "saturday" };
const GENERIC_CLASS_WORDS = ["class", "classes", "session", "group", "join", "book", "timetable", "schedule", "حصة", "حصص", "كلاس"];

function parseClassDescription(description: string): { start: string; name: string; coach: string } {
  const parts = description.split(" · ");
  return { start: `${parts[0] ?? ""} · ${parts[1] ?? ""}`, name: parts[2] ?? "", coach: (parts[3] ?? "").replace(/^coach /, "") };
}

export function resolveClassPickFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const candidates = input.candidates ?? [];
  const ids = candidates.map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const goal = normalize(text(record(input.state).goal));
  const goalTokens = tokens(goal);
  const wantsMorning = MORNING.some((word) => mentions(goal, word));
  const wantsEvening = EVENING.some((word) => mentions(goal, word));
  const wantsAfternoon = AFTERNOON.some((word) => mentions(goal, word));
  const wantedDays = new Set<string>([...WEEKDAYS.filter((day) => mentions(goal, day) || mentions(goal, day.slice(0, 3))), ...Object.entries(WEEKDAYS_AR).filter(([arabic]) => mentions(goal, arabic)).map(([, day]) => day)]);
  const scored = candidates.filter((candidate) => candidate.id !== RESOLUTION_NONE).map((candidate) => {
    const parsed = parseClassDescription(candidate.description);
    let score = 0;
    for (const token of tokens(parsed.name)) if (goalTokens.some((word) => word.length >= 3 && stemMatch(word, token))) score += 3;
    for (const token of tokens(parsed.coach)) if (token !== "not" && token !== "assigned" && goalTokens.some((word) => stemMatch(word, token))) score += 3;
    const dayName = parsed.start.slice(0, 3).toLowerCase();
    const day = WEEKDAYS.find((candidateDay) => candidateDay.startsWith(dayName));
    if (day && wantedDays.has(day)) score += 2;
    const hour = Number((parsed.start.match(/(\d{2}):\d{2}$/) ?? [])[1] ?? NaN);
    if (Number.isFinite(hour)) {
      if (wantsMorning && hour < 12) score += 2;
      if (wantsAfternoon && hour >= 12 && hour < 17) score += 2;
      if (wantsEvening && hour >= 17) score += 2;
      if ((wantsMorning && hour >= 12) || (wantsEvening && hour < 17)) score -= 2;
    }
    return { id: candidate.id, score };
  });
  const best = [...scored].sort((left, right) => right.score - left.score)[0];
  if (best && best.score > 0) return spread(ids, best.id, best.score >= 5 ? 0.82 : 0.66);
  // A generic ask with nothing to match on: the soonest joinable class, at low confidence.
  const generic = GENERIC_CLASS_WORDS.some((word) => mentions(goal, word)) && !wantedDays.size && !wantsMorning && !wantsEvening && !wantsAfternoon;
  if (generic && scored.length) return spread(ids, scored[0]!.id, 0.45);
  return spread(ids, RESOLUTION_NONE, 0.78);
}

export type ClassPickReading = { kind: "class"; option: ResolutionClassOption } | { kind: "none" };

export function resolveClassPickReading(judgment: JevJudgment, options: readonly ResolutionClassOption[]): ClassPickReading {
  if (judgment.kind !== "choice" || judgment.choice === RESOLUTION_NONE) return { kind: "none" };
  const option = options.find((candidate) => candidate.id === judgment.choice && candidate.eligible);
  return option ? { kind: "class", option } : { kind: "none" };
}

// ---------------------------------------------------------------------------
// Trainer pick
// ---------------------------------------------------------------------------

const LANGUAGE_LABEL: Record<string, string> = { en: "English", ar: "Arabic" };

export function describeTrainerOption(option: ResolutionTrainerOption, timezone: string): string {
  const specialties = option.specialties.length ? option.specialties.join(", ") : "not recorded";
  const languages = option.languages.length ? option.languages.map((code) => LANGUAGE_LABEL[code] ?? code).join(", ") : "not recorded";
  const slot = option.nextSlotAt ? `next open slot ${describeInstant(option.nextSlotAt, timezone)} (${option.openSlots} open in the next ${RESOLUTION_TRAINER_HORIZON_DAYS} days)` : `no open slot in the next ${RESOLUTION_TRAINER_HORIZON_DAYS} days`;
  return `${option.displayName} · specialties: ${specialties} · languages: ${languages} · branches: ${option.branchNames.join(", ") || "none"} · ${slot}`;
}

export function trainerPickCandidates(options: readonly ResolutionTrainerOption[], timezone: string): JevCandidate[] {
  return [
    ...options.filter((option) => option.published && option.nextSlotAt).map((option) => ({ id: option.id, description: describeTrainerOption(option, timezone) })),
    { id: RESOLUTION_NONE, description: "No offered trainer matches what was asked, or the request needs a profile detail no trainer has recorded." },
  ];
}

export function buildTrainerPickState(input: { goal: string; memberId: string; context: Pick<MemberResolutionContext, "trainers" | "preferredLanguage" | "timezone" | "homeBranchName"> }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const goal = input.goal.trim().slice(0, RESOLUTION_GOAL_MAX_LENGTH);
  const state: JevState = {
    purpose: "Gym staff want to match a member with a personal trainer and wrote what the member asked for. Only published trainers with an open slot at the member's branch are offered, described by what their profile records. Choose the trainer whose recorded profile fits; choose none when nothing recorded fits. A language, gender or skill that is not recorded is unknown: never infer it from a name.",
    goal,
    memberLanguage: LANGUAGE_LABEL[input.context.preferredLanguage] ?? input.context.preferredLanguage,
    memberBranch: input.context.homeBranchName,
    ptCreditsAvailable: input.context.trainers.credits,
    bookableTrainers: input.context.trainers.options.filter((option) => option.published && option.nextSlotAt).length,
  };
  return { state, candidates: trainerPickCandidates(input.context.trainers.options, input.context.timezone), scopeKey: `trainer-pick:${input.memberId}`, sourceVersion: "trainer-pick:1" };
}

const LANGUAGE_ASKS: Array<{ code: string; words: readonly string[] }> = [
  { code: "ar", words: ["arabic", "arabic speaking", "speaks arabic", "in arabic", "عربي", "بالعربي", "يحكي عربي", "تحكي عربي"] },
  { code: "en", words: ["english", "english speaking", "speaks english", "in english", "انجليزي", "إنجليزي", "بالانجليزي"] },
];
const SOONEST_WORDS = ["soon", "soonest", "asap", "today", "tomorrow", "this week", "earliest", "available", "أقرب", "اليوم", "بكرة", "بكرا"];

function parseTrainerDescription(description: string): { name: string; specialties: string; languages: string; slot: string } {
  const parts = description.split(" · ");
  const part = (prefix: string) => (parts.find((item) => item.startsWith(prefix)) ?? "").slice(prefix.length);
  return { name: parts[0] ?? "", specialties: part("specialties: "), languages: part("languages: "), slot: parts[parts.length - 1] ?? "" };
}

export function resolveTrainerPickFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const candidates = input.candidates ?? [];
  const ids = candidates.map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const goal = normalize(text(record(input.state).goal));
  const goalTokens = tokens(goal);
  const askedLanguages = LANGUAGE_ASKS.filter((ask) => ask.words.some((word) => mentions(goal, word))).map((ask) => LANGUAGE_LABEL[ask.code]!.toLowerCase());
  const wantsSoonest = SOONEST_WORDS.some((word) => mentions(goal, word));
  const scored = candidates.filter((candidate) => candidate.id !== RESOLUTION_NONE).map((candidate, index) => {
    const parsed = parseTrainerDescription(candidate.description);
    const recordedLanguages = parsed.languages === "not recorded" ? [] : parsed.languages.toLowerCase().split(", ");
    // A language the profile does not record is unknown, so the trainer cannot satisfy a language request.
    if (askedLanguages.length && !askedLanguages.every((language) => recordedLanguages.includes(language))) return { id: candidate.id, score: -1, index };
    let score = askedLanguages.length ? 3 : 0;
    for (const token of tokens(parsed.specialties)) if (token !== "not" && token !== "recorded" && goalTokens.some((word) => word.length >= 3 && stemMatch(word, token))) score += 3;
    for (const token of tokens(parsed.name)) if (goalTokens.some((word) => word.length >= 3 && word === token)) score += 4;
    if (wantsSoonest) score += Math.max(0, 2 - index);
    return { id: candidate.id, score, index };
  }).filter((item) => item.score >= 0);
  const best = [...scored].sort((left, right) => right.score - left.score || left.index - right.index)[0];
  if (best && best.score > 0) return spread(ids, best.id, best.score >= 6 ? 0.84 : 0.68);
  const generic = ["trainer", "coach", "pt", "personal training", "مدرب", "مدربة"].some((word) => mentions(goal, word)) && !askedLanguages.length;
  if (generic && scored.length) return spread(ids, scored[0]!.id, 0.45);
  return spread(ids, RESOLUTION_NONE, 0.8);
}

export type TrainerPickReading = { kind: "trainer"; option: ResolutionTrainerOption } | { kind: "none" };

export function resolveTrainerPickReading(judgment: JevJudgment, options: readonly ResolutionTrainerOption[]): TrainerPickReading {
  if (judgment.kind !== "choice" || judgment.choice === RESOLUTION_NONE) return { kind: "none" };
  const option = options.find((candidate) => candidate.id === judgment.choice && candidate.published && candidate.nextSlotAt);
  return option ? { kind: "trainer", option } : { kind: "none" };
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export function resolutionFacts(input: Pick<MemberResolutionContext, "charges" | "ptOrders" | "pt" | "membership" | "tasks" | "classes" | "trainers" | "plans">): ResolutionFacts {
  return {
    outstandingMinor: input.charges.reduce((sum, charge) => sum + (charge.collectible ? charge.outstandingAmount.amount : 0), 0),
    openCharges: input.charges.filter((charge) => charge.outstandingAmount.amount > 0).length,
    ptOrdersPending: input.ptOrders.filter((order) => order.status === "pending_payment").length,
    ptOrdersPaid: input.ptOrders.filter((order) => order.status === "active" || order.status === "partially_refunded").length,
    ptCreditsAvailable: input.pt.available,
    ptCreditsReserved: input.pt.reserved,
    membershipStatus: input.membership?.status,
    daysUntilExpiry: input.membership?.daysUntilExpiry,
    openTasks: input.tasks.filter((task) => task.status === "open").length,
    joinableClasses: input.classes.options.filter((option) => option.eligible).length,
    bookableTrainers: input.trainers.options.filter((option) => option.published && option.nextSlotAt).length,
    activePlans: input.plans.filter((plan) => plan.status === "active").length,
  };
}
