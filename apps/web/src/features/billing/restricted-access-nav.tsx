"use client";
import Link from "next/link";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useT } from "@/lib/i18n/provider";

/** Independent capabilities; a billing gym never authorizes a cancelled gym's workspace. */
export function RestrictedAccessNav() {
  const identity = useRivetIdentity();
  const t = useT();
  if ((identity.billingAccess?.length ?? 0) + (identity.exportAccess?.length ?? 0) < 2) return null;
  return <nav aria-label={t("commerce.checkout.permittedDestinations")} className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line px-4 py-3 text-[13px]">
    {identity.billingAccess?.map(gym => <Link key={`billing-${gym.organizationId}`} className="underline underline-offset-4" href={`/billing?organizationId=${encodeURIComponent(gym.organizationId)}`}>{t("commerce.checkout.billingFor", { gym: gym.organizationName })}</Link>)}
    {identity.exportAccess?.map(gym => <Link key={`export-${gym.organizationId}`} className="underline underline-offset-4" href={`/exports?organizationId=${encodeURIComponent(gym.organizationId)}`}>{t("commerce.checkout.exportsFor", { gym: gym.organizationName })}</Link>)}
  </nav>;
}
