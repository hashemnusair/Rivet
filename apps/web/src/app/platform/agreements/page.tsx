"use client";

import { Suspense } from "react";
import { PlatformAgreements } from "./platform-agreements.client";

export default function PlatformAgreementsPage() {
  return <Suspense fallback={null}><PlatformAgreements /></Suspense>;
}
