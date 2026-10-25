import type { AiArtifactSection, AiArtifactView, AiMessageParam } from "./contracts";

/**
 * Report and handover composition shared by the Convex playbooks and the
 * preview adapter. Inputs are the results of existing domain reads; a missing
 * input (no access, feature not in the plan) becomes a visible coverage gap,
 * never an empty section that reads as "nothing to report".
 */

type Data = Record<string, unknown>;
type Composed = Pick<AiArtifactView, "sections" | "verification" | "coverage"> & { titleParams: Record<string, AiMessageParam> };

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const money = (amountMinor: number, currency: string) => ({ amountMinor, currency });

export interface ReportInputs {
  collections?: Data;
  renewals?: Data;
  crm?: Data;
  /** Every payment-ledger row in the range, or undefined when it could not be read in full. */
  ledger?: Data[];
}

/** Sum the payment ledger the way the collections report counts it. */
export function ledgerTotals(rows: readonly Data[]): { collectedMinor: number; refundedMinor: number } {
  let collectedMinor = 0;
  let refundedMinor = 0;
  for (const row of rows) {
    const amount = num(record(row.amount).amount);
    if (text(row.type) === "refund") refundedMinor += Math.abs(amount);
    else if (text(row.status) !== "voided") collectedMinor += amount;
  }
  return { collectedMinor, refundedMinor };
}

export function composeManagementReport(inputs: ReportInputs, params: { from: string; to: string }, currency: string): Composed {
  const sections: AiArtifactSection[] = [];
  const checks: Composed["verification"]["checks"] = [];
  const coverage: Composed["coverage"] = [];
  if (inputs.collections) {
    const c = inputs.collections;
    const href = `/reports?view=collections&from=${params.from}&to=${params.to}`;
    const source = [{ kind: "report" as const, id: "collections", href }];
    sections.push({ key: "money", titleKey: "aiWork.report.money", items: [
      { key: "charged", message: { key: "aiWork.report.charged", params: { count: num(c.chargedCount), amount: money(num(c.chargedMinor), currency) } }, sources: source },
      { key: "collected", message: { key: "aiWork.report.collected", params: { count: num(c.collectedCount), amount: money(num(c.collectedMinor), currency) } }, sources: source, tone: "positive" },
      { key: "refunded", message: { key: "aiWork.report.refunded", params: { count: num(c.refundedCount), amount: money(num(c.refundedMinor), currency) } }, sources: source },
      { key: "voided", message: { key: "aiWork.report.voided", params: { count: num(c.voidedCount), amount: money(num(c.voidedMinor), currency) } }, sources: source },
      { key: "outstanding", message: { key: "aiWork.report.outstanding", params: { amount: money(num(c.outstandingNowMinor), currency) } }, sources: source, tone: num(c.outstandingNowMinor) > 0 ? "attention" : "neutral" },
    ] });
    if (inputs.ledger) {
      const totals = ledgerTotals(inputs.ledger);
      checks.push({ key: "collected", ok: totals.collectedMinor === num(c.collectedMinor), message: { key: totals.collectedMinor === num(c.collectedMinor) ? "aiWork.report.checkCollectedOk" : "aiWork.report.checkCollectedMismatch", params: { amount: money(totals.collectedMinor, currency) } } });
      checks.push({ key: "refunded", ok: totals.refundedMinor === num(c.refundedMinor), message: { key: totals.refundedMinor === num(c.refundedMinor) ? "aiWork.report.checkRefundedOk" : "aiWork.report.checkRefundedMismatch", params: { amount: money(totals.refundedMinor, currency) } } });
    }
  }
  coverage.push({ key: "money", complete: Boolean(inputs.collections), message: { key: inputs.collections ? "aiWork.report.coverageMoney" : "aiWork.report.gapMoney" } });
  coverage.push({ key: "ledger", complete: Boolean(inputs.ledger), message: { key: inputs.ledger ? "aiWork.report.coverageLedger" : "aiWork.report.gapLedger" } });
  if (inputs.renewals) {
    const buckets = (Array.isArray(inputs.renewals.buckets) ? inputs.renewals.buckets : []).map(record);
    sections.push({ key: "renewals", titleKey: "aiWork.report.renewals", items: buckets.map((bucket, index) => ({ key: `bucket-${index}`, message: { key: "aiWork.report.renewalBucket", params: { range: text(bucket.label), count: num(bucket.count), amount: money(num(bucket.valueMinor), currency) } }, sources: [{ kind: "report" as const, id: "renewals", href: "/reports?view=renewals" }] })) });
    const consistent = buckets.every((bucket) => !Array.isArray(bucket.rows) || bucket.rows.length <= num(bucket.count));
    checks.push({ key: "renewals", ok: consistent, message: { key: consistent ? "aiWork.report.checkRenewalsOk" : "aiWork.report.checkRenewalsMismatch" } });
  }
  coverage.push({ key: "renewals", complete: Boolean(inputs.renewals), message: { key: inputs.renewals ? "aiWork.report.coverageRenewals" : "aiWork.report.gapRenewals" } });
  if (inputs.crm) {
    const f = inputs.crm;
    const source = [{ kind: "report" as const, id: "crm", href: "/reports?view=crm" }];
    sections.push({ key: "sales", titleKey: "aiWork.report.sales", items: [
      { key: "leads", message: { key: "aiWork.report.leads", params: { created: num(f.leadsCreated), contacted: num(f.leadsContacted) } }, sources: source },
      { key: "trials", message: { key: "aiWork.report.trials", params: { booked: num(f.trialsBooked), attended: num(f.trialsAttended) } }, sources: source },
      { key: "sold", message: { key: "aiWork.report.sold", params: { count: num(f.membershipsSold) } }, sources: source, tone: "positive" },
    ] });
  }
  coverage.push({ key: "sales", complete: Boolean(inputs.crm), message: { key: inputs.crm ? "aiWork.report.coverageSales" : "aiWork.report.gapSales" } });
  const verified = checks.length > 0 && checks.every((check) => check.ok) && coverage.every((item) => item.complete);
  return { titleParams: { from: { date: params.from }, to: { date: params.to } }, sections, verification: { verified, checks }, coverage };
}

