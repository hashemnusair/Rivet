/** Deterministic branch operations views shared by Convex and the preview adapter. */

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function contentTokens(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter((token) => token.length >= 2);
}

function sharedTokenCount(left: string, right: string): number {
  const rightTokens = new Set(contentTokens(right));
  return [...new Set(contentTokens(left))].filter((token) => rightTokens.has(token)).length;
}

function hasArabic(value: string): boolean {
  return /[\u0600-\u06ff]/u.test(value);
}

export const BRANCHOPS_DESCRIPTION_MIN_LENGTH = 8;
export const BRANCHOPS_DESCRIPTION_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// Report filing choices. Staff select the report kind and target explicitly.
// ---------------------------------------------------------------------------

export type ReportCategoryId = "cleaning" | "inspection" | "incident" | "equipment_issue";

export interface ReportCategory {
  id: ReportCategoryId;
  label: string;
  description: string;
}

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  { id: "equipment_issue", label: "Machine issue", description: "A machine is faulty, noisy, stuck or unsafe: record it against the machine with severity and safety status." },
  { id: "cleaning", label: "Cleaning task", description: "Dirt, spills, smells, bins or supplies in a gym space." },
  { id: "incident", label: "Incident", description: "Something happened to a person or the building: injury, leak, flooding, power, water, a broken fixture or a hazard." },
  { id: "inspection", label: "Inspection", description: "Something should be checked, tested or verified on a schedule rather than fixed now." },
];

export function reportCategoryOptions(): Record<string, string> {
  return Object.fromEntries(REPORT_CATEGORIES.map((category) => [category.id, `${category.label}: ${category.description}`] as const));
}

export interface ReportMachineLike {
  id: string;
  code: string;
  name: string;
  manufacturer?: string;
  model?: string;
  zoneId?: string;
  status: string;
}

export interface ReportSpaceLike {
  id: string;
  name: string;
  nameAr?: string;
  kind: string;
}

// ---------------------------------------------------------------------------
// Related repair history for one machine.
// ---------------------------------------------------------------------------

export interface IssueLike {
  id: string;
  branchId: string;
  assetId: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  safetyStatus: string;
  reportedAt: string;
  resolvedAt?: string;
}

export interface WorkOrderLike {
  id: string;
  assetId: string;
  issueId?: string;
  status: string;
  description: string;
  openedAt: string;
  completedAt?: string;
  vendorName?: string;
}

export const OPEN_ISSUE_STATUSES = new Set(["open", "in_progress"]);
export const SIMILAR_WORDING_MIN_TOKENS = 2;

function issueText(issue: Pick<IssueLike, "title" | "description">): string {
  return `${issue.title} ${issue.description ?? ""}`;
}

export interface RepairHistoryEntry {
  issue: IssueLike;
  workOrders: WorkOrderLike[];
  similarWording: boolean;
  sharedTokens: number;
}

export interface RepairHistory {
  anchor: IssueLike;
  entries: RepairHistoryEntry[];
  comparisons: Array<{ issueId: string; otherIssueId: string }>;
  disclosure: string;
}

/** Every report on the same machine, newest first, with linked work orders. */
export function relatedRepairHistory(anchor: IssueLike, issues: readonly IssueLike[], workOrders: readonly WorkOrderLike[]): RepairHistory {
  const sameMachine = issues.filter((issue) => issue.assetId === anchor.assetId && issue.id !== anchor.id).sort((left, right) => right.reportedAt.localeCompare(left.reportedAt));
  const entries = sameMachine.map((issue) => {
    const shared = sharedTokenCount(issueText(anchor), issueText(issue));
    return { issue, workOrders: workOrders.filter((order) => order.issueId === issue.id), similarWording: shared >= SIMILAR_WORDING_MIN_TOKENS, sharedTokens: shared };
  });
  const oldest = sameMachine.concat(anchor).map((issue) => issue.reportedAt).sort()[0];
  const disclosure = sameMachine.length
    ? `History covers ${sameMachine.length + 1} report${sameMachine.length + 1 === 1 ? "" : "s"} on this machine since ${oldest?.slice(0, 10) ?? "its first report"}. Other machines and other branches are not included, even with the same name.`
    : "No earlier report exists for this machine. Other machines and other branches are not included, even with the same name.";
  return { anchor, entries, comparisons: entries.filter((entry) => entry.similarWording).slice(0, 6).map((entry) => ({ issueId: anchor.id, otherIssueId: entry.issue.id })), disclosure };
}

