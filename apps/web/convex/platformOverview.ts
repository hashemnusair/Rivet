export type PlatformQueueSeverity = "danger" | "warning" | "info";

export interface PlatformOverviewInput {
  now?: number;
  gyms: Array<{ id: string; organizationId?: string; subscriptionStatus: string; trialEndsAt?: string; provisioned?: boolean }>;
  organizations: Array<{ id?: string; status: string; subscriptionPlan?: string; entitlementPlan?: string; billingInterval?: "monthly" | "annual"; provisioned?: boolean }>;
  plans: Array<{ name: string; priceMinor: number }>;
  branches: Array<{ organizationId?: string; active: boolean; status?: string }>;
  members: Array<{ organizationId?: string; status?: string }>;
  staffMemberships: Array<{ organizationId?: string; active: boolean }>;
  bookings: Array<{ organizationId?: string; gymId?: string; status?: string }>;
  applications: Array<{
    id: string;
    gymName: string;
    plan: string;
    status: string;
    updatedAt: string;
    provisioningStatus?: string;
    provisioningError?: string;
  }>;
  invoices: Array<{
    id: string;
    organizationId?: string;
    gymId?: string;
    gym?: string;
    amount?: string;
    amountMinor?: number;
    currency?: string;
    status?: string;
    date?: string;
    issuedAt?: string;
    occurredAt?: string;
  }>;
  supportCases: Array<{
    id: string;
    organizationId?: string;
    gymId?: string;
    gym?: string;
    subject?: string;
    priority?: string;
    status?: string;
    createdAt?: string;
  }>;
}

const PLATFORM_BILLING_CURRENCY = "JOD";
const CURRENCY_MINOR_EXPONENTS: Record<string, number> = {
  AED: 2,
  BHD: 3,
  EUR: 2,
  GBP: 2,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  SAR: 2,
  TND: 3,
  USD: 2,
};

type InvoiceCurrencyResolution = {
  currency?: string;
  eligible: boolean;
};

function normalizedCurrency(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : undefined;
}

function currencyFromAmountLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const prefix = value.trim().match(/^([A-Za-z]{3}|JD)(?=\s|\d|$)/)?.[1]?.toUpperCase();
  return prefix === "JD" ? PLATFORM_BILLING_CURRENCY : prefix;
}

function resolveInvoiceCurrency(invoice: PlatformOverviewInput["invoices"][number]): InvoiceCurrencyResolution {
  const explicit = normalizedCurrency(invoice.currency);
  const labeled = currencyFromAmountLabel(invoice.amount);
  // A legacy amount label is useful only when it agrees with the persisted
  // currency. Conflicting evidence is configuration-invalid, not JOD.
  if (explicit && labeled && explicit !== labeled) return { currency: undefined, eligible: false };
  const currency = explicit ?? labeled;
  return { currency, eligible: currency === PLATFORM_BILLING_CURRENCY };
}

