import type {
  AuditQuery,
  DashboardQuery,
  ExecutionQuery,
  GymOSApi,
  LeadListQuery,
  MemberListQuery,
  MembershipListQuery,
  MockBehavior,
  PlanListQuery,
  RecentCheckInQuery,
  RenewalQueueQuery,
  TaskListQuery,
  TimelineQuery,
  TransactionListQuery,
  UserListQuery,
  PlatformBillingInvoice,
  PlatformGymDetail,
  PlatformData,
  PlatformGymApplication,
  PlatformSnapshot,
  PlatformSupportCase,
  PlatformSaasPlan,
  EntryPass,
  SubmitGymApplicationInput,
  SubmitGymApplicationResult,
  ReviewGymApplicationInput,
  SaveGymApplicationReviewNoteInput,
  ProvisionGymInput,
  GymProvisioningResult,
  UpdatePlatformGymInput,
  UpdatePlatformPlanInput,
  CreatePlatformInvoiceInput,
  RecordPlatformInvoicePaymentInput,
  CreateSupportCaseInput,
  OperationalNotification,
  MemberImportCommitInput,
  MemberImportCommitResult,
  MemberImportPreview,
  MemberImportRow,
  CustomerExperience,
} from "@/lib/api/GymOSApi";
import { DEFAULT_BEHAVIOR } from "@/lib/api/GymOSApi";
import { ApiError, ERR } from "@/lib/api/errors";
import { discountNeedsApproval, type Permission } from "@/lib/domain/permissions";
import { ptAvailableCredits, ptCancellationResult, ptPackageLadderIsValid, selectPtEntitlement } from "@/lib/domain/personal-training";
import { deriveMembershipStatus, evaluateCheckIn, isMembershipUsable } from "@/lib/domain/status";
import { chargeIsCollectible, collectibleOutstandingMinor } from "@/lib/domain/charges";
import type * as T from "@/lib/domain/types";
import { addDays, daysFromToday, diffDays, nowISO, todayISODate } from "@/lib/utils/dates";
import { money, zeroMoney } from "@/lib/utils/money";
import { buildSeed } from "./seed";
import { buildPlatformOverview } from "../../../convex/platformOverview";
import {
  CUSTOMER_PERSONAS,
  INITIAL_CUSTOMER_MEMBERSHIPS,
  INITIAL_TRIAL_BOOKINGS,
  MARKETPLACE_GYMS,
} from "@/lib/public/experience-data";
import type { CustomerMarketingPreference, CustomerPersona, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";
import { isTimeInTrialWindow } from "@/lib/public/trial-schedule";
import {
  currentRole,
  currentUser,
  mockUuid,
  permissionsFor,
  type MemberRecord,
  type MembershipRecord,
  type MockDb,
} from "./store";

const TZ = "Asia/Amman";
const MARKETING_WORDING_VERSION = "2026-08-default-opt-in-v1";
type MockOperationalNotification = OperationalNotification & { recipientId: string };

const MOCK_INVOICES: PlatformBillingInvoice[] = [
  { id: "RV-1048", gym: "Pulse Lab", amount: "JD 149.000", date: "31 Jul 2026", status: "failed" },
  { id: "RV-1047", gym: "Her House Fitness", amount: "JD 249.000", date: "28 Jul 2026", status: "paid" },
  { id: "RV-1046", gym: "Forge Fitness Club", amount: "JD 249.000", date: "18 Jul 2026", status: "paid" },
  { id: "RV-1045", gym: "District Strength", amount: "JD 0.000", date: "5 Jul 2026", status: "trial" },
  { id: "RV-1044", gym: "Pulse Lab", amount: "JD 149.000", date: "30 Jun 2026", status: "paid" },
];

const MOCK_SUPPORT_CASES: PlatformSupportCase[] = [
  { id: "SUP-218", gym: "Pulse Lab", subject: "Payment retry failed", age: "18m", priority: "urgent", status: "open" },
  { id: "SUP-217", gym: "Forge Fitness", subject: "New staff permission question", age: "1h", priority: "normal", status: "open" },
  { id: "SUP-216", gym: "District Strength", subject: "Member import formatting", age: "3h", priority: "normal", status: "waiting" },
  { id: "SUP-214", gym: "Her House", subject: "Add a Shmeisani kiosk", age: "1d", priority: "normal", status: "open" },
];

const MOCK_SAAS_PLANS: PlatformSaasPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
];

const INITIAL_GYM_APPLICATIONS: PlatformGymApplication[] = [
  {
    id: "20000000-0000-4a00-8a00-000000000001",
    gymName: "Northline Strength",
    ownerName: "Karim Haddad",
    email: "karim@northline.example",
    contactNumber: "+962 79 555 0144",
    plan: "Growth",
    status: "pending",
    notificationStatus: "sent",
    reviewNotificationStatus: "not_configured",
    submittedAt: "2026-08-06T08:42:00.000Z",
    updatedAt: "2026-08-06T08:42:00.000Z",
  },
  {
    id: "20000000-0000-4a00-8a00-000000000002",
    gymName: "Mosaic Women’s Fitness",
    ownerName: "Dina Al-Saleh",
    email: "dina@mosaic.example",
    contactNumber: "+962 78 222 0908",
    plan: "Pro",
    status: "under_review",
    notificationStatus: "sent",
    reviewNotificationStatus: "not_configured",
    submittedAt: "2026-08-05T14:18:00.000Z",
    updatedAt: "2026-08-05T16:05:00.000Z",
    reviewedBy: "Elias RIVET",
    reviewNotes: "Confirm the second branch address before approval.",
  },
];

type PageParams = { page?: number; pageSize?: number; sort?: string; search?: string };

function paginate<I>(items: I[], q: PageParams): T.Page<I> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, totalItems, totalPages };
}

function parseImportCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function applySort<I>(items: I[], sort: string | undefined, getter: (item: I, key: string) => string | number | undefined): I[] {
  if (!sort) return items;
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    const va = getter(a, key);
    const vb = getter(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return desc ? 1 : -1;
    if (va > vb) return desc ? -1 : 1;
    return 0;
  });
}

export class MockGymOSApi implements GymOSApi {
  private db: MockDb;
  private behavior: MockBehavior = { ...DEFAULT_BEHAVIOR };
  private gymApplications: PlatformGymApplication[];
  private platformGyms: MarketplaceGym[];
  private platformPlans: PlatformSaasPlan[];
  private platformInvoices: PlatformBillingInvoice[];
  private platformSupportCases: PlatformSupportCase[];
  private operationalNotifications: MockOperationalNotification[] = [];
  private trialBookings: TrialBooking[];
  private customerPreferenceHistory = new Map<string, CustomerMarketingPreference[]>();
  private registeredCustomers = new Map<string, CustomerPersona>();
  private memberImports = new Map<string, MemberImportPreview>();
  private memberImportIdempotency = new Map<string, { signature: string; result: MemberImportCommitResult }>();
  private membershipSaleIdempotency = new Map<string, { signature: string; result: T.MembershipSaleResult }>();
  private membershipTransferIdempotency = new Map<string, { signature: string; result: T.MembershipDetail }>();
  private activeCustomerId = CUSTOMER_PERSONAS[0]?.id ?? "customer-lina";
  private ptTrainers: T.PtTrainerProfile[] = [];
  private ptPackages: T.PtPackage[] = [];
  private ptRules: T.PtAvailabilityRule[] = [];
  private ptExceptions: T.PtAvailabilityException[] = [];
  private ptEntitlements: T.PtEntitlement[] = [];
  private ptBookings: T.PtBooking[] = [];
  private ptOrders: T.PtPackageOrder[] = [];
  private gymPublicProfile!: T.GymPublicProfile;
  private gymProfileVersions: T.GymProfileVersion[] = [];
  private operationalEmailKinds: string[] = [];
  private operationalEmailUpdate?: Pick<T.OperationalEmailActivationSettings, "ownerConfirmed" | "ownerConfirmedAt" | "ownerConfirmedBy" | "updatedAt" | "updatedBy" | "reason">;

