"use client";
import { RestrictedAccessNav } from "@/features/billing/restricted-access-nav";
import { useClerk } from "@clerk/nextjs";
import { LanguageButton } from "@/components/shared/language-switch";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { useApp } from "@/lib/providers/app-providers";

/** No workspace navigation, agreement gate, billing queries or operational writes. */
export function TerminationExportFrame({ children }: { children: React.ReactNode }) {
  const t = useT();
  const clerk = useClerk();
  const { signOut } = useApp();
  const leave = async () => {
    if (!DEMO_AUTH_BYPASS) await clerk.signOut({ redirectUrl: "/login" });
    await signOut();
  };
  return <div className="min-h-screen bg-paper text-ink"><header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3"><span className="font-semibold">RIVET</span><div className="flex gap-2"><LanguageButton /><Button variant="ghost" size="sm" onClick={() => void leave()}>{t("commerce.checkout.signOut")}</Button></div></header><RestrictedAccessNav /><main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main></div>;
}
