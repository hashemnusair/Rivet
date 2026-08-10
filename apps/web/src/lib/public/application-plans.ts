import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";

/**
 * Approved launch defaults keep the public application usable while an
 * editable catalog is being published or a transient catalog read fails.
 * These are not billing prices; they are the plan choices used to start the
 * sales conversation.
 */
export const DEFAULT_APPLICATION_PLANS: PlatformSaasPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
];

export function resolveApplicationPlans(livePlans: PlatformSaasPlan[]): PlatformSaasPlan[] {
  return livePlans.length > 0 ? livePlans : DEFAULT_APPLICATION_PLANS;
}
