export type PlatformQueueSeverity = "danger" | "warning" | "info";

export interface PlatformOverviewInput {
  now?: number;
  gyms: Array<{ id: string; subscriptionStatus: string; trialEndsAt?: string }>;
  organizations: Array<{ status: string; subscriptionPlan?: string }>;
  plans: Array<{ name: string; priceMinor: number }>;
  branches: Array<{ active: boolean; status?: string }>;
  members: Array<{ status?: string }>;
  staffMemberships: Array<{ active: boolean }>;
  bookings: Array<{ status?: string }>;
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
    gym?: string;
    subject?: string;
    priority?: string;
    status?: string;
    createdAt?: string;
  }>;
}

function invoiceAmountMinor(invoice: PlatformOverviewInput["invoices"][number]): number {
  if (Number.isSafeInteger(invoice.amountMinor) && (invoice.amountMinor ?? 0) >= 0) return invoice.amountMinor ?? 0;
  const parsed = Number((invoice.amount ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1_000) : 0;
}

export function buildPlatformOverview(input: PlatformOverviewInput) {
  const currency = input.invoices.find((invoice) => invoice.currency)?.currency ?? "JOD";
  const planPrices = new Map(input.plans.map((plan) => [plan.name, plan.priceMinor]));
  const gymCounts = { trial: 0, active: 0, past_due: 0, suspended: 0, cancelled: 0 };

  for (const gym of input.gyms) {
    if (gym.subscriptionStatus === "trial") gymCounts.trial += 1;
    else if (gym.subscriptionStatus === "active") gymCounts.active += 1;
    else if (gym.subscriptionStatus === "overdue" || gym.subscriptionStatus === "past_due") gymCounts.past_due += 1;
    else if (gym.subscriptionStatus === "suspended") gymCounts.suspended += 1;
    else if (gym.subscriptionStatus === "cancelled") gymCounts.cancelled += 1;
  }

  const activeMrr = input.organizations.reduce((total, organization) => {
    if (organization.status !== "active" || !organization.subscriptionPlan) return total;
    return total + (planPrices.get(organization.subscriptionPlan) ?? 0);
  }, 0);
  const paidInvoices = input.invoices.filter((invoice) => invoice.status === "paid");
  const overdueInvoices = input.invoices.filter((invoice) => ["failed", "past_due", "overdue"].includes(invoice.status ?? ""));
  const outstandingInvoices = input.invoices.filter((invoice) => !["paid", "void", "trial"].includes(invoice.status ?? ""));
  const now = input.now ?? Date.now();
  const fourteenDaysFromNow = now + 14 * 86_400_000;
  const billingByMonth = new Map<string, { issued: number; collected: number; outstanding: number }>();
  for (const invoice of input.invoices) {
    const timestamp = Date.parse(invoice.issuedAt ?? invoice.date ?? invoice.occurredAt ?? "");
    if (!Number.isFinite(timestamp)) continue;
    const month = new Date(timestamp).toISOString().slice(0, 7);
    const totals = billingByMonth.get(month) ?? { issued: 0, collected: 0, outstanding: 0 };
    const amount = invoiceAmountMinor(invoice);
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
    ...overdueInvoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      severity: "danger" as PlatformQueueSeverity,
      title: "Platform invoice needs attention",
      detail: `${invoice.gym ?? "Gym"} · ${invoice.amount ?? "Amount unavailable"}`,
      href: "/platform/billing",
      occurredAt: invoice.occurredAt ?? invoice.date,
    })),
    ...input.supportCases
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
    branchCount: input.branches.filter((branch) => branch.active && branch.status !== "inactive").length,
    memberCount: input.members.filter((member) => member.status === "active").length,
    activeStaffCount: input.staffMemberships.filter((membership) => membership.active).length,
    activeMrr: { amount: activeMrr, currency },
    invoiceTotals: {
      collected: { amount: paidInvoices.reduce((total, invoice) => total + invoiceAmountMinor(invoice), 0), currency },
      outstanding: { amount: outstandingInvoices.reduce((total, invoice) => total + invoiceAmountMinor(invoice), 0), currency },
      overdue: { amount: overdueInvoices.reduce((total, invoice) => total + invoiceAmountMinor(invoice), 0), currency },
    },
    trialRequests: input.bookings.length,
    trialConversions: input.bookings.filter((booking) => booking.status === "converted").length,
    pendingApplications: input.applications.filter((application) => application.status === "pending" || application.status === "under_review").length,
    provisioningFailures: input.applications.filter((application) => application.provisioningStatus === "failed").length,
    pastDueAccounts: new Set(overdueInvoices.map((invoice) => invoice.gymId ?? invoice.gym ?? invoice.id)).size,
    trialsExpiringSoon: input.gyms.filter((gym) => {
      if (gym.subscriptionStatus !== "trial" || !gym.trialEndsAt) return false;
      const trialEndsAt = Date.parse(gym.trialEndsAt);
      return Number.isFinite(trialEndsAt) && trialEndsAt >= now && trialEndsAt <= fourteenDaysFromNow;
    }).length,
    openSupportCases: input.supportCases.filter((supportCase) => supportCase.status !== "resolved").length,
    urgentSupportCases: input.supportCases.filter((supportCase) => supportCase.status !== "resolved" && supportCase.priority === "urgent").length,
    billingHistory,
    operatorQueue,
  };
}
