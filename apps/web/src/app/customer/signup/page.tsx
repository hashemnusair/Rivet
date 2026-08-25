import type { Metadata } from "next";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CustomerSignupClient } from "./customer-signup.client";

export const metadata: Metadata = { title: "Create a member account" };

/**
 * The old page created a browser-only persona and collected a password that
 * never reached an identity provider. Member signup now always uses Clerk in
 * real deployments. Preview mode intentionally offers only the seeded member
 * entry point; it never pretends to create a durable account.
 */
export default function CustomerSignupPage() {
  if (DEMO_AUTH_BYPASS) return <PreviewSignupNotice />;
  return <CustomerSignupClient />;
}

function PreviewSignupNotice() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <p className="eyebrow">RIVET member preview</p>
      <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">Member signup runs through Clerk.</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        The local preview does not create accounts or store passwords. Use a seeded member persona to inspect the member experience.
      </p>
      <a href="/login/member" className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-sm font-medium text-paper">
        Open member preview
      </a>
    </main>
  );
}
