"use client";

import { Suspense } from "react";
import { PlatformPage } from "@/components/platform/platform-page";
import { Skeleton } from "@/components/ui/misc";
import { PlatformAgreements } from "./platform-agreements.client";

function AgreementsFallback() {
  return <PlatformPage><div className="space-y-3" role="status" aria-label="Loading agreements"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></PlatformPage>;
}

export default function PlatformAgreementsPage() {
  return <Suspense fallback={<AgreementsFallback />}><PlatformAgreements /></Suspense>;
}
