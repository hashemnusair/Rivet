import type {
  AutomationExecution,
  AutomationRule,
  AuditEvent,
  Branch,
  CashShift,
  Charge,
  CheckInSummary,
  Lead,
  MembershipPlan,
  MessageTemplate,
  Offer,
  Payment,
  Receipt,
  StaffUser,
  Task,
  TimelineEvent,
  UUID,
  EquipmentAsset,
  EquipmentIssue,
  EquipmentWorkOrder,
  FacilityTask,
  InventoryBalance,
  LowStockAlert,
  Product,
  PurchaseOrder,
  StockMovement,
  Supplier,
} from "@/lib/domain/types";
import { defaultRoleDefinitions } from "@/lib/domain/permissions";
import { entitledModulesForPlan, defaultWorkspacePreferences, WORKSPACE_MODULE_CATALOG_VERSION } from "@/lib/domain/workspace-modules";
import { BRAND_PALETTE_PRESETS, deriveBrandTokens } from "@/lib/domain/brand";
import { addDays, diffDays, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import type { LeadRecord, MemberRecord, MembershipRecord, MockDb } from "./store";
import { resetUuidCounter, seedUuid } from "./store";
import {
  ARABIC_NAMES,
  CALL_NOTE_POOL,
  FAMILY,
  FEMALE_FIRST,
  LOST_REASONS,
  MALE_FIRST,
  NOTE_POOL,
  RENEWAL_OUTCOME_POOL,
  SENSITIVE_NOTE_POOL,
  TAG_POOL,
} from "./seed-constants";

// ---------------------------------------------------------------------------
// Deterministic RNG so the demo scenario is stable across reloads.
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORG_ID = seedUuid(1);
export const BRANCH_ABD = seedUuid(2);
export const BRANCH_SWF = seedUuid(3);

// Staff IDs
export const U = {
  omar: seedUuid(10), // owner
  layla: seedUuid(11), // manager (all)
  yousef: seedUuid(12), // manager (SWF)
  sara: seedUuid(13), // sales
  karim: seedUuid(14), // sales
  dina: seedUuid(15), // sales
  hala: seedUuid(16), // reception ABD
  rana: seedUuid(17), // reception SWF
  tarek: seedUuid(18), // reception ABD
  fadi: seedUuid(19), // trainer
  mona: seedUuid(20), // auditor
  sanad: seedUuid(21), // invited receptionist
  rania: seedUuid(22), // deactivated sales
} as const;

// Plan IDs
export const P = {
  monthly: seedUuid(30),
  quarterly: seedUuid(31),
  semi: seedUuid(32),
  annual: seedUuid(33),
  student: seedUuid(34),
  visits10: seedUuid(35),
  day: seedUuid(36),
  summer24: seedUuid(37),
} as const;

const TEMPLATE_IDS = { renewal: seedUuid(50), winback: seedUuid(51), payment: seedUuid(52) } as const;

const RULE_IDS = {
  expiry: seedUuid(60),
  expired: seedUuid(61),
  inactive: seedUuid(62),
  leadUntouched: seedUuid(63),
  followUpOverdue: seedUuid(64),
  outstanding: seedUuid(65),
} as const;

const OPS_IDS = {
  creatine: seedUuid(70),
  protein: seedUuid(71),
  supplier: seedUuid(72),
  zone: seedUuid(73),
  asset: seedUuid(74),
  issue: seedUuid(75),
  workOrder: seedUuid(76),
  facility: seedUuid(77),
} as const;

interface Gen {
  nextId: () => UUID;
  rnd: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
}

function makeGen(): Gen {
  let n = 1000;
  const rnd = mulberry32(20260729);
  const pick = <T,>(arr: readonly T[]): T => {
    const item = arr[Math.floor(rnd() * arr.length)];
    return item as T;
  };
  return {
    nextId: () => {
      n += 1;
      return seedUuid(n);
    },
    rnd,
    int: (min, max) => min + Math.floor(rnd() * (max - min + 1)),
    pick,
    chance: (p) => rnd() < p,
  };
}

const iso = (d: Date) => d.toISOString();

function daysAgo(now: Date, days: number, hour = 10, minute = 0): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(Math.max(0, hour - 3), minute, Math.floor(Math.random() * 50), 0); // Amman = UTC+3
  return d;
}

function hoursAgo(now: Date, hours: number, extraMinutes = 0): Date {
  return new Date(now.getTime() - hours * 3_600_000 - extraMinutes * 60_000);
}

/** Add calendar months without allowing dates such as January 31 to roll into
 * the following month. Subscription periods are calendar-based, so this is
 * intentionally different from adding a fixed number of milliseconds. */
function addCalendarMonths(timestamp: number, months: number): Date {
  const source = new Date(timestamp);
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return target;
}

