export type PlatformField<T> =
  | { state: "available"; value: T }
  | { state: "not_available" }
  | { state: "not_configured" };

type SubscriptionStatus = "trial" | "active" | "overdue" | "suspended" | "cancelled";
type OrganizationStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";
type PlatformPlan = "Starter" | "Growth" | "Pro" | "Enterprise";
type BillingInterval = "monthly" | "annual";

export interface PlatformGymDetailSource {
  gym: {
    id: string;
    name: string;
    shortName: string;
    accent: string;
    subscriptionStatus: SubscriptionStatus;
    rivetPlan: PlatformPlan;
    isPublic: boolean;
    isArchived?: boolean;
    archivedAt?: number;
    archiveReason?: string;
  };
  /** Resolved only from an active, public, same-tenant gym logo asset. */
  logoUrl?: string;
  organization?: {
    id: string;
    name: string;
    status: OrganizationStatus;
    currency: string;
    timezone: string;
    createdAt?: number;
    subscriptionPlan?: PlatformPlan;
    billingInterval?: BillingInterval;
    subscriptionStartedAt?: number;
    trialEndsAt?: number;
    currentPeriodEndsAt?: number;
    cancelledAt?: number;
    subscriptionStatusReason?: string;
    archivedAt?: number;
    archiveReason?: string;
  };
  branches: Array<{
    id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    status: "active" | "inactive";
  }>;
  owner?: {
    name: string;
    email: string;
    phone?: string;
  };
  usage: {
    memberCount: number;
    activeStaffCount: number;
    staffLimit?: number;
    automationRuleCount: number;
    paymentTransactionCount: number;
  };
  /** Derived from the live plan catalog and the tenant's billing interval. */
  recurringAmountMinor?: number;
  /** Platform invoices already scoped to this tenant, snapshot-view shaped. */
  invoices?: Array<Record<string, unknown> & { id: string }>;
  /** Public-page review facts: the live version plus any draft awaiting the
   * platform team's publish after the tenant's first self-serve publish. */
  publicPage?: { publishedVersion: number; draftVersion?: number; draftStatus?: string; draftUpdatedAt?: string };
  activity: Array<{
    id: string;
    action: string;
    summary: string;
    actorName: string;
    occurredAt: string;
  }>;
}

export function available<T>(value: T): PlatformField<T> {
  return { state: "available", value };
}

export function notAvailable<T>(): PlatformField<T> {
  return { state: "not_available" };
}

export function notConfigured<T>(): PlatformField<T> {
  return { state: "not_configured" };
}

function subscriptionStatus(status: OrganizationStatus): SubscriptionStatus {
  if (status === "past_due") return "overdue";
  return status as Exclude<OrganizationStatus, "past_due">;
}

function iso(timestamp: number | undefined): string | undefined {
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

/**
 * Builds the platform detail projection from facts already scoped to one
 * organization. Missing provider capabilities intentionally stay explicit;
 * this function never fills them with preview/demo values.
 */
export function buildPlatformGymDetail(source: PlatformGymDetailSource) {
  const organization = source.organization;
  const organizationData = organization
    ? available({
        id: organization.id,
        name: organization.name,
        status: organization.status,
        currency: organization.currency,
        timezone: organization.timezone,
        archivedAt: iso(organization.archivedAt),
        archiveReason: organization.archiveReason,
      })
    : notAvailable();
  const tenantAvailable = Boolean(organization);
  const joinedAt = iso(organization?.createdAt);
  const startedAt = iso(organization?.subscriptionStartedAt);
  const trialEndsAt = iso(organization?.trialEndsAt);
  const currentPeriodEndsAt = iso(organization?.currentPeriodEndsAt);
  const cancelledAt = iso(organization?.cancelledAt);
  const status = organization ? subscriptionStatus(organization.status) : undefined;
  const controlStatus = status ?? source.gym.subscriptionStatus;
  const controlPlan = organization?.subscriptionPlan ?? source.gym.rivetPlan;
  // A directory projection cannot publish a tenant that is suspended,
  // cancelled, overdue, or not provisioned. Keep the admin control truthful
  // even when an older marketplace row still says public.
  const controlIsPublic = Boolean(organization && (organization.status === "active" || organization.status === "trial") && source.gym.isPublic);
  const archivedAt = organization?.archivedAt ?? source.gym.archivedAt;
  const archiveReason = organization?.archiveReason ?? source.gym.archiveReason;

  return {
    id: source.gym.id,
    name: source.gym.name,
    shortName: source.gym.shortName,
    accent: source.gym.accent,
    logoUrl: organization ? (source.logoUrl ? available(source.logoUrl) : notConfigured()) : notAvailable(),
    controls: {
      status: controlStatus,
      plan: controlPlan,
      isPublic: controlIsPublic,
      isArchived: Boolean(archivedAt || source.gym.isArchived),
      archivedAt: iso(archivedAt),
      archiveReason,
    },
    organization: organizationData,
    publicPage: tenantAvailable && source.publicPage ? available(source.publicPage) : notAvailable(),
    joinedAt: joinedAt ? available(joinedAt) : notAvailable(),
    branches: tenantAvailable ? available(source.branches) : notAvailable(),
    owner: source.owner ? available(source.owner) : notAvailable(),
    usage: {
      memberCount: tenantAvailable ? available(source.usage.memberCount) : notAvailable(),
      activeStaffCount: tenantAvailable ? available(source.usage.activeStaffCount) : notAvailable(),
      staffLimit: tenantAvailable && source.usage.staffLimit !== undefined ? available(source.usage.staffLimit) : notConfigured(),
      automationRuleCount: tenantAvailable ? available(source.usage.automationRuleCount) : notAvailable(),
      paymentTransactionCount: tenantAvailable ? available(source.usage.paymentTransactionCount) : notAvailable(),
      storage: notConfigured(),
    },
    subscription: {
      plan: organization?.subscriptionPlan ? available(organization.subscriptionPlan) : organization ? notConfigured() : notAvailable(),
      billingInterval: organization ? available(organization.billingInterval ?? "monthly") : notAvailable(),
      status: status ? available(status) : notAvailable(),
      startedAt: startedAt ? available(startedAt) : notAvailable(),
      trialEndsAt: trialEndsAt ? available(trialEndsAt) : organization ? notConfigured() : notAvailable(),
      currentPeriodEndsAt: currentPeriodEndsAt ? available(currentPeriodEndsAt) : organization ? notConfigured() : notAvailable(),
      cancelledAt: cancelledAt ? available(cancelledAt) : organization ? notConfigured() : notAvailable(),
      statusReason: organization?.subscriptionStatusReason ? available(organization.subscriptionStatusReason) : organization ? notConfigured() : notAvailable(),
      recurringAmount: tenantAvailable && source.recurringAmountMinor !== undefined && organization
        ? available({ amount: source.recurringAmountMinor, currency: organization.currency })
        : tenantAvailable ? notConfigured() : notAvailable(),
      renewalDate: currentPeriodEndsAt ? available(currentPeriodEndsAt) : tenantAvailable ? notConfigured() : notAvailable(),
      paymentMethod: tenantAvailable ? notConfigured() : notAvailable(),
      invoices: tenantAvailable && source.invoices ? available(source.invoices) : tenantAvailable ? notConfigured() : notAvailable(),
    },
    activity: tenantAvailable ? available(source.activity) : notAvailable(),
  };
}