export function recurringSummary(confirmed: number): string {
  if (confirmed === 0) return "No confirmed recurrence.";
  return `${confirmed} earlier report${confirmed === 1 ? "" : "s"} confirmed as the same fault. Recurrence changes nothing by itself: the repair decision uses the recorded costs, age and downtime.`;
}

// ---------------------------------------------------------------------------
// Handover: unresolved checklist items and groups from record relationships.
// ---------------------------------------------------------------------------

export interface HandoverRunLike {
  templateId: string;
  branchId: string;
  localDate: string;
  name: string;
  type: string;
  dueTime: string;
  assignedRole: string;
  assignedUserId?: string;
  assignedUserName?: string;
  overdue: boolean;
  items: Array<{ itemId: string; label: string; instructions?: string; required: boolean; status: string; zoneId?: string; note?: string; reason?: string; actorName?: string; at?: string; facilityTaskId?: string }>;
}

export interface HandoverItem {
  key: string;
  templateId: string;
  localDate: string;
  itemId: string;
  label: string;
  runName: string;
  runType: string;
  dueTime: string;
  required: boolean;
  status: "failed" | "pending";
  zoneId?: string;
  note?: string;
  reason?: string;
  actorName?: string;
  responsible: string;
  assignedUserId?: string;
  overdue: boolean;
  facilityTaskId?: string;
}

export const HANDOVER_WINDOW_DAYS = 7;

export function handoverItemKey(templateId: string, localDate: string, itemId: string): string {
  return `${templateId}|${localDate}|${itemId}`;
}

export function handoverItems(runs: readonly HandoverRunLike[]): HandoverItem[] {
  const items: HandoverItem[] = [];
  for (const run of runs) {
    for (const item of run.items) {
      const status = item.status === "failed" ? "failed" : item.required && item.status === "pending" ? "pending" : undefined;
      if (!status) continue;
      items.push({ key: handoverItemKey(run.templateId, run.localDate, item.itemId), templateId: run.templateId, localDate: run.localDate, itemId: item.itemId, label: item.label, runName: run.name, runType: run.type, dueTime: run.dueTime, required: item.required, status, zoneId: item.zoneId, note: item.note, reason: item.reason, actorName: item.actorName, responsible: run.assignedUserName ?? run.assignedRole, assignedUserId: run.assignedUserId, overdue: run.overdue, facilityTaskId: item.facilityTaskId });
    }
  }
  return items.sort((left, right) => left.localDate.localeCompare(right.localDate) || left.runName.localeCompare(right.runName) || left.label.localeCompare(right.label));
}

export type HandoverGroupKind = "recurring" | "task" | "space";

export interface HandoverGroup {
  id: string;
  kind: HandoverGroupKind;
  label: string;
  reason: string;
  items: HandoverItem[];
}

export interface HandoverGrouping {
  groups: HandoverGroup[];
  ungrouped: HandoverItem[];
  comparisons: Array<{ first: HandoverItem; second: HandoverItem; sharedTokens: number }>;
  disclosure: string;
}

function itemText(item: HandoverItem): string {
  return `${item.label} ${item.note ?? ""} ${item.reason ?? ""}`;
}