export interface HandoverInputs {
  checklist?: Data;
  facilityTasks?: Data[];
  equipmentIssues?: Data[];
  followUps?: Data[];
  /** `null` means read and no drawer is open; undefined means it could not be read. */
  shift?: Data | null;
}

/**
 * Parts of prepared work drawn from a source that needs more than the work's
 * own access. The handover goes to the next person on shift, so a reader who
 * lacks that source's access sees the rest without it.
 */
export const ARTIFACT_SECTION_PERMISSIONS: Partial<Record<"management_report" | "shift_handover" | "cash_difference", Record<string, string>>> = {
  shift_handover: { followUps: "crm.read", cash: "reconciliation.open_shift" },
};

/** Whether a reader with these permissions may see a section (or its coverage line) of prepared work. */
export function artifactSectionReadable(kind: keyof typeof ARTIFACT_SECTION_PERMISSIONS, key: string, permissions: readonly string[]): boolean {
  const needed = ARTIFACT_SECTION_PERMISSIONS[kind]?.[key];
  return !needed || permissions.includes(needed);
}

export function composeHandover(inputs: HandoverInputs, params: { date: string; branchId: string }): Composed {
  const sections: AiArtifactSection[] = [];
  const coverage: Composed["coverage"] = [];
  if (inputs.checklist) {
    const runs = [...(Array.isArray(inputs.checklist.runs) ? inputs.checklist.runs : []), ...(Array.isArray(inputs.checklist.carryover) ? inputs.checklist.carryover : [])].map(record);
    const items: AiArtifactSection["items"] = [];
    for (const run of runs) {
      for (const item of (Array.isArray(run.items) ? run.items : []).map(record)) {
        const status = text(item.status);
        if (status === "completed" || (status === "pending" && !item.required)) continue;
        items.push({ key: `${text(run.templateId)}-${text(run.localDate)}-${text(item.itemId)}`, message: { key: status === "failed" ? "aiWork.handover.checkFailed" : status === "skipped" ? "aiWork.handover.checkSkipped" : "aiWork.handover.checkPending", params: { item: text(item.label), list: text(run.name), date: { date: text(run.localDate) } } }, sources: [{ kind: "checklist", id: text(run.templateId), href: `/checklists?date=${text(run.localDate)}` }], tone: status === "failed" ? "attention" : "neutral" });
      }
    }
    sections.push({ key: "checks", titleKey: "aiWork.handover.checks", items });
  }
  coverage.push({ key: "checks", complete: Boolean(inputs.checklist), message: { key: inputs.checklist ? "aiWork.handover.coverageChecks" : "aiWork.handover.gapChecks" } });
  if (inputs.facilityTasks) {
    const open = inputs.facilityTasks.filter((task) => ["open", "in_progress", "blocked"].includes(text(task.status)));
    sections.push({ key: "maintenance", titleKey: "aiWork.handover.maintenance", items: open.slice(0, 50).map((task) => ({ key: text(task.id), message: { key: text(task.status) === "blocked" ? "aiWork.handover.jobBlocked" : "aiWork.handover.jobOpen", params: { title: text(task.title), area: text(task.zoneName) } }, sources: [{ kind: "facility_task" as const, id: text(task.id), href: `/operations?tab=facilities&branch=${params.branchId}` }], tone: text(task.severity) === "critical" || text(task.status) === "blocked" ? "attention" as const : "neutral" as const })) });
  }
  coverage.push({ key: "maintenance", complete: Boolean(inputs.facilityTasks), message: { key: inputs.facilityTasks ? "aiWork.handover.coverageMaintenance" : "aiWork.handover.gapMaintenance" } });
  if (inputs.equipmentIssues) {
    const open = inputs.equipmentIssues.filter((issue) => ["open", "in_progress"].includes(text(issue.status)));
    sections.push({ key: "machines", titleKey: "aiWork.handover.machines", items: open.slice(0, 50).map((issue) => ({ key: text(issue.id), message: { key: text(issue.safetyStatus) === "out_of_service" ? "aiWork.handover.machineOut" : "aiWork.handover.machineProblem", params: { title: text(issue.title) } }, sources: [{ kind: "equipment_issue" as const, id: text(issue.id), href: "/maintenance" }], tone: text(issue.safetyStatus) === "out_of_service" ? "attention" as const : "neutral" as const })) });
  }
  coverage.push({ key: "machines", complete: Boolean(inputs.equipmentIssues), message: { key: inputs.equipmentIssues ? "aiWork.handover.coverageMachines" : "aiWork.handover.gapMachines" } });
  if (inputs.followUps) {
    sections.push({ key: "followUps", titleKey: "aiWork.handover.followUps", items: inputs.followUps.slice(0, 50).map((task) => ({ key: text(task.id), message: { key: "aiWork.handover.followUpDue", params: { title: text(task.title), owner: text(task.ownerName), at: { at: text(task.dueAt) } } }, sources: [{ kind: "task" as const, id: text(task.id), href: text(task.memberId) ? `/members/${text(task.memberId)}?tab=tasks` : "/crm/queues" }] })) });
  }
  coverage.push({ key: "followUps", complete: Boolean(inputs.followUps), message: { key: inputs.followUps ? "aiWork.handover.coverageFollowUps" : "aiWork.handover.gapFollowUps" } });
  if (inputs.shift !== undefined) {
    const shift = inputs.shift ? record(inputs.shift.shift ?? inputs.shift) : undefined;
    const open = Boolean(shift && text(shift.id));
    sections.push({ key: "cash", titleKey: "aiWork.handover.cash", items: [{ key: "drawer", message: { key: open ? "aiWork.handover.drawerOpen" : "aiWork.handover.drawerClosed", params: open ? { name: text(shift!.openedByName), at: { at: text(shift!.openedAt) } } : {} }, sources: [{ kind: "shift", id: open ? text(shift!.id) : "none", href: "/payments/shifts" }] }] });
  }
  coverage.push({ key: "cash", complete: inputs.shift !== undefined, message: { key: inputs.shift !== undefined ? "aiWork.handover.coverageCash" : "aiWork.handover.gapCash" } });
  return { titleParams: { date: { date: params.date } }, sections, verification: { verified: coverage.every((item) => item.complete), checks: [] }, coverage };
}
