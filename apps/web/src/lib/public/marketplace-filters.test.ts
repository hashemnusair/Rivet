import { describe, expect, it } from "vitest";
import { MARKETPLACE_GYMS, type MarketplaceGym } from "./experience-data";
import { platformTenantDirectoryGyms, publicMarketplaceGyms } from "./marketplace-filters";

const gym = (id: string, subscriptionStatus: MarketplaceGym["subscriptionStatus"], isPublic = true): MarketplaceGym => ({
  id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  tagline: "",
  description: "",
  city: "Amman",
  areas: [],
  category: "Gym",
  audience: "All members",
  rating: 0,
  reviewCount: 0,
  memberCount: 0,
  branchCount: 1,
  fromPriceMinor: 0,
  amenities: [],
  accent: "#000",
  featured: false,
  subscriptionStatus,
  rivetPlan: "Starter",
  joinedAt: "2026-08-10",
  lastActiveAt: "2026-08-10T00:00:00.000Z",
  monthlyRevenueMinor: 0,
  isPublic,
  branches: [],
});

describe("marketplace surface filters", () => {
  it("keeps hidden and suspended tenants out of public discovery", () => {
    const gyms = [gym("visible", "active"), gym("hidden", "active", false), gym("suspended", "suspended")];

    expect(publicMarketplaceGyms(gyms).map((item) => item.id)).toEqual(["visible"]);
  });

  it("fails closed when a listing has no explicit public visibility", () => {
    const missingVisibility = gym("missing-visibility", "active");
    delete missingVisibility.isPublic;

    expect(publicMarketplaceGyms([missingVisibility, gym("trial-visible", "trial")]).map((item) => item.id)).toEqual(["trial-visible"]);
  });

  it("keeps bundled preview fixtures explicit and separate from live visibility defaults", () => {
    expect(MARKETPLACE_GYMS.every((item) => item.isPublic === true)).toBe(true);
  });

  it("keeps every tenant available to the authorized platform directory", () => {
    const gyms = [gym("visible", "active"), gym("hidden", "active", false), gym("suspended", "suspended"), gym("cancelled", "cancelled")];

    expect(platformTenantDirectoryGyms(gyms).map((item) => item.id)).toEqual(["visible", "hidden", "suspended", "cancelled"]);
  });
});
