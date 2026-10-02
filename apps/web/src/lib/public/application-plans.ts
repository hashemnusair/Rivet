import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { DEFAULT_PUBLIC_PRICING_PLANS } from "./pricing";

/**
 * Approved launch defaults keep the public application usable while an
 * editable catalog is being published or a transient catalog read fails.
 * These are not billing prices; they are the plan choices used to start the
 * sales conversation.
 */
export const DEFAULT_APPLICATION_PLANS: PlatformSaasPlan[] = DEFAULT_PUBLIC_PRICING_PLANS.map((plan) => ({ ...plan }));

export function resolveApplicationPlans(livePlans: PlatformSaasPlan[]): PlatformSaasPlan[] {
  return livePlans.length > 0 ? livePlans : DEFAULT_APPLICATION_PLANS;
}