/** Groups use recorded checklist, task and space links. Similar wording is surfaced for manual comparison only. */
export function handoverGroups(items: readonly HandoverItem[], spaces: ReadonlyMap<string, string> = new Map()): HandoverGrouping {
  const groups: HandoverGroup[] = [];
  const placed = new Set<string>();
  const byItem = new Map<string, HandoverItem[]>();
  for (const item of items) {
    const key = `${item.templateId}|${item.itemId}`;
    byItem.set(key, [...(byItem.get(key) ?? []), item]);
  }
  for (const [key, members] of byItem) {
    const dates = new Set(members.map((member) => member.localDate));
    if (dates.size < 2) continue;
    groups.push({ id: `recurring:${key}`, kind: "recurring", label: members[0]!.label, reason: `Unresolved on ${dates.size} days (${[...dates].sort().join(", ")}). The same checklist item.`, items: members });
    members.forEach((member) => placed.add(member.key));
  }
  const byTask = new Map<string, HandoverItem[]>();
  for (const item of items) if (item.facilityTaskId && !placed.has(item.key)) byTask.set(item.facilityTaskId, [...(byTask.get(item.facilityTaskId) ?? []), item]);
  for (const [taskId, members] of byTask) {
    if (members.length < 2) continue;
    groups.push({ id: `task:${taskId}`, kind: "task", label: "Same maintenance task", reason: "These items were escalated to one maintenance task.", items: members });
    members.forEach((member) => placed.add(member.key));
  }
  const bySpace = new Map<string, HandoverItem[]>();
  for (const item of items) if (item.zoneId && !placed.has(item.key)) bySpace.set(item.zoneId, [...(bySpace.get(item.zoneId) ?? []), item]);
  for (const [zoneId, members] of bySpace) {
    if (members.length < 2) continue;
    groups.push({ id: `space:${zoneId}`, kind: "space", label: spaces.get(zoneId) ?? "Same area of the gym", reason: "These items are in the same area. They may be different problems.", items: members });
    members.forEach((member) => placed.add(member.key));
  }
  const ungrouped = items.filter((item) => !placed.has(item.key));
  const anchors = [...groups.map((group) => group.items[0]!), ...ungrouped];
  const comparisons: HandoverGrouping["comparisons"] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    for (let other = index + 1; other < anchors.length; other += 1) {
      const first = anchors[index]!;
      const second = anchors[other]!;
      if (first.templateId === second.templateId && first.itemId === second.itemId) continue;
      const shared = sharedTokenCount(itemText(first), itemText(second));
      if (shared >= SIMILAR_WORDING_MIN_TOKENS) comparisons.push({ first, second, sharedTokens: shared });
    }
  }
  comparisons.sort((left, right) => right.sharedTokens - left.sharedTokens);
  return { groups, ungrouped, comparisons: comparisons.slice(0, 6), disclosure: `Covers today and the previous ${HANDOVER_WINDOW_DAYS} days only, the handover window. Older unresolved work is not shown here.` };
}

// ---------------------------------------------------------------------------
// Notification groups (presentation only).
// ---------------------------------------------------------------------------

export interface NotificationLike {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  branchId?: string;
  readAt?: string;
  createdAt: string;
}

export const MANDATORY_NOTIFICATION_KINDS: readonly string[] = ["access_denial", "incident", "message_delivery_failed", "platform_invoice_past_due", "cash_variance", "automation_attention"];
export interface NotificationFamily { id: string; label: string; test: (kind: string) => boolean }
export const NOTIFICATION_FAMILIES: readonly NotificationFamily[] = [
  { id: "pt", label: "Personal training", test: (kind) => kind.startsWith("pt_") },
  { id: "support", label: "Support", test: (kind) => kind.startsWith("support_") },
  { id: "members", label: "Member follow-up", test: (kind) => ["renewal", "at_risk", "outstanding_balance", "follow_up", "checkin_override", "trial_status", "retention_snooze"].includes(kind) },
  { id: "billing", label: "RIVET billing", test: (kind) => kind.startsWith("platform_invoice_") },
  { id: "operations", label: "Operations", test: (kind) => ["facility_task", "branch_checklist", "low_stock", "purchase_order", "equipment_issue"].includes(kind) },
];

export function notificationEntity(notification: Pick<NotificationLike, "href" | "dedupeKey">): { key: string; label: string } | undefined {
  const href = notification.href;
  const query = href.includes("?") ? new URLSearchParams(href.slice(href.indexOf("?") + 1)) : undefined;
  const path = href.split("?")[0] ?? href;
  const booking = query?.get("booking");
  if (booking) return { key: `booking:${booking}`, label: "PT booking" };
  const supportCase = query?.get("case");
  if (supportCase) return { key: `case:${supportCase}`, label: `Support case ${supportCase}` };
  const invoice = query?.get("invoice");
  if (invoice) return { key: `invoice:${invoice}`, label: `Invoice ${invoice}` };
  const member = /^\/members\/([^/]+)/.exec(path);
  if (member?.[1]) return { key: `member:${member[1]}`, label: "Member" };
  const lead = /^\/crm\/leads\/([^/]+)/.exec(path);
  if (lead?.[1]) return { key: `lead:${lead[1]}`, label: "Lead" };
  const task = query?.get("task");
  if (task) return { key: `task:${task}`, label: "Maintenance task" };
  const dedupe = /^([a-z-]+):([^:]+)/i.exec(notification.dedupeKey);
  if (dedupe?.[1] && dedupe[2] && !/^\d{4}-\d{2}-\d{2}/.test(dedupe[2]) && dedupe[2].length >= 6) return { key: `${dedupe[1]}:${dedupe[2]}`, label: dedupe[1].replaceAll("-", " ") };
  return undefined;
}

