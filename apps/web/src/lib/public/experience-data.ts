import type { TrialBookingStatus, UUID } from "@/lib/domain/types";
import { BRANCH_ABD, BRANCH_SWF } from "@/lib/mock/seed";

export interface MarketplaceBranch {
  id: string;
  name: string;
  area: string;
  address: string;
  trialSlots: string[];
  internalBranchId?: UUID;
}

export interface MarketplaceGym {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  city: string;
  areas: string[];
  category: string;
  audience: string;
  rating?: number;
  reviewCount?: number;
  memberCount: number;
  branchCount: number;
  fromPriceMinor: number;
  amenities: string[];
  taglineAr?: string;
  descriptionAr?: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  profileVersion?: number;
  trainers?: import("@/lib/domain/types").PtTrainerProfile[];
  ptPackages?: import("@/lib/domain/types").PtPackage[];
  logo?: import("@/lib/domain/types").MediaAsset;
  cover?: import("@/lib/domain/types").MediaAsset;
  gallery?: import("@/lib/domain/types").MediaAsset[];
  accent: string;
  featured: boolean;
  subscriptionStatus: "trial" | "active" | "overdue" | "suspended" | "cancelled";
  rivetPlan: "Starter" | "Growth" | "Pro" | "Enterprise";
  joinedAt: string;
  lastActiveAt: string;
  monthlyRevenueMinor: number;
  /** Platform-only visibility flag; public API responses omit it. */
  isPublic?: boolean;
  /** Platform-only subscription lifecycle facts. */
  trialEndsAt?: string;
  subscriptionStartedAt?: string;
  currentPeriodEndsAt?: string;
  cancelledAt?: string;
  subscriptionStatusReason?: string;
  branches: MarketplaceBranch[];
}

export interface CustomerPersona {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  phone: string;
  initials: string;
  context: string;
  /** Member-owned promotional communication preference, separate from service messages. */
  marketingPreference?: CustomerMarketingPreference;
  marketingPreferenceHistory?: CustomerMarketingPreference[];
}

export type CustomerMarketingPreferenceSource = "system_default" | "member_selected";

export interface CustomerMarketingPreference {
  optedIn: boolean;
  status?: "explicit_opt_in" | "explicit_opt_out" | "unknown";
  source: CustomerMarketingPreferenceSource;
  changedAt?: string;
  wordingVersion?: string;
}

export interface CustomerMembership {
  id: string;
  customerId: string;
  gymId: string;
  branchId: string;
  memberNumber: string;
  planName: string;
  status: "active" | "expiring" | "frozen";
  startDate: string;
  endDate: string;
  visitsThisMonth: number;
  remainingVisits?: number;
  balanceMinor: number;
  qrValue: string;
  lastCheckInAt: string;
}

export interface TrialBooking {
  id: string;
  customerId?: string;
  gymId: string;
  branchId: string;
  fullName: string;
  email: string;
  phone: string;
  preferredDate: string;
  preferredTime: string;
  goal: string;
  status: TrialBookingStatus;
  createdAt: string;
  leadId?: UUID;
}

