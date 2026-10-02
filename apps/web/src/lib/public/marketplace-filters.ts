import type { MarketplaceGym } from "./experience-data";

/**
 * Public discovery only shows gyms that are explicitly visible and
 * operational. Visibility is intentionally opt-in: a missing flag is not
 * enough to publish a tenant, because older projections and partially seeded
 * records must fail closed on member-facing surfaces.
 */
export function publicMarketplaceGyms(gyms: MarketplaceGym[]): MarketplaceGym[] {
  return gyms.filter((gym) => (gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial") && gym.isPublic === true);
}

/** Platform operators need the complete tenant directory, including hidden,
 * suspended, overdue, and cancelled records. Public visibility is not an
 * authorization boundary for the platform console. */
export function platformTenantDirectoryGyms(gyms: MarketplaceGym[]): MarketplaceGym[] {
  return gyms;
}
