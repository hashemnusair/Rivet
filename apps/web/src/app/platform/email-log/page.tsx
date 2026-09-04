"use client";

import { Suspense } from "react";
import { PlatformEmailLog } from "./platform-email-log.client";

export default function PlatformEmailLogPage() {
  return <Suspense fallback={null}><PlatformEmailLog /></Suspense>;
}
