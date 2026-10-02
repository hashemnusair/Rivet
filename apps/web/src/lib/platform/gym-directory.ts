import type { MarketplaceGym } from "@/lib/public/experience-data";

const GYM_STATUS_ORDER: Record<MarketplaceGym["subscriptionStatus"], number> = {
  active: 0,
  trial: 1,
  overdue: 2,
  suspended: 3,
  cancelled: 4,
};

/** Keep the platform directory operationally useful: healthy tenants first,
 * then a stable lifecycle order and alphabetical names within each status. */
export function sortGymDirectory(gyms: MarketplaceGym[]): MarketplaceGym[] {
  return [...gyms].sort((left, right) => {
    const statusOrder = GYM_STATUS_ORDER[left.subscriptionStatus] - GYM_STATUS_ORDER[right.subscriptionStatus];
    if (statusOrder !== 0) return statusOrder;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id);
  });
}
