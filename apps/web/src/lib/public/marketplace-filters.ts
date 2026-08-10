import type { MarketplaceGym } from "./experience-data";

/** Public discovery only shows gyms that are both visible and operational. */
export function publicMarketplaceGyms(gyms: MarketplaceGym[]): MarketplaceGym[] {
  return gyms.filter((gym) => (gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial") && gym.isPublic !== false);
}

/** Platform operators need the complete tenant directory, including hidden,
 * suspended, overdue, and cancelled records. Public visibility is not an
 * authorization boundary for the platform console. */
export function platformTenantDirectoryGyms(gyms: MarketplaceGym[]): MarketplaceGym[] {
  return gyms;
}
