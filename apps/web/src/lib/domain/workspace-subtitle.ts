/** Optional source facts beside the original search/recent subtitle. Unknown history remains original. */
export type WorkspaceSubtitle =
  | { kind: "lead"; stage: string; phone: string }
  | { kind: "receipt"; memberName?: string; status: string };

/** Only known, bounded facts may accompany a saved recent item. Its original subtitle is retained. */
export function parseWorkspaceSubtitle(value: unknown, recordKind: string): WorkspaceSubtitle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const parts = value as Record<string, unknown>;
  if (recordKind === "lead" && parts.kind === "lead" && typeof parts.stage === "string" && typeof parts.phone === "string") {
    return { kind: "lead", stage: parts.stage.slice(0, 80), phone: parts.phone.slice(0, 80) };
  }
  if (recordKind === "receipt" && parts.kind === "receipt" && typeof parts.status === "string" && (parts.memberName === undefined || typeof parts.memberName === "string")) {
    return { kind: "receipt", status: parts.status.slice(0, 80), ...(typeof parts.memberName === "string" ? { memberName: parts.memberName.slice(0, 160) } : {}) };
  }
  return undefined;
}
