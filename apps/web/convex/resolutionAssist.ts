import type { FollowUpRelatedTask } from "./followupAssist";

/**
 * Member resolution workspace: the pure logic shared by the server query,
 * the preview adapter and the member page.
 *
 * Everything that decides what is true
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
}

export const RESOLUTION_PANELS: readonly ResolutionPanel[] = [
  { id: "panel.training_payment", label: "Training payment", description: "The member says they already paid for personal training: the PT package orders, the payments recorded against them and the membership charges still open, with dates and service types, never netted against each other.", anyPermission: ["members.read"] },
  { id: "panel.balance", label: "Balance and payments", description: "What the member owes and what was collected: open charges by service, payments, refunds and receipts.", anyPermission: ["members.read"] },
  { id: "panel.membership_terms", label: "Membership terms", description: "The current term: plan, dates, freeze allowance used and remaining, visits, payment status, and the existing actions (renew, freeze, extend, transfer, change plan).", anyPermission: ["members.read"] },
  { id: "panel.plan_compare", label: "Compare plans", description: "The gym's active plans side by side with the member's current plan: branch access, freezing, included training, visits, duration and price.", anyPermission: ["members.read"] },
  { id: "panel.classes", label: "Classes", description: "Upcoming group classes the member can actually join, with eligibility, audience, capacity and schedule enforced.", anyPermission: ["members.read"] },
  { id: "panel.trainers", label: "Trainers", description: "Personal trainers with recorded profiles and open availability, and the member's PT credit balance.", anyPermission: ["members.read"] },
  { id: "panel.open_work", label: "Open work", description: "Open tasks about the member, their follow-on links and the recent task events, so nothing unresolved is repeated or lost.", anyPermission: ["crm.read"] },
];

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

export interface PlanAttribute {
  id: PlanAttributeId;
  label: string;
  description: string;
}

export const PLAN_ATTRIBUTES: readonly PlanAttribute[] = [
  { id: "attr.branch_access", label: "Branch access", description: "Which branches the plan admits: every branch or selected ones." },
  { id: "attr.freeze", label: "Freezing", description: "How many freeze days a term allows, for pausing the membership during travel or injury." },
  { id: "attr.included_pt", label: "Included training", description: "Personal-training sessions included with each new term." },
  { id: "attr.visits", label: "Visits", description: "Visit-based plans: how many visits a term includes and how long they stay valid." },
  { id: "attr.duration", label: "Duration", description: "How long a term lasts." },
  { id: "attr.price", label: "Price", description: "The term price." },
];

const ATTRIBUTE_BY_ID = new Map(PLAN_ATTRIBUTES.map((attribute) => [attribute.id, attribute] as const));

export function isPlanAttributeId(value: unknown): value is PlanAttributeId {
  return typeof value === "string" && ATTRIBUTE_BY_ID.has(value as PlanAttributeId);
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
// Class and trainer display helpers
// ---------------------------------------------------------------------------

export const RESOLUTION_CLASS_HORIZON_DAYS = 14;
export const RESOLUTION_TRAINER_HORIZON_DAYS = 14;

const AUDIENCE_LABEL: Record<string, string> = { mixed: "everyone", women: "women only", men: "men only" };

export function describeClassOption(option: ResolutionClassOption, timezone: string): string {
  const spots = option.spotsRemaining > 0 ? `${option.spotsRemaining} of ${option.capacity} spots left` : `full · ${option.waitlistCount} waiting`;
  return `${describeInstant(option.startsAt, timezone)} · ${option.name} · coach ${option.coachName ?? "not assigned"} · ${AUDIENCE_LABEL[option.audience] ?? option.audience} · ${spots} · ${option.branchName}`;
}

const LANGUAGE_LABEL: Record<string, string> = { en: "English", ar: "Arabic" };

export function describeTrainerOption(option: ResolutionTrainerOption, timezone: string): string {
  const specialties = option.specialties.length ? option.specialties.join(", ") : "not recorded";
  const languages = option.languages.length ? option.languages.map((code) => LANGUAGE_LABEL[code] ?? code).join(", ") : "not recorded";
  const slot = option.nextSlotAt ? `next open slot ${describeInstant(option.nextSlotAt, timezone)} (${option.openSlots} open in the next ${RESOLUTION_TRAINER_HORIZON_DAYS} days)` : `no open slot in the next ${RESOLUTION_TRAINER_HORIZON_DAYS} days`;
  return `${option.displayName} · specialties: ${specialties} · languages: ${languages} · branches: ${option.branchNames.join(", ") || "none"} · ${slot}`;
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