export const MARKETPLACE_GYMS: MarketplaceGym[] = [
  {
    id: "forge-fitness",
    name: "Forge Fitness Club",
    shortName: "FORGE",
    tagline: "Strength, conditioning, and a floor that remembers your name.",
    description:
      "A serious but welcoming training club with two Amman branches, coached small groups, open gym, and practical plans for people who train consistently.",
    city: "Amman",
    areas: ["Abdoun", "Sweifieh"],
    category: "Strength & conditioning",
    audience: "All members",
    rating: 4.9,
    reviewCount: 184,
    memberCount: 1050,
    branchCount: 2,
    fromPriceMinor: 40_000,
    amenities: ["Free weights", "Functional zone", "Showers", "Parking", "Personal training"],
    accent: "#d9232b",
    featured: true,
    subscriptionStatus: "active",
    rivetPlan: "Pro",
    joinedAt: "2026-04-18",
    lastActiveAt: "2026-07-31T13:42:00+03:00",
    monthlyRevenueMinor: 48_750_000,
    branches: [
      {
        id: "forge-abdoun",
        name: "Forge — Abdoun",
        area: "Abdoun",
        address: "Salah Al-Suheimat St 12, Abdoun",
        trialSlots: ["08:00", "17:00", "19:00"],
        internalBranchId: BRANCH_ABD,
      },
      {
        id: "forge-sweifieh",
        name: "Forge — Sweifieh",
        area: "Sweifieh",
        address: "Ali Nasuh Al-Tahir St 7, Sweifieh",
        trialSlots: ["09:00", "18:00", "20:00"],
        internalBranchId: BRANCH_SWF,
      },
    ],
  },
  {
    id: "pulse-lab",
    name: "Pulse Lab",
    shortName: "PULSE",
    tagline: "Coach-led performance without the intimidation.",
    description:
      "Small-group strength, conditioning, and recovery sessions for busy professionals who want structure, coaching, and measurable progress.",
    city: "Amman",
    areas: ["Dabouq"],
    category: "Boutique performance",
    audience: "All members",
    rating: 4.8,
    reviewCount: 96,
    memberCount: 420,
    branchCount: 1,
    fromPriceMinor: 55_000,
    amenities: ["Coach-led classes", "Recovery room", "Mobility zone", "Parking"],
    accent: "#176e44",
    featured: true,
    subscriptionStatus: "active",
    rivetPlan: "Growth",
    joinedAt: "2026-05-06",
    lastActiveAt: "2026-07-31T12:18:00+03:00",
    monthlyRevenueMinor: 29_400_000,
    branches: [
      {
        id: "pulse-dabouq",
        name: "Pulse Lab — Dabouq",
        area: "Dabouq",
        address: "King Abdullah II St, Dabouq",
        trialSlots: ["07:30", "18:30", "20:00"],
      },
    ],
  },
  {
    id: "her-house",
    name: "Her House Fitness",
    shortName: "HER HOUSE",
    tagline: "A women-only club built around strength and privacy.",
    description:
      "Women-only training, studio classes, strength equipment, and personal coaching with private facilities and flexible morning and evening schedules.",
    city: "Amman",
    areas: ["Khalda", "Shmeisani"],
    category: "Women-only fitness",
    audience: "Women only",
    rating: 4.9,
    reviewCount: 231,
    memberCount: 1380,
    branchCount: 2,
    fromPriceMinor: 45_000,
    amenities: ["Women only", "Studio classes", "Sauna", "Child-friendly hours", "Parking"],
    accent: "#8d4f68",
    featured: true,
    subscriptionStatus: "active",
    rivetPlan: "Pro",
    joinedAt: "2026-03-11",
    lastActiveAt: "2026-07-31T13:51:00+03:00",
    monthlyRevenueMinor: 62_900_000,
    branches: [
      {
        id: "her-khalda",
        name: "Her House — Khalda",
        area: "Khalda",
        address: "Wasfi Al Tal St, Khalda",
        trialSlots: ["10:00", "16:00", "18:00"],
      },
      {
        id: "her-shmeisani",
        name: "Her House — Shmeisani",
        area: "Shmeisani",
        address: "Queen Noor St, Shmeisani",
        trialSlots: ["09:30", "17:30", "19:30"],
      },
    ],
  },
  {
    id: "district-strength",
    name: "District Strength",
    shortName: "DISTRICT",
    tagline: "Barbells, community, and zero wasted motion.",
    description:
      "An independent strength gym for lifters and first-timers, with coached fundamentals, powerlifting equipment, and straightforward memberships.",
    city: "Amman",
    areas: ["Jabal Amman"],
    category: "Independent strength gym",
    audience: "All members",
    rating: 4.7,
    reviewCount: 73,
    memberCount: 310,
    branchCount: 1,
    fromPriceMinor: 32_000,
    amenities: ["Powerlifting", "Olympic lifting", "Coaching", "Locker rooms"],
    accent: "#96620a",
    featured: false,
    subscriptionStatus: "trial",
    rivetPlan: "Starter",
    joinedAt: "2026-07-22",
    lastActiveAt: "2026-07-31T11:04:00+03:00",
    monthlyRevenueMinor: 13_850_000,
    branches: [
      {
        id: "district-jabal-amman",
        name: "District — Jabal Amman",
        area: "Jabal Amman",
        address: "Rainbow St, Jabal Amman",
        trialSlots: ["08:30", "17:30", "19:30"],
      },
    ],
  },
];

export const CUSTOMER_PERSONAS: CustomerPersona[] = [
  {
    id: "customer-lina",
    name: "Lina Haddad",
    nameAr: "لينا حداد",
    email: "lina@example.com",
    phone: "+962 79 440 2211",
    initials: "LH",
    context: "Active at Forge Fitness",
  },
  {
    id: "customer-yousef",
    name: "Yousef Nasser",
    nameAr: "يوسف ناصر",
    email: "yousef@example.com",
    phone: "+962 78 441 9033",
    initials: "YN",
    context: "Looking for a gym",
  },
];

export const INITIAL_CUSTOMER_MEMBERSHIPS: CustomerMembership[] = [
  {
    id: "membership-lina-forge",
    customerId: "customer-lina",
    gymId: "forge-fitness",
    branchId: "forge-abdoun",
    memberNumber: "ABD-2214",
    planName: "6-Month All Access",
    status: "expiring",
    startDate: "2026-02-09",
    endDate: "2026-08-12",
    visitsThisMonth: 14,
    balanceMinor: 0,
    qrValue: "rivet://entry/forge-fitness/ABD-2214/customer-lina",
    lastCheckInAt: "2026-07-30T19:12:00+03:00",
  },
];

export const INITIAL_TRIAL_BOOKINGS: TrialBooking[] = [
  {
    id: "trial-1001",
    gymId: "pulse-lab",
    branchId: "pulse-dabouq",
    fullName: "Maya Odeh",
    email: "maya@example.com",
    phone: "+962 79 882 1402",
    preferredDate: "2026-08-02",
    preferredTime: "18:30",
    goal: "Build strength with coaching",
    status: "confirmed",
    createdAt: "2026-07-31T10:12:00+03:00",
  },
  {
    id: "trial-1002",
    gymId: "forge-fitness",
    branchId: "forge-abdoun",
    fullName: "Rami Tahboub",
    email: "rami@example.com",
    phone: "+962 78 510 8831",
    preferredDate: "2026-08-01",
    preferredTime: "19:00",
    goal: "Return to training after a long break",
    status: "requested",
    createdAt: "2026-07-31T12:35:00+03:00",
  },
];

export const SAAS_PLANS = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2500, tone: "signal" },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
] as const;

export function gymById(id: string) {
  return MARKETPLACE_GYMS.find((gym) => gym.id === id);
}

export function membershipById(id: string) {
  return INITIAL_CUSTOMER_MEMBERSHIPS.find((membership) => membership.id === id);
}
