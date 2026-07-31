import type { Metadata } from "next";
import { PortalSignIn } from "../../portal-sign-in.client";

export const metadata: Metadata = { title: "Create a gym account" };

export default function GymSignUpPage() {
  return <PortalSignIn audience="staff" mode="sign-up" />;
}
