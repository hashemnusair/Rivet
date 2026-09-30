"use client";

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

const KIND_LABEL: Record<NavigationEntry["kind"], string> = { destination: "Page", report: "Report", form: "Form", settings: "Setting" };

export function NavigationEntryLine({ entry }: { entry: NavigationEntry }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-medium text-ink">{entry.label}</span>
      <Badge variant="outline">{KIND_LABEL[entry.kind]}</Badge>
      {entry.opensForm ? <span className="text-[11.5px] text-ink-3">opens a form. Nothing is saved yet</span> : null}
    </span>
  );
}
