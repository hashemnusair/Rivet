import { Building2, Dumbbell, Lock, type LucideIcon } from "lucide-react";

/**
 * RIVET has one sign-in address (`/login`) with three portals beneath it. The
 * portals never share an account list: gym staff, members and platform
 * administrators each authenticate into their own surface.
 */
export type Audience = "staff" | "member" | "admin";

export interface Portal {
  id: Audience;
  /** Route segment under /login. */
  href: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  audience: string;
  /** Where a completed sign-in lands. */
  destination: string;
  /** Sign-up route for this audience, when one exists. */
  signUpUrl?: string;
  /** Heading for the sign-up step — derived titles read badly ("gym team account"). */
  signUpTitle?: string;
}

export const PORTALS: Record<Audience, Portal> = {
  staff: {
    id: "staff",
    href: "/login/gym",
    icon: Building2,
    title: "Gym team",
    blurb: "Run the floor, the sales desk and the cash drawer.",
    audience: "Owners · Managers · Sales · Reception",
    destination: "/dashboard",
    signUpUrl: "/login/gym/create",
    signUpTitle: "Create a gym account",
  },
  member: {
    id: "member",
    href: "/login/member",
    icon: Dumbbell,
    title: "Gym member",
    blurb: "Your memberships, visits, receipts and entry QR.",
    audience: "Anyone training at a RIVET gym",
    destination: "/customer/my-gyms",
    signUpUrl: "/login/member/create",
    signUpTitle: "Create a member account",
  },
  admin: {
    id: "admin",
    href: "/login/admin",
    icon: Lock,
    title: "Platform administration",
    blurb: "Tenants, subscriptions, billing and support across the network.",
    audience: "RIVET staff only",
    destination: "/platform",
  },
};

/** Legacy `/login#member` style links still resolve to the right portal. */
export const AUDIENCE_FROM_HASH: Record<string, Audience> = {
  "#staff": "staff",
  "#gym": "staff",
  "#member": "member",
  "#admin": "admin",
};