export interface NotificationGroup { id: string; kind: "entity" | "family"; label: string; notifications: NotificationLike[]; unreadCount: number; latestAt: string }
export interface NotificationGrouping { mandatory: NotificationLike[]; groups: NotificationGroup[]; singles: NotificationLike[]; totalUnread: number }

function familyOf(kind: string): NotificationFamily | undefined { return NOTIFICATION_FAMILIES.find((family) => family.test(kind)); }

function entityNames(items: readonly NotificationLike[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    const head = item.body.split(" · ")[0]?.trim() ?? "";
    if (!head || /^\d/.test(head) || /^(today|tomorrow|yesterday|tonight)\b/i.test(head) || /\d{1,2}:\d{2}/.test(head)) continue;
    if (!names.includes(head)) names.push(head);
  }
  return names;
}

function entityName(items: readonly NotificationLike[]): string { return entityNames(items)[0] ?? items[0]?.title ?? ""; }
function group(id: string, kind: NotificationGroup["kind"], label: string, items: NotificationLike[]): NotificationGroup { return { id, kind, label, notifications: items, unreadCount: items.filter((item) => !item.readAt).length, latestAt: items.map((item) => item.createdAt).sort().at(-1) ?? "" }; }

/** Mandatory alerts stay visible; all other groups are presentation-only. */
export function groupNotifications(notifications: readonly NotificationLike[]): NotificationGrouping {
  const sorted = [...notifications].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const mandatory = sorted.filter((notification) => MANDATORY_NOTIFICATION_KINDS.includes(notification.kind));
  const rest = sorted.filter((notification) => !MANDATORY_NOTIFICATION_KINDS.includes(notification.kind));
  const groups: NotificationGroup[] = [];
  const placed = new Set<string>();
  const byEntity = new Map<string, { label: string; items: NotificationLike[] }>();
  for (const notification of rest) {
    const entity = notificationEntity(notification);
    if (!entity) continue;
    const bucket = byEntity.get(entity.key) ?? { label: entity.label, items: [] };
    bucket.items.push(notification);
    byEntity.set(entity.key, bucket);
  }
  for (const [key, bucket] of byEntity) {
    if (bucket.items.length < 2) continue;
    groups.push(group(`entity:${key}`, "entity", bucket.label === "Member" || bucket.label === "Lead" || bucket.label === "PT booking" ? `${bucket.label}: ${entityName(bucket.items)}` : bucket.label, bucket.items));
    bucket.items.forEach((item) => placed.add(item.id));
  }
  const byFamily = new Map<string, { family: NotificationFamily; items: NotificationLike[] }>();
  for (const notification of rest) {
    if (placed.has(notification.id)) continue;
    const family = familyOf(notification.kind);
    if (!family) continue;
    const bucket = byFamily.get(family.id) ?? { family, items: [] };
    bucket.items.push(notification);
    byFamily.set(family.id, bucket);
  }
  for (const [id, bucket] of byFamily) {
    if (bucket.items.length < 2) continue;
    groups.push(group(`family:${id}`, "family", bucket.family.label, bucket.items));
    bucket.items.forEach((item) => placed.add(item.id));
  }
  groups.sort((left, right) => right.latestAt.localeCompare(left.latestAt));
  const singles = rest.filter((notification) => !placed.has(notification.id));
  return { mandatory, groups, singles, totalUnread: notifications.filter((notification) => !notification.readAt).length };
}

export interface GroupingEvaluation { usefulPairs: number; falsePairs: number; missedPairs: number; hiddenItems: string[] }

export function evaluateGrouping(input: { sourceIds: readonly string[]; groups: ReadonlyArray<readonly string[]>; shownIds: readonly string[]; truePairs: ReadonlyArray<readonly [string, string]> }): GroupingEvaluation {
  const pairKey = (left: string, right: string) => [left, right].sort().join("+");
  const truth = new Set(input.truePairs.map(([left, right]) => pairKey(left, right)));
  const predicted = new Set<string>();
  for (const members of input.groups) for (let index = 0; index < members.length; index += 1) for (let other = index + 1; other < members.length; other += 1) predicted.add(pairKey(members[index]!, members[other]!));
  const usefulPairs = [...predicted].filter((key) => truth.has(key)).length;
  const shown = new Set(input.shownIds);
  return { usefulPairs, falsePairs: predicted.size - usefulPairs, missedPairs: [...truth].filter((key) => !predicted.has(key)).length, hiddenItems: input.sourceIds.filter((id) => !shown.has(id)) };
}

export function describesArabic(value: string): boolean { return hasArabic(value); }
