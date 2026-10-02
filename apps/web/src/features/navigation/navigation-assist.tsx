"use client";

import { useT } from "@/lib/i18n/provider";
import type { TKey } from "@/lib/i18n/core";
import { localizeNavigationEntry } from "@/lib/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import type { Session } from "@/lib/domain/types";
import type { NavigationAccess, NavigationEntry } from "../../../convex/navigationCatalogue";

/** Session-scoped access used by the keyword navigation palette. */
export function navigationAccessFromSession(session: Pick<Session, "permissions" | "roles" | "workspace"> | undefined): NavigationAccess {
  return {
    permissions: session?.permissions ?? [],
    role: session?.roles[0],
    modules: session?.workspace?.modules.map((module) => ({ key: module.key, entitled: module.entitled, enabled: module.enabled })),
  };
}

const KIND_LABEL: Record<NavigationEntry["kind"], TKey> = { destination: "palette.kind.page", report: "palette.kind.report", form: "palette.kind.form", settings: "palette.kind.setting" };

export function NavigationEntryLine({ entry }: { entry: NavigationEntry }) {
  const t = useT();
  const presented = localizeNavigationEntry(t, entry);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-medium text-ink">{presented.label}</span>
      <Badge variant="outline">{t(KIND_LABEL[entry.kind])}</Badge>
      {entry.opensForm ? <span className="text-[12px] text-ink-3">{t("palette.hints.opensForm")}</span> : null}
    </span>
  );
}