  constructor(db?: MockDb) {
    this.db = db ?? buildSeed();
    this.gymApplications = INITIAL_GYM_APPLICATIONS.map((application) => ({ ...application }));
    this.platformGyms = MARKETPLACE_GYMS.map((gym) => ({
      ...gym,
      areas: [...gym.areas],
      amenities: [...gym.amenities],
      branches: gym.branches.map((branch) => ({ ...branch, trialSlots: [...branch.trialSlots] })),
    }));
    this.platformPlans = MOCK_SAAS_PLANS.map((plan) => ({ ...plan }));
    this.platformInvoices = MOCK_INVOICES.map((invoice) => ({ ...invoice }));
    this.platformSupportCases = MOCK_SUPPORT_CASES.map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) }));
    this.trialBookings = INITIAL_TRIAL_BOOKINGS.map((booking) => ({ ...booking }));
    const trainer = this.db.users.find((user) => user.role === "trainer" && user.status === "active");
    if (trainer) {
      const createdAt = nowISO();
      const profileId = mockUuid();
      this.ptTrainers = [{ id: profileId, organizationId: this.db.organization.id, userId: trainer.id, displayName: trainer.name, specialties: ["Strength", "Mobility"], languages: ["en", "ar"], branchIds: trainer.branchScope === "all" ? this.db.branches.map((branch) => branch.id) : trainer.branchIds, status: "published", createdAt, updatedAt: createdAt }];
      this.ptRules = this.ptTrainers[0]!.branchIds.flatMap((branchId) => (["sun", "mon", "tue", "wed", "thu"] as T.WeekdayKey[]).map((weekday) => ({ id: mockUuid(), trainerProfileId: profileId, branchId, weekday, startMinute: 8 * 60, endMinute: 17 * 60, active: true })));
    }
    this.ptPackages = ([
      [12, 240_000, 90],
      [20, 360_000, 120],
      [30, 480_000, 180],
    ] as const).map(([sessionCount, amount, validityDays]) => ({ id: mockUuid(), organizationId: this.db.organization.id, name: `${sessionCount} PT sessions`, sessionCount, totalPrice: money(amount), validityDays, branchAccess: "all", branchIds: [], status: "active", createdAt: nowISO(), updatedAt: nowISO() }));
    const listing = this.platformGyms[0];
    this.gymPublicProfile = { organizationId: this.db.organization.id, version: 1, status: "published", shortName: listing?.shortName ?? this.db.organization.name.slice(0, 12), taglineEn: listing?.tagline ?? "", descriptionEn: listing?.description ?? "", category: listing?.category ?? "Gym", audience: listing?.audience ?? "All members", amenities: listing?.amenities ?? [], accentColor: listing?.accent ?? "#15140f", gallery: [], trainers: this.ptTrainers.filter((item) => item.status === "published"), ptPackages: this.ptPackages.filter((item) => item.status === "active"), publishedAt: nowISO(), updatedAt: nowISO() };
    this.gymProfileVersions = [{ id: mockUuid(), organizationId: this.db.organization.id, version: 1, status: "published", profile: { ...this.gymPublicProfile }, publishedAt: this.gymPublicProfile.publishedAt, updatedAt: this.gymPublicProfile.updatedAt }];
  }

  listMarketplaceGyms(): Promise<MarketplaceGym[]> {
    return this.respond(() => this.platformGyms.filter((gym) => (gym.isPublic ?? true) && (gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial")));
  }

  subscribeMarketplaceGyms(onValue: (gyms: MarketplaceGym[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listMarketplaceGyms(), onValue, onError);
  }

  getGymPublicProfile(): Promise<T.GymPublicProfile> {
    return this.respond(() => ({ ...this.gymPublicProfile, amenities: [...this.gymPublicProfile.amenities], gallery: [...this.gymPublicProfile.gallery], trainers: this.ptTrainers.filter((item) => item.status === "published"), ptPackages: this.ptPackages.filter((item) => item.status === "active") }));
  }

  subscribeGymPublicProfile(onValue: (profile: T.GymPublicProfile) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getGymPublicProfile(), onValue, onError);
  }

  listGymProfileVersions(): Promise<T.GymProfileVersion[]> {
    return this.respond(() => this.gymProfileVersions.map((item) => ({ ...item, profile: { ...item.profile, amenities: [...item.profile.amenities], gallery: [...item.profile.gallery] } })));
  }

  saveGymPublicProfile(input: T.UpdateGymPublicProfileInput): Promise<T.GymPublicProfile> {
    return this.respond(() => {
      this.require("profiles.manage");
      if (!input.shortName.trim() || !input.taglineEn.trim() || !input.descriptionEn.trim()) throw ApiError.of(ERR.VALIDATION, "Short name, tagline, and description are required.");
      if (!/^#[0-9a-f]{6}$/i.test(input.accentColor)) throw ApiError.of(ERR.VALIDATION, "Accent color must be a six-digit hex color.");
      const nextVersion = this.gymPublicProfile.status === "published" ? this.gymPublicProfile.version + 1 : this.gymPublicProfile.version;
      this.gymPublicProfile = { ...this.gymPublicProfile, ...input, version: nextVersion, status: "draft", amenities: [...input.amenities], gallery: [], trainers: this.ptTrainers.filter((item) => item.status === "published"), ptPackages: this.ptPackages.filter((item) => item.status === "active"), publishedAt: undefined, updatedAt: nowISO() };
      return { ...this.gymPublicProfile };
    });
  }

  publishGymPublicProfile(): Promise<T.GymPublicProfile> {
    return this.respond(() => {
      this.require("profiles.manage");
      const now = nowISO();
      this.gymProfileVersions = this.gymProfileVersions.map((item) => item.status === "published" ? { ...item, status: "unpublished", unpublishedAt: now } : item);
      this.gymPublicProfile = { ...this.gymPublicProfile, status: "published", publishedAt: now, updatedAt: now };
      this.gymProfileVersions.unshift({ id: mockUuid(), organizationId: this.db.organization.id, version: this.gymPublicProfile.version, status: "published", profile: { ...this.gymPublicProfile }, publishedAt: now, updatedAt: now });
      const listing = this.platformGyms[0];
      if (listing) Object.assign(listing, { shortName: this.gymPublicProfile.shortName, tagline: this.gymPublicProfile.taglineEn, description: this.gymPublicProfile.descriptionEn, category: this.gymPublicProfile.category, audience: this.gymPublicProfile.audience, amenities: [...this.gymPublicProfile.amenities], accent: this.gymPublicProfile.accentColor, profileVersion: this.gymPublicProfile.version });
      return { ...this.gymPublicProfile };
    });
  }

  unpublishGymPublicProfile(reason: string): Promise<T.GymPublicProfile> {
    return this.respond(() => {
      this.require("profiles.manage");
      if (!reason.trim()) throw ApiError.of(ERR.VALIDATION, "A reason is required to unpublish the gym profile.");
      this.gymPublicProfile = { ...this.gymPublicProfile, status: "unpublished", updatedAt: nowISO() };
      return { ...this.gymPublicProfile };
    });
  }

  uploadMediaAsset(input: { ownerType: T.MediaAssetOwnerType; ownerId: string; altText?: string; file: Blob }): Promise<T.MediaAsset> {
    return this.respond(() => {
      if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(input.file.type) || input.file.size > 5 * 1024 * 1024) throw ApiError.of(ERR.VALIDATION, "Use a JPEG, PNG, or WebP image up to 5 MB.");
      const now = nowISO();
      return { id: mockUuid(), organizationId: this.db.organization.id, ownerType: input.ownerType, ownerId: input.ownerId, storageId: `mock-storage-${mockUuid()}`, contentType: input.file.type as T.MediaAsset["contentType"], sizeBytes: input.file.size, altText: input.altText, visibility: input.ownerType === "member_photo" ? "private" : "public", status: input.ownerType.startsWith("gym_") ? "pending" : "active", url: URL.createObjectURL(input.file), createdAt: now, updatedAt: now };
    });
  }

  discardDraftMediaAsset(_assetId: T.UUID): Promise<void> { return this.respond(() => undefined); }

  private customerWithPreference(persona: CustomerPersona): CustomerPersona {
    const history = this.customerPreferenceHistory.get(persona.id) ?? [];
    const fallback: CustomerMarketingPreference = { optedIn: true, source: "system_default", wordingVersion: MARKETING_WORDING_VERSION };
    const preference = history[history.length - 1] ?? fallback;
    return { ...persona, marketingPreference: preference, marketingPreferenceHistory: history.length > 0 ? history.map((item) => ({ ...item })) : [fallback] };
  }

  getCustomerExperience(): Promise<CustomerExperience> {
    return this.respond(() => {
      const persona = this.registeredCustomers.get(this.activeCustomerId) ?? CUSTOMER_PERSONAS.find((item) => item.id === this.activeCustomerId) ?? CUSTOMER_PERSONAS[0]!;
      return { customer: this.customerWithPreference(persona), memberships: INITIAL_CUSTOMER_MEMBERSHIPS, bookings: this.trialBookings.map((booking) => ({ ...booking })) };
    });
  }

  async subscribeCustomerExperience(onValue: (experience: CustomerExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.getCustomerExperience());
    } catch (error) {
      onError?.(error);
    }
    // Mock mode has no server socket. Returning the same disposer contract
    // keeps provider lifecycle code identical in preview and production.
    return () => undefined;
  }

  registerCustomer(input: { fullName: string; email: string; phone: string }): Promise<CustomerPersona> {
    return this.respond(() => {
      const persona = {
        id: `customer-${Date.now()}`,
        name: input.fullName,
        nameAr: input.fullName,
        email: input.email.trim().toLowerCase(),
        phone: input.phone,
        initials: input.fullName.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase(),
        context: "New member account",
      };
      this.registeredCustomers.set(persona.id, persona);
      this.activeCustomerId = persona.id;
      return this.customerWithPreference(persona);
    });
  }

  updateCustomerMarketingPreference(input: { optedIn: boolean; customerId?: string }): Promise<CustomerPersona> {
    return this.respond(() => {
      if (typeof input.optedIn !== "boolean") throw ApiError.of(ERR.VALIDATION, "Choose whether to receive marketing messages.");
      const customerId = input.customerId ?? this.activeCustomerId;
      const persona = this.registeredCustomers.get(customerId) ?? CUSTOMER_PERSONAS.find((item) => item.id === customerId);
      const current = persona ?? {
        id: customerId,
        name: "RIVET member",
        nameAr: "RIVET member",
        email: "member@example.com",
        phone: "",
        initials: "RM",
        context: "RIVET member",
      };
      const history = this.customerPreferenceHistory.get(current.id) ?? [{ optedIn: true, source: "system_default" as const, wordingVersion: MARKETING_WORDING_VERSION }];
      const previous = history[history.length - 1];
      if (!previous || previous.optedIn !== input.optedIn || previous.source !== "member_selected") {
        history.push({ optedIn: input.optedIn, source: "member_selected", changedAt: nowISO(), wordingVersion: MARKETING_WORDING_VERSION });
        this.customerPreferenceHistory.set(current.id, history);
      }
      this.activeCustomerId = current.id;
      return this.customerWithPreference(current);
    });
  }

  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string }): Promise<TrialBooking> {
    return this.respond(() => {
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      const directoryBranch = gym?.branches.find((item) => item.id === input.branchId);
      if (!gym || !directoryBranch) throw ApiError.of(ERR.NOT_FOUND, "Gym branch not found.");
      if (!isTimeInTrialWindow(directoryBranch, input.preferredDate, input.preferredTime)) throw ApiError.of(ERR.CONFLICT, "That trial time is outside this branch's trial-request hours.");
      // The browser experience owns whether a member is signed in. Falling
      // back to the mock adapter's last persona would silently attach a guest
      // request to an unrelated seeded member after navigation or test reuse.
      const customerId = input.customerId;
      if (customerId && this.trialBookings.some((booking) => booking.customerId === customerId && booking.gymId === input.gymId && (booking.status === "requested" || booking.status === "confirmed"))) throw ApiError.of(ERR.CONFLICT, "You already have an open trial request with this gym.");
      const internalBranchId = directoryBranch?.internalBranchId;
      let leadId: string | undefined;
      if (gym && internalBranchId) {
        leadId = mockUuid();
        const followUp = new Date(`${input.preferredDate}T${input.preferredTime}:00+03:00`).toISOString();
        const lead: T.Lead = {
          id: leadId,
          organizationId: this.db.organization.id,
          branchId: internalBranchId,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          email: input.email.trim().toLowerCase(),
          stage: "trial_booked",
          source: "other",
          ownerId: this.actor().id,
          expectedValue: { amount: gym.fromPriceMinor, currency: "JOD" },
          nextFollowUpAt: followUp,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        (lead as T.Lead & { notes?: string }).notes = `Free trial requested through RIVET Member for ${directoryBranch.name}. Goal: ${input.goal}`;
        this.db.leads.push(lead);
        this.activity({ leadId, type: "member_created", title: "Free trial requested", body: input.goal, actorName: "RIVET Member" });
      }
      const booking: TrialBooking = { ...input, customerId, id: `trial-${Date.now()}`, createdAt: nowISO(), status: "requested", ...(leadId ? { leadId } : {}) };
      this.trialBookings.unshift(booking);
      return { ...booking };
    });
  }

  getEntryPass(membershipId: string): Promise<EntryPass> {
    return this.respond(() => {
      const membership = INITIAL_CUSTOMER_MEMBERSHIPS.find((item) => item.id === membershipId);
      if (!membership) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      return { token: membership.qrValue, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), membershipId };
    });
  }

  previewMemberImport(input: { csv: string; branchId: T.UUID }): Promise<MemberImportPreview> {
    return this.respond(() => {
      this.require("members.write");
      const rows = parseImportCsv(input.csv);
      const header = (rows.shift() ?? []).map((item) => item.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
      const nameIndex = header.findIndex((item) => ["full_name", "name", "member_name"].includes(item));
      const phoneIndex = header.findIndex((item) => ["phone", "mobile", "mobile_number"].includes(item));
      const emailIndex = header.findIndex((item) => item === "email" || item === "email_address");
      const previewRows: MemberImportRow[] = rows.map((values, index) => {
        const fullName = nameIndex >= 0 ? values[nameIndex] ?? "" : "";
        const phone = phoneIndex >= 0 ? values[phoneIndex] ?? "" : "";
        const email = emailIndex >= 0 ? values[emailIndex] || undefined : undefined;
        const duplicateIds = this.findDuplicates({ phone, email }).map((match) => match.memberId);
        const errors = [
          ...(fullName ? [] : ["Full name is required"]),
          ...(phone ? [] : ["Phone is required"]),
          ...(duplicateIds.length ? ["A member with this phone or email already exists"] : []),
        ];
        return { rowNumber: index + 2, fullName, phone, email, status: duplicateIds.length ? "duplicate" : errors.length ? "invalid" : "valid", errors, duplicateMemberIds: duplicateIds };
      });
      const preview: MemberImportPreview = { id: mockUuid(), branchId: input.branchId, totalRows: previewRows.length, validRows: previewRows.filter((row) => row.status === "valid").length, duplicateRows: previewRows.filter((row) => row.status === "duplicate").length, errorRows: previewRows.filter((row) => row.status === "invalid").length, rows: previewRows, createdAt: nowISO() };
      this.memberImports.set(preview.id, preview);
      return preview;
    });
  }

  commitMemberImport(input: MemberImportCommitInput): Promise<MemberImportCommitResult> {
    return this.respond(() => {
      this.require("members.write");
      const cursor = input.cursor ?? 0;
      const chunkSize = Math.min(100, Math.max(1, input.chunkSize ?? 25));
      const signature = JSON.stringify({ importId: input.importId, cursor, chunkSize });
      const existingResult = this.memberImportIdempotency.get(input.idempotencyKey);
      if (existingResult) {
        if (existingResult.signature !== signature) throw ApiError.of(ERR.VALIDATION, "This import idempotency key was already used for a different chunk.");
        return existingResult.result;
      }
      const preview = this.memberImports.get(input.importId);
      if (!preview) throw ApiError.of(ERR.NOT_FOUND, "Import preview not found.");
      const end = Math.min(preview.rows.length, cursor + chunkSize);
      const createdMemberIds: string[] = [];
      const errors: Array<{ rowNumber: number; message: string }> = [];
      let skippedCount = 0;
      for (let index = cursor; index < end; index += 1) {
        const row = preview.rows[index]!;
        if (row.status !== "valid") { skippedCount += 1; row.status = "skipped"; continue; }
        const branch = this.db.branches.find((item) => item.id === preview.branchId);
        if (!branch) { row.status = "invalid"; row.errors = ["Branch not found"]; errors.push({ rowNumber: row.rowNumber, message: "Branch not found" }); continue; }
        this.db.counters.memberNumber += 1;
        const member: MemberRecord = { id: mockUuid(), memberNumber: `${branch.code}-${this.db.counters.memberNumber}`, fullName: row.fullName, phone: row.phone, email: row.email, homeBranchId: branch.id, status: "active", tags: [], preferredLanguage: "en", marketingOptIn: true, createdAt: nowISO() };
        this.db.members.push(member);
        this.activity({ memberId: member.id, type: "member_created", title: "Member imported", actorId: this.actor().id, actorName: this.actor().name });
        this.audit({ category: "members", action: "member.imported", entityType: "member", entityId: member.id, entityLabel: `${member.fullName} · ${member.memberNumber}`, summary: `Imported from CSV row ${row.rowNumber}` });
        row.status = "committed";
        row.memberId = member.id;
        createdMemberIds.push(member.id);
      }
      const nextCursor = end;
      const result: MemberImportCommitResult = { importId: preview.id, status: nextCursor >= preview.rows.length ? "completed" : "processing", cursor: nextCursor, totalRows: preview.rows.length, committedCount: createdMemberIds.length, skippedCount, failedCount: errors.length, createdMemberIds, errors };
      this.memberImports.set(preview.id, preview);
      this.memberImportIdempotency.set(input.idempotencyKey, { signature, result });
      return result;
    });
  }

  getPlatformSnapshot(): Promise<PlatformSnapshot> {
    return this.respond(() => ({
      gyms: this.platformGyms,
      bookings: this.trialBookings,
      invoices: this.platformInvoices,
      supportCases: this.platformSupportCases,
      applications: this.gymApplications.map((application) => ({ ...application })),
      auditEvents: [],
      plans: this.platformPlans,
      overview: buildPlatformOverview({
        gyms: this.platformGyms.map((gym) => ({ id: gym.id, subscriptionStatus: gym.subscriptionStatus, trialEndsAt: gym.trialEndsAt })),
        organizations: [{ status: this.db.organization.status, subscriptionPlan: this.db.organization.subscriptionPlan }],
        plans: this.platformPlans.map((plan) => ({ name: plan.name, priceMinor: plan.priceMinor })),
        branches: this.db.branches.map((branch) => ({ active: branch.status === "active", status: branch.status })),
        members: this.db.members.map((member) => ({ status: member.status })),
        staffMemberships: this.db.users.map((user) => ({ active: user.status === "active" })),
        bookings: this.trialBookings.map((booking) => ({ status: booking.status })),
        applications: this.gymApplications.map((application) => ({
          id: application.id,
          gymName: application.gymName,
          plan: application.plan,
          status: application.status,
          updatedAt: application.updatedAt,
          provisioningStatus: application.provisioningStatus,
          provisioningError: application.provisioningError,
        })),
        invoices: this.platformInvoices,
        supportCases: this.platformSupportCases,
      }),
    }));
  }

  async previewMarketingPreferenceMigration(): Promise<import("@/lib/api/GymOSApi").MarketingPreferenceMigrationPreview> {
    return { profileCount: 0, memberCount: 0, totalCount: 0, targetStatus: "unknown", marketingDelivery: "suppressed" };
  }

  async applyMarketingPreferenceMigration(): Promise<import("@/lib/api/GymOSApi").MarketingPreferenceMigrationProgress> {
    return { id: `mock-marketing-${Date.now()}`, status: "completed", previewCount: 0, processedCount: 0, failedCount: 0, remainingCount: 0 };
  }

  async subscribePlatformSnapshot(onValue: (snapshot: PlatformSnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.getPlatformSnapshot());
    } catch (error) {
      onError?.(error);
    }
    return () => undefined;
  }

  getPlatformGymDetail(gymId: string): Promise<PlatformGymDetail> {
    return this.respond(() => {
      const gym = this.platformGyms.find((item) => item.id === gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");

      const available = <T,>(value: T): PlatformData<T> => ({ state: "available", value });
      const notAvailable = <T,>(): PlatformData<T> => ({ state: "not_available" });
      const notConfigured = <T,>(): PlatformData<T> => ({ state: "not_configured" });
      // The mock has one authoritative tenant. Other directory rows are
      // intentionally detail-incomplete rather than borrowing Forge facts.
      const isSeedTenant = gym.id === "forge-fitness";
      const organization = isSeedTenant ? this.db.organization : undefined;
      const branches = isSeedTenant
        ? this.db.branches.map((branch) => ({ id: branch.id, name: branch.name, code: branch.code, address: branch.address || undefined, phone: branch.phone || undefined, status: branch.status }))
        : [];
      const owner = organization ? this.db.users.find((user) => user.role === "owner" && user.status !== "deactivated") : undefined;
      const plan = organization?.subscriptionPlan ? this.platformPlans.find((item) => item.name === organization.subscriptionPlan) : undefined;
      const activeMemberCount = organization ? this.db.members.filter((member) => member.status === "active").length : 0;
      const activeStaffCount = organization ? this.db.users.filter((user) => user.status === "active").length : 0;
      const field = <T,>(value: T | undefined, missing: "not_available" | "not_configured" = "not_available"): PlatformData<T> => value === undefined ? (missing === "not_available" ? notAvailable<T>() : notConfigured<T>()) : available(value);

      return {
        id: gym.id,
        name: gym.name,
        shortName: gym.shortName,
        accent: gym.accent,
        controls: { status: gym.subscriptionStatus, plan: gym.rivetPlan, isPublic: gym.isPublic ?? true },
        organization: organization
          ? available({ id: organization.id, name: organization.name, status: organization.status, currency: organization.currency, timezone: organization.timezone })
          : notAvailable(),
        joinedAt: notAvailable(),
        branches: organization ? available(branches) : notAvailable(),
        owner: owner ? available({ name: owner.name, email: owner.email, phone: owner.phone || undefined }) : notAvailable(),
        usage: {
          memberCount: organization ? available(activeMemberCount) : notAvailable(),
          activeStaffCount: organization ? available(activeStaffCount) : notAvailable(),
          staffLimit: organization ? field(plan?.staff, "not_configured") : notAvailable(),
          automationRuleCount: organization ? available(this.db.rules.length) : notAvailable(),
          paymentTransactionCount: organization ? available(this.db.payments.length) : notAvailable(),
          storage: notConfigured(),
        },
        subscription: {
          plan: organization ? field(organization.subscriptionPlan, "not_configured") : notAvailable(),
          status: organization ? available(organization.status === "active" ? "active" : "suspended") : notAvailable(),
          startedAt: organization ? field(gym.subscriptionStartedAt, "not_configured") : notAvailable(),
          trialEndsAt: organization ? field(gym.trialEndsAt, "not_configured") : notAvailable(),
          currentPeriodEndsAt: organization ? field(gym.currentPeriodEndsAt, "not_configured") : notAvailable(),
          cancelledAt: organization ? field(gym.cancelledAt, "not_configured") : notAvailable(),
          statusReason: organization ? field(gym.subscriptionStatusReason, "not_configured") : notAvailable(),
          recurringAmount: notConfigured(),
          renewalDate: notConfigured(),
          paymentMethod: notConfigured(),
          invoices: notConfigured(),
        },
        activity: notConfigured(),
      };
    });
  }

  subscribePlatformGymDetail(gymId: string, onValue: (detail: PlatformGymDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getPlatformGymDetail(gymId), onValue, onError);
  }

  listPublicSaasPlans(): Promise<PlatformSaasPlan[]> {
    return this.respond(() => this.platformPlans);
  }

  submitGymApplication(_input: SubmitGymApplicationInput): Promise<SubmitGymApplicationResult> {
    return this.respond(() => ({
      applicationId: `application-${Date.now()}`,
      status: "pending" as const,
      notificationStatus: "sent" as const,
      submittedAt: new Date().toISOString(),
      duplicate: false,
    }));
  }

  listGymApplications(query: { status?: PlatformGymApplication["status"]; search?: string } = {}): Promise<PlatformGymApplication[]> {
    return this.respond(() => {
      const search = query.search?.trim().toLowerCase();
      return this.gymApplications
        .filter((application) => !query.status || application.status === query.status)
        .filter((application) => !search || [application.gymName, application.ownerName, application.email, application.contactNumber, application.plan, application.status].some((value) => value.toLowerCase().includes(search)))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .map((application) => ({ ...application }));
    });
  }

  async subscribePlatformApplications(onValue: (applications: PlatformGymApplication[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.listGymApplications());
    } catch (error) {
      onError?.(error);
    }
    return () => undefined;
  }

  reviewGymApplication(input: ReviewGymApplicationInput): Promise<PlatformGymApplication> {
    return this.respond(() => {
      const application = this.gymApplications.find((item) => item.id === input.applicationId);
      if (!application) throw ApiError.of(ERR.NOT_FOUND, "Gym application not found.");
      if (application.status === "approved" || application.status === "rejected") throw ApiError.of(ERR.VALIDATION, "This gym application has already been finalized.");
      if (input.decision === "rejected" && !input.note?.trim()) throw ApiError.of(ERR.VALIDATION, "Add a reason before rejecting an application.", { fieldErrors: { note: ["Required when rejecting an application"] } });
      const now = nowISO();
      application.status = input.decision;
      application.updatedAt = now;
      application.reviewedBy = this.actor().name;
      application.reviewNotes = input.note?.trim() || undefined;
      application.reviewedAt = input.decision === "under_review" ? undefined : now;
      application.reviewNotificationStatus = input.decision === "under_review" ? "not_configured" : "sent";
      application.reviewNotificationError = undefined;
      this.audit({
        category: "settings",
        action: `gym_application.${input.decision}`,
        entityType: "gym_application",
        entityId: application.id,
        entityLabel: application.gymName,
        summary: `${input.decision === "under_review" ? "Moved to review" : input.decision === "approved" ? "Approved" : "Rejected"} gym application`,
        reason: input.note,
      });
      return { ...application };
    });
  }

  saveGymApplicationReviewNote(input: SaveGymApplicationReviewNoteInput): Promise<PlatformGymApplication> {
    return this.respond(() => {
      const application = this.gymApplications.find((item) => item.id === input.applicationId);
      if (!application) throw ApiError.of(ERR.NOT_FOUND, "Gym application not found.");
      const note = input.note.trim();
      if (note.length > 2_000) throw ApiError.of(ERR.VALIDATION, "Review note must be 2,000 characters or fewer.", { fieldErrors: { note: ["Must be 2,000 characters or fewer"] } });
      const previousNote = application.reviewNotes;
      application.reviewNotes = note || undefined;
      application.updatedAt = nowISO();
      this.audit({
        category: "settings",
        action: "gym_application.review_note_update",
        entityType: "gym_application",
        entityId: application.id,
        entityLabel: application.gymName,
        summary: note ? "Updated gym application review note" : "Cleared gym application review note",
        before: { reviewNotes: previousNote ?? null },
        after: { reviewNotes: application.reviewNotes ?? null },
      });
      return { ...application };
    });
  }

  provisionGym(input: ProvisionGymInput): Promise<GymProvisioningResult> {
    return this.respond(() => {
      const application = this.gymApplications.find((item) => item.id === input.applicationId);
      if (!application) throw ApiError.of(ERR.NOT_FOUND, "Gym application not found.");
      if (application.status !== "approved") throw ApiError.of(ERR.VALIDATION, "Only approved applications can be provisioned.");
      if (application.provisioningStatus === "completed" && application.provisionedOrganizationId && application.provisionedBranchId) {
        return {
          applicationId: application.id,
          status: "completed" as const,
          organizationId: application.provisionedOrganizationId,
          organizationName: application.gymName,
          branchId: application.provisionedBranchId,
          branchName: `${application.gymName} — Main branch`,
          plan: application.plan,
          ownerName: application.ownerName,
          ownerEmail: application.email,
          clerkOrganizationId: application.clerkOrganizationId ?? `clerk-org-${application.id.slice(0, 8)}`,
          clerkInvitationId: application.clerkInvitationId ?? `clerk-inv-${application.id.slice(0, 8)}`,
        };
      }
      const now = nowISO();
      application.provisioningStatus = "completed";
      application.provisionedAt = now;
      application.provisionedOrganizationId = `org-${application.id}`;
      application.provisionedBranchId = `branch-${application.id}`;
      application.clerkOrganizationId = `clerk-org-${application.id.slice(0, 8)}`;
      application.clerkInvitationId = `clerk-inv-${application.id.slice(0, 8)}`;
      application.provisioningError = undefined;
      application.updatedAt = now;
      return {
        applicationId: application.id,
        status: "completed" as const,
        organizationId: application.provisionedOrganizationId,
        organizationName: application.gymName,
        branchId: application.provisionedBranchId,
        branchName: `${application.gymName} — Main branch`,
        plan: application.plan,
        ownerName: application.ownerName,
        ownerEmail: application.email,
        clerkOrganizationId: application.clerkOrganizationId,
        clerkInvitationId: application.clerkInvitationId,
      };
    });
  }

  updatePlatformGym(input: UpdatePlatformGymInput): Promise<MarketplaceGym> {
    return this.respond(() => {
      this.requireReason(input.reason);
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");
      if (input.status) gym.subscriptionStatus = input.status;
      if (input.plan) gym.rivetPlan = input.plan;
      if (input.isPublic !== undefined) gym.isPublic = input.isPublic;
      const applyDate = (key: "trialEndsAt" | "subscriptionStartedAt" | "currentPeriodEndsAt" | "cancelledAt", value?: string) => {
        if (value === undefined) return;
        const timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp)) throw ApiError.of(ERR.VALIDATION, "Subscription lifecycle dates are invalid.");
        gym[key] = new Date(timestamp).toISOString();
      };
      applyDate("trialEndsAt", input.trialEndsAt);
      applyDate("subscriptionStartedAt", input.subscriptionStartedAt);
      applyDate("currentPeriodEndsAt", input.currentPeriodEndsAt);
      applyDate("cancelledAt", input.cancelledAt);
      if (input.status === "cancelled" && !input.cancelledAt) gym.cancelledAt = nowISO();
      if (input.status && input.status !== "cancelled") gym.cancelledAt = undefined;
      gym.subscriptionStatusReason = input.reason.trim();
      gym.lastActiveAt = nowISO();
      return { ...gym, areas: [...gym.areas], amenities: [...gym.amenities], branches: gym.branches.map((branch) => ({ ...branch, trialSlots: [...branch.trialSlots] })) };
    });
  }

  updatePlatformPlan(input: UpdatePlatformPlanInput): Promise<PlatformSaasPlan> {
    return this.respond(() => {
      const plan = this.platformPlans.find((item) => item.name === input.name);
      if (!plan) throw ApiError.of(ERR.NOT_FOUND, "Plan not found.");
      if (input.priceMinor !== undefined) plan.priceMinor = Math.max(0, Math.round(input.priceMinor));
      if (input.branches !== undefined) plan.branches = Math.max(1, Math.round(input.branches));
      if (input.staff !== undefined) plan.staff = Math.max(1, Math.round(input.staff));
      if (input.members !== undefined) plan.members = Math.max(1, Math.round(input.members));
      return { ...plan };
    });
  }

  createPlatformInvoice(input: CreatePlatformInvoiceInput): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw ApiError.of(ERR.VALIDATION, "Invoice amount must be a positive integer.");
      const periodStart = Date.parse(input.periodStart);
      const periodEnd = Date.parse(input.periodEnd);
      const dueAt = Date.parse(input.dueAt);
      if (![periodStart, periodEnd, dueAt].every(Number.isFinite) || periodEnd < periodStart) throw ApiError.of(ERR.VALIDATION, "Invoice dates are invalid.");
      const currency = input.currency ?? "JOD";
      const invoice: PlatformBillingInvoice = {
        id: `INV-${crypto.randomUUID()}`,
        gymId: gym.id,
        gym: gym.name,
        amountMinor: input.amountMinor,
        amount: `${currency} ${(input.amountMinor / 1_000).toFixed(3)}`,
        currency,
        date: "Not issued",
        dueAt: new Date(dueAt).toISOString(),
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        status: "draft",
      };
      this.platformInvoices.unshift(invoice);
      return { ...invoice };
    });
  }

  issuePlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      const invoice = this.platformInvoices.find((item) => item.id === invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (invoice.status !== "draft") throw ApiError.of(ERR.VALIDATION, "Only draft invoices can be issued.");
      invoice.status = "open";
      invoice.issuedAt = nowISO();
      invoice.date = invoice.issuedAt;
      return { ...invoice };
    });
  }

  markPlatformInvoicePastDue(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      this.requireReason(reason);
      const invoice = this.platformInvoices.find((item) => item.id === invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (invoice.status !== "open") throw ApiError.of(ERR.VALIDATION, "Only an open invoice can be marked past due.");
      invoice.status = "past_due";
      return { ...invoice };
    });
  }

  recordPlatformInvoicePayment(input: RecordPlatformInvoicePaymentInput): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      this.requireReason(input.reason);
      if (!input.reference.trim()) throw ApiError.of(ERR.VALIDATION, "A payment reference is required.");
      const invoice = this.platformInvoices.find((item) => item.id === input.invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (!["open", "past_due", "failed"].includes(invoice.status)) throw ApiError.of(ERR.VALIDATION, "Only an outstanding invoice can be marked paid.");
      invoice.status = "paid";
      invoice.paidAt = input.paidAt ? new Date(input.paidAt).toISOString() : nowISO();
      invoice.paymentReference = input.reference.trim();
      return { ...invoice };
    });
  }

  voidPlatformInvoice(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      this.requireReason(reason);
      const invoice = this.platformInvoices.find((item) => item.id === invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (invoice.status === "paid" || invoice.status === "void") throw ApiError.of(ERR.VALIDATION, "Paid or void invoices cannot be voided.");
      invoice.status = "void";
      invoice.voidedAt = nowISO();
      return { ...invoice };
    });
  }

  listSupportCases(): Promise<PlatformSupportCase[]> {
    return this.respond(() => {
      const actor = this.actor();
      const canViewAll = currentRole(this.db) === "owner" || currentRole(this.db) === "manager";
      return this.platformSupportCases
        .filter((supportCase) => canViewAll || supportCase.creatorId === actor.id)
        .map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) }));
    });
  }

  async subscribeSupportCases(onValue: (cases: PlatformSupportCase[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try { onValue(await this.listSupportCases()); } catch (error) { onError?.(error); }
    return () => undefined;
  }

  createSupportCase(input: CreateSupportCaseInput): Promise<PlatformSupportCase> {
    return this.respond(() => {
      if (!input.email.trim() || !input.subject.trim() || !input.body.trim()) throw ApiError.of(ERR.VALIDATION, "Email, subject, and message are required.");
      if (!["normal", "urgent"].includes(input.priority)) throw ApiError.of(ERR.VALIDATION, "Support priority is invalid.");
      const actor = this.actor();
      const createdAt = nowISO();
      const caseId = `SUP-${crypto.randomUUID()}`;
      const supportCase: PlatformSupportCase = {
        id: caseId,
        gymId: this.db.organization.id,
        gym: this.db.organization.name,
        branchId: input.branchId,
        branchName: this.db.branches.find((branch) => branch.id === input.branchId)?.name,
        creatorId: actor.id,
        creatorName: actor.name,
        creatorEmail: input.email.trim().toLowerCase(),
        subject: input.subject.trim(),
        body: input.body.trim(),
        priority: input.priority,
        status: "open",
        createdAt,
        updatedAt: createdAt,
        messages: [{ id: `SUP-MSG-${crypto.randomUUID()}`, caseId, authorType: "gym", authorId: actor.id, authorName: actor.name, body: input.body.trim(), createdAt }],
      };
      this.platformSupportCases.unshift(supportCase);
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  resolvePlatformSupportCase(caseId: string, resolutionSummary: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      this.requireReason(resolutionSummary, "resolutionSummary");
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      supportCase.status = "resolved";
      supportCase.resolutionSummary = resolutionSummary.trim();
      supportCase.resolvedAt = nowISO();
      supportCase.updatedAt = supportCase.resolvedAt;
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  reopenPlatformSupportCase(caseId: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      if (supportCase.status !== "resolved") throw ApiError.of(ERR.VALIDATION, "Only resolved cases can be reopened.");
      supportCase.status = "open";
      supportCase.resolvedAt = undefined;
      supportCase.resolutionSummary = undefined;
      supportCase.updatedAt = nowISO();
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  assignPlatformSupportCase(caseId: string, assigneeId?: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      supportCase.assigneeId = assigneeId;
      supportCase.assigneeName = assigneeId ? this.actor().name : undefined;
      supportCase.updatedAt = nowISO();
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      if (!body.trim()) throw ApiError.of(ERR.VALIDATION, "A reply is required.");
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      const createdAt = nowISO();
      supportCase.messages = [...(supportCase.messages ?? []), { id: `SUP-MSG-${crypto.randomUUID()}`, caseId, authorType: "platform", authorId: this.actor().id, authorName: this.actor().name, body: body.trim(), createdAt }];
      supportCase.firstResponseAt ??= createdAt;
      supportCase.updatedAt = createdAt;
      supportCase.status = "waiting";
      if (supportCase.creatorId) this.operationalNotifications.unshift({ id: `NOT-${crypto.randomUUID()}`, kind: "support_reply", title: "RIVET replied to your support case", body: supportCase.subject, href: `/support?case=${supportCase.id}`, dedupeKey: `support-reply:${supportCase.id}:${createdAt}`, createdAt, organizationId: this.db.organization.id, branchId: supportCase.branchId, recipientId: supportCase.creatorId });
      return { ...supportCase, messages: supportCase.messages.map((message) => ({ ...message })) };
    });
  }

  listNotifications(): Promise<OperationalNotification[]> {
    return this.respond(() => {
      const actorId = this.actor().id;
      return this.operationalNotifications
        .filter((notification) => notification.recipientId === actorId)
        .map((notification) => ({ ...notification }));
    });
  }

  async subscribeNotifications(onValue: (notifications: OperationalNotification[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try { onValue(await this.listNotifications()); } catch (error) { onError?.(error); }
    return () => undefined;
  }

  setNotificationRead(notificationId: string, read: boolean): Promise<OperationalNotification> {
    return this.respond(() => {
      const actorId = this.actor().id;
      const notification = this.operationalNotifications.find((item) => item.id === notificationId && item.recipientId === actorId);
      if (!notification) throw ApiError.of(ERR.NOT_FOUND, "Notification not found.");
      notification.readAt = read ? nowISO() : undefined;
      return { ...notification };
    });
  }

  markAllNotificationsRead(): Promise<void> {
    return this.respond(() => {
      const actorId = this.actor().id;
      const now = nowISO();
      this.operationalNotifications.filter((item) => item.recipientId === actorId).forEach((notification) => { notification.readAt = now; });
    });
  }

  // -------------------------------------------------------------------------
  // infrastructure
  // -------------------------------------------------------------------------

  setBehavior(behavior: Partial<MockBehavior>): void {
    this.behavior = { ...this.behavior, ...behavior };
  }

  getBehavior(): MockBehavior {
    return { ...this.behavior };
  }

  resetDemo(): Promise<void> {
    const role = currentRole(this.db);
    const branch = this.db.session.activeBranchId;
    this.db = buildSeed();
    this.memberImports.clear();
    this.memberImportIdempotency.clear();
    this.gymApplications = INITIAL_GYM_APPLICATIONS.map((application) => ({ ...application }));
    this.platformGyms = MARKETPLACE_GYMS.map((gym) => ({
      ...gym,
      areas: [...gym.areas],
      amenities: [...gym.amenities],
      branches: gym.branches.map((branch) => ({ ...branch, trialSlots: [...branch.trialSlots] })),
    }));
    this.platformPlans = MOCK_SAAS_PLANS.map((plan) => ({ ...plan }));
    this.platformInvoices = MOCK_INVOICES.map((invoice) => ({ ...invoice }));
    this.platformSupportCases = MOCK_SUPPORT_CASES.map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) }));
    this.operationalNotifications = [];
    this.trialBookings = INITIAL_TRIAL_BOOKINGS.map((booking) => ({ ...booking }));
    this.membershipSaleIdempotency.clear();
    this.membershipTransferIdempotency.clear();
    this.ptTrainers = [];
    this.ptPackages = [];
    this.ptRules = [];
    this.ptExceptions = [];
    this.ptEntitlements = [];
    this.ptBookings = [];
    this.ptOrders = [];
    this.operationalEmailKinds = [];
    this.operationalEmailUpdate = undefined;
    const trainer = this.db.users.find((user) => user.role === "trainer" && user.status === "active");
    if (trainer) {
      const createdAt = nowISO();
      const profileId = mockUuid();
      this.ptTrainers = [{ id: profileId, organizationId: this.db.organization.id, userId: trainer.id, displayName: trainer.name, specialties: ["Strength", "Mobility"], languages: ["en", "ar"], branchIds: trainer.branchScope === "all" ? this.db.branches.map((branch) => branch.id) : trainer.branchIds, status: "published", createdAt, updatedAt: createdAt }];
      this.ptRules = this.ptTrainers[0]!.branchIds.flatMap((branchId) => (["sun", "mon", "tue", "wed", "thu"] as T.WeekdayKey[]).map((weekday) => ({ id: mockUuid(), trainerProfileId: profileId, branchId, weekday, startMinute: 8 * 60, endMinute: 17 * 60, active: true })));
    }
    this.ptPackages = ([
      [12, 240_000, 90],
      [20, 360_000, 120],
      [30, 480_000, 180],
    ] as const).map(([sessionCount, amount, validityDays]) => ({ id: mockUuid(), organizationId: this.db.organization.id, name: `${sessionCount} PT sessions`, sessionCount, totalPrice: money(amount), validityDays, branchAccess: "all", branchIds: [], status: "active", createdAt: nowISO(), updatedAt: nowISO() }));
    const listing = this.platformGyms[0];
    this.gymPublicProfile = { organizationId: this.db.organization.id, version: 1, status: "published", shortName: listing?.shortName ?? this.db.organization.name.slice(0, 12), taglineEn: listing?.tagline ?? "", descriptionEn: listing?.description ?? "", category: listing?.category ?? "Gym", audience: listing?.audience ?? "All members", amenities: listing?.amenities ?? [], accentColor: listing?.accent ?? "#15140f", gallery: [], trainers: this.ptTrainers.filter((item) => item.status === "published"), ptPackages: this.ptPackages.filter((item) => item.status === "active"), publishedAt: nowISO(), updatedAt: nowISO() };
    this.gymProfileVersions = [{ id: mockUuid(), organizationId: this.db.organization.id, version: 1, status: "published", profile: { ...this.gymPublicProfile }, publishedAt: this.gymPublicProfile.publishedAt, updatedAt: this.gymPublicProfile.updatedAt }];
    // keep the persona the reviewer is using
    const userForRole = this.db.users.find((u) => u.role === role && u.status === "active");
    if (userForRole) this.db.session.userId = userForRole.id;
    this.db.session.activeBranchId = branch;
    return Promise.resolve();
  }

  private async respond<R>(fn: () => R | Promise<R>): Promise<R> {
    const latency = this.behavior.latencyMs;
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    if (this.behavior.failNextRequest) {
      this.behavior.failNextRequest = false;
      throw ApiError.of(ERR.FORCED_FAILURE, "Simulated failure (demo controls). Disable “Fail next request” and retry.");
    }
    return await fn();
  }

  private async subscribeOnce<R>(load: () => Promise<R>, onValue: (value: R) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try { onValue(await load()); } catch (error) { onError?.(error); }
    return () => undefined;
  }

  private today(): string {
    return todayISODate(TZ);
  }

  /**
   * Sensitive adjustments are auditable only if the reason is real. Enforced
   * here, not just in the dialogs, so the audit trail can never hold a blank.
   */
  private requireReason(reason: string | undefined, field = "reason") {
    if (!reason || !reason.trim()) {
      throw ApiError.of(ERR.VALIDATION, "A reason is required for this action.", {
        fieldErrors: { [field]: ["Required"] },
      });
    }
  }

  private require(permission: Permission) {
    const role = currentRole(this.db);
    const perms = permissionsFor(this.db, role);
    if (!perms.includes(permission)) {
      throw ApiError.of(ERR.FORBIDDEN, `Your role (${role}) is missing the “${permission}” permission.`);
    }
  }

  private actor() {
    return currentUser(this.db);
  }

  private marketingPreferenceFor(input: { marketingOptIn?: boolean; marketingPreferenceSource?: T.MarketingPreferenceSource }, fallbackOptedIn = true): T.MarketingPreference {
    const optedIn = input.marketingOptIn === undefined ? fallbackOptedIn : input.marketingOptIn !== false;
    const source = input.marketingPreferenceSource ?? (input.marketingOptIn === undefined ? "system_default" : "staff_selected");
    return {
      optedIn,
      source,
      changedAt: nowISO(),
      changedById: source === "system_default" ? undefined : this.actor().id,
      wordingVersion: MARKETING_WORDING_VERSION,
    };
  }

  private branchScopedBranchId(requested?: T.UUID): T.UUID | undefined {
    // Managers/reception scoped to branches can only see their own.
    const user = this.actor();
    if (user.branchScope === "all") return requested;
    if (requested && user.branchIds.includes(requested)) return requested;
    return user.branchIds[0];
  }

  private branchIsVisible(branchId?: T.UUID): boolean {
    const user = this.actor();
    return user.branchScope === "all" || !branchId || user.branchIds.includes(branchId);
  }

  private audit(input: Omit<T.AuditEvent, "id" | "organizationId" | "correlationId" | "occurredAt" | "actorId" | "actorName" | "actorRole">) {
    const actor = this.actor();
    const event: T.AuditEvent = {
      ...input,
      id: mockUuid(),
      organizationId: this.db.organization.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      correlationId: `mock-${mockUuid()}`,
      occurredAt: nowISO(),
    };
    this.db.audits.unshift(event);
    return event;
  }

  private activity(input: Omit<T.TimelineEvent, "id" | "organizationId" | "occurredAt"> & { occurredAt?: string }) {
    const event: T.TimelineEvent = {
      ...input,
      id: mockUuid(),
      organizationId: this.db.organization.id,
      occurredAt: input.occurredAt ?? nowISO(),
    };
    this.db.activities.unshift(event);
    return event;
  }

  // -------------------------------------------------------------------------
  // mappers
  // -------------------------------------------------------------------------

  private membershipStatusOf(m: MembershipRecord): T.MembershipEffectiveStatus {
    return deriveMembershipStatus(
      {
        cancelledAt: m.cancelledAt,
        activeFreeze: m.activeFreeze,
        startDate: m.startDate,
        endDate: m.endDate,
        remainingVisits: m.remainingVisits,
        totalVisits: m.totalVisits,
      },
      this.today(),
    );
  }

  private currentMembership(memberId: T.UUID): MembershipRecord | undefined {
    const terms = this.db.memberships.filter((m) => m.memberId === memberId);
    if (terms.length === 0) return undefined;
    const rank: Record<T.MembershipEffectiveStatus, number> = { active: 0, expiring: 0, frozen: 0, depleted: 1, scheduled: 2, expired: 3, cancelled: 4 };
    return terms.sort((a, b) => rank[this.membershipStatusOf(a)] - rank[this.membershipStatusOf(b)] || b.endDate.localeCompare(a.endDate))[0];
  }

  private outstandingForMember(memberId: T.UUID): T.Money {
    const total = this.db.charges
      .filter((c) => c.memberId === memberId)
      .reduce((s, c) => s + collectibleOutstandingMinor(c, this.today()), 0);
    return money(total);
  }

  private chargeProjection(charge: T.Charge | undefined): T.Charge | undefined {
    if (!charge) return undefined;
    return {
      ...charge,
      issueDate: charge.issueDate ?? charge.createdAt.slice(0, 10),
      dueDate: charge.dueDate ?? charge.issueDate ?? charge.createdAt.slice(0, 10),
      collectible: chargeIsCollectible(charge, this.today()),
    };
  }

  private toMemberSummary(m: MemberRecord): T.MemberSummary {
    const current = this.currentMembership(m.id);
    const plan = current ? this.db.plans.find((p) => p.id === current.planId) : undefined;
    const lastCheckIn = this.db.checkIns.find((c) => c.memberId === m.id && c.decision !== "blocked");
    return {
      id: m.id,
      memberNumber: m.memberNumber,
      fullName: m.fullName,
      fullNameAr: m.fullNameAr,
      phone: m.phone,
      email: m.email,
      homeBranchId: m.homeBranchId,
      status: m.status,
      tags: m.tags,
      membershipStatus: current ? this.membershipStatusOf(current) : undefined,
      currentPlanName: plan?.name,
      membershipEndDate: current?.endDate,
      outstanding: this.outstandingForMember(m.id),
      lastCheckInAt: lastCheckIn?.occurredAt,
      createdAt: m.createdAt,
    };
  }

  private toMemberDetail(m: MemberRecord, viewerPerms?: string[]): T.MemberDetail {
    const perms = viewerPerms ?? permissionsFor(this.db, currentRole(this.db));
    const summary = this.toMemberSummary(m);
    const checkIns30 = this.db.checkIns.filter(
      (c) => c.memberId === m.id && c.decision !== "blocked" && daysFromToday(c.occurredAt.slice(0, 10)) >= -30,
    ).length;
    const allCheckIns = this.db.checkIns.filter((c) => c.memberId === m.id && c.decision !== "blocked");
    const lifetime = this.db.payments
      .filter((p) => p.memberId === m.id && p.status !== "voided")
      .reduce((s, p) => s + p.amount.amount, 0);
    const last = allCheckIns[0];
    return {
      ...summary,
      gender: m.gender,
      dateOfBirth: m.dateOfBirth,
      preferredLanguage: m.preferredLanguage,
      emergencyContactName: m.emergencyContactName,
      emergencyContactPhone: m.emergencyContactPhone,
      source: m.source,
      assignedSalespersonId: m.assignedSalespersonId,
      marketingOptIn: m.marketingOptIn,
      marketingPreference: m.marketingPreference ?? { optedIn: m.marketingOptIn, source: "system_default", wordingVersion: "legacy-boolean" },
      notes: m.notes,
      sensitiveNotes: perms.includes("members.sensitive_notes.read") ? m.sensitiveNotes : undefined,
      archivedAt: m.archivedAt,
      stats: {
        checkInsLast30Days: checkIns30,
        totalCheckIns: allCheckIns.length,
        lifetimeValue: money(lifetime),
        outstanding: summary.outstanding,
        daysSinceLastCheckIn: last ? Math.max(0, -daysFromToday(last.occurredAt.slice(0, 10))) : undefined,
      },
    };
  }

  private toMembership(record: MembershipRecord): T.Membership {
    return {
      id: record.id,
      organizationId: record.organizationId,
      memberId: record.memberId,
      planId: record.planId,
      homeBranchId: record.homeBranchId,
      startDate: record.startDate,
      endDate: record.endDate,
      status: this.membershipStatusOf(record),
      totalVisits: record.totalVisits,
      remainingVisits: record.remainingVisits,
      salePrice: record.salePrice,
      discount: record.discount,
      discountReason: record.discountReason,
      discountApprovalStatus: record.discountApprovalStatus,
      paymentStatus: this.paymentStatusForMembership(record),
      soldById: record.soldById,
      previousMembershipId: record.previousMembershipId,
      frozenDaysUsed: record.frozenDaysUsed,
      activeFreeze: record.activeFreeze,
      cancelledAt: record.cancelledAt,
      cancellationReason: record.cancellationReason,
      createdAt: record.createdAt,
    };
  }

  private paymentStatusForMembership(record: MembershipRecord): T.PaymentStatus {
    const charge = this.db.charges.find((c) => c.membershipId === record.id);
    return charge?.status ?? "unpaid";
  }

  private toMembershipSummary(record: MembershipRecord): T.MembershipSummary {
    const member = this.db.members.find((m) => m.id === record.memberId);
    const plan = this.db.plans.find((p) => p.id === record.planId);
    const branch = this.db.branches.find((b) => b.id === record.homeBranchId);
    const charge = this.db.charges.find((c) => c.membershipId === record.id);
    return {
      ...this.toMembership(record),
      memberName: member?.fullName ?? "Unknown member",
      memberNumber: member?.memberNumber ?? "—",
      planName: plan?.name ?? "Unknown plan",
      branchName: branch?.name ?? "—",
      planFreezeAllowanceDays: plan?.freezeAllowanceDays ?? 0,
      outstanding: charge && chargeIsCollectible(charge, this.today()) ? charge.outstandingAmount : zeroMoney(),
      upcomingAmount: charge && !chargeIsCollectible(charge, this.today()) && charge.status !== "void" && charge.status !== "refunded" ? charge.outstandingAmount : zeroMoney(),
    };
  }

  private toPlan(plan: T.MembershipPlan): T.MembershipPlan {
    const activeSubscribers = this.db.memberships.filter((m) => {
      if (m.planId !== plan.id) return false;
      const s = this.membershipStatusOf(m);
      return s === "active" || s === "expiring" || s === "frozen";
    }).length;
    return { ...plan, includedPtSessions: plan.includedPtSessions ?? 0, activeSubscribers };
  }

  private ensureIncludedPtEntitlement(membershipId: T.UUID): T.PtEntitlement | undefined {
    const existing = this.ptEntitlements.find((item) => item.membershipId === membershipId && item.source === "included");
    if (existing) return existing;
    const membership = this.db.memberships.find((item) => item.id === membershipId);
    if (!membership) return undefined;
    const plan = this.db.plans.find((item) => item.id === membership.planId);
    const sessions = plan?.includedPtSessions ?? 0;
    if (sessions <= 0) return undefined;
    const now = nowISO();
    const entitlement: T.PtEntitlement = { id: mockUuid(), organizationId: this.db.organization.id, memberId: membership.memberId, source: "included", membershipId, granted: sessions, reserved: 0, consumed: 0, revoked: 0, available: sessions, expiresAt: `${membership.endDate}T23:59:59.999Z`, status: "active", createdAt: now, updatedAt: now };
    this.ptEntitlements.push(entitlement);
    this.activity({ memberId: membership.memberId, type: "pt_credit_granted", title: `${sessions} included PT session${sessions === 1 ? "" : "s"} granted`, meta: { membershipId, entitlementId: entitlement.id } });
    return entitlement;
  }

  private ptBookingView(booking: T.PtBooking): T.PtBooking {
    return { ...booking };
  }

  private toLeadSummary(lead: T.Lead): T.LeadSummary {
    const owner = lead.ownerId ? this.db.users.find((u) => u.id === lead.ownerId) : undefined;
    const branch = this.db.branches.find((b) => b.id === lead.branchId);
    const attempts = this.db.activities.filter((a) => a.leadId === lead.id && a.type === "call_attempt");
    const last = attempts[0];
    const open = lead.stage !== "won" && lead.stage !== "lost";
    return {
      ...lead,
      ownerName: owner?.name,
      branchName: branch?.name ?? "—",
      lastContactOutcome: last?.meta?.outcome ? String(last.meta.outcome) : undefined,
      lastContactAt: last?.occurredAt,
      overdue: open && Boolean(lead.nextFollowUpAt && lead.nextFollowUpAt < nowISO()),
    };
  }

  private toTransaction(p: T.Payment): T.TransactionSummary {
    const member = this.db.members.find((m) => m.id === p.memberId);
    const branch = this.db.branches.find((b) => b.id === p.branchId);
    return { ...p, memberName: member?.fullName ?? "—", memberNumber: member?.memberNumber ?? "—", branchName: branch?.name ?? "—" };
  }

  private matchesSearch(haystack: Array<string | undefined>, search?: string): boolean {
    if (!search) return true;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const normalized = q.replace(/[\s-]/g, "");
    return haystack.some((h) => {
      if (!h) return false;
      const s = h.toLowerCase();
      return s.includes(q) || s.replace(/[\s-]/g, "").includes(normalized);
    });
  }

  private maybeEmpty<I>(items: I[]): I[] {
    return this.behavior.forceEmptyLists ? [] : items;
  }

  // -------------------------------------------------------------------------
  // session
  // -------------------------------------------------------------------------

  getSession(): Promise<T.Session> {
    return this.respond(() => this.buildSession());
  }

  selectOrganization(_organizationId: T.UUID): Promise<T.Session> {
    return this.getSession();
  }

  private buildSession(): T.Session {
    const user = this.actor();
    const org = this.db.organization;
    return {
      user: { id: user.id, name: user.name, email: user.email },
      organization: { id: org.id, name: org.name, currency: org.currency, timezone: org.timezone, locale: org.locale },
      branches: this.db.branches.map((b) => ({ id: b.id, name: b.name, code: b.code })),
      activeBranchId: this.db.session.activeBranchId,
      roles: [user.role],
      permissions: permissionsFor(this.db, user.role),
    };
  }

  switchDemoRole(
    role: T.RoleKey,
    branchId?: T.UUID,
    identity?: Pick<T.Session["user"], "name" | "email">,
  ): Promise<T.Session> {
    return this.respond(() => {
      const user = this.db.users.find((u) => u.role === role && u.status === "active");
      if (!user) throw ApiError.of(ERR.NOT_FOUND, `No active demo user for role ${role}.`);
      // Convex supplies the real role while the operating data is still mocked.
      // Rebind the seeded actor to the authenticated profile so current-user UI
      // and newly created audit events never impersonate the seed persona.
      if (identity) {
        user.name = identity.name;
        user.email = identity.email;
      }
      this.db.session.userId = user.id;
      this.db.session.activeBranchId =
        branchId ?? (user.branchScope === "selected" ? user.branchIds[0] : undefined);
      return this.buildSession();
    });
  }

  setActiveBranch(branchId: T.UUID | undefined): Promise<T.Session> {
    return this.respond(() => {
      this.db.session.activeBranchId = branchId;
      return this.buildSession();
    });
  }

  signOut(): Promise<void> {
    return this.respond(() => undefined);
  }

  // -------------------------------------------------------------------------
  // dashboard
  // -------------------------------------------------------------------------

  getDashboard(query: DashboardQuery): Promise<T.DashboardData> {
    return this.respond(() => {
      const today = this.today();
      const branchId = this.branchScopedBranchId(query.branchId);
      const inBranch = <X extends { branchId?: T.UUID; homeBranchId?: T.UUID }>(x: X) =>
        !branchId || x.branchId === branchId || x.homeBranchId === branchId;

      const validPayments = this.db.payments.filter((p) => p.status !== "voided" && inBranch(p));
      const dayOf = (isoStr: string) => todayISODate(TZ, new Date(isoStr));
      const revenueOn = (date: string) =>
        validPayments.filter((p) => dayOf(p.occurredAt) === date).reduce((s, p) => s + p.amount.amount, 0);

      const monthStart = today.slice(0, 8) + "01";
      const prevMonthDate = addDays(monthStart, -1);
      const prevMonthStart = prevMonthDate.slice(0, 8) + "01";
      const revenueBetween = (from: string, to: string) =>
        validPayments
          .filter((p) => {
            const d = dayOf(p.occurredAt);
            return d >= from && d <= to;
          })
          .reduce((s, p) => s + p.amount.amount, 0);

      const outstandingTotal = this.db.charges
        .filter((c) => c.status !== "refunded")
        .filter((c) => {
          if (!branchId) return true;
          const ms = this.db.memberships.find((m) => m.id === c.membershipId);
          return ms ? ms.homeBranchId === branchId : true;
        })
        .reduce((s, c) => s + c.outstandingAmount.amount, 0);

      const statuses = this.db.memberships.map((m) => ({ m, s: this.membershipStatusOf(m) }));
      const renewalsDue = statuses.filter(
        ({ m, s }) => (s === "active" || s === "expiring") && inBranch(m) && diffDays(today, m.endDate) >= 0 && diffDays(today, m.endDate) <= 7,
      ).length;
      const expiredUnactioned = statuses.filter(({ m, s }) => {
        if (s !== "expired" || !inBranch(m)) return false;
        const daysExpired = diffDays(m.endDate, today);
        return daysExpired <= 30;
      }).length;

      const openTasks = this.db.tasks.filter((t) => t.status === "open");
      const overdueTasks = openTasks.filter((t) => t.dueAt < nowISO());

      const leads = this.db.leads.filter((l) => inBranch(l));
      const activeLeads = leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length;

      const checkInsToday = this.db.checkIns.filter((c) => inBranch(c) && dayOf(c.occurredAt) === today && c.decision !== "blocked").length;

      const revenueSeries: T.RevenuePoint[] = [];
      for (let d = 29; d >= 0; d--) {
        const date = addDays(today, -d);
        const collected = validPayments.filter((p) => p.type === "payment" && dayOf(p.occurredAt) === date).reduce((s, p) => s + p.amount.amount, 0);
        const refunds = validPayments.filter((p) => p.type === "refund" && dayOf(p.occurredAt) === date).reduce((s, p) => s + Math.abs(p.amount.amount), 0);
        revenueSeries.push({ date, collected, refunds });
      }

      const branchRevenue: T.BranchRevenue[] = this.db.branches
        .filter((b) => !branchId || b.id === branchId)
        .map((b) => ({
          branchId: b.id,
          branchName: b.name,
          collected: money(this.branchRevenue(b.id, addDays(today, -29), today)),
          checkInsToday: this.db.checkIns.filter((c) => c.branchId === b.id && dayOf(c.occurredAt) === today && c.decision !== "blocked").length,
          activeMembers: this.db.members.filter((m) => {
            if (m.homeBranchId !== b.id || m.status !== "active") return false;
            const cur = this.currentMembership(m.id);
            return cur && isMembershipUsable(this.membershipStatusOf(cur));
          }).length,
        }));

      const funnelOrder: T.LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];
      const funnelLabels: Record<T.LeadStage, string> = {
        new: "New",
        attempted: "Attempted",
        contacted: "Contacted",
        trial_booked: "Trial booked",
        trial_completed: "Trial done",
        offer_sent: "Offer sent",
        won: "Won",
        lost: "Lost",
      };
      const funnel: T.FunnelStage[] = funnelOrder.map((stage) => ({
        stage,
        label: funnelLabels[stage],
        count: leads.filter((l) => l.stage === stage).length,
      }));

      const leaderboard: T.SalespersonStat[] = this.db.users
        .filter((u) => u.role === "salesperson" && u.status === "active")
        .map((u) => {
          const collected = validPayments
            .filter((p) => p.collectedById === u.id && p.type === "payment" && dayOf(p.occurredAt) >= monthStart)
            .reduce((s, p) => s + p.amount.amount, 0);
          const sold = this.db.memberships.filter((m) => m.soldById === u.id && dayOf(m.createdAt) >= monthStart);
          return {
            userId: u.id,
            name: u.name,
            revenueCollected: money(collected),
            newSales: sold.filter((m) => !m.previousMembershipId).length,
            renewals: sold.filter((m) => m.previousMembershipId).length,
            leadsConverted: this.db.leads.filter((l) => l.ownerId === u.id && l.stage === "won").length,
            followUpsCompleted: this.db.tasks.filter((t) => t.ownerId === u.id && t.status === "completed" && dayOf(t.completedAt ?? t.createdAt) >= monthStart).length,
            overdueFollowUps: overdueTasks.filter((t) => t.ownerId === u.id).length,
          };
        })
        .sort((a, b) => b.revenueCollected.amount - a.revenueCollected.amount);

      const alerts = this.buildAlerts(branchId);

      const recentActivity = this.db.activities
        .filter((a) => !a.leadId)
        .slice(0, 14);

      return {
        kpis: {
          revenueToday: money(revenueOn(today)),
          revenueThisMonth: money(revenueBetween(monthStart, today)),
          revenuePrevMonth: money(revenueBetween(prevMonthStart, prevMonthDate)),
          outstandingTotal: money(outstandingTotal),
          newMembersThisMonth: this.db.members.filter((m) => dayOf(m.createdAt) >= monthStart).length,
          renewalsDueNext7Days: renewalsDue,
          expiredUnactioned,
          checkInsToday,
          activeLeads,
          overdueFollowUps: overdueTasks.length,
        },
        revenueSeries,
        branchRevenue,
        funnel,
        leaderboard,
        alerts,
        recentActivity,
      };
    });
  }

  subscribeDashboard(query: DashboardQuery, onValue: (dashboard: T.DashboardData) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getDashboard(query), onValue, onError);
  }

  private branchRevenue(branchId: T.UUID, from: string, to: string): number {
    return this.db.payments
      .filter((p) => {
        if (p.branchId !== branchId || p.status === "voided") return false;
        const d = todayISODate(TZ, new Date(p.occurredAt));
        return d >= from && d <= to;
      })
      .reduce((s, p) => s + p.amount.amount, 0);
  }

  private buildAlerts(branchId?: T.UUID): T.DashboardAlert[] {
    const alerts: T.DashboardAlert[] = [];
    // Alerts follow the selected branch: an owner filtering to one location
    // must not be shown another branch's exceptions. Events with no branch
    // (organization-wide changes) stay visible either way.
    const inScope = (a: T.AuditEvent) => !branchId || !a.branchId || a.branchId === branchId;
    const pendingApprovals = this.db.audits.filter((a) => a.approvalStatus === "pending" && inScope(a));
    for (const a of pendingApprovals) {
      if (a.action === "membership.discount") {
        alerts.push({
          id: `alert-${a.id}`,
          kind: "pending_discount",
          title: "Discount awaiting approval",
          detail: `${a.summary} — ${a.entityLabel}`,
          actorName: a.actorName,
          href: "/audit?approval=pending",
          severity: "warning",
          occurredAt: a.occurredAt,
        });
      } else if (a.action === "shift.close_variance") {
        alerts.push({
          id: `alert-${a.id}`,
          kind: "cash_variance",
          title: "Cash variance to review",
          detail: a.summary,
          actorName: a.actorName,
          href: "/payments/shifts",
          severity: "critical",
          occurredAt: a.occurredAt,
        });
      } else if (a.action === "payment.refund") {
        alerts.push({
          id: `alert-${a.id}`,
          kind: "refund",
          title: "Refund awaiting review",
          detail: a.summary,
          actorName: a.actorName,
          href: "/audit?approval=pending",
          severity: "warning",
          occurredAt: a.occurredAt,
        });
      }
    }
    const overrides = this.db.audits.filter((a) => a.action === "checkin.override" && inScope(a)).slice(0, 2);
    for (const a of overrides) {
      alerts.push({
        id: `alert-${a.id}`,
        kind: "checkin_override",
        title: "Check-in override used",
        detail: `${a.entityLabel} — ${a.reason ?? ""}`,
        actorName: a.actorName,
        href: "/audit?category=checkins",
        severity: "info",
        occurredAt: a.occurredAt,
      });
    }
    return alerts.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  }

  // -------------------------------------------------------------------------
  // members
  // -------------------------------------------------------------------------

  listMembers(query: MemberListQuery): Promise<T.Page<T.MemberSummary>> {
    return this.respond(() => {
      this.require("members.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = this.db.members.map((m) => this.toMemberSummary(m));
      if (branchId) items = items.filter((m) => m.homeBranchId === branchId);
      if (query.status) items = items.filter((m) => m.status === query.status);
      if (query.planId) {
        items = items.filter((m) => {
          const cur = this.currentMembership(m.id);
          return cur?.planId === query.planId;
        });
      }
      if (query.membershipStatus) {
        if (query.membershipStatus === "outstanding") {
          items = items.filter((m) => m.outstanding.amount > 0);
        } else {
          items = items.filter((m) => m.membershipStatus === query.membershipStatus);
        }
      }
      items = items.filter((m) => this.matchesSearch([m.fullName, m.fullNameAr, m.phone, m.memberNumber, m.email], query.search));
      items = applySort(items, query.sort ?? "fullName", (m, k) => {
        switch (k) {
          case "fullName": return m.fullName;
          case "memberNumber": return m.memberNumber;
          case "membershipEndDate": return m.membershipEndDate;
          case "lastCheckInAt": return m.lastCheckInAt;
          case "outstanding": return m.outstanding.amount;
          case "createdAt": return m.createdAt;
          default: return m.fullName;
        }
      });
      return paginate(this.maybeEmpty(items), query);
    });
  }

  getMember(memberId: T.UUID): Promise<T.MemberDetail> {
    return this.respond(() => {
      this.require("members.read");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      return this.toMemberDetail(m);
    });
  }

  subscribeMember(memberId: T.UUID, onValue: (member: T.MemberDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getMember(memberId), onValue, onError);
  }

  checkMemberDuplicates(input: { phone?: string; email?: string }): Promise<T.DuplicateMatch[]> {
    return this.respond(() => this.findDuplicates(input));
  }

  /** Phone/email match ignoring formatting. Shared by the check and by create. */
  private findDuplicates(input: { phone?: string; email?: string }): T.DuplicateMatch[] {
    const norm = (s?: string) => (s ?? "").replace(/[\s+()-]/g, "").toLowerCase();
    const matches: T.DuplicateMatch[] = [];
    for (const m of this.db.members) {
      if (m.status === "archived") continue;
      if (input.phone && norm(m.phone) === norm(input.phone)) {
        matches.push({ memberId: m.id, fullName: m.fullName, memberNumber: m.memberNumber, matchedOn: "phone" });
      } else if (input.email && m.email && norm(m.email) === norm(input.email)) {
        matches.push({ memberId: m.id, fullName: m.fullName, memberNumber: m.memberNumber, matchedOn: "email" });
      }
    }
    return matches;
  }

  createMember(input: T.CreateMemberInput): Promise<T.CreateMemberResult> {
    return this.respond(() => {
      this.require("members.write");
      if (!input.fullName.trim() || !input.phone.trim()) {
        throw ApiError.of(ERR.VALIDATION, "Name and phone are required.", {
          fieldErrors: {
            ...(input.fullName.trim() ? {} : { fullName: ["Full name is required"] }),
            ...(input.phone.trim() ? {} : { phone: ["Phone is required"] }),
          },
        });
      }
      this.db.counters.memberNumber += 1;
      const branch = this.db.branches.find((b) => b.id === input.homeBranchId) ?? this.db.branches[0]!;
      const record: MemberRecord = {
        id: mockUuid(),
        memberNumber: `${branch.code}-${this.db.counters.memberNumber}`,
        fullName: input.fullName.trim(),
        fullNameAr: input.fullNameAr,
        phone: input.phone.trim(),
        email: input.email?.trim().toLowerCase() || undefined,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        homeBranchId: branch.id,
        status: "active",
        tags: input.tags ?? [],
        preferredLanguage: input.preferredLanguage,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        source: input.source,
        assignedSalespersonId: input.assignedSalespersonId,
        marketingOptIn: input.marketingOptIn !== false,
        marketingPreference: this.marketingPreferenceFor(input),
        notes: input.notes,
        createdAt: nowISO(),
      };
      // Duplicate detection runs against the directory *before* the new record
      // is inserted, so the member never matches themselves. The record is still
      // created — reception decides whether to merge — but the caller is warned.
      const duplicates = this.findDuplicates({ phone: input.phone, email: input.email });

      this.db.members.push(record);
      this.activity({
        memberId: record.id,
        type: "member_created",
        title: "Member profile created",
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return {
        member: this.toMemberDetail(record),
        duplicates,
      };
    });
  }

  updateMember(memberId: T.UUID, input: T.UpdateMemberInput): Promise<T.MemberDetail> {
    return this.respond(() => {
      this.require("members.write");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      const marketingChanged = input.marketingOptIn !== undefined || input.marketingPreferenceSource !== undefined;
      const beforePreference = m.marketingPreference ?? { optedIn: m.marketingOptIn, source: "system_default" as const };
      Object.assign(m, {
        ...input,
        email: input.email === undefined ? m.email : input.email || undefined,
      });
      delete (m as MemberRecord & { marketingPreferenceSource?: unknown }).marketingPreferenceSource;
      if (marketingChanged) {
        m.marketingOptIn = input.marketingOptIn === undefined ? m.marketingOptIn : input.marketingOptIn !== false;
        m.marketingPreference = this.marketingPreferenceFor(input, m.marketingOptIn);
        this.activity({
          memberId: m.id,
          type: "marketing_preference_changed",
          title: `Marketing messages ${m.marketingOptIn ? "enabled" : "disabled"}`,
          body: `Preference changed from ${beforePreference.optedIn ? "opted in" : "opted out"} to ${m.marketingOptIn ? "opted in" : "opted out"}.`,
          actorId: this.actor().id,
          actorName: this.actor().name,
          meta: { optedIn: m.marketingOptIn, source: m.marketingPreference.source },
        });
        this.audit({
          category: "members",
          action: "member.marketing_preference.update",
          entityType: "member",
          entityId: m.id,
          entityLabel: `${m.fullName} · ${m.memberNumber}`,
          summary: `Marketing messages ${m.marketingOptIn ? "enabled" : "disabled"}`,
          before: { optedIn: beforePreference.optedIn ? "true" : "false", source: beforePreference.source },
          after: { optedIn: m.marketingOptIn ? "true" : "false", source: m.marketingPreference.source },
          branchId: m.homeBranchId,
        });
      }
      return this.toMemberDetail(m);
    });
  }

  archiveMember(memberId: T.UUID, input: { reason: string }): Promise<void> {
    return this.respond(() => {
      this.require("members.archive");
      this.requireReason(input.reason);
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      m.status = "archived";
      m.archivedAt = nowISO();
      this.audit({
        category: "members",
        action: "member.archive",
        entityType: "member",
        entityId: m.id,
        entityLabel: `${m.fullName} · ${m.memberNumber}`,
        summary: "Member archived",
        reason: input.reason,
        before: { status: "active" },
        after: { status: "archived" },
        branchId: m.homeBranchId,
      });
    });
  }

  listMemberTimeline(memberId: T.UUID, query?: TimelineQuery): Promise<T.Page<T.TimelineEvent>> {
    return this.respond(() => {
      this.require("members.read");
      let items = this.db.activities.filter((a) => a.memberId === memberId);
      if (query?.types && query.types.length > 0) items = items.filter((a) => query.types!.includes(a.type));
      return paginate(this.maybeEmpty(items), query ?? {});
    });
  }

  logMemberContactAttempt(memberId: T.UUID, input: T.ContactAttemptInput): Promise<T.TimelineEvent> {
    return this.respond(() => {
      this.require("crm.write");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      if (input.nextFollowUpAt) {
        // surface as an open renewal/follow-up task owned by the actor
        this.db.tasks.push({
          id: mockUuid(),
          organizationId: this.db.organization.id,
          type: "follow_up",
          title: `Follow up — ${m.fullName}`,
          ownerId: this.actor().id,
          ownerName: this.actor().name,
          dueAt: input.nextFollowUpAt,
          priority: "normal",
          status: "open",
          memberId: m.id,
          subjectName: m.fullName,
          createdById: this.actor().id,
          createdAt: nowISO(),
        });
      }
      return this.activity({
        memberId,
        type: "call_attempt",
        title: `Call — ${input.outcome.replace(/_/g, " ")}`,
        body: input.notes,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { outcome: input.outcome },
      });
    });
  }

  addMemberNote(memberId: T.UUID, input: { body: string }): Promise<T.TimelineEvent> {
    return this.respond(() => {
      this.require("members.write");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      return this.activity({
        memberId,
        type: "note",
        title: "Note added",
        body: input.body,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
    });
  }

  // -------------------------------------------------------------------------
  // plans
  // -------------------------------------------------------------------------

  listPlans(query: PlanListQuery): Promise<T.Page<T.MembershipPlan>> {
    return this.respond(() => {
      let items = this.db.plans.map((p) => this.toPlan(p));
      if (query.status) items = items.filter((p) => p.status === query.status);
      else items = items.filter((p) => p.status === "active");
      items = items.filter((p) => this.matchesSearch([p.name, p.code], query.search));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  createPlan(input: T.CreatePlanInput): Promise<T.MembershipPlan> {
    return this.respond(() => {
      this.require("settings.manage");
      const plan: T.MembershipPlan = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        activeSubscribers: 0,
        status: "active",
        includedPtSessions: input.includedPtSessions ?? 0,
        ...input,
      };
      this.db.plans.push(plan);
      this.audit({
        category: "settings",
        action: "plan.create",
        entityType: "plan",
        entityId: plan.id,
        entityLabel: plan.name,
        summary: `Plan created — JOD ${(plan.basePrice.amount / 1000).toFixed(3)}`,
      });
      return this.toPlan(plan);
    });
  }

  updatePlan(planId: T.UUID, input: T.UpdatePlanInput): Promise<T.MembershipPlan> {
    return this.respond(() => {
      this.require("settings.manage");
      const plan = this.db.plans.find((p) => p.id === planId);
      if (!plan) throw ApiError.of(ERR.NOT_FOUND, "Plan not found.");
      const before = { basePrice: plan.basePrice.amount, status: plan.status };
      Object.assign(plan, input);
      this.audit({
        category: "settings",
        action: "plan.update",
        entityType: "plan",
        entityId: plan.id,
        entityLabel: plan.name,
        summary: "Plan updated",
        before,
        after: { basePrice: plan.basePrice.amount, status: plan.status },
      });
      return this.toPlan(plan);
    });
  }

  // -------------------------------------------------------------------------
  // personal training
  getPtWorkspace(): Promise<T.PtWorkspace> {
    return this.respond(() => {
      this.require("pt.reports.read");
      const paidOrderIds = new Set(this.ptOrders.filter((order) => order.status !== "pending_payment" && order.status !== "cancelled").map((order) => order.id));
      const packageRevenue = this.ptOrders.reduce((total, order) => {
        if (!paidOrderIds.has(order.id)) return total;
        return total + (this.ptPackages.find((item) => item.id === order.packageId)?.totalPrice.amount ?? 0);
      }, 0);
      return {
        trainers: this.ptTrainers.map((item) => ({ ...item, availabilityRules: this.ptRules.filter((rule) => rule.trainerProfileId === item.id).map((rule) => ({ ...rule })), availabilityExceptions: this.ptExceptions.filter((exception) => exception.trainerProfileId === item.id).map((exception) => ({ ...exception })) })),
        packages: this.ptPackages.map((item) => ({ ...item })),
        bookings: [...this.ptBookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((item) => this.ptBookingView(item)),
        pendingOrders: this.ptOrders.filter((order) => order.status === "pending_payment").map((item) => ({ ...item, memberName: this.db.members.find((member) => member.id === item.memberId)?.fullName ?? "Member", packageName: this.ptPackages.find((pkg) => pkg.id === item.packageId)?.name ?? "PT package", paymentReference: `PT order ${item.id.slice(-6).toUpperCase()}` })),
        metrics: {
          packageRevenue: money(packageRevenue),
          sessionsUsed: this.ptEntitlements.reduce((total, item) => total + item.consumed, 0),
          sessionsReserved: this.ptEntitlements.reduce((total, item) => total + item.reserved, 0),
          upcomingBookings: this.ptBookings.filter((item) => ["reserved", "confirmed"].includes(item.status) && Date.parse(item.startsAt) > Date.now()).length,
          noShows: this.ptBookings.filter((item) => item.status === "no_show").length,
        },
      };
    });
  }

  subscribePtWorkspace(onValue: (workspace: T.PtWorkspace) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getPtWorkspace(), onValue, onError);
  }

  getPtMemberExperience(membershipId: T.UUID): Promise<T.PtMemberExperience> {
    return this.respond(() => {
      this.require("members.read");
      const membership = this.db.memberships.find((item) => item.id === membershipId);
      if (!membership) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      this.ensureIncludedPtEntitlement(membershipId);
      const entitlements = this.ptEntitlements.filter((item) => item.memberId === membership.memberId).map((item) => ({ ...item, available: ptAvailableCredits(item) }));
      return {
        organizationId: this.db.organization.id,
        membershipId,
        availableSessions: entitlements.reduce((total, item) => total + item.available, 0),
        reservedSessions: entitlements.reduce((total, item) => total + item.reserved, 0),
        entitlements,
        upcomingBookings: this.ptBookings.filter((item) => item.memberId === membership.memberId && ["reserved", "confirmed"].includes(item.status)).map((item) => this.ptBookingView(item)),
        orders: this.ptOrders.filter((item) => item.memberId === membership.memberId).map((item) => ({ ...item })),
        trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => ({ ...item })),
        packages: this.ptPackages.filter((item) => item.status === "active").map((item) => ({ ...item })),
      };
    });
  }

  subscribePtMemberExperience(membershipId: T.UUID, onValue: (experience: T.PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getPtMemberExperience(membershipId), onValue, onError);
  }

  getCustomerPtExperience(membershipId: T.UUID): Promise<T.PtMemberExperience> {
    const internal = this.db.memberships.find((item) => item.id === membershipId);
    if (internal) return this.getPtMemberExperience(membershipId);
    return this.respond(() => ({ organizationId: this.db.organization.id, membershipId, availableSessions: 0, reservedSessions: 0, entitlements: [], upcomingBookings: [], orders: [], trainers: this.ptTrainers.filter((item) => item.status === "published"), packages: this.ptPackages.filter((item) => item.status === "active") }));
  }

  subscribeCustomerPtExperience(membershipId: T.UUID, onValue: (experience: T.PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getCustomerPtExperience(membershipId), onValue, onError);
  }

  upsertPtTrainerProfile(input: T.UpsertPtTrainerProfileInput): Promise<T.PtTrainerProfile> {
    return this.respond(() => {
      this.require("pt.manage");
      const staff = this.db.users.find((item) => item.id === input.userId && item.role === "trainer" && item.status === "active");
      if (!staff) throw ApiError.of(ERR.VALIDATION, "Trainer profiles must link to an active trainer account.");
      if (input.status === "published" && input.photoAssetId && !input.photoAlt?.trim()) throw ApiError.of(ERR.VALIDATION, "Published trainer photos require alt text.");
      const existing = input.id ? this.ptTrainers.find((item) => item.id === input.id) : undefined;
      const now = nowISO();
      const value: T.PtTrainerProfile = { id: existing?.id ?? mockUuid(), organizationId: this.db.organization.id, userId: input.userId, displayName: input.displayName.trim(), bioEn: input.bioEn?.trim() || undefined, bioAr: input.bioAr?.trim() || undefined, specialties: [...input.specialties], languages: [...input.languages], branchIds: [...input.branchIds], photoAlt: input.photoAlt?.trim() || undefined, status: input.status, createdAt: existing?.createdAt ?? now, updatedAt: now };
      if (existing) this.ptTrainers.splice(this.ptTrainers.indexOf(existing), 1, value); else this.ptTrainers.push(value);
      this.audit({ category: "users", action: existing ? "pt.trainer.update" : "pt.trainer.create", entityType: "pt_trainer", entityId: value.id, entityLabel: value.displayName, summary: existing ? "Updated trainer profile" : "Created trainer profile" });
      return { ...value };
    });
  }

  upsertPtPackage(input: T.UpsertPtPackageInput): Promise<T.PtPackage> {
    return this.respond(() => {
      this.require("pt.manage");
      if (!Number.isSafeInteger(input.totalPrice.amount) || input.totalPrice.amount <= 0 || input.validityDays < 1) throw ApiError.of(ERR.VALIDATION, "Package price and validity must be positive.");
      const existing = input.id ? this.ptPackages.find((item) => item.id === input.id) : undefined;
      const now = nowISO();
      const value: T.PtPackage = { id: existing?.id ?? mockUuid(), organizationId: this.db.organization.id, name: input.name.trim(), sessionCount: input.sessionCount, totalPrice: { ...input.totalPrice }, validityDays: input.validityDays, branchAccess: input.branchAccess, branchIds: input.branchAccess === "all" ? [] : [...input.branchIds], status: input.status, createdAt: existing?.createdAt ?? now, updatedAt: now };
      const candidate = [...this.ptPackages.filter((item) => item.id !== value.id && item.status === "active"), value].filter((item) => item.status === "active");
      if (!ptPackageLadderIsValid(candidate)) throw ApiError.of(ERR.VALIDATION, "Larger PT packages cannot cost more per session than smaller packages.");
      if (existing) this.ptPackages.splice(this.ptPackages.indexOf(existing), 1, value); else this.ptPackages.push(value);
      this.audit({ category: "settings", action: existing ? "pt.package.update" : "pt.package.create", entityType: "pt_package", entityId: value.id, entityLabel: value.name, summary: existing ? "Updated PT package" : "Created PT package" });
      return { ...value };
    });
  }

  replacePtAvailability(input: T.ReplacePtAvailabilityInput): Promise<T.PtTrainerProfile> {
    return this.respond(() => {
      const profile = this.ptTrainers.find((item) => item.id === input.trainerProfileId);
      if (!profile) throw ApiError.of(ERR.NOT_FOUND, "Trainer profile not found.");
      const actor = this.actor();
      if (profile.userId !== actor.id) this.require("pt.manage"); else this.require("pt.schedule.self");
      for (const rule of input.rules) {
        if (rule.startMinute < 0 || rule.endMinute > 1440 || rule.endMinute - rule.startMinute < 60) throw ApiError.of(ERR.VALIDATION, "Availability windows must contain at least one 60-minute session.");
        if (input.rules.some((other) => other !== rule && other.branchId === rule.branchId && other.weekday === rule.weekday && rule.startMinute < other.endMinute && other.startMinute < rule.endMinute)) throw ApiError.of(ERR.CONFLICT, "Availability windows cannot overlap.");
      }
      this.ptRules = this.ptRules.filter((item) => item.trainerProfileId !== profile.id).concat(input.rules.map((rule) => ({ ...rule, id: mockUuid(), trainerProfileId: profile.id })));
      this.ptExceptions = this.ptExceptions.filter((item) => item.trainerProfileId !== profile.id).concat(input.exceptions.map((exception) => ({ ...exception, id: mockUuid(), trainerProfileId: profile.id })));
      this.audit({ category: "settings", action: "pt.availability.replace", entityType: "pt_trainer", entityId: profile.id, entityLabel: profile.displayName, summary: "Updated trainer availability" });
      return { ...profile };
    });
  }

  listPtAvailableSlots(input: { trainerProfileId: T.UUID; branchId: T.UUID; from: T.ISODate; to: T.ISODate }): Promise<T.PtAvailableSlot[]> {
    return this.respond(() => {
      const profile = this.ptTrainers.find((item) => item.id === input.trainerProfileId && item.status === "published");
      if (!profile || !profile.branchIds.includes(input.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Trainer is not available at this branch.");
      const slots: T.PtAvailableSlot[] = [];
      for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
        const weekday = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as T.WeekdayKey[])[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
        const blocked = this.ptExceptions.filter((item) => item.trainerProfileId === profile.id && item.branchId === input.branchId && item.date === date);
        for (const rule of this.ptRules.filter((item) => item.trainerProfileId === profile.id && item.branchId === input.branchId && item.weekday === weekday && item.active)) {
          for (let minute = rule.startMinute; minute + 60 <= rule.endMinute; minute += 60) {
            if (blocked.some((item) => item.startMinute === undefined || (minute < (item.endMinute ?? 1440) && (item.startMinute ?? 0) < minute + 60))) continue;
            const hour = String(Math.floor(minute / 60)).padStart(2, "0");
            const min = String(minute % 60).padStart(2, "0");
            const startsAt = new Date(`${date}T${hour}:${min}:00+03:00`).toISOString();
            const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
            if (Date.parse(startsAt) <= Date.now()) continue;
            if (this.ptBookings.some((item) => item.trainerProfileId === profile.id && ["reserved", "confirmed"].includes(item.status) && item.startsAt < endsAt && startsAt < item.endsAt)) continue;
            slots.push({ trainerProfileId: profile.id, branchId: input.branchId, startsAt, endsAt });
          }
        }
      }
      return slots;
    });
  }

  listCustomerPtAvailableSlots(input: { membershipId: T.UUID; trainerProfileId: T.UUID; branchId: T.UUID; from: T.ISODate; to: T.ISODate }): Promise<T.PtAvailableSlot[]> {
    return this.listPtAvailableSlots(input);
  }

  createPtBooking(input: T.CreatePtBookingInput): Promise<T.PtBooking> {
    return this.respond(async () => {
      this.require("pt.book_for_member");
      const existing = this.ptBookings.find((item) => item.id === input.idempotencyKey);
      if (existing) return { ...existing };
      const membership = this.db.memberships.find((item) => item.id === input.membershipId);
      if (!membership || !["active", "expiring"].includes(this.membershipStatusOf(membership))) throw ApiError.of(ERR.VALIDATION, "An active, unfrozen membership is required for the session date.");
      const member = this.db.members.find((item) => item.id === membership.memberId)!;
      const trainer = this.ptTrainers.find((item) => item.id === input.trainerProfileId && item.status === "published");
      const branch = this.db.branches.find((item) => item.id === input.branchId);
      if (!trainer || !branch) throw ApiError.of(ERR.NOT_FOUND, "Trainer or branch not found.");
      const date = input.startsAt.slice(0, 10) as T.ISODate;
      const slots = await this.listPtAvailableSlots({ trainerProfileId: trainer.id, branchId: branch.id, from: date, to: date });
      if (!slots.some((slot) => slot.startsAt === input.startsAt)) throw ApiError.of(ERR.CONFLICT, "This PT slot is no longer available.");
      this.ensureIncludedPtEntitlement(membership.id);
      const entitlement = selectPtEntitlement(this.ptEntitlements.filter((item) => item.memberId === member.id), Date.parse(input.startsAt));
      if (!entitlement) throw ApiError.of(ERR.VALIDATION, "No PT session credit is available.");
      entitlement.reserved += 1; entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      const now = nowISO();
      const booking: T.PtBooking = { id: input.idempotencyKey, organizationId: this.db.organization.id, memberId: member.id, memberName: member.fullName, trainerProfileId: trainer.id, trainerName: trainer.displayName, branchId: branch.id, branchName: branch.name, entitlementId: entitlement.id, startsAt: input.startsAt, endsAt: new Date(Date.parse(input.startsAt) + 3_600_000).toISOString(), status: "reserved", bookedById: this.actor().id, createdAt: now, updatedAt: now };
      this.ptBookings.push(booking);
      this.activity({ memberId: member.id, type: "pt_booking_reserved", title: `PT booked with ${trainer.displayName}`, meta: { bookingId: booking.id } });
      this.audit({ category: "memberships", action: "pt.booking.create", entityType: "pt_booking", entityId: booking.id, entityLabel: `${member.fullName} · ${trainer.displayName}`, summary: "Reserved one PT credit", branchId: branch.id });
      return { ...booking };
    });
  }

  createCustomerPtBooking(input: T.CreatePtBookingInput): Promise<T.PtBooking> { return this.createPtBooking(input); }

  cancelPtBooking(bookingId: T.UUID, input: { reason: string; cancelledByGym?: boolean }): Promise<T.PtBooking> {
    return this.respond(() => {
      this.requireReason(input.reason);
      const booking = this.ptBookings.find((item) => item.id === bookingId);
      if (!booking || !["reserved", "confirmed"].includes(booking.status)) throw ApiError.of(ERR.NOT_FOUND, "Active PT booking not found.");
      const policy = this.db.operationalPolicies.personalTraining;
      const result = ptCancellationResult({ startsAt: Date.parse(booking.startsAt), cancelledAt: Date.now(), cutoffHours: policy.cancellationCutoffHours, cancelledByGym: Boolean(input.cancelledByGym) });
      const entitlement = this.ptEntitlements.find((item) => item.id === booking.entitlementId)!;
      entitlement.reserved = Math.max(0, entitlement.reserved - 1);
      if (!result.restoreCredit) entitlement.consumed += 1;
      entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      booking.status = result.status; booking.cancellationReason = input.reason.trim(); booking.updatedAt = nowISO();
      this.activity({ memberId: booking.memberId, type: "pt_booking_cancelled", title: result.restoreCredit ? "PT booking cancelled — credit restored" : "PT booking cancelled after cutoff — credit used", body: input.reason, meta: { bookingId } });
      return { ...booking };
    });
  }

  cancelCustomerPtBooking(bookingId: T.UUID, reason: string): Promise<T.PtBooking> { return this.cancelPtBooking(bookingId, { reason }); }

  reschedulePtBooking(input: T.ReschedulePtBookingInput): Promise<T.PtBooking> {
    return this.respond(async () => {
      this.requireReason(input.reason);
      const booking = this.ptBookings.find((item) => item.id === input.bookingId);
      if (!booking || !["reserved", "confirmed"].includes(booking.status)) throw ApiError.of(ERR.NOT_FOUND, "Active PT booking not found.");
      const entitlement = this.ptEntitlements.find((item) => item.id === booking.entitlementId);
      const trainer = this.ptTrainers.find((item) => item.id === input.trainerProfileId && item.status === "published");
      const branch = this.db.branches.find((item) => item.id === input.branchId);
      if (!trainer || !branch || !entitlement || Date.parse(input.startsAt) > Date.parse(entitlement.expiresAt)) throw ApiError.of(ERR.NOT_FOUND, "The new PT slot or its reserved credit is unavailable.");
      const date = input.startsAt.slice(0, 10) as T.ISODate;
      const priorStatus = booking.status;
      booking.status = "cancelled";
      const slots = await this.listPtAvailableSlots({ trainerProfileId: trainer.id, branchId: branch.id, from: date, to: date });
      booking.status = priorStatus;
      if (!slots.some((slot) => slot.startsAt === input.startsAt)) throw ApiError.of(ERR.CONFLICT, "This PT slot is no longer available.");
      const collision = this.ptBookings.some((item) => item.id !== booking.id && item.memberId === booking.memberId && ["reserved", "confirmed"].includes(item.status) && item.startsAt < new Date(Date.parse(input.startsAt) + 3_600_000).toISOString() && input.startsAt < item.endsAt);
      if (collision) throw ApiError.of(ERR.CONFLICT, "The member already has a PT booking at this time.");
      booking.trainerProfileId = trainer.id; booking.trainerName = trainer.displayName; booking.branchId = branch.id; booking.branchName = branch.name; booking.startsAt = input.startsAt; booking.endsAt = new Date(Date.parse(input.startsAt) + 3_600_000).toISOString(); booking.updatedAt = nowISO();
      this.activity({ memberId: booking.memberId, type: "pt_booking_rescheduled", title: `PT rescheduled with ${trainer.displayName}`, body: input.reason, meta: { bookingId: booking.id, startsAt: booking.startsAt } });
      this.audit({ category: "memberships", action: "pt.booking.reschedule", entityType: "pt_booking", entityId: booking.id, entityLabel: booking.memberName, summary: "Rescheduled PT booking without changing credit balance", reason: input.reason, branchId: branch.id });
      return { ...booking };
    });
  }

  rescheduleCustomerPtBooking(input: T.ReschedulePtBookingInput): Promise<T.PtBooking> { return this.reschedulePtBooking(input); }

  completePtBooking(bookingId: T.UUID, input: { reason?: string } = {}): Promise<T.PtBooking> { return this.finishPtBooking(bookingId, "completed", input.reason); }
  markPtBookingNoShow(bookingId: T.UUID, input: { reason?: string } = {}): Promise<T.PtBooking> { return this.finishPtBooking(bookingId, "no_show", input.reason); }

  private finishPtBooking(bookingId: T.UUID, status: "completed" | "no_show", reason?: string): Promise<T.PtBooking> {
    return this.respond(() => {
      const booking = this.ptBookings.find((item) => item.id === bookingId);
      if (!booking || !["reserved", "confirmed"].includes(booking.status)) throw ApiError.of(ERR.NOT_FOUND, "Active PT booking not found.");
      const trainer = this.ptTrainers.find((item) => item.id === booking.trainerProfileId);
      if (trainer?.userId !== this.actor().id) this.require("pt.manage"); else this.require("pt.outcome.self");
      if (status === "no_show") this.requireReason(reason);
      const entitlement = this.ptEntitlements.find((item) => item.id === booking.entitlementId)!;
      entitlement.reserved = Math.max(0, entitlement.reserved - 1); entitlement.consumed += 1; entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      booking.status = status; booking.outcomeReason = reason?.trim() || undefined; booking.updatedAt = nowISO();
      this.activity({ memberId: booking.memberId, type: status === "completed" ? "pt_session_completed" : "pt_session_no_show", title: status === "completed" ? "PT session completed" : "PT session marked no-show", body: reason, meta: { bookingId } });
      return { ...booking };
    });
  }

  requestPtPackage(input: T.RequestPtPackageInput): Promise<T.PtPackageOrder> {
    return this.respond(() => {
      const prior = this.ptOrders.find((item) => item.id === input.idempotencyKey);
      if (prior) return { ...prior };
      const membership = this.db.memberships.find((item) => item.id === input.membershipId);
      const ptPackage = this.ptPackages.find((item) => item.id === input.packageId && item.status === "active");
      if (!membership || !ptPackage) throw ApiError.of(ERR.NOT_FOUND, "Membership or PT package not found.");
      const charge: T.Charge = { id: mockUuid(), organizationId: this.db.organization.id, memberId: membership.memberId, membershipId: membership.id, description: ptPackage.name, subtotal: { ...ptPackage.totalPrice }, discount: money(0), tax: money(0), total: { ...ptPackage.totalPrice }, paidAmount: money(0), outstandingAmount: { ...ptPackage.totalPrice }, status: "unpaid", createdAt: nowISO() };
      this.db.charges.push(charge);
      const now = nowISO();
      const order: T.PtPackageOrder = { id: input.idempotencyKey, organizationId: this.db.organization.id, memberId: membership.memberId, packageId: ptPackage.id, chargeId: charge.id, status: "pending_payment", createdAt: now, updatedAt: now };
      this.ptOrders.push(order);
      this.activity({ memberId: membership.memberId, type: "pt_package_requested", title: `${ptPackage.name} requested`, meta: { orderId: order.id, chargeId: charge.id } });
      return { ...order };
    });
  }

  requestCustomerPtPackage(input: T.RequestPtPackageInput): Promise<T.PtPackageOrder> { return this.requestPtPackage(input); }

  refundPtPackage(orderId: T.UUID, input: T.RefundPtPackageInput): Promise<T.PtPackageOrder> {
    return this.respond(() => {
      this.require("pt.refund"); this.requireReason(input.reason);
      const order = this.ptOrders.find((item) => item.id === orderId);
      const entitlement = order?.entitlementId ? this.ptEntitlements.find((item) => item.id === order.entitlementId) : undefined;
      if (!order || !entitlement || input.sessions < 1 || input.sessions > ptAvailableCredits(entitlement)) throw ApiError.of(ERR.VALIDATION, "Only unused PT credits can be refunded.");
      entitlement.revoked += input.sessions; entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      const ptPackage = this.ptPackages.find((item) => item.id === order.packageId)!;
      const refundedSessions = (order.refundedSessions ?? 0) + input.sessions;
      order.refundedSessions = refundedSessions;
      order.refundedAmount = money(Math.floor((ptPackage.totalPrice.amount * refundedSessions) / ptPackage.sessionCount));
      order.status = entitlement.available === 0 ? "refunded" : "partially_refunded"; order.updatedAt = nowISO();
      this.activity({ memberId: order.memberId, type: "pt_credit_refunded", title: `${input.sessions} PT credit${input.sessions === 1 ? "" : "s"} refunded`, body: input.reason, meta: { orderId } });
      return { ...order };
    });
  }

  previewPtIntroductoryCredits(sessionCount = 2): Promise<T.PtIntroductoryCreditPreview> {
    return this.respond(() => {
      this.require("pt.manage");
      const active = this.db.memberships.filter((membership) => ["active", "expiring"].includes(this.membershipStatusOf(membership)));
      const alreadyGranted = active.filter((membership) => this.ptEntitlements.some((item) => item.membershipId === membership.id && item.source === "manual")).length;
      return { eligibleMemberships: active.length - alreadyGranted, alreadyGranted, sessionCount };
    });
  }

  applyPtIntroductoryCredits(input: { sessionCount: number; reason: string; idempotencyKey: string }): Promise<T.PtIntroductoryCreditApplyResult> {
    return this.respond(() => {
      this.require("pt.manage"); this.requireReason(input.reason);
      const preview = this.db.memberships.filter((membership) => ["active", "expiring"].includes(this.membershipStatusOf(membership)));
      let grantedMemberships = 0;
      for (const membership of preview) {
        if (this.ptEntitlements.some((item) => item.membershipId === membership.id && item.source === "manual")) continue;
        const now = nowISO();
        this.ptEntitlements.push({ id: mockUuid(), organizationId: this.db.organization.id, memberId: membership.memberId, source: "manual", membershipId: membership.id, granted: input.sessionCount, reserved: 0, consumed: 0, revoked: 0, available: input.sessionCount, expiresAt: `${membership.endDate}T23:59:59.999Z`, status: "active", createdAt: now, updatedAt: now });
        grantedMemberships += 1;
      }
      this.audit({ category: "memberships", action: "pt.introductory_credits.apply", entityType: "pt_credit_migration", entityId: input.idempotencyKey, entityLabel: "Existing active memberships", summary: `Granted introductory PT credits to ${grantedMemberships} memberships`, reason: input.reason });
      return { eligibleMemberships: 0, alreadyGranted: preview.length, sessionCount: input.sessionCount, grantedMemberships, migrationId: input.idempotencyKey };
    });
  }

  // -------------------------------------------------------------------------
  // memberships
  listMemberships(query: MembershipListQuery): Promise<T.Page<T.MembershipSummary>> {
    return this.respond(() => {
      this.require("members.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = this.db.memberships.map((m) => this.toMembershipSummary(m));
      if (branchId) items = items.filter((m) => m.homeBranchId === branchId);
      if (query.memberId) items = items.filter((m) => m.memberId === query.memberId);
      if (query.status) items = items.filter((m) => m.status === query.status);
      if (query.paymentStatus) items = items.filter((m) => m.paymentStatus === query.paymentStatus);
      items = items.filter((m) => this.matchesSearch([m.memberName, m.memberNumber, m.planName], query.search));
      items = applySort(items, query.sort ?? "-endDate", (m, k) => {
        switch (k) {
          case "endDate": return m.endDate;
          case "startDate": return m.startDate;
          case "memberName": return m.memberName;
          default: return m.endDate;
        }
      });
      return paginate(this.maybeEmpty(items), query);
    });
  }

  getMembership(membershipId: T.UUID): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("members.read");
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      const plan = this.db.plans.find((p) => p.id === record.planId)!;
      return {
        ...this.toMembership(record),
        member: this.toMemberSummary(member),
        plan: this.toPlan(plan),
        charge: this.chargeProjection(this.db.charges.find((c) => c.membershipId === record.id)),
        adjustments: record.adjustments,
        freezes: record.freezes,
      };
    });
  }

  subscribeMembership(membershipId: T.UUID, onValue: (membership: T.MembershipDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getMembership(membershipId), onValue, onError);
  }

  private buildSale(args: {
    memberId: T.UUID;
    planId: T.UUID;
    startDate: T.ISODate;
    priceOverride?: T.Money;
    overrideReason?: string;
    discount?: T.Money;
    discountReason?: string;
    payment?: { amount: T.Money; method: T.PaymentMethodKey; externalReference?: string };
    previousMembershipId?: T.UUID;
    operation?: "sale" | "renewal" | "plan_change";
    previousPlanId?: T.UUID;
    reason?: string;
    standardStartDate?: T.ISODate;
    idempotencyKey?: string;
    soldBy: T.UUID;
  }): T.MembershipSaleResult {
    const member = this.db.members.find((m) => m.id === args.memberId);
    if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
    const plan = this.db.plans.find((p) => p.id === args.planId);
    if (!plan || plan.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "Plan not found or inactive.");

    const priceMinor = args.priceOverride?.amount ?? plan.basePrice.amount;
    const priceOverride = Boolean(args.priceOverride && args.priceOverride.amount !== plan.basePrice.amount);
    const dateOverride = Boolean(args.standardStartDate && args.startDate !== args.standardStartDate);
    if (priceOverride || dateOverride) {
      this.require("memberships.override_dates");
      this.requireReason(args.overrideReason);
    }
    const discountMinor = Math.min(args.discount?.amount ?? 0, priceMinor);
    if (discountMinor > 0) {
      this.require("payments.discount");
      if (!args.discountReason?.trim()) {
        throw ApiError.of(ERR.VALIDATION, "A reason is required for discounts.", { fieldErrors: { discountReason: ["Required when a discount is applied"] } });
      }
    }
    const approvalPending = discountNeedsApproval(this.db.roles, currentRole(this.db), discountMinor);
    const operation = args.operation ?? (args.previousMembershipId ? "renewal" : "sale");
    const idempotencyKey = args.idempotencyKey?.trim();
    const idempotencyMapKey = idempotencyKey ? `${operation}:${idempotencyKey}` : undefined;
    const idempotencySignature = idempotencyKey ? JSON.stringify({ ...args, idempotencyKey }) : undefined;
    if (idempotencyMapKey && idempotencySignature) {
      const existing = this.membershipSaleIdempotency.get(idempotencyMapKey);
      if (existing) {
        if (existing.signature !== idempotencySignature) throw ApiError.of(ERR.VALIDATION, "This idempotency key was already used for a different membership sale.");
        return existing.result;
      }
    }

    const duration = plan.kind === "visits" ? (plan.visitValidityDays ?? 90) : (plan.durationDays ?? 30);
    const endDate = addDays(args.startDate, duration);
    if (!this.db.operationalPolicies.membership.allowOverlappingMemberships) {
      const overlap = this.db.memberships.some((membership) =>
        membership.memberId === member.id &&
        membership.id !== args.previousMembershipId &&
        !membership.cancelledAt &&
        args.startDate <= membership.endDate &&
        membership.startDate <= endDate,
      );
      if (overlap) throw ApiError.of(ERR.CONFLICT, "This member already has a membership covering part of the selected term.");
    }
    const recordId = mockUuid();
    const record: MembershipRecord = {
      id: recordId,
      organizationId: this.db.organization.id,
      memberId: member.id,
      planId: plan.id,
      homeBranchId: member.homeBranchId,
      startDate: args.startDate,
      endDate,
      totalVisits: plan.kind === "visits" ? plan.visitAllowance : undefined,
      remainingVisits: plan.kind === "visits" ? plan.visitAllowance : undefined,
      salePrice: money(priceMinor),
      discount: money(discountMinor),
      discountReason: args.discountReason,
      discountApprovalStatus: discountMinor > 0 ? (approvalPending ? "pending" : "approved") : "none",
      soldById: args.soldBy,
      previousMembershipId: args.previousMembershipId,
      frozenDaysUsed: 0,
      freezes: [],
      adjustments: args.operation === "plan_change" ? [{
        id: mockUuid(),
        membershipId: recordId,
        type: "plan_change",
        reason: args.reason ?? "Membership plan changed",
        actorId: args.soldBy,
        before: { planId: args.previousPlanId ?? "" },
        after: { planId: plan.id, effectiveDate: args.startDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      }] : [],
      createdAt: nowISO(),
    };
    this.db.memberships.push(record);

    const totalMinor = priceMinor - discountMinor;
    const charge: T.Charge = {
      id: mockUuid(),
      organizationId: this.db.organization.id,
      memberId: member.id,
      membershipId: record.id,
      description: `${plan.name} membership`,
      subtotal: money(priceMinor),
      discount: money(discountMinor),
      tax: money(0),
      total: money(totalMinor),
      paidAmount: money(0),
      outstandingAmount: money(totalMinor),
      status: totalMinor === 0 ? "paid" : "unpaid",
      issueDate: this.today(),
      dueDate: args.startDate > this.today() ? args.startDate : this.today(),
      createdAt: nowISO(),
    };
    this.db.charges.push(charge);

    const isPlanChange = operation === "plan_change";
    const isRenewal = operation === "renewal";
    const timelineIds: T.UUID[] = [];
    timelineIds.push(
      this.activity({
        memberId: member.id,
        type: isPlanChange ? "membership_plan_changed" : isRenewal ? "membership_renewed" : "membership_sold",
        title: isPlanChange ? `Membership plan changed to ${plan.name}` : `${plan.name} ${isRenewal ? "membership renewed" : "membership sold"}`,
        body: isPlanChange ? `${args.reason ?? "Plan change"} Effective ${record.startDate}; no proration applied.` : `Term ${record.startDate} → ${record.endDate}.`,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      }).id,
    );

    if (discountMinor > 0) {
      this.audit({
        category: "payments",
        action: "membership.discount",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: approvalPending
          ? `Discount of JOD ${(discountMinor / 1000).toFixed(3)} exceeds limit — approval requested`
          : `Discount of JOD ${(discountMinor / 1000).toFixed(3)} applied`,
        reason: args.discountReason,
        before: { price: priceMinor, discount: 0, approvalStatus: "none" },
        after: { price: priceMinor, discount: discountMinor, approvalStatus: approvalPending ? "pending" : "approved" },
        approvalStatus: approvalPending ? "pending" : "approved",
        branchId: member.homeBranchId,
      });
    }

    if (priceOverride) {
      this.audit({
        category: "payments",
        action: "membership.price_override",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Price override: JOD ${(priceMinor / 1000).toFixed(3)}`,
        reason: args.overrideReason,
        before: { price: plan.basePrice.amount },
        after: { price: priceMinor },
        branchId: member.homeBranchId,
      });
    }
    if (dateOverride) {
      this.audit({
        category: "memberships",
        action: "membership.date_override",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Start date overridden to ${args.startDate}`,
        reason: args.overrideReason,
        before: { startDate: args.standardStartDate ?? null },
        after: { startDate: args.startDate },
        branchId: member.homeBranchId,
      });
    }

    let payment: T.Payment | undefined;
    let receipt: T.Receipt | undefined;
    if (args.payment && args.payment.amount.amount > 0) {
      const result = this.recordPayment({
        memberId: member.id,
        chargeId: charge.id,
        amount: args.payment.amount,
        method: args.payment.method,
        externalReference: args.payment.externalReference,
        idempotencyKey: `sale-${record.id}`,
      });
      payment = result.payment;
      receipt = result.receipt;
      timelineIds.push(result.timelineEventId);
    }

    this.audit({
      category: "memberships",
      action: isPlanChange ? "membership.plan_change" : isRenewal ? "membership.renew" : "membership.sale",
      entityType: "membership",
      entityId: record.id,
      entityLabel: `${member.fullName} · ${member.memberNumber}`,
      summary: `${plan.name} — JOD ${(totalMinor / 1000).toFixed(3)}`,
      after: { startDate: record.startDate, endDate: record.endDate, total: totalMinor },
      branchId: member.homeBranchId,
    });

    const result = { membership: this.toMembership(record), charge, payment, receipt, timelineEventIds: timelineIds };
    if (idempotencyMapKey && idempotencySignature) this.membershipSaleIdempotency.set(idempotencyMapKey, { signature: idempotencySignature, result });
    return result;
  }

  createMembershipSale(input: T.CreateMembershipSaleInput): Promise<T.MembershipSaleResult> {
    return this.respond(() => {
      this.require("memberships.sell");
      return this.buildSale({ ...input, standardStartDate: this.today(), soldBy: this.actor().id });
    });
  }

  renewMembership(membershipId: T.UUID, input: T.RenewMembershipInput): Promise<T.MembershipSaleResult> {
    return this.respond(() => {
      this.require("memberships.sell");
      const old = this.db.memberships.find((m) => m.id === membershipId);
      if (!old) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const status = this.membershipStatusOf(old);
      if (status === "cancelled") throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, "Cancelled memberships cannot be renewed; create a new sale.");
      const today = this.today();
      const startDate = input.startDate ?? (old.endDate >= today ? addDays(old.endDate, 1) : today);
      return this.buildSale({
        memberId: old.memberId,
        planId: input.planId ?? old.planId,
        startDate,
        priceOverride: input.priceOverride,
        overrideReason: input.overrideReason,
        discount: input.discount,
        discountReason: input.discountReason,
        payment: input.payment,
        idempotencyKey: input.idempotencyKey,
        previousMembershipId: old.id,
        operation: "renewal",
        standardStartDate: old.endDate >= today ? addDays(old.endDate, 1) : today,
        soldBy: this.actor().id,
      });
    });
  }

  changeMembershipPlan(membershipId: T.UUID, input: T.ChangeMembershipPlanInput): Promise<T.MembershipSaleResult> {
    return this.respond(() => {
      this.require("memberships.sell");
      this.requireReason(input.reason);
      const old = this.db.memberships.find((membership) => membership.id === membershipId);
      if (!old) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const status = this.membershipStatusOf(old);
      if (status === "cancelled") throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, "Cancelled memberships cannot change plans.");
      if (old.planId === input.planId) throw ApiError.of(ERR.VALIDATION, "Choose a different plan.");
      const effectiveDate = input.effectiveDate ?? "next_renewal";
      if (effectiveDate === "immediate") {
        this.require("memberships.override_dates");
        if (status !== "active" && status !== "expiring") throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, "Immediate plan changes require an active membership.");
      }
      const result = this.buildSale({
        memberId: old.memberId,
        planId: input.planId,
        startDate: effectiveDate === "immediate" ? this.today() : old.endDate >= this.today() ? addDays(old.endDate, 1) : this.today(),
        previousMembershipId: old.id,
        previousPlanId: old.planId,
        operation: "plan_change",
        reason: input.reason,
        soldBy: this.actor().id,
      });
      if (effectiveDate === "immediate") {
        const previousEndDate = old.endDate;
        old.cancelledAt = nowISO();
        old.cancellationReason = `Superseded by plan change: ${input.reason}`;
        old.adjustments.push({
          id: mockUuid(),
          membershipId: old.id,
          type: "plan_change",
          reason: input.reason,
          actorId: this.actor().id,
          before: { planId: old.planId, endDate: previousEndDate },
          after: { planId: input.planId, successorMembershipId: result.membership.id },
          approvalStatus: "not_required",
          createdAt: nowISO(),
        });
      }
      this.audit({
        category: "memberships",
        action: "membership.plan_change",
        entityType: "membership",
        entityId: result.membership.id,
        entityLabel: `${this.db.members.find((member) => member.id === old.memberId)?.fullName ?? "Member"}`,
        summary: `Plan changed (${effectiveDate === "immediate" ? "immediate" : "next renewal"}) — no proration`,
        reason: input.reason,
        before: { planId: old.planId, effectiveDate },
        after: { planId: input.planId, successorMembershipId: result.membership.id },
        branchId: old.homeBranchId,
      });
      return result;
    });
  }

  freezeMembership(membershipId: T.UUID, input: T.FreezeMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.freeze");
      this.requireReason(input.reason);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const status = this.membershipStatusOf(record);
      if (status !== "active" && status !== "expiring") {
        throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, `Cannot freeze a membership in “${status}” state.`);
      }
      const plan = this.db.plans.find((p) => p.id === record.planId)!;
      const today = this.today();
      if (record.activeFreeze?.status === "active") {
        if (record.activeFreeze.endDate >= today) throw ApiError.of(ERR.CONFLICT, "This membership already has a scheduled or active freeze.");
        record.frozenDaysUsed += diffDays(record.activeFreeze.startDate, record.activeFreeze.endDate) + 1;
        record.activeFreeze.status = "completed";
        record.activeFreeze = undefined;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) throw ApiError.of(ERR.VALIDATION, "Freeze dates must be calendar dates.");
      if (input.startDate < today) throw ApiError.of(ERR.VALIDATION, "A freeze cannot begin before today.");
      if (input.startDate > record.endDate) throw ApiError.of(ERR.VALIDATION, "A freeze must begin during the current membership term.");
      const days = diffDays(input.startDate, input.endDate) + 1;
      if (days <= 0) throw ApiError.of(ERR.VALIDATION, "Freeze end must be on or after the start date.");
      if (days < this.db.operationalPolicies.membership.minimumFreezeDays) throw ApiError.of(ERR.VALIDATION, `A freeze must be at least ${this.db.operationalPolicies.membership.minimumFreezeDays} days.`);
      const remainingAllowance = plan.freezeAllowanceDays - record.frozenDaysUsed;
      if (days > remainingAllowance) {
        throw ApiError.of(
          ERR.FREEZE_ALLOWANCE_EXCEEDED,
          `This plan allows ${plan.freezeAllowanceDays} freeze days total; ${Math.max(0, remainingAllowance)} remain.`,
        );
      }
      const freeze: T.FreezePeriod = {
        id: mockUuid(),
        membershipId: record.id,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "active",
        reason: input.reason,
        createdById: this.actor().id,
        createdAt: nowISO(),
      };
      const oldEnd = record.endDate;
      record.freezes.push(freeze);
      record.activeFreeze = freeze;
      record.endDate = addDays(record.endDate, days);
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "freeze",
        reason: input.reason,
        actorId: this.actor().id,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_frozen",
        title: `Membership frozen ${input.startDate} → ${input.endDate}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.freeze",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Frozen ${days} day${days === 1 ? "" : "s"} — expiry ${oldEnd} → ${record.endDate}`,
        reason: input.reason,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  unfreezeMembership(membershipId: T.UUID, input: { reason: string }): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.freeze");
      this.requireReason(input.reason);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record?.activeFreeze) throw ApiError.of(ERR.NOT_FOUND, "No active freeze on this membership.");
      const freeze = record.activeFreeze;
      const today = this.today();
      if (freeze.startDate > today || freeze.endDate < today) throw ApiError.of(ERR.VALIDATION, "Only a freeze currently in progress can be ended early.");
      const plannedDays = diffDays(freeze.startDate, freeze.endDate) + 1;
      const usedDays = Math.max(1, diffDays(freeze.startDate, today) + 1);
      const unusedDays = Math.max(0, plannedDays - usedDays);
      const oldEnd = record.endDate;
      freeze.status = "completed";
      freeze.endDate = today;
      record.activeFreeze = undefined;
      record.frozenDaysUsed += usedDays;
      record.endDate = addDays(record.endDate, -unusedDays);
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "unfreeze",
        reason: input.reason,
        actorId: this.actor().id,
        before: { endDate: oldEnd, freezeEnd: freeze.endDate },
        after: { endDate: record.endDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_unfrozen",
        title: "Freeze ended early",
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.unfreeze",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Freeze ended early — expiry ${oldEnd} → ${record.endDate}`,
        reason: input.reason,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  extendMembership(membershipId: T.UUID, input: T.ExtendMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.override_dates");
      this.requireReason(input.reason);
      const maximumExtensionDays = this.db.operationalPolicies.membership.maximumExtensionDays;
      if (input.days <= 0 || input.days > maximumExtensionDays) throw ApiError.of(ERR.VALIDATION, `Extension must be between 1 and ${maximumExtensionDays} days.`);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const oldEnd = record.endDate;
      record.endDate = addDays(record.endDate, input.days);
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "extension",
        reason: input.reason,
        actorId: this.actor().id,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_extended",
        title: `Membership extended by ${input.days} day${input.days === 1 ? "" : "s"}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.date_override",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Extended ${input.days} days — expiry ${oldEnd} → ${record.endDate}`,
        reason: input.reason,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  cancelMembership(membershipId: T.UUID, input: T.CancelMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.freeze"); // managers+ only via role matrix
      this.requireReason(input.reason);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      if (record.cancelledAt) throw ApiError.of(ERR.VALIDATION, "Membership is already cancelled.");
      const wasScheduled = this.membershipStatusOf(record) === "scheduled";
      record.cancelledAt = nowISO();
      record.cancellationReason = input.reason;
      record.activeFreeze = undefined;
      if (wasScheduled) {
        const charge = this.db.charges.find((candidate) => candidate.membershipId === record.id);
        if (charge && charge.paidAmount.amount === 0) {
          charge.status = "void";
          charge.outstandingAmount = money(0);
        }
      }
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "cancellation",
        reason: input.reason,
        actorId: this.actor().id,
        before: { status: "active" },
        after: { status: "cancelled" },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_cancelled",
        title: "Membership cancelled",
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.cancel",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: "Membership cancelled",
        reason: input.reason,
        before: { endDate: record.endDate },
        after: { status: "cancelled" },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  transferMembership(membershipId: T.UUID, input: T.TransferMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.override_dates");
      this.requireReason(input.reason);
      const record = this.db.memberships.find((membership) => membership.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      if (!this.branchIsVisible(record.homeBranchId)) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      if (record.cancelledAt) throw ApiError.of(ERR.VALIDATION, "Cancelled memberships cannot be transferred.");
      const branch = this.db.branches.find((candidate) => candidate.id === input.branchId && candidate.status === "active");
      if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Destination branch not found or inactive.");
      if (!this.branchIsVisible(input.branchId)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to the destination branch.");
      const transferKey = input.idempotencyKey?.trim();
      const transferSignature = transferKey ? JSON.stringify({ membershipId, branchId: input.branchId, reason: input.reason }) : undefined;
      if (transferKey && transferSignature) {
        const existing = this.membershipTransferIdempotency.get(transferKey);
        if (existing) {
          if (existing.signature !== transferSignature) throw ApiError.of(ERR.VALIDATION, "This idempotency key was already used for a different membership transfer.");
          return existing.result;
        }
      }
      const plan = this.db.plans.find((candidate) => candidate.id === record.planId);
      if (plan?.branchAccess === "selected" && !plan.branchIds.includes(input.branchId)) {
        throw ApiError.of(ERR.VALIDATION, "This membership plan is not available at the destination branch.");
      }
      if (record.homeBranchId === input.branchId) throw ApiError.of(ERR.VALIDATION, "Membership is already assigned to this branch.");
      const previousBranchId = record.homeBranchId;
      record.homeBranchId = input.branchId;
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "branch_transfer",
        reason: input.reason,
        actorId: this.actor().id,
        before: { branchId: previousBranchId },
        after: { branchId: input.branchId },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((candidate) => candidate.id === record.memberId)!;
      if (member.homeBranchId === previousBranchId) member.homeBranchId = input.branchId;
      const previousBranch = this.db.branches.find((candidate) => candidate.id === previousBranchId);
      this.activity({
        memberId: record.memberId,
        type: "membership_transferred",
        title: `Membership transferred to ${branch.name}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id, previousBranchId, branchId: input.branchId },
      });
      this.audit({
        category: "memberships",
        action: "membership.branch_transfer",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Transferred ${previousBranch?.name ?? "branch"} → ${branch.name}`,
        reason: input.reason,
        before: { branchId: previousBranchId },
        after: { branchId: input.branchId },
        branchId: input.branchId,
      });
      const result = this.getMembershipSync(record);
      if (transferKey && transferSignature) this.membershipTransferIdempotency.set(transferKey, { signature: transferSignature, result });
      return result;
    });
  }

  private getMembershipSync(record: MembershipRecord): T.MembershipDetail {
    const member = this.db.members.find((m) => m.id === record.memberId)!;
    const plan = this.db.plans.find((p) => p.id === record.planId)!;
    return {
      ...this.toMembership(record),
      member: this.toMemberSummary(member),
      plan: this.toPlan(plan),
      charge: this.chargeProjection(this.db.charges.find((c) => c.membershipId === record.id)),
      adjustments: record.adjustments,
      freezes: record.freezes,
    };
  }

  // -------------------------------------------------------------------------
  // CRM
  // -------------------------------------------------------------------------

  listLeads(query: LeadListQuery): Promise<T.Page<T.LeadSummary>> {
    return this.respond(() => {
      this.require("crm.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = this.db.leads.map((l) => this.toLeadSummary(l));
      if (branchId) items = items.filter((l) => l.branchId === branchId);
      if (query.stage) {
        const stages = Array.isArray(query.stage) ? query.stage : [query.stage];
        items = items.filter((l) => stages.includes(l.stage));
      }
      if (query.ownerId === "unassigned") items = items.filter((l) => !l.ownerId);
      else if (query.ownerId) items = items.filter((l) => l.ownerId === query.ownerId);
      if (query.overdueOnly) items = items.filter((l) => l.overdue);
      items = items.filter((l) => this.matchesSearch([l.fullName, l.phone, l.email], query.search));
      items = applySort(items, query.sort ?? "-createdAt", (l, k) => {
        switch (k) {
          case "createdAt": return l.createdAt;
          case "nextFollowUpAt": return l.nextFollowUpAt;
          case "expectedValue": return l.expectedValue?.amount;
          case "fullName": return l.fullName;
          default: return l.createdAt;
        }
      });
      return paginate(this.maybeEmpty(items), query);
    });
  }

  async subscribeLeads(query: LeadListQuery, onValue: (page: T.Page<T.LeadSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.listLeads(query));
    } catch (error) {
      onError?.(error);
    }
    return () => undefined;
  }

  getLead(leadId: T.UUID): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.read");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      const activities = this.db.activities.filter((a) => a.leadId === leadId);
      const offers = this.db.offers.filter((o) => o.leadId === leadId).map((offer) => this.projectOffer(offer));
      const trialBooking = this.trialBookings.find((booking) => booking.leadId === leadId);
      return { ...this.toLeadSummary(lead), notes: lead.notes, activities, offers, ...(trialBooking ? { trialBooking: { ...trialBooking } } : {}) };
    });
  }

  subscribeLead(leadId: T.UUID, onValue: (lead: T.LeadDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getLead(leadId), onValue, onError);
  }

  createLead(input: T.CreateLeadInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const requestedOwnerId = input.ownerId;
      if (requestedOwnerId && requestedOwnerId !== "unassigned" && requestedOwnerId !== this.actor().id) {
        this.require("crm.assign");
        const owner = this.db.users.find((user) => user.id === requestedOwnerId && user.status === "active");
        if (!owner || !["owner", "manager", "salesperson"].includes(owner.role)) throw ApiError.of(ERR.NOT_FOUND, "Lead owner not found.");
      }
      const lead: T.Lead = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        branchId: input.branchId,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim().toLowerCase() || undefined,
        stage: "new",
        source: input.source,
        ownerId: input.ownerId === "unassigned" ? undefined : input.ownerId ?? this.actor().id,
        expectedValue: input.expectedValue,
        nextFollowUpAt: input.nextFollowUpAt,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      this.db.leads.push(lead);
      if (input.notes) {
        (this.db.leads.find((l) => l.id === lead.id) as { notes?: string }).notes = input.notes;
      }
      this.activity({
        leadId: lead.id,
        type: "member_created",
        title: "Lead captured",
        body: input.notes,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.getLeadSync(lead.id);
    });
  }

  private getLeadSync(leadId: T.UUID): T.LeadDetail {
    const lead = this.db.leads.find((l) => l.id === leadId)!;
    return {
      ...this.toLeadSummary(lead),
      notes: lead.notes,
      activities: this.db.activities.filter((a) => a.leadId === leadId),
      offers: this.db.offers.filter((o) => o.leadId === leadId).map((offer) => this.projectOffer(offer)),
      trialBooking: this.trialBookings.find((booking) => booking.leadId === leadId),
    };
  }

  updateLead(leadId: T.UUID, input: T.UpdateLeadInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (input.ownerId && input.ownerId !== lead.ownerId) this.require("crm.assign");
      Object.assign(lead, input, { updatedAt: nowISO() });
      return this.getLeadSync(leadId);
    });
  }

  logContactAttempt(leadId: T.UUID, input: T.ContactAttemptInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (input.stage) lead.stage = input.stage;
      else if (lead.stage === "new") lead.stage = "attempted";
      if (input.nextFollowUpAt !== undefined) lead.nextFollowUpAt = input.nextFollowUpAt || undefined;
      lead.updatedAt = nowISO();
      const outcomeLabels: Record<T.ContactOutcome, string> = {
        no_answer: "No answer",
        answered_interested: "Answered — interested",
        answered_not_interested: "Answered — not interested",
        answered_call_back: "Asked for a callback",
        wrong_number: "Wrong number",
        whatsapp_sent: "WhatsApp sent",
        trial_booked: "Trial booked",
        trial_completed: "Trial completed",
      };
      this.activity({
        leadId,
        type: "call_attempt",
        title: `Call — ${outcomeLabels[input.outcome].toLowerCase()}`,
        body: input.notes,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { outcome: input.outcome },
      });
      return this.getLeadSync(leadId);
    });
  }

  updateTrialBooking(bookingId: T.UUID, input: { status: Extract<T.TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string }): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const booking = this.trialBookings.find((item) => item.id === bookingId);
      if (!booking?.leadId) throw ApiError.of(ERR.NOT_FOUND, "Trial booking not found.");
      const lead = this.db.leads.find((item) => item.id === booking.leadId);
      if (!lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Trial booking not found.");
      const transitions: Record<T.TrialBookingStatus, T.TrialBookingStatus[]> = {
        requested: ["confirmed", "completed", "no_show", "cancelled"],
        confirmed: ["completed", "no_show", "cancelled"],
        completed: [],
        no_show: [],
        cancelled: [],
        converted: [],
      };
      if (!transitions[booking.status].includes(input.status)) throw ApiError.of(ERR.VALIDATION, `Trial cannot move from ${booking.status.replaceAll("_", " ")} to ${input.status.replaceAll("_", " ")}.`);
      if ((input.status === "no_show" || input.status === "cancelled") && !input.note?.trim()) throw ApiError.of(ERR.VALIDATION, "Record a reason for this trial outcome.");
      const previous = booking.status;
      booking.status = input.status;
      const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
      if (input.status === "completed") Object.assign(lead, { stage: "trial_completed", nextFollowUpAt: followUpAt });
      else if (input.status === "cancelled") Object.assign(lead, { stage: "lost", lostReason: `Trial cancelled — ${input.note}`, nextFollowUpAt: undefined });
      else if (input.status === "no_show") Object.assign(lead, { stage: "contacted", nextFollowUpAt: followUpAt });
      else lead.stage = "trial_booked";
      lead.updatedAt = nowISO();
      const labels = { confirmed: "Trial confirmed", completed: "Trial completed", no_show: "Trial marked as no-show", cancelled: "Trial cancelled" } as const;
      const eventTypes = { confirmed: "trial_confirmed", completed: "trial_completed", no_show: "trial_no_show", cancelled: "trial_cancelled" } as const;
      this.activity({ leadId: lead.id, type: eventTypes[input.status], title: labels[input.status], body: input.note, actorId: this.actor().id, actorName: this.actor().name, meta: { bookingId, status: input.status } });
      if ((input.status === "completed" || input.status === "no_show") && !this.db.tasks.some((task) => task.leadId === lead.id && task.type === "trial_follow_up" && task.status === "open")) {
        this.db.tasks.push({ id: mockUuid(), organizationId: this.db.organization.id, type: "trial_follow_up", title: input.status === "no_show" ? "Reschedule missed trial" : "Follow up after trial", ownerId: lead.ownerId ?? this.actor().id, ownerName: this.db.users.find((user) => user.id === lead.ownerId)?.name ?? this.actor().name, dueAt: followUpAt, priority: input.status === "no_show" ? "high" : "normal", status: "open", leadId: lead.id, subjectName: lead.fullName, createdById: this.actor().id, createdAt: nowISO() });
      }
      this.audit({ category: "crm", action: `trial.${input.status}`, entityType: "trial_booking", entityId: booking.id, entityLabel: `${booking.fullName} · ${booking.preferredDate} ${booking.preferredTime}`, summary: labels[input.status], reason: input.note, before: { status: previous }, after: { status: input.status }, branchId: lead.branchId });
      return this.getLeadSync(lead.id);
    });
  }

  createOffer(input: { leadId: T.UUID; planId: T.UUID; price: T.Money; expiresInDays?: number }): Promise<T.Offer> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((l) => l.id === input.leadId);
      if (!lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      const plan = this.db.plans.find((p) => p.id === input.planId);
      if (!plan) throw ApiError.of(ERR.NOT_FOUND, "Plan not found.");
      const offer: T.Offer = {
        id: mockUuid(),
        leadId: lead.id,
        planId: plan.id,
        planName: plan.name,
        price: input.price,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : undefined,
        status: "draft",
        createdById: this.actor().id,
        createdAt: nowISO(),
      };
      this.db.offers.push(offer);
      this.activity({
        leadId: lead.id,
        type: "offer_drafted",
        title: `Offer drafted — ${plan.name} at JOD ${(input.price.amount / 1000).toFixed(3)}`,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { offerId: offer.id },
      });
      return offer;
    });
  }

  markOfferDelivered(offerId: T.UUID, input: { channel: T.OfferDeliveryChannel; reference?: string }): Promise<T.Offer> {
    return this.respond(() => {
      this.require("crm.write");
      const offer = this.db.offers.find((item) => item.id === offerId);
      const lead = offer?.leadId ? this.db.leads.find((item) => item.id === offer.leadId) : undefined;
      if (!offer || !lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Offer not found.");
      if (offer.status !== "draft") throw ApiError.of(ERR.CONFLICT, "This offer has already been delivered or closed.");
      if (!["email", "whatsapp", "sms", "manual"].includes(input.channel)) throw ApiError.of(ERR.VALIDATION, "Choose a valid delivery channel.");
      if ((input.channel === "email" && !lead.email) || ((input.channel === "whatsapp" || input.channel === "sms") && !lead.phone)) {
        throw ApiError.of(ERR.VALIDATION, `This lead has no ${input.channel === "email" ? "email address" : "phone number"} to record delivery against.`);
      }
      const deliveredAt = nowISO();
      Object.assign(offer, {
        status: "sent" as const,
        deliveryChannel: input.channel,
        deliveredAt,
        deliveredById: this.actor().id,
        deliveryReference: input.reference?.trim() || undefined,
      });
      lead.stage = "offer_sent";
      lead.updatedAt = deliveredAt;
      this.activity({
        leadId: lead.id,
        type: "offer_sent",
        title: `Offer delivery confirmed — ${offer.planName}`,
        body: `${input.channel === "manual" ? "Manual delivery" : input.channel} confirmed${input.reference?.trim() ? ` · ${input.reference.trim()}` : ""}.`,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { offerId: offer.id, channel: input.channel },
      });
      this.audit({
        category: "crm",
        action: "offer.delivered",
        entityType: "offer",
        entityId: offer.id,
        entityLabel: `${offer.planName} · ${lead.fullName}`,
        summary: `Offer delivery confirmed via ${input.channel}`,
        reason: input.reference?.trim() || `Manual ${input.channel} delivery confirmation`,
        before: { status: "draft" },
        after: { status: "sent", deliveryChannel: input.channel },
        branchId: lead.branchId,
      });
      return offer;
    });
  }

  recordOfferOutcome(offerId: T.UUID, input: { outcome: T.OfferOutcome; reason?: string }): Promise<T.Offer> {
    return this.respond(() => {
      this.require("crm.write");
      const offer = this.db.offers.find((item) => item.id === offerId);
      const lead = offer?.leadId ? this.db.leads.find((item) => item.id === offer.leadId) : undefined;
      if (!offer || !lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Offer not found.");
      if (offer.status !== "sent") throw ApiError.of(ERR.CONFLICT, "Only a delivered offer can receive an outcome.");
      if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= Date.now()) {
        throw ApiError.of(ERR.CONFLICT, "This offer has expired.");
      }
      const reason = input.reason?.trim();
      if (input.outcome === "declined" && (!reason || reason.length < 3)) throw ApiError.of(ERR.VALIDATION, "Record why the offer was declined.");
      if (input.outcome !== "accepted" && input.outcome !== "declined") throw ApiError.of(ERR.VALIDATION, "Choose a valid offer outcome.");
      const respondedAt = nowISO();
      Object.assign(offer, { status: input.outcome, respondedAt, respondedById: this.actor().id, responseReason: reason || undefined });
      if (input.outcome === "declined") {
        lead.stage = "contacted";
        lead.nextFollowUpAt = new Date(Date.now() + 86_400_000).toISOString();
      }
      lead.updatedAt = respondedAt;
      this.activity({
        leadId: lead.id,
        type: input.outcome === "accepted" ? "offer_accepted" : "offer_declined",
        title: `Offer ${input.outcome} — ${offer.planName}`,
        body: reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { offerId: offer.id, outcome: input.outcome },
      });
      this.audit({
        category: "crm",
        action: `offer.${input.outcome}`,
        entityType: "offer",
        entityId: offer.id,
        entityLabel: `${offer.planName} · ${lead.fullName}`,
        summary: `Offer ${input.outcome}`,
        reason,
        before: { status: "sent" },
        after: { status: input.outcome },
        branchId: lead.branchId,
      });
      return offer;
    });
  }

  private projectOffer(offer: T.Offer): T.Offer {
    return offer.status === "sent" && offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()
      ? { ...offer, status: "expired" }
      : offer;
  }

  listTasks(query: TaskListQuery): Promise<T.Page<T.Task>> {
    return this.respond(() => {
      this.require("crm.read");
      let items = [...this.db.tasks];
      if (query.status) items = items.filter((t) => t.status === query.status);
      if (query.ownerId) items = items.filter((t) => t.ownerId === query.ownerId);
      if (query.overdueOnly) items = items.filter((t) => t.status === "open" && t.dueAt < nowISO());
      const dueBefore = query.dueBefore;
      if (dueBefore) items = items.filter((t) => t.dueAt <= dueBefore);
      items = applySort(items, query.sort ?? "dueAt", (t, k) => (k === "dueAt" ? t.dueAt : t.createdAt));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeTasks(query: TaskListQuery, onValue: (page: T.Page<T.Task>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listTasks(query), onValue, onError);
  }

  createFollowUp(input: T.CreateTaskInput): Promise<T.Task> {
    return this.respond(() => {
      this.require("crm.write");
      const subject = input.leadId
        ? this.db.leads.find((l) => l.id === input.leadId)?.fullName
        : this.db.members.find((m) => m.id === input.memberId)?.fullName;
      const task: T.Task = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        type: input.type,
        title: input.title,
        ownerId: input.ownerId,
        ownerName: this.db.users.find((u) => u.id === input.ownerId)?.name ?? "Staff",
        dueAt: input.dueAt,
        priority: input.priority ?? "normal",
        status: "open",
        leadId: input.leadId,
        memberId: input.memberId,
        subjectName: subject ?? "—",
        createdById: this.actor().id,
        createdAt: nowISO(),
      };
      this.db.tasks.push(task);
      if (input.memberId) {
        this.activity({
          memberId: input.memberId,
          type: "task_created",
          title: `Task: ${input.title}`,
          actorId: this.actor().id,
          actorName: this.actor().name,
        });
      }
      return task;
    });
  }

  completeTask(taskId: T.UUID, input: T.CompleteTaskInput): Promise<T.Task> {
    return this.respond(() => {
      this.require("crm.write");
      const task = this.db.tasks.find((t) => t.id === taskId);
      if (!task) throw ApiError.of(ERR.NOT_FOUND, "Task not found.");
      task.status = "completed";
      task.outcome = input.outcome;
      task.completedAt = nowISO();
      if (task.memberId) {
        this.activity({
          memberId: task.memberId,
          type: "task_completed",
          title: `Task completed: ${task.title}`,
          body: input.outcome,
          actorId: this.actor().id,
          actorName: this.actor().name,
        });
      }
      return task;
    });
  }

  convertLead(leadId: T.UUID, input: T.ConvertLeadInput): Promise<T.MemberDetail> {
    return this.respond(() => {
      this.require("crm.write");
      this.require("members.write");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (lead.stage === "won" && lead.convertedMemberId) {
        throw ApiError.of(ERR.VALIDATION, "Lead was already converted.");
      }
      const duplicates = this.findDuplicates({ phone: lead.phone, email: lead.email });
      if (duplicates.length > 0) {
        throw ApiError.of(ERR.DUPLICATE_MEMBER, "This lead matches an existing member. Open that member instead of creating a duplicate.", {
          details: { matches: duplicates },
        });
      }
      const result = this.createMemberSync({
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        homeBranchId: input.homeBranchId,
        preferredLanguage: input.preferredLanguage,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        marketingOptIn: input.marketingOptIn,
        marketingPreferenceSource: input.marketingPreferenceSource,
        source: lead.source,
        assignedSalespersonId: lead.ownerId,
      });
      lead.stage = "won";
      lead.convertedMemberId = result.id;
      lead.nextFollowUpAt = undefined;
      lead.updatedAt = nowISO();
      const trialBooking = this.trialBookings.find((booking) => booking.leadId === lead.id);
      if (trialBooking) trialBooking.status = "converted";
      // Close open follow-up tasks for this lead
      for (const t of this.db.tasks.filter((t) => t.leadId === lead.id && t.status === "open")) {
        t.status = "completed";
        t.outcome = "Converted to member";
        t.completedAt = nowISO();
      }
      this.activity({
        leadId: lead.id,
        memberId: result.id,
        type: "lead_converted",
        title: `Lead converted — ${lead.fullName} became ${result.memberNumber}`,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.toMemberDetail(result);
    });
  }

  private createMemberSync(input: T.CreateMemberInput): MemberRecord {
    this.db.counters.memberNumber += 1;
    const branch = this.db.branches.find((b) => b.id === input.homeBranchId) ?? this.db.branches[0]!;
    const record: MemberRecord = {
      id: mockUuid(),
      memberNumber: `${branch.code}-${this.db.counters.memberNumber}`,
      fullName: input.fullName.trim(),
      fullNameAr: input.fullNameAr,
      phone: input.phone.trim(),
      email: input.email?.trim() || undefined,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      homeBranchId: branch.id,
      status: "active",
      tags: input.tags ?? [],
      preferredLanguage: input.preferredLanguage,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      source: input.source,
      assignedSalespersonId: input.assignedSalespersonId,
      marketingOptIn: input.marketingOptIn !== false,
      marketingPreference: this.marketingPreferenceFor(input),
      notes: input.notes,
      createdAt: nowISO(),
    };
    this.db.members.push(record);
    this.activity({
      memberId: record.id,
      type: "member_created",
      title: "Member profile created",
      actorId: this.actor().id,
      actorName: this.actor().name,
    });
    return record;
  }

  listRenewalQueue(query: RenewalQueueQuery): Promise<T.Page<T.RenewalQueueItem>> {
    return this.respond(() => {
      this.require("crm.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      const today = this.today();
      const items: T.RenewalQueueItem[] = [];
      for (const record of this.db.memberships) {
        if (branchId && record.homeBranchId !== branchId) continue;
        const status = this.membershipStatusOf(record);
        const daysUntil = diffDays(today, record.endDate);
        const member = this.db.members.find((m) => m.id === record.memberId);
        if (!member || member.status !== "active") continue;
        // Exclude memberships that already have a newer term (renewed)
        const hasNewerTerm = this.db.memberships.some((m) => m.previousMembershipId === record.id);
        if (hasNewerTerm) continue;
        if (query.bucket === "expired") {
          if (status !== "expired" || daysUntil < -45) continue;
        } else {
          if (!(status === "expiring" || (status === "active" && daysUntil <= this.db.operationalPolicies.membership.renewalWindowDays))) continue;
        }
        const calls = this.db.activities.filter((a) => a.memberId === record.memberId && a.type === "call_attempt");
        const openTask = this.db.tasks.find((t) => t.memberId === record.memberId && t.status === "open" && t.type === "renewal_call");
        items.push({
          member: this.toMemberSummary(member),
          membership: this.toMembershipSummary(record),
          daysUntilExpiry: daysUntil,
          lastContactAt: calls[0]?.occurredAt,
          lastContactOutcome: calls[0]?.meta?.outcome ? String(calls[0].meta.outcome) : undefined,
          openTaskId: openTask?.id,
        });
      }
      items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      return paginate(this.maybeEmpty(items), query);
    });
  }

  // -------------------------------------------------------------------------
  // check-in
  // -------------------------------------------------------------------------

  subscribeRenewalQueue(query: RenewalQueueQuery, onValue: (page: T.Page<T.RenewalQueueItem>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listRenewalQueue(query), onValue, onError);
  }

  private evaluateForMember(member: MemberRecord, branchId: T.UUID): {
    decision: T.CheckInDecision;
    reasonCodes: T.CheckInReasonCode[];
    message: string;
    membership?: MembershipRecord;
  } {
    const today = this.today();
    const current = this.currentMembership(member.id);
    const plan = current ? this.db.plans.find((p) => p.id === current.planId) : undefined;
    // duplicate scan suppression (2 minutes, same branch)
    const lastCheckIn = this.db.checkIns.find(
      (c) => c.memberId === member.id && c.branchId === branchId && c.decision !== "blocked",
    );
    const duplicate = lastCheckIn ? Date.now() - new Date(lastCheckIn.occurredAt).getTime() < 2 * 60_000 : false;

    const result = evaluateCheckIn({
      memberStatus: member.status,
      membership: current
        ? {
            status: this.membershipStatusOf(current),
            planBranchAccess: plan?.branchAccess ?? "all",
            planBranchIds: plan?.branchIds ?? [],
            remainingVisits: current.remainingVisits,
            endDate: current.endDate,
          }
        : undefined,
      checkInBranchId: branchId,
      memberHomeBranchId: member.homeBranchId,
      outstanding: this.outstandingForMember(member.id),
      today,
      duplicateWithinMinutes: duplicate,
    });
    return { ...result, membership: current };
  }

  previewCheckIn(input: { branchId: T.UUID; query: string }): Promise<T.CheckInPreview> {
    return this.respond(() => {
      this.require("members.read");
      const q = input.query.trim();
      if (!q) return { found: false, decision: "blocked", reasonCodes: [], message: "Type a name, phone, or member number." };
      if (q.length < 3) {
        return { found: false, decision: "blocked", reasonCodes: [], message: "Keep typing — at least 3 characters." };
      }
      const member = this.db.members.find((m) =>
        this.matchesSearch([m.fullName, m.fullNameAr, m.phone, m.memberNumber, m.email], q),
      );
      if (!member) {
        return { found: false, decision: "blocked", reasonCodes: [], message: `No member matches “${q}”.` };
      }
      const evaluation = this.evaluateForMember(member, input.branchId);
      const summary = this.toMemberSummary(member);
      return {
        found: true,
        member: summary,
        membership: evaluation.membership ? this.toMembershipSummary(evaluation.membership) : undefined,
        decision: evaluation.decision,
        reasonCodes: evaluation.reasonCodes,
        message: evaluation.message,
        criticalNotes: member.sensitiveNotes && permissionsFor(this.db, currentRole(this.db)).includes("members.sensitive_notes.read") ? member.sensitiveNotes : undefined,
      };
    });
  }

  createCheckIn(input: T.CreateCheckInInput): Promise<T.CheckInResult> {
    return this.respond(() => {
      this.require("members.read");
      const member = this.db.members.find((m) => m.id === input.memberId);
      if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      const evaluation = this.evaluateForMember(member, input.branchId);
      const summary = this.toMemberSummary(member);
      if (evaluation.decision === "blocked") {
        // record the blocked attempt for the audit trail
        this.db.checkIns.unshift({
          id: mockUuid(),
          memberId: member.id,
          memberName: member.fullName,
          memberNumber: member.memberNumber,
          branchId: input.branchId,
          branchName: this.db.branches.find((b) => b.id === input.branchId)?.name ?? "—",
          decision: "blocked",
          reasonCodes: evaluation.reasonCodes,
          actorId: this.actor().id,
          actorName: this.actor().name,
          occurredAt: nowISO(),
        });
        return {
          decision: "blocked",
          reasonCodes: evaluation.reasonCodes,
          member: summary,
          membership: evaluation.membership ? this.toMembershipSummary(evaluation.membership) : undefined,
          message: evaluation.message,
        };
      }
      return this.recordCheckIn(member, input.branchId, evaluation, undefined);
    });
  }

  overrideCheckIn(input: T.OverrideCheckInInput): Promise<T.CheckInResult> {
    return this.respond(() => {
      this.require("checkins.override");
      if (!input.reason.trim()) {
        throw ApiError.of(ERR.VALIDATION, "An override reason is required.", { fieldErrors: { reason: ["Required"] } });
      }
      const member = this.db.members.find((m) => m.id === input.memberId);
      if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      const evaluation = this.evaluateForMember(member, input.branchId);
      const result = this.recordCheckIn(member, input.branchId, evaluation, input.reason);
      this.audit({
        category: "checkins",
        action: "checkin.override",
        entityType: "member",
        entityId: member.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Manual check-in override (${evaluation.reasonCodes.join(", ") || "no block reason"})`,
        reason: input.reason,
        before: { decision: evaluation.decision },
        after: { decision: "overridden" },
        branchId: input.branchId,
      });
      return result;
    });
  }

  private recordCheckIn(
    member: MemberRecord,
    branchId: T.UUID,
    evaluation: { decision: T.CheckInDecision; reasonCodes: T.CheckInReasonCode[]; message: string; membership?: MembershipRecord },
    overrideReason?: string,
  ): T.CheckInResult {
    const decision: T.CheckInDecision = overrideReason ? "overridden" : evaluation.decision;
    const checkIn: T.CheckInSummary = {
      id: mockUuid(),
      memberId: member.id,
      memberName: member.fullName,
      memberNumber: member.memberNumber,
      branchId,
      branchName: this.db.branches.find((b) => b.id === branchId)?.name ?? "—",
      decision,
      reasonCodes: overrideReason ? [...evaluation.reasonCodes.filter((c) => c !== "OK"), "MANUAL_OVERRIDE"] : evaluation.reasonCodes,
      actorId: this.actor().id,
      actorName: this.actor().name,
      overrideReason,
      occurredAt: nowISO(),
    };
    this.db.checkIns.unshift(checkIn);
    if (evaluation.membership?.totalVisits != null && evaluation.membership.remainingVisits != null) {
      evaluation.membership.remainingVisits = Math.max(0, evaluation.membership.remainingVisits - 1);
    }
    this.activity({
      memberId: member.id,
      type: "check_in",
      title: `Checked in — ${checkIn.branchName}`,
      actorId: this.actor().id,
      actorName: this.actor().name,
      meta: { decision },
    });
    return {
      checkInId: checkIn.id,
      decision,
      reasonCodes: checkIn.reasonCodes,
      member: this.toMemberSummary(member),
      membership: evaluation.membership ? this.toMembershipSummary(evaluation.membership) : undefined,
      occurredAt: checkIn.occurredAt,
      message: overrideReason ? `Overridden by ${this.actor().name}: ${overrideReason}` : evaluation.message,
    };
  }

  listRecentCheckIns(query: RecentCheckInQuery): Promise<T.Page<T.CheckInSummary>> {
    return this.respond(() => {
      this.require("members.read");
      let items = [...this.db.checkIns];
      const branchId = this.branchScopedBranchId(query.branchId);
      if (branchId) items = items.filter((c) => c.branchId === branchId);
      if (query.memberId) items = items.filter((c) => c.memberId === query.memberId);
      const since = query.since;
      if (since) items = items.filter((c) => c.occurredAt >= since);
      if (query.date) items = items.filter((c) => todayISODate(TZ, new Date(c.occurredAt)) === query.date);
      if (query.acceptedOnly) items = items.filter((c) => c.decision !== "blocked");
      items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeRecentCheckIns(query: RecentCheckInQuery, onValue: (page: T.Page<T.CheckInSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listRecentCheckIns(query), onValue, onError);
  }

  getOccupancy(branchId: T.UUID): Promise<T.OccupancySnapshot> {
    return this.respond(() => {
      const branch = this.db.branches.find((b) => b.id === branchId);
      if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      const today = this.today();
      const cutoff = Date.now() - 90 * 60_000;
      const current = this.db.checkIns.filter(
        (c) => c.branchId === branchId && c.decision !== "blocked" && new Date(c.occurredAt).getTime() >= cutoff,
      ).length;
      const todayCheckIns = this.db.checkIns.filter(
        (c) => c.branchId === branchId && c.decision !== "blocked" && todayISODate(TZ, new Date(c.occurredAt)) === today,
      );
      const hourCounts = new Map<number, number>();
      for (const c of todayCheckIns) {
        const h = Number(new Date(c.occurredAt).toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }));
        hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
      }
      let peakHour = "—";
      let peak = 0;
      for (const [h, count] of hourCounts) {
        if (count > peak) {
          peak = count;
          peakHour = `${String(h).padStart(2, "0")}:00`;
        }
      }
      return { branchId, current, capacity: branch.capacity, checkInsToday: todayCheckIns.length, peakHour };
    });
  }

  // -------------------------------------------------------------------------
  // payments
  // -------------------------------------------------------------------------

  subscribeOccupancy(branchId: T.UUID, onValue: (occupancy: T.OccupancySnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getOccupancy(branchId), onValue, onError);
  }

  private nextReceiptNumber(): string {
    const n = `${this.db.organization.receiptPrefix}${this.db.counters.receiptNumber}`;
    this.db.counters.receiptNumber += 1;
    return n;
  }

  private recordPayment(args: {
    memberId: T.UUID;
    chargeId?: T.UUID;
    amount: T.Money;
    method: T.PaymentMethodKey;
    idempotencyKey: string;
    externalReference?: string;
  }): { payment: T.Payment; receipt: T.Receipt; timelineEventId: T.UUID } {
    const member = this.db.members.find((m) => m.id === args.memberId);
    if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
    const method = this.db.paymentMethods.find((m) => m.key === args.method);
    if (!method?.enabled) throw ApiError.of(ERR.VALIDATION, `Payment method “${args.method}” is disabled.`);
    if (args.amount.currency !== this.db.organization.currency) throw ApiError.of(ERR.VALIDATION, "Payment currency does not match the organization.");
    if (["card", "bank_transfer", "cliq"].includes(args.method) && !args.externalReference?.trim()) {
      throw ApiError.of(ERR.VALIDATION, "An external reference is required for card, bank transfer, and CliQ payments.");
    }

    // idempotency
    const existing = this.db.payments.find((p) => p.idempotencyKey === args.idempotencyKey);
    if (existing) {
      if (existing.memberId !== args.memberId || (args.chargeId !== undefined && existing.chargeId !== args.chargeId) || existing.amount.amount !== args.amount.amount || existing.amount.currency !== args.amount.currency || existing.method !== args.method) {
        throw ApiError.of(ERR.VALIDATION, "This idempotency key was already used for a different payment.");
      }
      const receipt = this.db.receipts.find((r) => r.id === existing.receiptId)!;
      return { payment: existing, receipt, timelineEventId: "" };
    }

    let charge: T.Charge | undefined;
    if (args.chargeId) {
      charge = this.db.charges.find((c) => c.id === args.chargeId);
    } else {
      charge = this.db.charges
        .filter((c) => c.memberId === member.id && c.outstandingAmount.amount > 0 && chargeIsCollectible(c, this.today()))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    }
    if (!charge) throw ApiError.of(ERR.NO_OUTSTANDING_BALANCE, "This member has no outstanding balance to collect.");
    if (!chargeIsCollectible(charge, this.today())) throw ApiError.of(ERR.VALIDATION, `This invoice becomes collectible on ${charge.dueDate ?? charge.createdAt.slice(0, 10)}.`);
    if (charge.outstandingAmount.amount <= 0) {
      throw ApiError.of(ERR.NO_OUTSTANDING_BALANCE, "This charge is already fully paid.");
    }
    if (!Number.isSafeInteger(args.amount.amount) || args.amount.amount <= 0) throw ApiError.of(ERR.VALIDATION, "Amount must be a positive integer.");
    if (args.amount.amount > charge.outstandingAmount.amount) throw ApiError.of(ERR.VALIDATION, "Payment cannot exceed the outstanding balance.");
    const amount = args.amount.amount;

    // cash requires an open shift at the member's home branch
    const branchId = member.homeBranchId;
    let shift: T.CashShift | undefined;
    if (method.affectsCashDrawer) {
      shift = this.db.shifts.find((s) => s.branchId === branchId && s.status === "open");
      if (!shift) {
        throw ApiError.of(ERR.NO_OPEN_SHIFT, `No open cash shift at this branch. Open a shift before collecting cash.`);
      }
    }

    const payment: T.Payment = {
      id: mockUuid(),
      organizationId: this.db.organization.id,
      branchId,
      memberId: member.id,
      chargeId: charge.id,
      type: "payment",
      amount: money(amount),
      method: args.method,
      status: "completed",
      receiptId: "",
      receiptNumber: "",
      collectedById: this.actor().id,
      collectedByName: this.actor().name,
      shiftId: shift?.id,
      externalReference: args.externalReference,
      idempotencyKey: args.idempotencyKey,
      occurredAt: nowISO(),
    };
    const receiptNumber = this.nextReceiptNumber();
    const receipt: T.Receipt = { id: mockUuid(), receiptNumber, paymentId: payment.id, issuedAt: payment.occurredAt };
    payment.receiptId = receipt.id;
    payment.receiptNumber = receiptNumber;
    this.db.payments.push(payment);
    this.db.receipts.push(receipt);

    charge.paidAmount = money(charge.paidAmount.amount + amount);
    charge.outstandingAmount = money(charge.outstandingAmount.amount - amount);
    charge.status = charge.outstandingAmount.amount <= 0 ? "paid" : "partial";

    const event = this.activity({
      memberId: member.id,
      type: "payment_collected",
      title: `Payment collected — JOD ${(amount / 1000).toFixed(3)} ${args.method.replace("_", " ")}`,
      actorId: this.actor().id,
      actorName: this.actor().name,
      meta: { receiptNumber, receiptId: receipt.id },
    });
    return { payment, receipt, timelineEventId: event.id };
  }

  listTransactions(query: TransactionListQuery): Promise<T.Page<T.TransactionSummary>> {
    return this.respond(() => {
      this.require("reports.financial.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = this.db.payments.map((p) => this.toTransaction(p));
      if (branchId) items = items.filter((p) => p.branchId === branchId);
      if (query.memberId) items = items.filter((p) => p.memberId === query.memberId);
      if (query.method) items = items.filter((p) => p.method === query.method);
      if (query.type) items = items.filter((p) => p.type === query.type);
      const txFrom = query.from;
      const txTo = query.to;
      if (txFrom) items = items.filter((p) => p.occurredAt >= txFrom);
      if (txTo) items = items.filter((p) => p.occurredAt <= `${txTo}T23:59:59.999Z`);
      items = items.filter((p) => this.matchesSearch([p.memberName, p.memberNumber, p.receiptNumber], query.search));
      items = applySort(items, query.sort ?? "-occurredAt", (p, k) => (k === "occurredAt" ? p.occurredAt : p.amount.amount));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeTransactions(query: TransactionListQuery, onValue: (page: T.Page<T.TransactionSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listTransactions(query), onValue, onError);
  }

  createPayment(input: T.CreatePaymentInput, idempotencyKey: string): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("payments.collect");
      const { payment } = this.recordPayment({ ...input, idempotencyKey });
      this.audit({
        category: "payments",
        action: "payment.collect",
        entityType: "payment",
        entityId: payment.id,
        entityLabel: `${payment.receiptNumber} · ${this.db.members.find((m) => m.id === payment.memberId)?.fullName ?? ""}`,
        summary: `Collected JOD ${(payment.amount.amount / 1000).toFixed(3)} (${payment.method.replace("_", " ")})`,
        after: { amount: payment.amount.amount, method: payment.method },
        branchId: payment.branchId,
      });
      return this.getReceiptSync(payment.receiptId);
    });
  }

  refundPayment(paymentId: T.UUID, input: T.RefundPaymentInput): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("payments.refund");
      if (!input.reason.trim()) {
        throw ApiError.of(ERR.VALIDATION, "A reason is required for refunds.", { fieldErrors: { reason: ["Required"] } });
      }
      const original = this.db.payments.find((p) => p.id === paymentId);
      if (!original) throw ApiError.of(ERR.NOT_FOUND, "Payment not found.");
      if (original.type !== "payment") throw ApiError.of(ERR.VALIDATION, "Only payments can be refunded.");
      if (original.status === "voided") throw ApiError.of(ERR.PAYMENT_ALREADY_VOIDED, "Voided payments cannot be refunded.");
      const alreadyRefunded = original.refundedAmount?.amount ?? 0;
      const remaining = original.amount.amount - alreadyRefunded;
      if (remaining <= 0) throw ApiError.of(ERR.PAYMENT_ALREADY_REFUNDED, "This payment was already fully refunded.");
      if (input.amount && input.amount.currency !== this.db.organization.currency) {
        throw ApiError.of(ERR.VALIDATION, "Refund currency does not match the organization.");
      }
      const amount = input.amount?.amount ?? remaining;
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) {
        throw ApiError.of(ERR.REFUND_EXCEEDS_AMOUNT, "Refund amount exceeds the refundable balance.");
      }

      const receiptNumber = this.nextReceiptNumber();
      const refund: T.Payment = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        branchId: original.branchId,
        memberId: original.memberId,
        chargeId: original.chargeId,
        type: "refund",
        amount: money(-amount),
        method: original.method,
        status: "completed",
        receiptId: "",
        receiptNumber,
        collectedById: this.actor().id,
        collectedByName: this.actor().name,
        shiftId: this.db.shifts.find((s) => s.branchId === original.branchId && s.status === "open")?.id,
        idempotencyKey: `refund-${original.id}-${mockUuid()}`,
        originalPaymentId: original.id,
        refundReason: input.reason,
        occurredAt: nowISO(),
      };
      const receipt: T.Receipt = { id: mockUuid(), receiptNumber, paymentId: refund.id, issuedAt: refund.occurredAt };
      refund.receiptId = receipt.id;
      this.db.payments.push(refund);
      this.db.receipts.push(receipt);

      original.refundedAmount = money(alreadyRefunded + amount);
      original.refundReason = input.reason;
      original.status = alreadyRefunded + amount >= original.amount.amount ? "refunded" : "partially_refunded";

      const charge = this.db.charges.find((c) => c.id === original.chargeId);
      if (charge) {
        charge.paidAmount = money(Math.max(0, charge.paidAmount.amount - amount));
        charge.outstandingAmount = money(charge.total.amount - charge.paidAmount.amount);
        charge.status = charge.paidAmount.amount <= 0 ? "refunded" : "partial";
      }

      const member = this.db.members.find((m) => m.id === original.memberId)!;
      const needsReview = amount > 25_000; // large refunds are flagged for manager review
      this.audit({
        category: "payments",
        action: "payment.refund",
        entityType: "payment",
        entityId: original.id,
        entityLabel: `${original.receiptNumber} · ${member.fullName}`,
        summary: `Refunded JOD ${(amount / 1000).toFixed(3)} (${original.method.replace("_", " ")})`,
        reason: input.reason,
        before: { paymentStatus: "completed", chargePaid: original.amount.amount },
        after: { paymentStatus: original.status, refunded: alreadyRefunded + amount },
        approvalStatus: needsReview ? "pending" : "approved",
        branchId: original.branchId,
      });
      this.activity({
        memberId: original.memberId,
        type: "payment_refunded",
        title: `Payment refunded — JOD ${(amount / 1000).toFixed(3)}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.getReceiptSync(receipt.id);
    });
  }

  voidPayment(paymentId: T.UUID, input: T.VoidPaymentInput): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("payments.void");
      if (!input.reason.trim()) {
        throw ApiError.of(ERR.VALIDATION, "A reason is required to void a payment.", { fieldErrors: { reason: ["Required"] } });
      }
      const original = this.db.payments.find((p) => p.id === paymentId);
      if (!original) throw ApiError.of(ERR.NOT_FOUND, "Payment not found.");
      if (original.type !== "payment") throw ApiError.of(ERR.VALIDATION, "Only payments can be voided.");
      if (original.status === "voided") throw ApiError.of(ERR.PAYMENT_ALREADY_VOIDED, "Payment is already voided.");
      if (original.status === "refunded" || original.status === "partially_refunded") {
        throw ApiError.of(ERR.PAYMENT_ALREADY_REFUNDED, "Refunded payments cannot be voided.");
      }
      const paymentDay = todayISODate(TZ, new Date(original.occurredAt));
      if (paymentDay !== this.today()) {
        throw ApiError.of(ERR.VOID_WINDOW_EXPIRED, "Payments can only be voided on the same business day. Issue a refund instead.");
      }
      original.status = "voided";
      original.voidReason = input.reason;
      const charge = this.db.charges.find((c) => c.id === original.chargeId);
      if (charge) {
        charge.paidAmount = money(Math.max(0, charge.paidAmount.amount - original.amount.amount));
        charge.outstandingAmount = money(charge.total.amount - charge.paidAmount.amount);
        charge.status = charge.paidAmount.amount <= 0 ? "unpaid" : "partial";
      }
      const member = this.db.members.find((m) => m.id === original.memberId)!;
      this.audit({
        category: "payments",
        action: "payment.void",
        entityType: "payment",
        entityId: original.id,
        entityLabel: `${original.receiptNumber} · ${member.fullName}`,
        summary: `Voided JOD ${(original.amount.amount / 1000).toFixed(3)} (${original.method.replace("_", " ")})`,
        reason: input.reason,
        before: { status: "completed" },
        after: { status: "voided" },
        branchId: original.branchId,
      });
      this.activity({
        memberId: original.memberId,
        type: "payment_voided",
        title: `Payment voided — ${original.receiptNumber}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.getReceiptSync(original.receiptId);
    });
  }

  getReceipt(receiptId: T.UUID): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("members.read");
      return this.getReceiptSync(receiptId);
    });
  }

  private getReceiptSync(receiptId: T.UUID): T.ReceiptDetail {
    const receipt = this.db.receipts.find((r) => r.id === receiptId);
    if (!receipt) throw ApiError.of(ERR.NOT_FOUND, "Receipt not found.");
    const payment = this.db.payments.find((p) => p.id === receipt.paymentId)!;
    const branch = this.db.branches.find((b) => b.id === payment.branchId)!;
    const member = this.db.members.find((m) => m.id === payment.memberId)!;
    const charge = this.db.charges.find((c) => c.id === payment.chargeId);
    const related = this.db.payments.filter((p) => p.originalPaymentId === payment.id || (payment.originalPaymentId && p.id === payment.originalPaymentId));
    return {
      receipt,
      organization: {
        name: this.db.organization.name,
        receiptFooter: this.db.organization.receiptFooter,
        taxRatePercent: this.db.organization.taxRatePercent,
      },
      branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone },
      member: { fullName: member.fullName, memberNumber: member.memberNumber },
      payment,
      charge,
      relatedPayments: related,
    };
  }

  // -------------------------------------------------------------------------
  // shifts & reconciliation
  // -------------------------------------------------------------------------

  openCashShift(input: T.OpenCashShiftInput): Promise<T.CashShift> {
    return this.respond(() => {
      this.require("reconciliation.open_shift");
      const existing = this.db.shifts.find((s) => s.branchId === input.branchId && s.status === "open");
      if (existing) {
        throw ApiError.of(ERR.SHIFT_ALREADY_OPEN, `A shift is already open at this branch (opened by ${existing.openedByName}).`);
      }
      const shift: T.CashShift = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        branchId: input.branchId,
        openedById: this.actor().id,
        openedByName: this.actor().name,
        openedAt: nowISO(),
        openingFloat: input.openingFloat,
        status: "open",
      };
      this.db.shifts.push(shift);
      return shift;
    });
  }

  getCurrentCashShift(branchId: T.UUID): Promise<T.CashShift | null> {
    return this.respond(() => {
      return this.db.shifts.find((s) => s.branchId === branchId && s.status === "open") ?? null;
    });
  }

  getCurrentShiftTotals(branchId: T.UUID): Promise<{ shift: T.CashShift; totals: T.ShiftTotals } | null> {
    return this.respond(() => {
      const shift = this.db.shifts.find((s) => s.branchId === branchId && s.status === "open");
      if (!shift) return null;
      return { shift, totals: this.shiftTotals(shift) };
    });
  }

  subscribeCurrentShiftTotals(branchId: T.UUID, onValue: (value: { shift: T.CashShift; totals: T.ShiftTotals } | null) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getCurrentShiftTotals(branchId), onValue, onError);
  }

  private shiftTotals(shift: T.CashShift): T.ShiftTotals {
    const inShift = this.db.payments.filter((p) => p.shiftId === shift.id && p.status !== "voided");
    const sum = (fn: (p: T.Payment) => boolean) => inShift.filter(fn).reduce((s, p) => s + Math.abs(p.amount.amount), 0);
    return {
      cashPayments: money(sum((p) => p.method === "cash" && p.type === "payment")),
      cashRefunds: money(sum((p) => p.method === "cash" && p.type === "refund")),
      cardPayments: money(sum((p) => p.method === "card" && p.type === "payment")),
      transferPayments: money(sum((p) => (p.method === "bank_transfer" || p.method === "cliq") && p.type === "payment")),
      otherPayments: money(sum((p) => p.method === "other" && p.type === "payment")),
      paymentCount: inShift.filter((p) => p.type === "payment").length,
      refundCount: inShift.filter((p) => p.type === "refund").length,
      discountsTotal: money(
        inShift
          .map((p) => this.db.charges.find((c) => c.id === p.chargeId)?.discount.amount ?? 0)
          .reduce((s, d) => s + d, 0),
      ),
    };
  }

  closeCashShift(shiftId: T.UUID, input: T.CloseCashShiftInput): Promise<T.CashShift> {
    return this.respond(() => {
      this.require("reconciliation.close_shift");
      const shift = this.db.shifts.find((s) => s.id === shiftId);
      if (!shift) throw ApiError.of(ERR.NOT_FOUND, "Shift not found.");
      if (shift.status === "closed") throw ApiError.of(ERR.VALIDATION, "Shift is already closed.");
      const totals = this.shiftTotals(shift);
      const expected = shift.openingFloat.amount + totals.cashPayments.amount - totals.cashRefunds.amount;
      const variance = input.countedCash.amount - expected;
      if (variance !== 0 && !input.varianceExplanation?.trim()) {
        throw ApiError.of(ERR.VALIDATION, "Explain the cash variance before closing.", {
          fieldErrors: { varianceExplanation: ["Required when counted cash does not match expected"] },
        });
      }
      shift.status = "closed";
      shift.closedAt = nowISO();
      shift.closedById = this.actor().id;
      shift.expectedCash = money(expected);
      shift.countedCash = input.countedCash;
      shift.variance = money(variance);
      shift.varianceExplanation = input.varianceExplanation;
      shift.varianceApprovalStatus = variance === 0 ? "none" : "pending";
      if (variance !== 0) {
        const branch = this.db.branches.find((b) => b.id === shift.branchId)!;
        this.audit({
          category: "reconciliation",
          action: "shift.close_variance",
          entityType: "cash_shift",
          entityId: shift.id,
          entityLabel: `${branch.name} · shift ${todayISODate(TZ, new Date(shift.openedAt))}`,
          summary: `Shift closed with ${variance < 0 ? "shortage" : "surplus"} of JOD ${(Math.abs(variance) / 1000).toFixed(3)}`,
          reason: input.varianceExplanation,
          before: { expectedCash: expected },
          after: { countedCash: input.countedCash.amount },
          approvalStatus: "pending",
          branchId: shift.branchId,
        });
      }
      return shift;
    });
  }

  listCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }): Promise<T.Page<T.CashShift>> {
    return this.respond(() => {
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = [...this.db.shifts].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
      if (branchId) items = items.filter((s) => s.branchId === branchId);
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }, onValue: (page: T.Page<T.CashShift>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listCashShifts(query), onValue, onError);
  }

  reviewVariance(shiftId: T.UUID, input: { decision: "approved" | "rejected"; note: string }): Promise<T.CashShift> {
    return this.respond(() => {
      this.require("reconciliation.approve_variance");
      this.requireReason(input.note);
      const shift = this.db.shifts.find((s) => s.id === shiftId);
      if (!shift) throw ApiError.of(ERR.NOT_FOUND, "Shift not found.");
      shift.varianceApprovalStatus = input.decision;
      const audit = this.db.audits.find((a) => a.entityType === "cash_shift" && a.entityId === shift.id && a.approvalStatus === "pending");
      if (audit) audit.approvalStatus = input.decision;
      return shift;
    });
  }

  getDailyReconciliation(query: { branchId: T.UUID; date: T.ISODate }): Promise<T.ReconciliationReport> {
    return this.respond(() => {
      this.require("reports.financial.read");
      const dayPayments = this.db.payments.filter(
        (p) => p.branchId === query.branchId && p.status !== "voided" && todayISODate(TZ, new Date(p.occurredAt)) === query.date,
      );
      const methods: T.PaymentMethodKey[] = ["cash", "card", "bank_transfer", "cliq", "other"];
      const totalsByMethod = methods
        .map((method) => {
          const ofMethod = dayPayments.filter((p) => p.method === method);
          const paymentsSum = ofMethod.filter((p) => p.type === "payment").reduce((s, p) => s + p.amount.amount, 0);
          const refundsSum = ofMethod.filter((p) => p.type === "refund").reduce((s, p) => s + Math.abs(p.amount.amount), 0);
          return {
            method,
            payments: money(paymentsSum),
            refunds: money(refundsSum),
            net: money(paymentsSum - refundsSum),
            count: ofMethod.length,
          };
        })
        .filter((row) => row.count > 0);
      const discountsTotal = dayPayments
        .filter((p) => p.type === "payment")
        .map((p) => this.db.charges.find((c) => c.id === p.chargeId)?.discount.amount ?? 0)
        .reduce((s, d) => s + d, 0);
      const shifts = this.db.shifts.filter(
        (s) => s.branchId === query.branchId && todayISODate(TZ, new Date(s.openedAt)) === query.date,
      );
      return {
        branchId: query.branchId,
        date: query.date,
        totalsByMethod,
        totalCollected: money(dayPayments.filter((p) => p.type === "payment").reduce((s, p) => s + p.amount.amount, 0)),
        totalRefunded: money(dayPayments.filter((p) => p.type === "refund").reduce((s, p) => s + Math.abs(p.amount.amount), 0)),
        discountsTotal: money(discountsTotal),
        shifts,
        totalVariance: money(shifts.reduce((s, sh) => s + (sh.variance?.amount ?? 0), 0)),
      };
    });
  }

  // -------------------------------------------------------------------------
  // automations
  // -------------------------------------------------------------------------

  listAutomationRules(): Promise<T.AutomationRule[]> {
    return this.respond(() => {
      return this.maybeEmpty([...this.db.rules]);
    });
  }

  getAutomationRule(id: T.UUID): Promise<T.AutomationRule> {
    return this.respond(() => {
      const rule = this.db.rules.find((r) => r.id === id);
      if (!rule) throw ApiError.of(ERR.NOT_FOUND, "Rule not found.");
      return rule;
    });
  }

  createAutomationRule(input: T.CreateAutomationRuleInput): Promise<T.AutomationRule> {
    return this.respond(() => {
      this.require("automations.manage");
      const rule: T.AutomationRule = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        executionsLast30Days: 0,
        updatedAt: nowISO(),
        ...input,
      };
      this.db.rules.push(rule);
      this.audit({
        category: "automations",
        action: "automation.rule_created",
        entityType: "automation_rule",
        entityId: rule.id,
        entityLabel: rule.name,
        summary: "Automation rule created",
      });
      return rule;
    });
  }

  updateAutomationRule(id: T.UUID, input: T.UpdateAutomationRuleInput): Promise<T.AutomationRule> {
    return this.respond(() => {
      this.require("automations.manage");
      const rule = this.db.rules.find((r) => r.id === id);
      if (!rule) throw ApiError.of(ERR.NOT_FOUND, "Rule not found.");
      const wasEnabled = rule.enabled;
      Object.assign(rule, input, { updatedAt: nowISO() });
      if (input.enabled !== undefined && input.enabled !== wasEnabled) {
        this.audit({
          category: "automations",
          action: input.enabled ? "automation.rule_enabled" : "automation.rule_disabled",
          entityType: "automation_rule",
          entityId: rule.id,
          entityLabel: rule.name,
          summary: input.enabled ? "Rule enabled" : "Rule disabled",
          before: { enabled: wasEnabled ? "yes" : "no" },
          after: { enabled: input.enabled ? "yes" : "no" },
        });
      } else {
        this.audit({
          category: "automations",
          action: "automation.rule_updated",
          entityType: "automation_rule",
          entityId: rule.id,
          entityLabel: rule.name,
          summary: "Rule configuration updated",
          before: { enabled: wasEnabled ? "yes" : "no", name: rule.name },
          after: { enabled: rule.enabled ? "yes" : "no", name: rule.name },
        });
      }
      return rule;
    });
  }

  listAutomationExecutions(query: ExecutionQuery): Promise<T.Page<T.AutomationExecution>> {
    return this.respond(() => {
      let items = [...this.db.executions];
      if (query.ruleId) items = items.filter((e) => e.ruleId === query.ruleId);
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeAutomationExecutions(query: ExecutionQuery, onValue: (page: T.Page<T.AutomationExecution>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listAutomationExecutions(query), onValue, onError);
  }

  getAutomationExecution(id: T.UUID): Promise<T.AutomationExecutionDetail> {
    return this.respond(() => {
      this.require("automations.manage");
      const execution = this.db.executions.find((item) => item.id === id);
      if (!execution) throw ApiError.of(ERR.NOT_FOUND, "Automation execution not found.");
      const action = execution.action ?? "notify_manager";
      const normalizedStatus = execution.status === "success" ? "completed" : execution.status === "skipped_duplicate" ? "suppressed" : execution.status;
      return {
        ...execution,
        status: normalizedStatus,
        actionResults: execution.actionResults ?? [{ key: action, status: normalizedStatus === "failed" ? "failed" : normalizedStatus === "suppressed" ? "suppressed" : "completed" }],
        attemptHistory: execution.attemptHistory ?? [{ action, attempt: 1, status: normalizedStatus === "failed" ? "failed" : normalizedStatus === "suppressed" ? "suppressed" : "completed", occurredAt: execution.executedAt, reason: execution.detail }],
        retryPolicy: execution.retryPolicy ?? { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
      };
    });
  }

  previewAutomationRun(ruleId: T.UUID): Promise<T.AutomationRunPreview> {
    return this.respond(() => {
      this.require("automations.manage");
      const rule = this.db.rules.find((item) => item.id === ruleId);
      if (!rule) throw ApiError.of(ERR.NOT_FOUND, "Automation rule not found.");
      const source = rule.trigger.startsWith("lead") || rule.trigger === "follow_up_overdue" ? this.db.leads : this.db.members;
      const candidates = source.slice(0, 10).map((item) => ({
        subjectType: (rule.trigger.startsWith("lead") || rule.trigger === "follow_up_overdue" ? "lead" : "member") as T.AutomationExecution["subjectType"],
        subjectId: item.id,
        subjectName: item.fullName,
        branchId: "branchId" in item ? item.branchId : item.homeBranchId,
        duplicate: false,
      }));
      return { ruleId, ruleName: rule.name, eligibleCount: candidates.length, duplicateCount: 0, candidates };
    });
  }

  runAutomationRuleNow(ruleId: T.UUID, reason: string): Promise<{ created: number; skippedDuplicates: number }> {
    return this.respond(async () => {
      this.require("automations.manage");
      if (!reason.trim()) throw ApiError.of(ERR.VALIDATION, "A reason is required.");
      const preview = await this.previewAutomationRun(ruleId);
      const rule = this.db.rules.find((item) => item.id === ruleId)!;
      for (const candidate of preview.candidates.filter((item) => !item.duplicate)) {
        const action = rule.actions[0]?.key ?? "notify_manager";
        this.db.executions.unshift({
          id: crypto.randomUUID(),
          ruleId,
          ruleName: rule.name,
          subjectType: candidate.subjectType,
          subjectId: candidate.subjectId,
          subjectName: candidate.subjectName,
          action,
          status: "completed",
          detail: "Executed in explicit mock mode.",
          actionResults: rule.actions.map((item) => ({ key: item.key, status: "completed" as const })),
          attemptHistory: rule.actions.map((item) => ({ action: item.key, attempt: 1, status: "completed" as const, occurredAt: new Date().toISOString() })),
          retryPolicy: { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
          executedAt: new Date().toISOString(),
        });
      }
      this.audit({ category: "automations", action: "automation.rule_run_now", entityType: "automation_rule", entityId: ruleId, entityLabel: rule.name, summary: "Automation rule run manually", reason });
      return { created: preview.eligibleCount, skippedDuplicates: preview.duplicateCount };
    });
  }

  retryAutomationExecution(executionId: T.UUID, reason: string): Promise<T.AutomationExecutionDetail> {
    return this.respond(async () => {
      this.require("automations.manage");
      if (!reason.trim()) throw ApiError.of(ERR.VALIDATION, "A reason is required.");
      const execution = this.db.executions.find((item) => item.id === executionId);
      if (!execution) throw ApiError.of(ERR.NOT_FOUND, "Automation execution not found.");
      if (execution.status !== "failed") throw ApiError.of(ERR.VALIDATION, "Only failed executions can be retried.");
      execution.status = "completed";
      execution.detail = "Retry completed in explicit mock mode.";
      this.audit({ category: "automations", action: "automation.execution_retry", entityType: "automation_execution", entityId: executionId, entityLabel: execution.ruleName, summary: "Automation execution retried", reason });
      return await this.getAutomationExecution(executionId);
    });
  }

  listMessageTemplates(): Promise<T.MessageTemplate[]> {
    return this.respond(() => [...this.db.templates]);
  }

  listOperationalEmailDeliveries(query: T.ListQuery = {}): Promise<T.Page<T.OperationalEmailDelivery>> {
    return this.respond(() => paginate([], query));
  }

  subscribeOperationalEmailDeliveries(query: T.ListQuery, onValue: (page: T.Page<T.OperationalEmailDelivery>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listOperationalEmailDeliveries(query), onValue, onError);
  }

  // -------------------------------------------------------------------------
  // audit
  // -------------------------------------------------------------------------

  listAuditEvents(query: AuditQuery): Promise<T.Page<T.AuditEvent>> {
    return this.respond(() => {
      this.require("audit.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = [...this.db.audits];
      if (branchId) items = items.filter((a) => !a.branchId || a.branchId === branchId);
      if (query.category) items = items.filter((a) => a.category === query.category);
      if (query.actorId) items = items.filter((a) => a.actorId === query.actorId);
      if (query.entityId) items = items.filter((a) => a.entityId === query.entityId);
      const auditFrom = query.from;
      const auditTo = query.to;
      if (auditFrom) items = items.filter((a) => a.occurredAt >= auditFrom);
      if (auditTo) items = items.filter((a) => a.occurredAt <= `${auditTo}T23:59:59.999Z`);
      items = items.filter((a) => this.matchesSearch([a.summary, a.entityLabel, a.actorName, a.action], query.search));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  listPendingApprovals(): Promise<T.AuditEvent[]> {
    return this.respond(() => {
      this.require("audit.read");
      return this.db.audits.filter((a) => a.approvalStatus === "pending" && this.branchIsVisible(a.branchId));
    });
  }

  reviewApproval(auditEventId: T.UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<void> {
    return this.respond(() => {
      const event = this.db.audits.find((a) => a.id === auditEventId);
      if (!event) throw ApiError.of(ERR.NOT_FOUND, "Approval not found.");
      if (!this.branchIsVisible(event.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Approval not found.");
      if (input.decision !== "approved" && input.decision !== "rejected") {
        throw ApiError.of(ERR.VALIDATION, "Approval decision must be approved or rejected.");
      }
      if (event.approvalStatus !== "pending") throw ApiError.of(ERR.VALIDATION, "This approval is not pending.");
      if (event.action === "membership.discount") this.require("payments.discount");
      else if (event.action === "payment.refund") this.require("payments.refund");
      else if (event.action === "shift.close_variance") this.require("reconciliation.approve_variance");
      else throw ApiError.of(ERR.VALIDATION, "This audit event does not support approval review.");
      this.requireReason(input.note, "note");
      const before = { ...event.before, approvalStatus: "pending" as const };
      const after = { ...event.after, approvalStatus: input.decision };
      event.approvalStatus = input.decision;
      if (event.action === "membership.discount") {
        const membership = this.db.memberships.find((m) => m.id === event.entityId);
        if (membership) membership.discountApprovalStatus = input.decision;
      }
      if (event.action === "shift.close_variance") {
        const shift = this.db.shifts.find((s) => s.id === event.entityId);
        if (shift) shift.varianceApprovalStatus = input.decision;
      }
      this.audit({
        category: event.category,
        action: `${event.action}.${input.decision}`,
        entityType: event.entityType,
        entityId: event.entityId,
        entityLabel: event.entityLabel,
        summary: `${input.decision === "approved" ? "Approved" : "Rejected"}: ${event.summary}`,
        reason: input.note,
        before,
        after,
        branchId: event.branchId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // settings & users
  // -------------------------------------------------------------------------

  getOrganizationSettings(): Promise<T.OrganizationSettings> {
    return this.respond(() => ({
      organization: this.db.organization,
      branches: this.db.branches,
      paymentMethods: this.db.paymentMethods,
      roles: this.db.roles,
      notifications: this.db.notificationSettings,
      operationalPolicies: this.db.operationalPolicies,
    }));
  }

  updateOrganizationSettings(input: T.UpdateOrganizationSettingsInput): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      const before = { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent };
      Object.assign(this.db.organization, input);
      this.audit({
        category: "settings",
        action: "settings.organization_update",
        entityType: "organization",
        entityId: this.db.organization.id,
        entityLabel: this.db.organization.name,
        summary: "Organization settings updated",
        before,
        after: { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent },
      });
      return this.getOrganizationSettingsSync();
    });
  }

  private getOrganizationSettingsSync(): T.OrganizationSettings {
    return {
      organization: this.db.organization,
      branches: this.db.branches,
      paymentMethods: this.db.paymentMethods,
      roles: this.db.roles,
      notifications: this.db.notificationSettings,
      operationalPolicies: this.db.operationalPolicies,
    };
  }

  updatePaymentMethods(input: T.PaymentMethod[]): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      this.db.paymentMethods = input;
      this.audit({
        category: "settings",
        action: "settings.payment_methods",
        entityType: "organization",
        entityId: this.db.organization.id,
        entityLabel: this.db.organization.name,
        summary: `Payment methods updated — ${input.filter((m) => m.enabled).map((m) => m.label).join(", ")}`,
      });
      return this.getOrganizationSettingsSync();
    });
  }

  updateNotificationSettings(input: T.NotificationSettings): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      this.db.notificationSettings = input;
      return this.getOrganizationSettingsSync();
    });
  }

  updateOperationalPolicies(input: T.OperationalPolicies): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      this.db.operationalPolicies = structuredClone(input);
      this.audit({
        category: "settings",
        action: "settings.operational_policies",
        entityType: "organization",
        entityId: this.db.organization.id,
        entityLabel: this.db.organization.name,
        summary: "Entry, membership, and operating-hour policies updated",
      });
      return this.getOrganizationSettingsSync();
    });
  }

  getOperationalEmailSettings(): Promise<T.OperationalEmailActivationSettings> {
    return this.respond(() => ({ enabledKinds: [...this.operationalEmailKinds], availableKinds: ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"], configurableKinds: ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"], mandatoryPlatformKinds: ["platform_invoice_issued", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled"], liveWorkerEnabled: false, providerConfigured: false, webhookConfigured: false, ownerConfirmed: false, ...this.operationalEmailUpdate }));
  }

  updateOperationalEmailSettings(input: { enabledKinds: string[]; reason: string }): Promise<T.OperationalEmailActivationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      const allowed = ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"];
      const next = [...new Set(input.enabledKinds)];
      if (next.some((kind) => !allowed.includes(kind))) throw ApiError.of(ERR.VALIDATION, "Only gym-controlled member service email types can be configured here.");
      const nextKinds = new Set(next);
      if (this.operationalEmailKinds.some((kind) => !nextKinds.has(kind))) this.requireReason(input.reason);
      this.operationalEmailKinds = next;
      const confirmedAt = nowISO();
      this.operationalEmailUpdate = { ownerConfirmed: true, ownerConfirmedAt: confirmedAt, ownerConfirmedBy: this.actor().name, updatedAt: confirmedAt, updatedBy: this.actor().name, reason: input.reason || undefined };
      this.audit({ category: "settings", action: "settings.operational_email.update", entityType: "organization", entityId: this.db.organization.id, entityLabel: this.db.organization.name, summary: `Enabled ${this.operationalEmailKinds.length} gym-controlled service email types`, reason: input.reason || undefined });
      return { enabledKinds: [...this.operationalEmailKinds], availableKinds: allowed, configurableKinds: allowed, mandatoryPlatformKinds: ["platform_invoice_issued", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled"], liveWorkerEnabled: false, providerConfigured: false, webhookConfigured: false, ...this.operationalEmailUpdate! };
    });
  }

  listBranches(): Promise<T.Branch[]> {
    return this.respond(() => [...this.db.branches]);
  }

  upsertBranch(input: { id?: T.UUID; name: string; code: string; address: string; phone: string; capacity: number; status: "active" | "inactive" }): Promise<T.Branch> {
    return this.respond(() => {
      this.require("settings.manage");
      if (input.id) {
        const branch = this.db.branches.find((b) => b.id === input.id);
        if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
        Object.assign(branch, input);
        this.audit({
          category: "settings",
          action: "branch.update",
          entityType: "branch",
          entityId: branch.id,
          entityLabel: branch.name,
          summary: "Branch updated",
        });
        return branch;
      }
      const branch: T.Branch = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        name: input.name,
        code: input.code.toUpperCase(),
        address: input.address,
        phone: input.phone,
        capacity: input.capacity,
        status: input.status,
      };
      this.db.branches.push(branch);
      this.audit({
        category: "settings",
        action: "branch.create",
        entityType: "branch",
        entityId: branch.id,
        entityLabel: branch.name,
        summary: "Branch created",
      });
      return branch;
    });
  }

  listUsers(query: UserListQuery): Promise<T.Page<T.StaffUser>> {
    return this.respond(() => {
      let items = [...this.db.users];
      if (query.role) items = items.filter((u) => u.role === query.role);
      if (query.status) items = items.filter((u) => u.status === query.status);
      items = items.filter((u) => this.matchesSearch([u.name, u.email, u.phone], query.search));
      items = applySort(items, query.sort ?? "name", (u, k) => (k === "name" ? u.name : u.role));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  inviteUser(input: T.InviteUserInput): Promise<T.StaffUser> {
    return this.respond(() => {
      this.require("users.manage");
      const user: T.StaffUser = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        name: input.name,
        email: input.email,
        phone: input.phone ?? "",
        role: input.role,
        branchScope: input.branchScope,
        branchIds: input.branchIds,
        status: "invited",
        invitedAt: nowISO(),
      };
      this.db.users.push(user);
      this.audit({
        category: "users",
        action: "user.invite",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.name,
        summary: `Invited as ${input.role}`,
      });
      return user;
    });
  }

  updateUserAccess(userId: T.UUID, input: T.UpdateUserAccessInput): Promise<T.StaffUser> {
    return this.respond(() => {
      this.require("users.manage");
      const user = this.db.users.find((u) => u.id === userId);
      if (!user) throw ApiError.of(ERR.NOT_FOUND, "User not found.");
      if (user.id === this.actor().id && input.status === "deactivated") {
        throw ApiError.of(ERR.VALIDATION, "You cannot deactivate your own account.");
      }
      const before = { role: user.role, status: user.status, branches: user.branchIds.length };
      Object.assign(user, input);
      this.audit({
        category: "users",
        action: input.status === "deactivated" ? "user.deactivate" : "user.access_update",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.name,
        summary: input.status === "deactivated" ? "Account deactivated" : "Access updated",
        reason: input.status === "deactivated" ? "Deactivated by administrator" : undefined,
        before,
        after: { role: user.role, status: user.status, branches: user.branchIds.length },
      });
      return user;
    });
  }

  updateRolePermissions(role: T.RoleKey, input: T.UpdateRolePermissionsInput): Promise<T.RoleDefinition> {
    return this.respond(() => {
      this.require("users.manage");
      const def = this.db.roles.find((r) => r.key === role);
      if (!def) throw ApiError.of(ERR.NOT_FOUND, "Role not found.");
      if (role === "owner") throw ApiError.of(ERR.VALIDATION, "The owner role always has full access.");
      const before = { permissions: def.permissions.length, discountLimit: def.discountLimitMinor };
      if (input.permissions) def.permissions = input.permissions;
      if (input.discountLimitMinor !== undefined) def.discountLimitMinor = input.discountLimitMinor;
      this.audit({
        category: "users",
        action: "role.permissions_change",
        entityType: "role",
        entityId: this.db.users.find((u) => u.role === role)?.id ?? this.db.organization.id,
        entityLabel: def.label,
        summary: `Permissions updated for the ${def.label} role`,
        before,
        after: { permissions: def.permissions.length, discountLimit: def.discountLimitMinor },
      });
      return def;
    });
  }
}
