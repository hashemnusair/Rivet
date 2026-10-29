"use client";

import { Suspense } from "react";
import { SettingsPageInner } from "@/features/settings/settings-page-inner";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}
