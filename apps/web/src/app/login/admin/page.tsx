import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { PortalSignIn } from "../portal-sign-in.client";

export const metadata: Metadata = { title: "Platform administration" };

export default function AdminLoginPage() {
  if (!DEMO_AUTH_BYPASS) redirect("/login");
  return <PortalSignIn audience="admin" />;
}