export function buildSeed(now: Date = new Date()): MockDb {
  resetUuidCounter();
  const g = makeGen();
  const today = todayISODate("Asia/Amman", now);
  // Forge is an already-converted demo tenant. Keep its lifecycle facts
  // realistic so admin detail and platform snapshot screens never fall back
  // to "Not configured" for the canonical active tenant.
  const subscriptionStartedAt = new Date(now);
  subscriptionStartedAt.setUTCDate(subscriptionStartedAt.getUTCDate() - 12);
  subscriptionStartedAt.setUTCHours(7, 0, 0, 0);
  const currentPeriodEndsAt = addCalendarMonths(subscriptionStartedAt.getTime(), 1);

  // -------------------------------------------------------------------------
  // Organization, branches, config
  // -------------------------------------------------------------------------
  const branches: Branch[] = [
    {
      id: BRANCH_ABD,
      organizationId: ORG_ID,
      name: "Forge — Abdoun",
      code: "ABD",
      address: "Salah Al-Suheimat St 12, Abdoun, Amman",
      phone: "+962 6 593 4421",
      capacity: 110,
      status: "active",
    },
    {
      id: BRANCH_SWF,
      organizationId: ORG_ID,
      name: "Forge — Sweifieh",
      code: "SWF",
      address: "Ali Nasuh Al-Tahir St 7, Sweifieh, Amman",
      phone: "+962 6 585 7790",
      capacity: 85,
      status: "active",
    },
  ];

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------
  const users: StaffUser[] = [
    { id: U.omar, organizationId: ORG_ID, name: "Omar Al-Khatib", email: "omar@forgefitness.jo", phone: "+962 79 500 1122", role: "owner", branchScope: "all", branchIds: [], status: "active", lastActiveAt: iso(hoursAgo(now, 1)) },
    { id: U.layla, organizationId: ORG_ID, name: "Layla Haddad", email: "layla@forgefitness.jo", phone: "+962 79 511 3407", role: "manager", branchScope: "all", branchIds: [], status: "active", lastActiveAt: iso(hoursAgo(now, 0, 20)) },
    { id: U.yousef, organizationId: ORG_ID, name: "Yousef Nasser", email: "yousef@forgefitness.jo", phone: "+962 78 522 8814", role: "manager", branchScope: "selected", branchIds: [BRANCH_SWF], status: "active", lastActiveAt: iso(hoursAgo(now, 3)) },
    { id: U.sara, organizationId: ORG_ID, name: "Sara Abuhamdan", email: "sara@forgefitness.jo", phone: "+962 79 533 2290", role: "salesperson", branchScope: "all", branchIds: [], status: "active", lastActiveAt: iso(hoursAgo(now, 0, 45)) },
    { id: U.karim, organizationId: ORG_ID, name: "Karim Awad", email: "karim@forgefitness.jo", phone: "+962 77 544 6673", role: "salesperson", branchScope: "selected", branchIds: [BRANCH_ABD], status: "active", lastActiveAt: iso(hoursAgo(now, 2)) },
    { id: U.dina, organizationId: ORG_ID, name: "Dina Saleh", email: "dina@forgefitness.jo", phone: "+962 78 555 9031", role: "salesperson", branchScope: "selected", branchIds: [BRANCH_SWF], status: "active", lastActiveAt: iso(hoursAgo(now, 5)) },
    { id: U.hala, organizationId: ORG_ID, name: "Hala Qasem", email: "hala@forgefitness.jo", phone: "+962 79 566 4418", role: "receptionist", branchScope: "selected", branchIds: [BRANCH_ABD], status: "active", lastActiveAt: iso(hoursAgo(now, 0, 5)) },
    { id: U.rana, organizationId: ORG_ID, name: "Rana Issa", email: "rana@forgefitness.jo", phone: "+962 77 577 2256", role: "receptionist", branchScope: "selected", branchIds: [BRANCH_SWF], status: "active", lastActiveAt: iso(hoursAgo(now, 1)) },
    { id: U.tarek, organizationId: ORG_ID, name: "Tarek Azar", email: "tarek@forgefitness.jo", phone: "+962 78 588 7742", role: "receptionist", branchScope: "selected", branchIds: [BRANCH_ABD], status: "active", lastActiveAt: iso(hoursAgo(now, 26)) },
    { id: U.fadi, organizationId: ORG_ID, name: "Fadi Khoury", email: "fadi@forgefitness.jo", phone: "+962 79 599 1187", role: "trainer", branchScope: "selected", branchIds: [BRANCH_ABD], status: "active", lastActiveAt: iso(hoursAgo(now, 8)) },
    { id: U.mona, organizationId: ORG_ID, name: "Mona Barakat", email: "mona@forgefitness.jo", phone: "+962 77 610 3359", role: "auditor", branchScope: "all", branchIds: [], status: "active", lastActiveAt: iso(hoursAgo(now, 50)) },
    { id: U.sanad, organizationId: ORG_ID, name: "Sanad Khries", email: "sanad@forgefitness.jo", phone: "+962 78 621 9924", role: "receptionist", branchScope: "selected", branchIds: [BRANCH_SWF], status: "invited", invitedAt: iso(daysAgo(now, 2)) },
    { id: U.rania, organizationId: ORG_ID, name: "Rania Hijazi", email: "rania@forgefitness.jo", phone: "+962 79 632 5508", role: "salesperson", branchScope: "selected", branchIds: [BRANCH_ABD], status: "deactivated", lastActiveAt: iso(daysAgo(now, 34)) },
  ];

  const salespeople = [U.sara, U.karim, U.dina];
  const receptionBy = { [BRANCH_ABD]: [U.hala, U.tarek], [BRANCH_SWF]: [U.rana] } as Record<string, UUID[]>;

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------
  const planDefs: Array<Omit<MembershipPlan, "activeSubscribers">> = [
    { id: P.monthly, organizationId: ORG_ID, name: "Monthly Standard", code: "M1", kind: "time", durationDays: 30, basePrice: money(40_000), branchAccess: "selected", branchIds: [BRANCH_ABD, BRANCH_SWF], freezeAllowanceDays: 7, includedPtSessions: 2, status: "active" },
    { id: P.quarterly, organizationId: ORG_ID, name: "Quarterly", code: "Q3", kind: "time", durationDays: 90, basePrice: money(105_000), branchAccess: "all", branchIds: [], freezeAllowanceDays: 10, includedPtSessions: 2, status: "active" },
    { id: P.semi, organizationId: ORG_ID, name: "Semi-Annual", code: "S6", kind: "time", durationDays: 180, basePrice: money(190_000), branchAccess: "all", branchIds: [], freezeAllowanceDays: 15, includedPtSessions: 4, status: "active" },
    { id: P.annual, organizationId: ORG_ID, name: "Annual All-Access", code: "A12", kind: "time", durationDays: 365, basePrice: money(350_000), branchAccess: "all", branchIds: [], freezeAllowanceDays: 30, includedPtSessions: 6, status: "active" },
    { id: P.student, organizationId: ORG_ID, name: "Student Monthly", code: "STU", kind: "time", durationDays: 30, basePrice: money(30_000), branchAccess: "selected", branchIds: [BRANCH_ABD, BRANCH_SWF], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
    { id: P.visits10, organizationId: ORG_ID, name: "10-Visit Pass", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 90, basePrice: money(50_000), branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
    { id: P.day, organizationId: ORG_ID, name: "Day Pass", code: "DAY", kind: "time", durationDays: 1, basePrice: money(8_000), branchAccess: "selected", branchIds: [BRANCH_ABD, BRANCH_SWF], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
    { id: P.summer24, organizationId: ORG_ID, name: "Summer Promo 2024", code: "SUM24", kind: "time", durationDays: 90, basePrice: money(89_000), branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 0, status: "archived" },
  ];

  // -------------------------------------------------------------------------
  // Members & memberships
  // -------------------------------------------------------------------------
  const members: MemberRecord[] = [];
  const memberships: MembershipRecord[] = [];
  const charges: Charge[] = [];
  const payments: Payment[] = [];
  const receipts: Receipt[] = [];
  const activities: TimelineEvent[] = [];
  const audits: AuditEvent[] = [];
  const offers: Offer[] = [];
  const tasks: Task[] = [];

  let memberCounter = 1041;
  let receiptCounter = 2318;

  type Scenario = "active_long" | "expiring" | "expired" | "frozen" | "cancelled" | "visits" | "scheduled";
  const scenarioPlan: Scenario[] = [
    ...Array<Scenario>(38).fill("active_long"),
    ...Array<Scenario>(12).fill("expiring"),
    ...Array<Scenario>(15).fill("expired"),
    ...Array<Scenario>(6).fill("frozen"),
    ...Array<Scenario>(4).fill("cancelled"),
    ...Array<Scenario>(8).fill("visits"),
    ...Array<Scenario>(3).fill("scheduled"),
  ];

  const usedNames = new Set<string>();
  const nameFor = (): { first: string; family: string; gender: "male" | "female"; ar?: string } => {
    for (let i = 0; i < 500; i++) {
      const gender = g.chance(0.55) ? "male" : "female";
      const first = gender === "male" ? g.pick(MALE_FIRST) : g.pick(FEMALE_FIRST);
      const family = g.pick(FAMILY);
      const key = `${first} ${family}`;
      if (usedNames.has(key)) continue;
      usedNames.add(key);
      const arFirst = ARABIC_NAMES[first];
      const arFamily = ARABIC_NAMES[family];
      return { first, family, gender, ar: arFirst && arFamily && g.chance(0.5) ? `${arFirst} ${arFamily}` : undefined };
    }
    return { first: "Member", family: String(usedNames.size), gender: "male" };
  };

  const phoneFor = (): string => {
    const prefix = g.pick(["79", "78", "77"] as const);
    return `+962 ${prefix} ${g.int(100, 999)} ${g.int(1000, 9999)}`;
  };

  interface TermResult {
    term: MembershipRecord;
    charge: Charge;
    paymentMade: Payment[];
  }

  const makeTerm = (args: {
    member: MemberRecord;
    planId: UUID;
    startDate: string;
    soldDaysAgo: number;
    soldBy: UUID;
    previousMembershipId?: UUID;
    discounted?: { amount: number; reason: string; by: UUID; approval: "approved" | "pending" | "none" };
    payState: "paid" | "partial" | "unpaid";
    payMethod?: Payment["method"];
    cancelled?: { daysAgo: number; reason: string };
    frozen?: { startDaysAgo: number; lengthDays: number; reason: string };
    priceOverrideMinor?: number;
  }): TermResult => {
    const { member } = args;
    const plan = planDefs.find((p) => p.id === args.planId)!;
    const duration = plan.kind === "visits" ? (plan.visitValidityDays ?? 90) : (plan.durationDays ?? 30);
    let endDate = addDays(args.startDate, duration);
    const id = g.nextId();
    const chargeId = g.nextId();
    const basePrice = args.priceOverrideMinor ?? plan.basePrice.amount;
    const discountMinor = args.discounted?.amount ?? 0;
    const total = basePrice - discountMinor;

    const term: MembershipRecord = {
      id,
      organizationId: ORG_ID,
      memberId: member.id,
      planId: plan.id,
      homeBranchId: member.homeBranchId,
      startDate: args.startDate,
      endDate,
      totalVisits: plan.kind === "visits" ? plan.visitAllowance : undefined,
      remainingVisits: plan.kind === "visits" ? plan.visitAllowance : undefined,
      salePrice: money(basePrice),
      discount: money(discountMinor),
      discountReason: args.discounted?.reason,
      discountApprovalStatus: args.discounted?.approval ?? "none",
      soldById: args.soldBy,
      previousMembershipId: args.previousMembershipId,
      frozenDaysUsed: 0,
      freezes: [],
      adjustments: [],
      createdAt: iso(daysAgo(now, args.soldDaysAgo)),
    };

    if (args.cancelled) {
      term.cancelledAt = iso(daysAgo(now, args.cancelled.daysAgo));
      term.cancellationReason = args.cancelled.reason;
      term.adjustments.push({
        id: g.nextId(),
        membershipId: id,
        type: "cancellation",
        reason: args.cancelled.reason,
        actorId: U.layla,
        before: { status: "active" },
        after: { status: "cancelled" },
        approvalStatus: "not_required",
        createdAt: term.cancelledAt,
      });
    }

    if (args.frozen) {
      const freezeStart = addDays(today, -args.frozen.startDaysAgo);
      const freezeEnd = addDays(freezeStart, args.frozen.lengthDays);
      const freeze = {
        id: g.nextId(),
        membershipId: id,
        startDate: freezeStart,
        endDate: freezeEnd,
        status: "active" as const,
        reason: args.frozen.reason,
        createdById: g.pick([U.hala, U.layla] as const),
        createdAt: iso(daysAgo(now, args.frozen.startDaysAgo + 1)),
      };
      term.freezes.push(freeze);
      term.activeFreeze = freeze;
      term.frozenDaysUsed = args.frozen.startDaysAgo;
      term.endDate = addDays(term.endDate, args.frozen.lengthDays); // freeze pushes expiry out
      endDate = term.endDate;
      term.adjustments.push({
        id: g.nextId(),
        membershipId: id,
        type: "freeze",
        reason: args.frozen.reason,
        actorId: freeze.createdById,
        before: { endDate: addDays(endDate, -args.frozen.lengthDays) },
        after: { endDate },
        approvalStatus: "not_required",
        createdAt: freeze.createdAt,
      });
    }

    // Charge
    const paidMinor =
      args.payState === "paid" ? total : args.payState === "partial" ? Math.round(total * 0.55) : 0;
    const charge: Charge = {
      id: chargeId,
      organizationId: ORG_ID,
      memberId: member.id,
      membershipId: id,
      description: `${plan.name} membership`,
      subtotal: money(basePrice),
      discount: money(discountMinor),
      tax: money(0),
      total: money(total),
      paidAmount: money(paidMinor),
      outstandingAmount: money(total - paidMinor),
      status: paidMinor === 0 ? "unpaid" : paidMinor < total ? "partial" : "paid",
      createdAt: iso(daysAgo(now, args.soldDaysAgo)),
    };

    // Payments
    const made: Payment[] = [];
    if (paidMinor > 0) {
      const payDate = daysAgo(now, args.soldDaysAgo);
      const method = args.payMethod ?? (g.chance(0.55) ? "cash" : g.chance(0.6) ? "card" : g.chance(0.5) ? "bank_transfer" : "cliq");
      const pId = g.nextId();
      const rId = g.nextId();
      const rNum = `R-${receiptCounter++}`;
      const collectedBy = g.chance(0.5) ? args.soldBy : g.pick(receptionBy[member.homeBranchId] ?? [U.hala]);
      made.push({
        id: pId,
        organizationId: ORG_ID,
        branchId: member.homeBranchId,
        memberId: member.id,
        chargeId,
        type: "payment",
        amount: money(paidMinor),
        method,
        status: "completed",
        receiptId: rId,
        receiptNumber: rNum,
        collectedById: collectedBy,
        collectedByName: users.find((u) => u.id === collectedBy)?.name ?? "Staff",
        idempotencyKey: `seed-${pId}`,
        occurredAt: iso(payDate),
      });
      receipts.push({ id: rId, receiptNumber: rNum, paymentId: pId, issuedAt: iso(payDate) });
    }

    return { term, charge, paymentMade: made };
  };

  const planPickWeights: Array<[UUID, number]> = [
    [P.monthly, 0.24],
    [P.quarterly, 0.26],
    [P.semi, 0.14],
    [P.annual, 0.14],
    [P.student, 0.1],
    [P.day, 0.02],
    [P.visits10, 0.1],
  ];
  const pickPlan = (): UUID => {
    const r = g.rnd();
    let acc = 0;
    for (const [id, w] of planPickWeights) {
      acc += w;
      if (r <= acc) return id;
    }
    return P.monthly;
  };

  const memberIdsByNumber = new Map<string, UUID>();
  const expiredMembers: MemberRecord[] = [];
  const expiringMembers: MemberRecord[] = [];

  scenarioPlan.forEach((scenario, idx) => {
    const id = g.nextId();
    const { first, family, gender, ar } = nameFor();
    const homeBranchId = g.chance(0.55) ? BRANCH_ABD : BRANCH_SWF;
    memberCounter += 1;
    const branchCode = homeBranchId === BRANCH_ABD ? "ABD" : "SWF";
    const createdDaysAgo = g.int(20, 380);
    const member: MemberRecord = {
      id,
      memberNumber: `${branchCode}-${memberCounter}`,
      fullName: `${first} ${family}`,
      fullNameAr: ar,
      phone: phoneFor(),
      email: g.chance(0.6) ? `${first.toLowerCase()}.${family.toLowerCase().replace(/[^a-z]/g, "")}@${g.pick(["gmail.com", "outlook.com", "hotmail.com"] as const)}` : undefined,
      gender,
      dateOfBirth: `${g.int(1978, 2004)}-${String(g.int(1, 12)).padStart(2, "0")}-${String(g.int(1, 28)).padStart(2, "0")}`,
      homeBranchId,
      status: "active",
      tags: g.chance(0.5) ? [g.pick(TAG_POOL)] : [],
      preferredLanguage: g.chance(0.4) ? "ar" : "en",
      emergencyContactName: g.chance(0.7) ? `${g.pick(MALE_FIRST)} ${family}` : undefined,
      emergencyContactPhone: g.chance(0.7) ? phoneFor() : undefined,
      source: g.pick(["instagram", "walk_in", "referral", "whatsapp", "google"] as const),
      assignedSalespersonId: g.chance(0.75) ? g.pick(salespeople) : undefined,
      marketingOptIn: g.chance(0.7),
      notes: g.chance(0.45) ? g.pick(NOTE_POOL) : undefined,
      sensitiveNotes: g.chance(0.06) ? g.pick(SENSITIVE_NOTE_POOL) : undefined,
      createdAt: iso(daysAgo(now, createdDaysAgo)),
    };
    members.push(member);
    memberIdsByNumber.set(member.memberNumber, id);

    const soldBy = member.assignedSalespersonId ?? g.pick(salespeople);

    // How many historical terms?
    const histTerms =
      scenario === "active_long" || scenario === "expiring"
        ? g.chance(0.3)
          ? 2
          : g.chance(0.55)
            ? 1
            : 0
        : scenario === "frozen"
          ? 1
          : 0;

    let previousId: UUID | undefined;
    let histStart = createdDaysAgo;

    for (let h = 0; h < histTerms; h++) {
      const planId = pickPlan();
      const plan = planDefs.find((p) => p.id === planId)!;
      const dur = plan.kind === "visits" ? (plan.visitValidityDays ?? 90) : (plan.durationDays ?? 30);
      const startDate = addDays(today, -histStart);
      const r = makeTerm({
        member,
        planId,
        startDate,
        soldDaysAgo: histStart,
        soldBy,
        previousMembershipId: previousId,
        payState: "paid",
      });
      r.term.remainingVisits = r.term.totalVisits != null ? 0 : undefined;
      memberships.push(r.term);
      charges.push(r.charge);
      payments.push(...r.paymentMade);
      previousId = r.term.id;
      histStart = Math.max(0, histStart - dur - g.int(0, 20));
    }

    // Current term by scenario
    let currentPlanId = pickPlan();
    if (scenario === "visits") currentPlanId = P.visits10;
    const currentPlan = planDefs.find((p) => p.id === currentPlanId)!;
    const dur = currentPlan.kind === "visits" ? (currentPlan.visitValidityDays ?? 90) : (currentPlan.durationDays ?? 30);

    let startOffset: number;
    let payState: "paid" | "partial" | "unpaid" = "paid";
    let discounted: { amount: number; reason: string; by: UUID; approval: "approved" | "pending" | "none" } | undefined;
    let cancelled: { daysAgo: number; reason: string } | undefined;
    let frozen: { startDaysAgo: number; lengthDays: number; reason: string } | undefined;

    switch (scenario) {
      case "active_long":
        startOffset = g.int(Math.min(15, dur - 60 > 0 ? 15 : 2), Math.max(16, dur - 60));
        if (g.chance(0.12)) payState = "partial";
        if (g.chance(0.12)) discounted = { amount: 10_000, reason: "Returning member loyalty", by: soldBy, approval: "none" };
        break;
      case "expiring":
        startOffset = dur - g.int(2, 13);
        if (g.chance(0.15)) payState = "partial";
        break;
      case "expired":
        startOffset = dur + g.int(2, 40);
        if (g.chance(0.2)) payState = "unpaid";
        else if (g.chance(0.15)) payState = "partial";
        break;
      case "frozen":
        startOffset = g.int(30, Math.max(31, dur - 90));
        frozen = { startDaysAgo: g.int(3, 9), lengthDays: g.int(10, 20), reason: g.pick(["Travel — work trip to Dubai", "Medical — physiotherapy recovery", "University exams", "Family travel"] as const) };
        break;
      case "cancelled":
        startOffset = g.int(60, Math.max(61, dur - 30));
        cancelled = { daysAgo: g.int(10, 45), reason: g.pick(["Moved to another city", "Injury — long-term break", "Dissatisfied with crowding at peak hours", "Financial reasons"] as const) };
        break;
      case "visits":
        startOffset = g.int(10, 70);
        break;
      case "scheduled":
        startOffset = -g.int(3, 18); // starts in the future
        break;
    }

    // Keep start within membership history
    const soldDaysAgo = Math.max(1, Math.min(startOffset, createdDaysAgo));
    const startDate = addDays(today, -startOffset);

    // A couple of specially-flagged discounted sales for the alerts feed
    if (idx === 5) {
      discounted = { amount: 20_000, reason: "Corporate group rate promised by sales", by: U.karim, approval: "pending" };
    }
    if (idx === 9) {
      discounted = { amount: 15_000, reason: "Student upgrading mid-year, manager approved", by: U.sara, approval: "approved" };
    }

    const { term, charge, paymentMade } = makeTerm({
      member,
      planId: currentPlanId,
      startDate,
      soldDaysAgo,
      soldBy,
      previousMembershipId: previousId,
      discounted,
      payState,
      cancelled,
      frozen,
    });
    memberships.push(term);
    charges.push(charge);
    payments.push(...paymentMade);

    if (scenario === "expired") expiredMembers.push(member);
    if (scenario === "expiring") expiringMembers.push(member);
  });

  // Walk-in buyers over the last 30 days — day passes, student and monthly
  // sales keep the daily revenue series alive and realistic.
  const walkInPlans = [P.day, P.student, P.monthly, P.quarterly] as const;
  for (let i = 0; i < 14; i++) {
    const id = g.nextId();
    const { first, family, gender, ar } = nameFor();
    const homeBranchId = g.chance(0.55) ? BRANCH_ABD : BRANCH_SWF;
    memberCounter += 1;
    const createdDaysAgo = Math.max(1, Math.round((i + 1) * 2.1 + g.rnd() * 1.5)); // spread ~1-31 days back
    const planId = i < 4 ? P.day : (walkInPlans[g.int(0, 3)] ?? P.monthly);
    const member: MemberRecord = {
      id,
      memberNumber: `${homeBranchId === BRANCH_ABD ? "ABD" : "SWF"}-${memberCounter}`,
      fullName: `${first} ${family}`,
      fullNameAr: ar,
      phone: phoneFor(),
      gender,
      homeBranchId,
      status: "active",
      tags: i < 4 ? ["walk-in"] : [],
      preferredLanguage: g.chance(0.4) ? "ar" : "en",
      source: i < 4 ? "walk_in" : g.pick(["instagram", "walk_in", "referral", "whatsapp"] as const),
      assignedSalespersonId: i < 4 ? undefined : g.pick(salespeople),
      marketingOptIn: g.chance(0.6),
      createdAt: iso(daysAgo(now, createdDaysAgo, g.int(9, 20))),
    };
    members.push(member);
    memberIdsByNumber.set(member.memberNumber, id);
    const { term, charge, paymentMade } = makeTerm({
      member,
      planId,
      startDate: addDays(today, -createdDaysAgo),
      soldDaysAgo: createdDaysAgo,
      soldBy: member.assignedSalespersonId ?? g.pick(receptionBy[homeBranchId] ?? [U.hala]) ?? U.hala,
      payState: "paid",
    });
    memberships.push(term);
    charges.push(charge);
    payments.push(...paymentMade);
  }

  // A few inactive/archived member examples
  for (let i = 0; i < 3; i++) {
    const id = g.nextId();
    const { first, family, gender } = nameFor();
    const homeBranchId = i === 0 ? BRANCH_SWF : BRANCH_ABD;
    memberCounter += 1;
    const createdDaysAgo = g.int(200, 500);
    const member: MemberRecord = {
      id,
      memberNumber: `${homeBranchId === BRANCH_ABD ? "ABD" : "SWF"}-${memberCounter}`,
      fullName: `${first} ${family}`,
      phone: phoneFor(),
      gender,
      homeBranchId,
      status: i === 2 ? "archived" : "inactive",
      tags: [],
      preferredLanguage: "en",
      marketingOptIn: false,
      createdAt: iso(daysAgo(now, createdDaysAgo)),
      archivedAt: i === 2 ? iso(daysAgo(now, 12)) : undefined,
    };
    if (i === 2) {
      member.notes = "Duplicate profile merged into ABD-1044 after phone verification.";
    }
    // an old, fully-expired membership so history is visible
    const oldPlan = planDefs[1]!;
    const startDate = addDays(today, -(createdDaysAgo - 10));
    const { term, charge, paymentMade } = makeTerm({
      member,
      planId: oldPlan.id,
      startDate,
      soldDaysAgo: createdDaysAgo - 10,
      soldBy: U.rania,
      payState: "paid",
    });
    members.push(member);
    memberships.push(term);
    charges.push(charge);
    payments.push(...paymentMade);
  }

  // -------------------------------------------------------------------------
  // Today's commercial activity: one new member, one renewal, one balance
  // collection, one voided payment — so dashboards show live "today" numbers.
  // -------------------------------------------------------------------------
  const shiftWindowPayments: Payment[] = [];

  const addTodayPayment = (p: Omit<Payment, "id" | "receiptId" | "receiptNumber" | "idempotencyKey">) => {
    const id = g.nextId();
    const rId = g.nextId();
    const rNum = `R-${receiptCounter++}`;
    const payment: Payment = { ...p, id, receiptId: rId, receiptNumber: rNum, idempotencyKey: `seed-${id}` };
    payments.push(payment);
    receipts.push({ id: rId, receiptNumber: rNum, paymentId: id, issuedAt: p.occurredAt });
    shiftWindowPayments.push(payment);
    return payment;
  };

  // New member today
  {
    const id = g.nextId();
    memberCounter += 1;
    const member: MemberRecord = {
      id,
      memberNumber: `ABD-${memberCounter}`,
      fullName: "Yara Sweidan",
      fullNameAr: "يارا سويدان",
      phone: "+962 79 682 3145",
      email: "yara.sweidan@gmail.com",
      gender: "female",
      homeBranchId: BRANCH_ABD,
      status: "active",
      tags: ["referral"],
      preferredLanguage: "en",
      source: "referral",
      assignedSalespersonId: U.sara,
      marketingOptIn: true,
      notes: "Friend of ABD-1044. Started on the quarterly plan.",
      createdAt: iso(hoursAgo(now, 4)),
    };
    members.push(member);
    memberIdsByNumber.set(member.memberNumber, id);
    const startDate = today;
    const { term, charge } = makeTerm({ member, planId: P.quarterly, startDate, soldDaysAgo: 0, soldBy: U.sara, payState: "unpaid" });
    memberships.push(term);
    const paidNow = addTodayPayment({
      organizationId: ORG_ID,
      branchId: BRANCH_ABD,
      memberId: id,
      chargeId: charge.id,
      type: "payment",
      amount: money(105_000),
      method: "card",
      status: "completed",
      collectedById: U.sara,
      collectedByName: "Sara Abuhamdan",
      occurredAt: iso(hoursAgo(now, 3, 40)),
    });
    charge.paidAmount = money(105_000);
    charge.outstandingAmount = money(0);
    charge.status = "paid";
    charges.push(charge);
    activities.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      memberId: id,
      type: "membership_sold",
      title: "Quarterly membership sold",
      body: "Quarterly plan — JOD 105.000, paid in full by card.",
      actorId: U.sara,
      actorName: "Sara Abuhamdan",
      occurredAt: iso(hoursAgo(now, 3, 40)),
      meta: { membershipId: term.id, planName: "Quarterly" },
    });
    void paidNow;
  }

  // Renewal today (an expiring member renewed this morning)
  let _renewedToday: { member: MemberRecord; oldTerm: MembershipRecord } | undefined;
  {
    const candidate = expiringMembers[0];
    if (candidate) {
      const oldTerm = memberships.find((m) => m.memberId === candidate.id && !m.cancelledAt && m.endDate >= today)!;
      const oldPlan = planDefs.find((p) => p.id === oldTerm.planId)!;
      const startDate = addDays(oldTerm.endDate, 1);
      const { term, charge } = makeTerm({
        member: candidate,
        planId: oldPlan.id,
        startDate,
        soldDaysAgo: 0,
        soldBy: U.karim,
        previousMembershipId: oldTerm.id,
        payState: "unpaid",
      });
      memberships.push(term);
      addTodayPayment({
        organizationId: ORG_ID,
        branchId: candidate.homeBranchId,
        memberId: candidate.id,
        chargeId: charge.id,
        type: "payment",
        amount: charge.total,
        method: "cash",
        status: "completed",
        collectedById: U.hala,
        collectedByName: "Hala Qasem",
        occurredAt: iso(hoursAgo(now, 2, 15)),
      });
      charge.paidAmount = charge.total;
      charge.outstandingAmount = money(0);
      charge.status = "paid";
      charges.push(charge);
      _renewedToday = { member: candidate, oldTerm };
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: candidate.id,
        type: "membership_renewed",
        title: `${oldPlan.name} membership renewed`,
        body: `Renewed before expiry — new term ${startDate} → ${term.endDate}.`,
        actorId: U.karim,
        actorName: "Karim Awad",
        occurredAt: iso(hoursAgo(now, 2, 15)),
        meta: { membershipId: term.id },
      });
    }
  }

  // Outstanding balance collected today at SWF
  {
    const partial = charges.find((c) => c.status === "partial" && c.outstandingAmount.amount > 0 && memberships.find((m) => m.id === c.membershipId)?.homeBranchId === BRANCH_SWF);
    if (partial) {
      const m = members.find((x) => x.id === partial.memberId)!;
      addTodayPayment({
        organizationId: ORG_ID,
        branchId: BRANCH_SWF,
        memberId: partial.memberId,
        chargeId: partial.id,
        type: "payment",
        amount: partial.outstandingAmount,
        method: "cash",
        status: "completed",
        collectedById: U.rana,
        collectedByName: "Rana Issa",
        occurredAt: iso(hoursAgo(now, 1, 30)),
      });
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: partial.memberId,
        type: "payment_collected",
        title: `Outstanding balance collected — JOD ${(partial.outstandingAmount.amount / 1000).toFixed(3)}`,
        actorId: U.rana,
        actorName: "Rana Issa",
        occurredAt: iso(hoursAgo(now, 1, 30)),
      });
      partial.paidAmount = partial.total;
      partial.outstandingAmount = money(0);
      partial.status = "paid";
      void m;
    }
  }

  // A card payment voided today (wrong amount entered at the desk)
  {
    const p = addTodayPayment({
      organizationId: ORG_ID,
      branchId: BRANCH_ABD,
      memberId: members[3]!.id,
      type: "payment",
      amount: money(40_000),
      method: "card",
      status: "completed",
      collectedById: U.tarek,
      collectedByName: "Tarek Azar",
      occurredAt: iso(hoursAgo(now, 1, 5)),
    });
    p.status = "voided";
    p.voidReason = "Entered JOD 40 instead of JOD 400 at the terminal — re-ran correctly.";
  }

  // Refund 6 days ago (pending manager review) and 16 days ago (reviewed)
  const refundSpecs = [
    { daysAgo: 6, approval: "pending" as const, reason: "Member relocated abroad within first week — goodwill refund.", by: U.layla },
    { daysAgo: 16, approval: "approved" as const, reason: "Duplicate card charge confirmed by bank statement.", by: U.layla },
  ];
  refundSpecs.forEach((spec, i) => {
    const candidates = payments.filter(
      (p) => p.type === "payment" && p.status === "completed" && p.method === "card" && !shiftWindowPayments.includes(p),
    );
    const orig = candidates[Math.floor(candidates.length * (0.3 + i * 0.4))];
    if (!orig) return;
    const refundedAt = iso(daysAgo(now, spec.daysAgo, 13));
    const rId = g.nextId();
    const receiptId = g.nextId();
    const rNum = `R-${receiptCounter++}`;
    const refund: Payment = {
      id: rId,
      organizationId: ORG_ID,
      branchId: orig.branchId,
      memberId: orig.memberId,
      chargeId: orig.chargeId,
      type: "refund",
      amount: money(-orig.amount.amount),
      method: orig.method,
      status: "completed",
      receiptId,
      receiptNumber: rNum,
      collectedById: spec.by,
      collectedByName: "Layla Haddad",
      idempotencyKey: `seed-${rId}`,
      originalPaymentId: orig.id,
      refundReason: spec.reason,
      occurredAt: refundedAt,
    };
    orig.status = "refunded";
    orig.refundedAmount = money(orig.amount.amount);
    orig.refundReason = spec.reason;
    payments.push(refund);
    receipts.push({ id: receiptId, receiptNumber: rNum, paymentId: rId, issuedAt: refundedAt });
    const charge = charges.find((c) => c.id === orig.chargeId);
    if (charge) {
      charge.paidAmount = money(0);
      charge.outstandingAmount = charge.total;
      charge.status = "refunded";
    }
    const member = members.find((m) => m.id === orig.memberId);
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: orig.branchId,
      actorId: spec.by,
      actorName: "Layla Haddad",
      actorRole: "manager",
      category: "payments",
      action: "payment.refund",
      entityType: "payment",
      entityId: orig.id,
      entityLabel: `${orig.receiptNumber} · ${member?.fullName ?? ""}`,
      summary: `Refunded JOD ${(orig.amount.amount / 1000).toFixed(3)} (${orig.method})`,
      reason: spec.reason,
      before: { paymentStatus: "completed", chargePaid: orig.amount.amount },
      after: { paymentStatus: "refunded", chargePaid: 0 },
      approvalStatus: spec.approval,
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: refundedAt,
    });
    activities.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      memberId: orig.memberId,
      type: "payment_refunded",
      title: `Payment refunded — JOD ${(orig.amount.amount / 1000).toFixed(3)}`,
      body: spec.reason,
      actorId: spec.by,
      actorName: "Layla Haddad",
      occurredAt: refundedAt,
    });
  });

  // -------------------------------------------------------------------------
  // Cash shifts: 7 days × 2 branches. Two variances. Today = open.
  // -------------------------------------------------------------------------
  const shifts: CashShift[] = [];
  const openShiftByBranch = new Map<UUID, CashShift>();

  const ammanNowMinutes = (now.getTime() + 3 * 3_600_000) % 86_400_000 / 60_000;
  for (let d = 7; d >= 0; d--) {
    for (const branch of branches) {
      const opener = branch.id === BRANCH_ABD ? (d % 2 === 0 ? U.hala : U.tarek) : U.rana;
      const openerName = users.find((u) => u.id === opener)!.name;
      // Today's shift must never open "in the future": before 08:05 local it
      // opened late yesterday (the gym runs until midnight).
      const openedAt =
        d === 0 && ammanNowMinutes < 485
          ? iso(hoursAgo(now, 3))
          : iso(daysAgo(now, d, 8));
      const floatMinor = 50_000;

      const dayPayments = payments.filter((p) => {
        if (p.branchId !== branch.id || p.method !== "cash") return false;
        const pd = todayISODate("Asia/Amman", new Date(p.occurredAt));
        return pd === addDays(today, -d);
      });
      const cashIn = dayPayments.filter((p) => p.type === "payment" && p.status !== "voided").reduce((s, p) => s + p.amount.amount, 0);
      const cashOut = dayPayments.filter((p) => p.type === "refund").reduce((s, p) => s + Math.abs(p.amount.amount), 0);

      if (d === 0) {
        const shift: CashShift = {
          id: g.nextId(),
          organizationId: ORG_ID,
          branchId: branch.id,
          openedById: opener,
          openedByName: openerName,
          openedAt,
          openingFloat: money(floatMinor),
          status: "open",
        };
        shifts.push(shift);
        openShiftByBranch.set(branch.id, shift);
        continue;
      }

      const expected = floatMinor + cashIn - cashOut;
      let counted = expected;
      let explanation: string | undefined;
      let approval: CashShift["varianceApprovalStatus"] = "none";
      if (branch.id === BRANCH_ABD && d === 3) {
        counted = expected - 7_000;
        explanation = "JOD 5 + JOD 2 note likely given as extra change during evening rush. Recount confirmed.";
        approval = "pending";
      } else if (branch.id === BRANCH_SWF && d === 5) {
        counted = expected + 3_500;
        explanation = "Member overpaid for a day pass; agreed to credit it against next visit.";
        approval = "approved";
      }
      const shift: CashShift = {
        id: g.nextId(),
        organizationId: ORG_ID,
        branchId: branch.id,
        openedById: opener,
        openedByName: openerName,
        openedAt,
        openingFloat: money(floatMinor),
        closedAt: iso(daysAgo(now, d, 23)),
        closedById: opener,
        expectedCash: money(expected),
        countedCash: money(counted),
        variance: money(counted - expected),
        varianceExplanation: explanation,
        varianceApprovalStatus: approval,
        status: "closed",
      };
      shifts.push(shift);
      if (approval !== "none") {
        audits.push({
          id: g.nextId(),
          organizationId: ORG_ID,
          branchId: branch.id,
          actorId: opener,
          actorName: openerName,
          actorRole: "receptionist",
          category: "reconciliation",
          action: "shift.close_variance",
          entityType: "cash_shift",
          entityId: shift.id,
          entityLabel: `${branch.name} · shift ${addDays(today, -d)}`,
          summary: `Shift closed with ${counted - expected < 0 ? "shortage" : "surplus"} of JOD ${(Math.abs(counted - expected) / 1000).toFixed(3)}`,
          reason: explanation,
          before: { expectedCash: expected },
          after: { countedCash: counted },
          approvalStatus: approval,
          correlationId: `seed-audit-${g.nextId()}`,
          occurredAt: shift.closedAt!,
        });
      }
    }
  }

  // Link today's cash payments to open shifts
  for (const p of payments) {
    if (p.method !== "cash") continue;
    const pd = todayISODate("Asia/Amman", new Date(p.occurredAt));
    if (pd !== today) continue;
    const shift = openShiftByBranch.get(p.branchId);
    if (shift && p.status !== "voided") p.shiftId = shift.id;
  }

  // -------------------------------------------------------------------------
  // Check-ins: 30 days of history + a live "today" window.
  // -------------------------------------------------------------------------
  const checkIns: CheckInSummary[] = [];
  const membershipOf = new Map(memberships.map((m) => [`${m.memberId}:${m.endDate}`, m]));
  void membershipOf;

  const currentTermByMember = new Map<UUID, MembershipRecord>();
  for (const m of memberships) {
    const existing = currentTermByMember.get(m.memberId);
    if (!existing || m.endDate > existing.endDate) currentTermByMember.set(m.memberId, m);
  }

  const usableMembers = members.filter((m) => {
    if (m.status !== "active") return false;
    const t = currentTermByMember.get(m.id);
    if (!t || t.cancelledAt || t.activeFreeze) return false;
    return t.endDate >= today;
  });

  const visitsUsed = new Map<UUID, number>();
  usableMembers.forEach((m) => {
    const term = currentTermByMember.get(m.id)!;
    const isVisits = term.totalVisits != null;
    const freq = isVisits ? g.int(2, 9) : g.int(3, 16);
    for (let d = 30; d >= 1; d--) {
      if (g.rnd() < freq / 30) {
        const termStart = term.startDate;
        const dateStr = addDays(today, -d);
        if (dateStr < termStart) continue;
        const at = daysAgo(now, d, g.int(6, 22), g.int(0, 59));
        checkIns.push({
          id: g.nextId(),
          memberId: m.id,
          memberName: m.fullName,
          memberNumber: m.memberNumber,
          branchId: m.homeBranchId,
          branchName: branches.find((b) => b.id === m.homeBranchId)!.name,
          decision: "allowed",
          reasonCodes: ["OK"],
          actorId: g.pick(receptionBy[m.homeBranchId] ?? [U.hala]),
          actorName: undefined,
          occurredAt: iso(at),
        });
        if (isVisits) visitsUsed.set(term.id, (visitsUsed.get(term.id) ?? 0) + 1);
      }
    }
  });

  // A couple of historical warning/blocked/overridden check-ins for texture
  const warningMember = expiringMembers[1];
  if (warningMember) {
    checkIns.push({
      id: g.nextId(),
      memberId: warningMember.id,
      memberName: warningMember.fullName,
      memberNumber: warningMember.memberNumber,
      branchId: warningMember.homeBranchId,
      branchName: branches.find((b) => b.id === warningMember.homeBranchId)!.name,
      decision: "warning",
      reasonCodes: ["EXPIRES_SOON"],
      actorId: U.hala,
      occurredAt: iso(daysAgo(now, 1, 18, 40)),
    });
  }
  const expiredExample = expiredMembers[2];
  if (expiredExample) {
    checkIns.push({
      id: g.nextId(),
      memberId: expiredExample.id,
      memberName: expiredExample.fullName,
      memberNumber: expiredExample.memberNumber,
      branchId: expiredExample.homeBranchId,
      branchName: branches.find((b) => b.id === expiredExample.homeBranchId)!.name,
      decision: "blocked",
      reasonCodes: ["MEMBERSHIP_EXPIRED"],
      actorId: U.rana,
      occurredAt: iso(daysAgo(now, 2, 19, 5)),
    });
  }
  const overrideMember = expiredMembers[5];
  if (overrideMember) {
    checkIns.push({
      id: g.nextId(),
      memberId: overrideMember.id,
      memberName: overrideMember.fullName,
      memberNumber: overrideMember.memberNumber,
      branchId: overrideMember.homeBranchId,
      branchName: branches.find((b) => b.id === overrideMember.homeBranchId)!.name,
      decision: "overridden",
      reasonCodes: ["MEMBERSHIP_EXPIRED", "MANUAL_OVERRIDE"],
      actorId: U.layla,
      actorName: "Layla Haddad",
      overrideReason: "Renewal payment promised tomorrow; manager allowed entry as goodwill.",
      occurredAt: iso(daysAgo(now, 4, 17, 30)),
    });
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: overrideMember.homeBranchId,
      actorId: U.layla,
      actorName: "Layla Haddad",
      actorRole: "manager",
      category: "checkins",
      action: "checkin.override",
      entityType: "member",
      entityId: overrideMember.id,
      entityLabel: `${overrideMember.fullName} · ${overrideMember.memberNumber}`,
      summary: "Manual check-in override on expired membership",
      reason: "Renewal payment promised tomorrow; manager allowed entry as goodwill.",
      before: { decision: "blocked" },
      after: { decision: "overridden" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: iso(daysAgo(now, 4, 17, 30)),
    });
  }

  // Today's live check-ins — always within opening hours (05:45 → now local).
  const ammanNow = new Date(now.getTime() + 3 * 3_600_000);
  const openTodayUtc = Date.UTC(ammanNow.getUTCFullYear(), ammanNow.getUTCMonth(), ammanNow.getUTCDate(), 2, 45) - 3 * 3_600_000; // 05:45 Amman in UTC
  const earliest = Math.max(openTodayUtc, now.getTime() - 10 * 3_600_000);
  const spanMinutes = Math.max(30, (now.getTime() - earliest) / 60_000);
  const todayCheckInCount = spanMinutes < 240 ? 4 : 16;
  const todaysMembers = [...usableMembers].sort(() => g.rnd() - 0.5).slice(0, todayCheckInCount);
  todaysMembers.forEach((m, i) => {
    const branchId = m.homeBranchId;
    const minutesAgo = i < 5 ? g.int(8, Math.min(85, Math.floor(spanMinutes) - 1)) : g.int(90, Math.floor(spanMinutes));
    const at = new Date(now.getTime() - minutesAgo * 60_000);
    const term = currentTermByMember.get(m.id)!;
    const isVisits = term.totalVisits != null;
    checkIns.push({
      id: g.nextId(),
      memberId: m.id,
      memberName: m.fullName,
      memberNumber: m.memberNumber,
      branchId,
      branchName: branches.find((b) => b.id === branchId)!.name,
      decision: i === 6 ? "warning" : "allowed",
      reasonCodes: i === 6 ? ["EXPIRES_SOON"] : ["OK"],
      actorId: g.pick(receptionBy[branchId] ?? [U.hala]),
      occurredAt: iso(at),
    });
    if (isVisits) visitsUsed.set(term.id, (visitsUsed.get(term.id) ?? 0) + 1);
  });

  // Apply visit consumption (keep at least a couple with 0 remaining → depleted)
  for (const term of memberships) {
    if (term.totalVisits == null) continue;
    const used = visitsUsed.get(term.id) ?? 0;
    term.remainingVisits = Math.max(0, term.totalVisits - used);
  }
  // Force one depleted pass for the demo
  const visitsTerms = memberships.filter((m) => m.totalVisits != null && m.endDate >= today && !m.cancelledAt);
  if (visitsTerms[0]) visitsTerms[0].remainingVisits = 0;

  // -------------------------------------------------------------------------
  // Leads, offers, lead timelines
  // -------------------------------------------------------------------------
  const leads: LeadRecord[] = [];
  const leadStages: Array<[Lead["stage"], number]> = [
    ["new", 6],
    ["attempted", 5],
    ["contacted", 4],
    ["trial_booked", 3],
    ["trial_completed", 3],
    ["offer_sent", 3],
    ["won", 3],
    ["lost", 3],
  ];

  let _leadIdx = 0;
  for (const [stage, count] of leadStages) {
    for (let i = 0; i < count; i++) {
      _leadIdx += 1;
      const id = g.nextId();
      const { first, family } = nameFor();
      const branchId = g.chance(0.5) ? BRANCH_ABD : BRANCH_SWF;
      const createdDaysAgo = stage === "new" ? g.int(0, 2) : g.int(3, 25);
      const ownerId = stage === "new" && i < 2 ? undefined : g.pick(salespeople);
      const created = daysAgo(now, createdDaysAgo, g.int(9, 19));
      const expectedMinor = g.pick([40_000, 105_000, 190_000, 350_000] as const);
      const lead: LeadRecord = {
        id,
        organizationId: ORG_ID,
        branchId,
        fullName: `${first} ${family}`,
        phone: phoneFor(),
        email: g.chance(0.5) ? `${first.toLowerCase()}${g.int(1, 99)}@${g.pick(["gmail.com", "outlook.com"] as const)}` : undefined,
        stage,
        source: g.pick(["instagram", "walk_in", "referral", "whatsapp", "google", "phone_call"] as const),
        ownerId,
        expectedValue: money(expectedMinor),
        createdAt: iso(created),
        updatedAt: iso(created),
      };

      const leadActivities: TimelineEvent[] = [];
      leadActivities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        leadId: id,
        type: "member_created",
        title: "Lead captured",
        body: `Source: ${lead.source?.replace("_", " ")}.`,
        actorId: ownerId,
        actorName: ownerId ? users.find((u) => u.id === ownerId)?.name : undefined,
        occurredAt: iso(created),
      });

      if (stage === "lost") {
        lead.lostReason = g.pick(LOST_REASONS);
        lead.nextFollowUpAt = undefined;
      } else if (stage !== "won") {
        const followInHours = g.pick([-30, -8, -3, 4, 10, 26, 50] as const);
        lead.nextFollowUpAt = iso(hoursAgo(now, -followInHours));
      }

      if (stage === "offer_sent" || (stage === "won" && g.chance(0.8))) {
        const planId = expectedMinor === 350_000 ? P.annual : expectedMinor === 190_000 ? P.semi : expectedMinor === 105_000 ? P.quarterly : P.monthly;
        const plan = planDefs.find((p) => p.id === planId)!;
        const offer: Offer = {
          id: g.nextId(),
          leadId: id,
          planId,
          planName: plan.name,
          price: money(expectedMinor),
          expiresAt: iso(hoursAgo(now, stage === "offer_sent" ? -48 : 24 * 10)),
          status: stage === "won" ? "accepted" : "sent",
          deliveryChannel: "manual",
          deliveredAt: iso(daysAgo(now, Math.max(1, createdDaysAgo - 2))),
          deliveredById: ownerId ?? U.sara,
          deliveryReference: "seeded-demo-delivery",
          createdById: ownerId ?? U.sara,
          createdAt: iso(daysAgo(now, Math.max(1, createdDaysAgo - 2))),
        };
        offers.push(offer);
        leadActivities.push({
          id: g.nextId(),
          organizationId: ORG_ID,
          leadId: id,
          type: "offer_sent",
          title: `Offer delivery confirmed — ${plan.name} at JOD ${(expectedMinor / 1000).toFixed(3)}`,
          body: "Manual delivery confirmed · seeded demo delivery.",
          actorId: offer.createdById,
          actorName: users.find((u) => u.id === offer.createdById)?.name,
          occurredAt: offer.createdAt,
          meta: { offerId: offer.id, channel: "manual" },
        });
      }

      if (stage !== "new") {
        const attempts = stage === "attempted" ? g.int(1, 2) : g.int(2, 4);
        for (let a = 0; a < attempts; a++) {
          const at = daysAgo(now, Math.max(0, createdDaysAgo - a - 1), g.int(10, 20));
          const outcome = a === attempts - 1 && (stage === "trial_booked" || stage === "trial_completed") ? "trial_booked" : g.pick(["no_answer", "answered_interested", "answered_call_back", "whatsapp_sent"] as const);
          leadActivities.push({
            id: g.nextId(),
            organizationId: ORG_ID,
            leadId: id,
            type: "call_attempt",
            title: `Call — ${outcome.replace(/_/g, " ")}`,
            body: g.pick(CALL_NOTE_POOL),
            actorId: ownerId ?? U.sara,
            actorName: users.find((u) => u.id === (ownerId ?? U.sara))?.name,
            occurredAt: iso(at),
            meta: { outcome },
          });
        }
      }

      if (stage === "won") {
        // The converted member is one of the already-seeded active members;
        // link the most recent "active_long" members created today-ish.
        lead.convertedMemberId = undefined;
      }

      activities.push(...leadActivities);
      leads.push(lead);
    }
  }

  // Link won leads to 3 recently-joined active members
  const wonLeads = leads.filter((l) => l.stage === "won");
  const joinCandidates = members
    .filter((m) => m.status === "active" && currentTermByMember.has(m.id))
    .slice(0, 3);
  wonLeads.forEach((lead, i) => {
    const member = joinCandidates[i];
    if (!member) return;
    lead.convertedMemberId = member.id;
    member.source = lead.source;
    member.assignedSalespersonId = lead.ownerId;
    activities.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      leadId: lead.id,
      memberId: member.id,
      type: "lead_converted",
      title: `Lead converted — ${member.fullName} became ${member.memberNumber}`,
      actorId: lead.ownerId,
      actorName: lead.ownerId ? users.find((u) => u.id === lead.ownerId)?.name : undefined,
      occurredAt: member.createdAt,
    });
  });

  // -------------------------------------------------------------------------
  // Tasks
  // -------------------------------------------------------------------------
  const openLeads = leads.filter((l) => !["won", "lost"].includes(l.stage));
  openLeads.forEach((lead, i) => {
    if (!lead.nextFollowUpAt || !lead.ownerId) return;
    if (i % 3 === 2) return; // leave some without tasks (they're automation candidates)
    const dueAt = lead.nextFollowUpAt;
    const overdue = dueAt < iso(now);
    tasks.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      type: "follow_up",
      title: `Follow up — ${lead.fullName}`,
      ownerId: lead.ownerId,
      ownerName: users.find((u) => u.id === lead.ownerId)!.name,
      dueAt,
      priority: overdue ? "high" : "normal",
      status: "open",
      leadId: lead.id,
      subjectName: lead.fullName,
      createdById: lead.ownerId,
      createdAt: lead.createdAt,
    });
  });

  // Renewal call tasks for a slice of expiring members
  expiringMembers.slice(2, 7).forEach((m, i) => {
    const term = currentTermByMember.get(m.id)!;
    const ownerId = m.assignedSalespersonId ?? g.pick(salespeople);
    tasks.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      type: "renewal_call",
      title: `Renewal call — expires ${term.endDate}`,
      ownerId,
      ownerName: users.find((u) => u.id === ownerId)!.name,
      dueAt: iso(hoursAgo(now, i < 2 ? -6 : 20 + i * 8)),
      priority: i < 2 ? "high" : "normal",
      status: "open",
      memberId: m.id,
      subjectName: m.fullName,
      createdById: U.layla,
      createdAt: iso(daysAgo(now, 2)),
    });
  });

  // Completed tasks for the leaderboard
  salespeople.forEach((sp) => {
    for (let i = 0; i < 4; i++) {
      const m = g.pick(members);
      tasks.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        type: g.chance(0.6) ? "follow_up" : "renewal_call",
        title: g.chance(0.6) ? `Follow up — ${m.fullName}` : `Renewal call — ${m.fullName}`,
        ownerId: sp,
        ownerName: users.find((u) => u.id === sp)!.name,
        dueAt: iso(daysAgo(now, g.int(1, 12))),
        priority: "normal",
        status: "completed",
        memberId: m.id,
        subjectName: m.fullName,
        outcome: g.pick(RENEWAL_OUTCOME_POOL),
        completedAt: iso(daysAgo(now, g.int(0, 6))),
        createdById: sp,
        createdAt: iso(daysAgo(now, g.int(13, 20))),
      });
    }
  });

  // Outstanding-payment collection tasks
  const outstandingCharges = charges.filter((c) => c.outstandingAmount.amount > 0 && c.status !== "refunded");
  outstandingCharges.slice(0, 3).forEach((c) => {
    const m = members.find((x) => x.id === c.memberId)!;
    tasks.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      type: "payment_collection",
      title: `Collect outstanding JOD ${(c.outstandingAmount.amount / 1000).toFixed(3)}`,
      ownerId: m.assignedSalespersonId ?? U.sara,
      ownerName: users.find((u) => u.id === (m.assignedSalespersonId ?? U.sara))!.name,
      dueAt: iso(hoursAgo(now, g.int(-20, 30))),
      priority: "high",
      status: "open",
      memberId: m.id,
      subjectName: m.fullName,
      createdById: U.layla,
      createdAt: iso(daysAgo(now, 3)),
    });
  });

  // -------------------------------------------------------------------------
  // Member notes & sales-call activities for timelines
  // -------------------------------------------------------------------------
  members.forEach((m) => {
    if (m.assignedSalespersonId && g.chance(0.35)) {
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: m.id,
        type: "call_attempt",
        title: "Renewal call — interested",
        body: g.pick(RENEWAL_OUTCOME_POOL),
        actorId: m.assignedSalespersonId,
        actorName: users.find((u) => u.id === m.assignedSalespersonId)?.name,
        occurredAt: iso(daysAgo(now, g.int(1, 15))),
        meta: { outcome: "answered_interested" },
      });
    }
    if (g.chance(0.3)) {
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: m.id,
        type: "note",
        title: "Note added",
        body: g.pick(NOTE_POOL),
        actorId: g.pick([U.hala, U.layla, U.sara] as const),
        actorName: undefined,
        occurredAt: iso(daysAgo(now, g.int(2, 60))),
      });
    }
  });

  // Membership sale/renewal/freeze/cancel activities from records
  for (const term of memberships) {
    const plan = planDefs.find((p) => p.id === term.planId)!;
    const actor = users.find((u) => u.id === term.soldById);
    const isRenewal = Boolean(term.previousMembershipId);
    activities.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      memberId: term.memberId,
      type: isRenewal ? "membership_renewed" : "membership_sold",
      title: `${plan.name} ${isRenewal ? "membership renewed" : "membership sold"}`,
      body: `Term ${term.startDate} → ${term.endDate}.`,
      actorId: term.soldById,
      actorName: actor?.name,
      occurredAt: term.createdAt,
      meta: { membershipId: term.id },
    });
    for (const freeze of term.freezes) {
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: term.memberId,
        type: "membership_frozen",
        title: `Membership frozen ${freeze.startDate} → ${freeze.endDate}`,
        body: freeze.reason,
        actorId: freeze.createdById,
        actorName: users.find((u) => u.id === freeze.createdById)?.name,
        occurredAt: freeze.createdAt,
        meta: { membershipId: term.id },
      });
    }
    if (term.cancelledAt) {
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: term.memberId,
        type: "membership_cancelled",
        title: "Membership cancelled",
        body: term.cancellationReason,
        actorId: U.layla,
        actorName: "Layla Haddad",
        occurredAt: term.cancelledAt,
        meta: { membershipId: term.id },
      });
    }
  }

  // Payment activities
  for (const p of payments) {
    if (p.status === "voided") {
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: p.memberId,
        type: "payment_voided",
        title: `Payment voided — ${p.receiptNumber}`,
        body: p.voidReason,
        actorId: p.collectedById,
        actorName: p.collectedByName,
        occurredAt: p.occurredAt,
      });
      continue;
    }
    if (p.type === "refund") continue; // refund activity already added above
    activities.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      memberId: p.memberId,
      type: "payment_collected",
      title: `Payment collected — JOD ${(p.amount.amount / 1000).toFixed(3)} ${p.method.replace("_", " ")}`,
      actorId: p.collectedById,
      actorName: p.collectedByName,
      occurredAt: p.occurredAt,
      meta: { receiptNumber: p.receiptNumber, receiptId: p.receiptId },
    });
  }

  // Check-in activities (recent only, to keep timelines readable)
  for (const c of checkIns) {
    if (c.occurredAt < iso(daysAgo(now, 14))) continue;
    activities.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      memberId: c.memberId,
      type: "check_in",
      title: `Checked in — ${c.branchName}`,
      actorId: c.actorId,
      occurredAt: c.occurredAt,
      meta: { decision: c.decision },
    });
  }

  // -------------------------------------------------------------------------
  // Automation rules, templates, executions
  // -------------------------------------------------------------------------
  const templates: MessageTemplate[] = [
    {
      id: TEMPLATE_IDS.renewal,
      name: "Renewal reminder",
      channel: "whatsapp",
      bodyEn: "Hi {{member_name}}, your {{gym_name}} membership ends on {{end_date}}. Renew at the {{branch_name}} desk or reply here and we'll sort it out. — {{gym_name}}",
      bodyAr: "مرحباً {{member_name}}، عضويتك في {{gym_name}} تنتهي بتاريخ {{end_date}}. جدّد من كاونتر فرع {{branch_name}} أو رد على هذه الرسالة وسنرتبها لك. — {{gym_name}}",
      variables: ["member_name", "end_date", "branch_name", "gym_name"],
    },
    {
      id: TEMPLATE_IDS.winback,
      name: "Expired win-back",
      channel: "whatsapp",
      bodyEn: "Hi {{member_name}}, we miss you at {{gym_name}}! Your membership ended on {{end_date}}. Come back this week and we'll waive the sign-up fee.",
      bodyAr: "مرحباً {{member_name}}، اشتقنا لك في {{gym_name}}! انتهت عضويتك بتاريخ {{end_date}}. عُد هذا الأسبوع وسنعفيك من رسوم التسجيل.",
      variables: ["member_name", "end_date", "gym_name"],
    },
    {
      id: TEMPLATE_IDS.payment,
      name: "Outstanding balance",
      channel: "sms",
      bodyEn: "{{gym_name}}: Hi {{member_name}}, a balance of JOD {{amount}} is outstanding on your account. You can settle it at the {{branch_name}} desk. Thank you!",
      bodyAr: "{{gym_name}}: مرحباً {{member_name}}، يوجد رصيد متبقٍ بقيمة {{amount}} دينار على حسابك. يمكنك تسديده في فرع {{branch_name}}. شكراً لك!",
      variables: ["member_name", "amount", "branch_name", "gym_name"],
    },
  ];

  const rules: AutomationRule[] = [
    { id: RULE_IDS.expiry, organizationId: ORG_ID, name: "Renewal reminder — 14 & 3 days", trigger: "membership_expiring", triggerParams: { daysBefore: [14, 3] }, actions: [{ key: "queue_message", templateId: TEMPLATE_IDS.renewal, channel: "whatsapp" }, { key: "create_task", taskOwnerRole: "salesperson", taskTitle: "Renewal call" }], enabled: true, dedupeWindowHours: 72, lastRunAt: iso(hoursAgo(now, 5)), executionsLast30Days: 86, updatedAt: iso(daysAgo(now, 20)) },
    { id: RULE_IDS.expired, organizationId: ORG_ID, name: "Expired membership win-back", trigger: "membership_expired", triggerParams: { daysAfter: 1 }, actions: [{ key: "queue_message", templateId: TEMPLATE_IDS.winback, channel: "whatsapp" }], enabled: true, dedupeWindowHours: 168, lastRunAt: iso(hoursAgo(now, 5)), executionsLast30Days: 24, updatedAt: iso(daysAgo(now, 20)) },
    { id: RULE_IDS.inactive, organizationId: ORG_ID, name: "Inactive member — 21 days", trigger: "member_inactive", triggerParams: { days: 21 }, actions: [{ key: "create_task", taskOwnerRole: "salesperson", taskTitle: "Re-engagement call" }], enabled: true, dedupeWindowHours: 336, lastRunAt: iso(hoursAgo(now, 5)), executionsLast30Days: 17, updatedAt: iso(daysAgo(now, 12)) },
    { id: RULE_IDS.leadUntouched, organizationId: ORG_ID, name: "New lead untouched — 24h", trigger: "lead_untouched", triggerParams: { hours: 24 }, actions: [{ key: "notify_manager" }, { key: "create_task", taskOwnerRole: "salesperson", taskTitle: "First contact" }], enabled: true, dedupeWindowHours: 48, lastRunAt: iso(hoursAgo(now, 2)), executionsLast30Days: 31, updatedAt: iso(daysAgo(now, 8)) },
    { id: RULE_IDS.followUpOverdue, organizationId: ORG_ID, name: "Follow-up overdue", trigger: "follow_up_overdue", triggerParams: { hours: 4 }, actions: [{ key: "notify_manager" }], enabled: true, dedupeWindowHours: 24, lastRunAt: iso(hoursAgo(now, 1)), executionsLast30Days: 44, updatedAt: iso(daysAgo(now, 8)) },
    { id: RULE_IDS.outstanding, organizationId: ORG_ID, name: "Outstanding payment — 7 days", trigger: "payment_outstanding", triggerParams: { days: 7 }, actions: [{ key: "queue_message", templateId: TEMPLATE_IDS.payment, channel: "sms" }], enabled: false, dedupeWindowHours: 168, lastRunAt: iso(daysAgo(now, 9)), executionsLast30Days: 6, updatedAt: iso(daysAgo(now, 9)) },
  ];

  const executions: AutomationExecution[] = [];
  for (let i = 0; i < 52; i++) {
    const rule = g.pick(rules);
    const member = g.pick(members);
    const at = iso(hoursAgo(now, g.int(1, 24 * 14)));
    const failed = g.chance(0.06);
    const skipped = !failed && g.chance(0.1);
    const action = rule.actions[0]?.key ?? "notify_manager";
    executions.push({
      id: g.nextId(),
      ruleId: rule.id,
      ruleName: rule.name,
      subjectType: rule.trigger.startsWith("lead") || rule.trigger === "follow_up_overdue" ? "lead" : "member",
      subjectId: member.id,
      subjectName: member.fullName,
      action,
      status: failed ? "failed" : skipped ? "skipped_duplicate" : "success",
      detail: failed
        ? "Provider rejected: recipient not on WhatsApp (sandbox)"
        : skipped
          ? "Suppressed — same action ran within the dedupe window"
          : action === "queue_message"
            ? `Queued ${rule.actions[0]?.channel ?? "whatsapp"} via sandbox provider`
            : action === "create_task"
              ? "Task created and assigned"
              : "Manager notified in-app",
      executedAt: at,
    });
  }

  // A few automation activities on member timelines
  executions
    .filter((e) => e.action === "queue_message" && e.status === "success")
    .slice(0, 12)
    .forEach((e) => {
      activities.push({
        id: g.nextId(),
        organizationId: ORG_ID,
        memberId: e.subjectId,
        type: "automation",
        title: `Automation: ${e.ruleName}`,
        body: e.detail,
        occurredAt: e.executedAt,
      });
    });

  // -------------------------------------------------------------------------
  // Remaining audit events (discounts, freezes, user admin, settings)
  // -------------------------------------------------------------------------
  const pendingDiscountTerm = memberships.find((m) => m.discountApprovalStatus === "pending");
  if (pendingDiscountTerm) {
    const member = members.find((m) => m.id === pendingDiscountTerm.memberId)!;
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: pendingDiscountTerm.homeBranchId,
      actorId: U.karim,
      actorName: "Karim Awad",
      actorRole: "salesperson",
      category: "payments",
      action: "membership.discount",
      entityType: "membership",
      entityId: pendingDiscountTerm.id,
      entityLabel: `${member.fullName} · ${member.memberNumber}`,
      summary: "Discount of JOD 20.000 exceeds salesperson limit (JOD 10.000)",
      reason: pendingDiscountTerm.discountReason,
      before: { price: pendingDiscountTerm.salePrice.amount },
      after: { discount: pendingDiscountTerm.discount.amount },
      approvalStatus: "pending",
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: pendingDiscountTerm.createdAt,
    });
  }
  const approvedDiscountTerm = memberships.find((m) => m.discountApprovalStatus === "approved");
  if (approvedDiscountTerm) {
    const member = members.find((m) => m.id === approvedDiscountTerm.memberId)!;
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: approvedDiscountTerm.homeBranchId,
      actorId: U.sara,
      actorName: "Sara Abuhamdan",
      actorRole: "salesperson",
      category: "payments",
      action: "membership.discount",
      entityType: "membership",
      entityId: approvedDiscountTerm.id,
      entityLabel: `${member.fullName} · ${member.memberNumber}`,
      summary: "Discount of JOD 15.000 approved by Layla Haddad",
      reason: approvedDiscountTerm.discountReason,
      before: { price: approvedDiscountTerm.salePrice.amount },
      after: { discount: approvedDiscountTerm.discount.amount },
      approvalStatus: "approved",
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: approvedDiscountTerm.createdAt,
    });
  }

  for (const term of memberships.filter((m) => m.activeFreeze).slice(0, 3)) {
    const member = members.find((m) => m.id === term.memberId)!;
    const freezeActor = users.find((u) => u.id === term.activeFreeze!.createdById);
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: term.homeBranchId,
      actorId: term.activeFreeze!.createdById,
      actorName: freezeActor?.name ?? "Staff",
      actorRole: freezeActor?.role ?? "receptionist",
      category: "memberships",
      action: "membership.freeze",
      entityType: "membership",
      entityId: term.id,
      entityLabel: `${member.fullName} · ${member.memberNumber}`,
      summary: `Frozen ${term.activeFreeze!.startDate} → ${term.activeFreeze!.endDate}`,
      reason: term.activeFreeze!.reason,
      before: { endDate: addDays(term.endDate, -diffDays(term.activeFreeze!.startDate, term.activeFreeze!.endDate)) },
      after: { endDate: term.endDate },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: term.activeFreeze!.createdAt,
    });
  }

  audits.push(
    {
      id: g.nextId(),
      organizationId: ORG_ID,
      actorId: U.omar,
      actorName: "Omar Al-Khatib",
      actorRole: "owner",
      category: "users",
      action: "user.invite",
      entityType: "user",
      entityId: U.sanad,
      entityLabel: "Sanad Khries",
      summary: "Invited as receptionist — Forge — Sweifieh",
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: iso(daysAgo(now, 2)),
    },
    {
      id: g.nextId(),
      organizationId: ORG_ID,
      actorId: U.omar,
      actorName: "Omar Al-Khatib",
      actorRole: "owner",
      category: "users",
      action: "user.deactivate",
      entityType: "user",
      entityId: U.rania,
      entityLabel: "Rania Hijazi",
      summary: "Account deactivated — employment ended",
      reason: "Offboarding checklist completed; leads reassigned to Sara Abuhamdan.",
      before: { status: "active" },
      after: { status: "deactivated" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: iso(daysAgo(now, 34)),
    },
    {
      id: g.nextId(),
      organizationId: ORG_ID,
      actorId: U.layla,
      actorName: "Layla Haddad",
      actorRole: "manager",
      category: "settings",
      action: "settings.receipt_footer",
      entityType: "organization",
      entityId: ORG_ID,
      entityLabel: "Forge Fitness Club",
      summary: "Receipt footer updated",
      before: { receiptFooter: "Thank you for training with us." },
      after: { receiptFooter: "Thank you for training with Forge. Follow @forgefitness.jo" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: iso(daysAgo(now, 6)),
    },
    {
      id: g.nextId(),
      organizationId: ORG_ID,
      actorId: U.omar,
      actorName: "Omar Al-Khatib",
      actorRole: "owner",
      category: "automations",
      action: "automation.rule_disabled",
      entityType: "automation_rule",
      entityId: RULE_IDS.outstanding,
      entityLabel: "Outstanding payment — 7 days",
      summary: "Rule disabled — switched to manual collection calls for now",
      before: { enabled: "yes" },
      after: { enabled: "no" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: iso(daysAgo(now, 9)),
    },
    {
      id: g.nextId(),
      organizationId: ORG_ID,
      actorId: U.omar,
      actorName: "Omar Al-Khatib",
      actorRole: "owner",
      category: "users",
      action: "role.permissions_change",
      entityType: "role",
      entityId: U.layla, // display anchor
      entityLabel: "Sales role",
      summary: "Removed payments.refund from the Sales role",
      before: { "payments.refund": "granted" },
      after: { "payments.refund": "removed" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: iso(daysAgo(now, 15)),
    },
  );

  // Member archive audit
  const archivedMember = members.find((m) => m.status === "archived");
  if (archivedMember) {
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: archivedMember.homeBranchId,
      actorId: U.layla,
      actorName: "Layla Haddad",
      actorRole: "manager",
      category: "members",
      action: "member.archive",
      entityType: "member",
      entityId: archivedMember.id,
      entityLabel: `${archivedMember.fullName} · ${archivedMember.memberNumber}`,
      summary: "Member archived",
      reason: "Duplicate profile merged after phone verification.",
      before: { status: "active" },
      after: { status: "archived" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: archivedMember.archivedAt!,
    });
  }

  // Void audit for today's voided payment
  const voidedPayment = payments.find((p) => p.status === "voided");
  if (voidedPayment) {
    const member = members.find((m) => m.id === voidedPayment.memberId)!;
    audits.push({
      id: g.nextId(),
      organizationId: ORG_ID,
      branchId: voidedPayment.branchId,
      actorId: U.tarek,
      actorName: "Tarek Azar",
      actorRole: "receptionist",
      category: "payments",
      action: "payment.void",
      entityType: "payment",
      entityId: voidedPayment.id,
      entityLabel: `${voidedPayment.receiptNumber} · ${member.fullName}`,
      summary: `Voided JOD ${(voidedPayment.amount.amount / 1000).toFixed(3)} (${voidedPayment.method})`,
      reason: voidedPayment.voidReason,
      before: { status: "completed" },
      after: { status: "voided" },
      correlationId: `seed-audit-${g.nextId()}`,
      occurredAt: voidedPayment.occurredAt,
    });
  }

  // -------------------------------------------------------------------------
  // Organization settings
  // -------------------------------------------------------------------------
  const operationsZone: import("@/lib/domain/types").Zone = {
    id: OPS_IDS.zone,
    organizationId: ORG_ID,
    branchId: BRANCH_ABD,
    code: "MAIN-FLOOR",
    name: "Main floor",
    nameAr: "الطابق الرئيسي",
    kind: "floor",
    capacity: 80,
    status: "active",
    createdAt: iso(daysAgo(now, 30)),
    updatedAt: iso(daysAgo(now, 30)),
  };
  const products: Product[] = [
    { id: OPS_IDS.creatine, organizationId: ORG_ID, sku: "SUP-CREATINE", name: "Creatine monohydrate", unit: "serving", reorderPoint: 20, targetLevel: 80, supplierLeadTimeDays: 5, preferredSupplierId: OPS_IDS.supplier, defaultUnitCost: money(650, "JOD"), status: "active", createdAt: iso(daysAgo(now, 45)), updatedAt: iso(daysAgo(now, 2)) },
    { id: OPS_IDS.protein, organizationId: ORG_ID, sku: "SUP-PROTEIN", name: "Protein bar", unit: "each", reorderPoint: 12, targetLevel: 60, supplierLeadTimeDays: 3, defaultUnitCost: money(450, "JOD"), status: "active", createdAt: iso(daysAgo(now, 45)), updatedAt: iso(daysAgo(now, 2)) },
  ];
  const suppliers: Supplier[] = [{ id: OPS_IDS.supplier, organizationId: ORG_ID, name: "Jordan Sports Supply", contactName: "Maya Haddad", email: "orders@jss.example", phone: "+962 79 700 1000", terms: "Net 15", leadTimeDays: 5, branchIds: [BRANCH_ABD, BRANCH_SWF], preferredProductIds: [OPS_IDS.creatine, OPS_IDS.protein], status: "active", createdAt: iso(daysAgo(now, 60)), updatedAt: iso(daysAgo(now, 7)) }];
  const inventoryBalances: InventoryBalance[] = [
    { id: seedUuid(78), organizationId: ORG_ID, branchId: BRANCH_ABD, productId: OPS_IDS.creatine, quantityOnHand: 16, committedQuantity: 0, availableQuantity: 16, lastMovementAt: iso(daysAgo(now, 1)), updatedAt: iso(daysAgo(now, 1)) },
    { id: seedUuid(79), organizationId: ORG_ID, branchId: BRANCH_ABD, productId: OPS_IDS.protein, quantityOnHand: 42, committedQuantity: 0, availableQuantity: 42, lastMovementAt: iso(daysAgo(now, 1)), updatedAt: iso(daysAgo(now, 1)) },
  ];
  const stockMovements: StockMovement[] = [{ id: seedUuid(80), organizationId: ORG_ID, branchId: BRANCH_ABD, productId: OPS_IDS.creatine, type: "receive", quantityDelta: 40, quantity: 40, unitCost: money(650, "JOD"), referenceType: "opening_balance", idempotencyKey: "seed-opening-creatine", financialPostingStatus: "not_posted", occurredAt: iso(daysAgo(now, 30)), createdAt: iso(daysAgo(now, 30)), createdById: U.omar }];
  const lowStockAlerts: LowStockAlert[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const facilityTasks: FacilityTask[] = [{ id: OPS_IDS.facility, organizationId: ORG_ID, branchId: BRANCH_ABD, zoneId: OPS_IDS.zone, zoneName: operationsZone.name, kind: "cleaning", severity: "medium", status: "open", title: "Main floor inspection", notes: "Check supplies and wipe high-touch surfaces.", assigneeId: U.hala, trafficContext: { checkInsLastHour: 18, occupancyPercent: 72, capturedAt: iso(hoursAgo(now, 1)) }, financialPostingStatus: "not_posted", createdAt: iso(daysAgo(now, 1)), updatedAt: iso(daysAgo(now, 1)) }];
  const equipmentAssets: EquipmentAsset[] = [{ id: OPS_IDS.asset, organizationId: ORG_ID, branchId: BRANCH_ABD, zoneId: OPS_IDS.zone, code: "TREAD-01", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity 95Ti", serialNumber: "LF-AB-001", purchaseDate: iso(daysAgo(now, 900)).slice(0, 10), purchaseCost: money(2_900_000, "JOD"), warrantyEndDate: iso(daysAgo(now, 170)).slice(0, 10), status: "maintenance", expectedServiceIntervalDays: 90, expectedUsefulLifeMonths: 84, createdAt: iso(daysAgo(now, 900)), updatedAt: iso(daysAgo(now, 4)) }];
  const equipmentIssues: EquipmentIssue[] = [{ id: OPS_IDS.issue, organizationId: ORG_ID, branchId: BRANCH_ABD, assetId: OPS_IDS.asset, title: "Belt slipping under load", description: "Reported by front desk during evening peak.", severity: "high", status: "in_progress", reportedAt: iso(daysAgo(now, 4)), downtimeDays: 2, safetyStatus: "out_of_service", createdById: U.hala }];
  const equipmentWorkOrders: EquipmentWorkOrder[] = [{ id: OPS_IDS.workOrder, organizationId: ORG_ID, branchId: BRANCH_ABD, assetId: OPS_IDS.asset, issueId: OPS_IDS.issue, status: "approved", description: "Inspect belt and motor; quote replacement.", assigneeId: U.layla, vendorName: "Life Fitness service", partsCost: money(220_000, "JOD"), laborCost: money(80_000, "JOD"), totalCost: money(300_000, "JOD"), replacementEstimate: money(1_900_000, "JOD"), financialPostingStatus: "pending", openedAt: iso(daysAgo(now, 4)), updatedAt: iso(daysAgo(now, 3)) }];
  const db: MockDb = {
    organization: {
      id: ORG_ID,
      name: "Forge Fitness Club",
      slug: "forge-fitness",
      currency: "JOD",
      timezone: "Asia/Amman",
      locale: "en-JO",
      defaultLanguage: "en",
      taxRatePercent: 0,
      receiptPrefix: "R-",
      nextReceiptNumber: receiptCounter,
      receiptFooter: "Thank you for training with Forge. Follow @forgefitness.jo",
      status: "active",
      subscriptionPlan: "Pro",
      billingInterval: "monthly",
      subscriptionStartedAt: iso(subscriptionStartedAt),
      currentPeriodEndsAt: iso(currentPeriodEndsAt),
    },
    brand: {
      organizationId: ORG_ID,
      paletteKey: "rivet",
      primaryColor: BRAND_PALETTE_PRESETS.rivet,
      tokens: deriveBrandTokens(BRAND_PALETTE_PRESETS.rivet),
      version: 0,
    },
    branches,
    zones: [operationsZone],
    products,
    suppliers,
    inventoryBalances,
    stockMovements,
    lowStockAlerts,
    purchaseOrders,
    facilityTasks,
    equipmentAssets,
    equipmentIssues,
    equipmentWorkOrders,
    users,
    roles: defaultRoleDefinitions(),
    paymentMethods: [
      { key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true },
      { key: "card", label: "Card (POS terminal)", enabled: true, affectsCashDrawer: false },
      { key: "bank_transfer", label: "Bank transfer", enabled: true, affectsCashDrawer: false },
      { key: "cliq", label: "CliQ instant transfer", enabled: true, affectsCashDrawer: false },
      { key: "other", label: "Other / adjustment", enabled: false, affectsCashDrawer: false },
    ],
    notificationSettings: {
      managerAlerts: { cashVariance: true, refundOrVoid: true, checkinOverride: true, discountApproval: true },
      renewalRecoveryEnabled: false,
      automationDeliveryMode: "sandbox",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    },
    organizationEntitlements: {
      organizationId: ORG_ID,
      catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
      subscriptionPlan: "Pro",
      entitledModules: entitledModulesForPlan("Pro"),
      source: "subscription_plan",
      updatedAt: iso(now),
    },
    workspaceModulePreferences: {
      organizationId: ORG_ID,
      catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
      enabledModules: defaultWorkspacePreferences(entitledModulesForPlan()),
      updatedAt: iso(now),
      updatedById: U.omar,
    },
    operationalPolicies: {
      entry: {
        outstandingBalance: "warn",
        expiryWarningDays: 7,
        duplicateScanWindowMinutes: 2,
        enforceOperatingHours: false,
      },
      membership: {
        allowOverlappingMemberships: false,
        renewalWindowDays: 14,
        minimumFreezeDays: 1,
        maximumExtensionDays: 365,
      },
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 },
      operatingHours: [],
      trialSchedules: [],
    },
    members,
    memberships,
    plans: planDefs.map((p) => ({ ...p, activeSubscribers: 0 })),
    charges,
    payments,
    receipts,
    shifts,
    checkIns: checkIns.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    leads,
    offers,
    tasks,
    activities: activities.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    audits: audits.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)),
    rules,
    executions: executions.sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1)),
    templates,
    session: { userId: U.omar, activeBranchId: undefined },
    counters: { receiptNumber: receiptCounter, memberNumber: memberCounter },
  };

  return db;
}
