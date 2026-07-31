import type { Metadata } from "next";
import { PortalSignIn } from "../portal-sign-in.client";

export const metadata: Metadata = { title: "Platform administration" };

export default function AdminLoginPage() {
  return <PortalSignIn audience="admin" />;
}
