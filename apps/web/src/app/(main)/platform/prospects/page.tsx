"use client";

import { Suspense } from "react";
import { PlatformPage } from "@/components/platform/platform-page";
import { Skeleton } from "@/components/ui/misc";
import { useT } from "@/lib/i18n/provider";
import { PlatformProspects } from "./platform-prospects.client";

function ProspectsFallback() {
  const t = useT();
  return <PlatformPage><div className="space-y-3" role="status" aria-label={t("platformConsole.prospects.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="h-[480px] w-full" /></div></PlatformPage>;
}

export default function PlatformProspectsPage() {
  return <Suspense fallback={<ProspectsFallback />}><PlatformProspects /></Suspense>;
}