function invoiceAmountMinor(invoice: PlatformOverviewInput["invoices"][number], currency?: string): number {
  if (Number.isSafeInteger(invoice.amountMinor) && (invoice.amountMinor ?? 0) >= 0) return invoice.amountMinor ?? 0;
  const exponent = currency ? CURRENCY_MINOR_EXPONENTS[currency] : undefined;
  if (exponent === undefined) return 0;
  const parsed = Number((invoice.amount ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10 ** exponent) : 0;
}

export function buildPlatformOverview(input: PlatformOverviewInput) {
  const currency = PLATFORM_BILLING_CURRENCY;
  // Platform snapshots retain legacy directory rows for cleanup, but every
  // operational aggregate must be scoped to a provisioned tenant. A record
  // with neither a provisioned gym nor organization link is intentionally
  // ignored instead of being guessed into the totals.
  const provisionedGymIds = new Set(input.gyms.filter((gym) => gym.provisioned === true).map((gym) => gym.id));
  const provisionedOrganizationIds = new Set(input.organizations.filter((organization) => organization.provisioned === true && organization.id).map((organization) => organization.id as string));
  const operationalOrganizationIds = new Set(input.organizations
    .filter((organization) => organization.provisioned === true && ["trial", "active", "past_due"].includes(organization.status) && organization.id)
    .map((organization) => organization.id as string));
  const belongsToProvisionedTenant = (record: { gymId?: string; organizationId?: string }, operationalOnly = false) => {
    // An explicit gym link takes precedence. This prevents a stale database
    // organization link from reviving an unprovisioned cleanup fixture.
    if (record.gymId !== undefined) return provisionedGymIds.has(record.gymId);
    const allowedOrganizations = operationalOnly ? operationalOrganizationIds : provisionedOrganizationIds;
    return record.organizationId !== undefined && allowedOrganizations.has(record.organizationId);
  };
  const provisionedGyms = input.gyms.filter((gym) => gym.provisioned === true);
  const provisionedInvoices = input.invoices.filter((invoice) => belongsToProvisionedTenant(invoice));
  const provisionedBookings = input.bookings.filter((booking) => belongsToProvisionedTenant(booking));
  const provisionedSupportCases = input.supportCases.filter((supportCase) => belongsToProvisionedTenant(supportCase));
  const eligibleInvoices = provisionedInvoices.flatMap((invoice) => {
    const resolution = resolveInvoiceCurrency(invoice);
    return resolution.eligible ? [{ invoice, currency: resolution.currency ?? PLATFORM_BILLING_CURRENCY }] : [];
  });
  const billingCurrencyMismatches = provisionedInvoices.length - eligibleInvoices.length;
  const planPrices = new Map(input.plans.map((plan) => [plan.name, plan.priceMinor]));
  const gymCounts = { trial: 0, active: 0, past_due: 0, suspended: 0, cancelled: 0 };

  for (const gym of provisionedGyms) {
    if (gym.subscriptionStatus === "trial") gymCounts.trial += 1;
    else if (gym.subscriptionStatus === "active") gymCounts.active += 1;
    else if (gym.subscriptionStatus === "overdue" || gym.subscriptionStatus === "past_due") gymCounts.past_due += 1;
    else if (gym.subscriptionStatus === "suspended") gymCounts.suspended += 1;
    else if (gym.subscriptionStatus === "cancelled") gymCounts.cancelled += 1;
  }

  const activeMrr = input.organizations.reduce((total, organization) => {
    if (organization.status !== "active" || organization.provisioned !== true) return total;
    // The organization billing plan is authoritative. Entitlement materiality
    // can lag a plan mutation and must never make MRR look stale.
    const plan = organization.subscriptionPlan ?? organization.entitlementPlan;
    if (!plan) return total;
    const monthlyPrice = planPrices.get(plan) ?? 0;
    // Annual tenants pay twelve months with the published 20% saving, so
    // their effective monthly revenue is the discounted rate — not the
    // headline monthly price.
    return total + (organization.billingInterval === "annual" ? Math.round(monthlyPrice * 0.8) : monthlyPrice);
  }, 0);
  const paidInvoices = eligibleInvoices.filter(({ invoice }) => invoice.status === "paid");
  const overdueInvoices = eligibleInvoices.filter(({ invoice }) => ["failed", "past_due", "overdue"].includes(invoice.status ?? ""));
  const outstandingInvoices = eligibleInvoices.filter(({ invoice }) => !["paid", "void", "trial"].includes(invoice.status ?? ""));
  const now = input.now ?? Date.now();
  const fourteenDaysFromNow = now + 14 * 86_400_000;
  const billingByMonth = new Map<string, { issued: number; collected: number; outstanding: number }>();
  for (const { invoice, currency: invoiceCurrency } of eligibleInvoices) {
    const timestamp = Date.parse(invoice.issuedAt ?? invoice.date ?? invoice.occurredAt ?? "");
    if (!Number.isFinite(timestamp)) continue;
    const month = new Date(timestamp).toISOString().slice(0, 7);
    const totals = billingByMonth.get(month) ?? { issued: 0, collected: 0, outstanding: 0 };
    const amount = invoiceAmountMinor(invoice, invoiceCurrency);
    if (!["draft", "void", "trial"].includes(invoice.status ?? "")) totals.issued += amount;
    if (invoice.status === "paid") totals.collected += amount;
    if (!["paid", "void", "trial", "draft"].includes(invoice.status ?? "")) totals.outstanding += amount;
    billingByMonth.set(month, totals);
  }
  const billingHistory = [...billingByMonth.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, 12)
    .map(([month, totals]) => ({
      month,
      issued: { amount: totals.issued, currency },
      collected: { amount: totals.collected, currency },
      outstanding: { amount: totals.outstanding, currency },
    }));

  const operatorQueue = [
    ...input.applications
      .filter((application) => application.status === "pending" || application.status === "under_review")
      .map((application) => ({
        id: `application:${application.id}`,
        severity: (application.status === "pending" ? "info" : "warning") as PlatformQueueSeverity,
        title: application.status === "pending" ? "Gym application awaiting review" : "Gym application under review",
        detail: `${application.gymName} · ${application.plan} plan`,
        href: `/platform/applications?application=${application.id}`,
        occurredAt: application.updatedAt,
      })),
    ...input.applications
      .filter((application) => application.provisioningStatus === "failed")
      .map((application) => ({
        id: `provisioning:${application.id}`,
        severity: "danger" as PlatformQueueSeverity,
        title: "Gym provisioning needs attention",
        detail: `${application.gymName}${application.provisioningError ? ` · ${application.provisioningError}` : ""}`,
        href: `/platform/applications?application=${application.id}`,
        occurredAt: application.updatedAt,
      })),
    ...overdueInvoices.map(({ invoice }) => ({
      id: `invoice:${invoice.id}`,
      severity: "danger" as PlatformQueueSeverity,
      title: "Platform invoice needs attention",
      detail: `${invoice.gym ?? "Gym"} · ${invoice.amount ?? "Amount unavailable"}`,
      href: "/platform/billing",
      occurredAt: invoice.occurredAt ?? invoice.date,
    })),
    ...provisionedSupportCases
      .filter((supportCase) => supportCase.status !== "resolved")
      .map((supportCase) => ({
        id: `support:${supportCase.id}`,
        severity: (supportCase.priority === "urgent" ? "danger" : "warning") as PlatformQueueSeverity,
        title: supportCase.subject ?? "Open support case",
        detail: supportCase.gym ?? "Gym support case",
        href: `/platform/support?case=${supportCase.id}`,
        occurredAt: supportCase.createdAt,
      })),
  ].sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""));

  return {
    gymCounts,
    branchCount: input.branches.filter((branch) => belongsToProvisionedTenant(branch, true) && branch.active && branch.status !== "inactive").length,
    memberCount: input.members.filter((member) => belongsToProvisionedTenant(member, true) && member.status === "active").length,
    activeStaffCount: input.staffMemberships.filter((membership) => belongsToProvisionedTenant(membership, true) && membership.active).length,
    activeMrr: { amount: activeMrr, currency },
    invoiceTotals: {
      collected: { amount: paidInvoices.reduce((total, { invoice, currency: invoiceCurrency }) => total + invoiceAmountMinor(invoice, invoiceCurrency), 0), currency },
      outstanding: { amount: outstandingInvoices.reduce((total, { invoice, currency: invoiceCurrency }) => total + invoiceAmountMinor(invoice, invoiceCurrency), 0), currency },
      overdue: { amount: overdueInvoices.reduce((total, { invoice, currency: invoiceCurrency }) => total + invoiceAmountMinor(invoice, invoiceCurrency), 0), currency },
    },
    billingCurrencyMismatches,
    trialRequests: provisionedBookings.length,
    trialConversions: provisionedBookings.filter((booking) => booking.status === "converted").length,
    pendingApplications: input.applications.filter((application) => application.status === "pending" || application.status === "under_review").length,
    provisioningFailures: input.applications.filter((application) => application.provisioningStatus === "failed").length,
    pastDueAccounts: new Set(overdueInvoices.map(({ invoice }) => invoice.gymId ?? invoice.gym ?? invoice.id)).size,
    trialsExpiringSoon: provisionedGyms.filter((gym) => {
      if (gym.subscriptionStatus !== "trial" || !gym.trialEndsAt) return false;
      const trialEndsAt = Date.parse(gym.trialEndsAt);
      return Number.isFinite(trialEndsAt) && trialEndsAt >= now && trialEndsAt <= fourteenDaysFromNow;
    }).length,
    openSupportCases: provisionedSupportCases.filter((supportCase) => supportCase.status !== "resolved").length,
    urgentSupportCases: provisionedSupportCases.filter((supportCase) => supportCase.status !== "resolved" && supportCase.priority === "urgent").length,
    billingHistory,
    operatorQueue,
  };
}
