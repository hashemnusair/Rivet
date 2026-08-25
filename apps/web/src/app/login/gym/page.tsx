import type { Metadata } from "next";
import { PortalSignIn } from "../portal-sign-in.client";

export const metadata: Metadata = { title: "Gym team sign-in" };

export default function GymLoginPage() {
  return <PortalSignIn audience="staff" />;
}
