import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  domainError,
  publicBranchId,
  publicUserId,
  requirePermission,
  requireReason,
  type ActorContext,
  type OrganizationRole,
} from "./security";
import { operationsMutation } from "./operations";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Template = Doc<"checklistTemplates">;
type Run = Doc<"checklistRuns">;

const GYM_ROLES: readonly OrganizationRole[] = ["owner", "manager", "sales", "receptionist", "trainer", "auditor"];
const MAX_ITEMS = 50;
const TZ_FALLBACK = "Asia/Amman";
const RUN_STATUSES = ["pending", "completed", "failed", "skipped"] as const;

function optionalText(input: unknown): string | undefined {
  const value = typeof input === "string" ? input.trim() : undefined;
  return value || undefined;
}

function requiredText(input: unknown, field: string, actor: ActorContext): string {
  const value = optionalText(input);
  if (!value) domainError("VALIDATION_ERROR", `${field} is required.`, { correlationId: actor.correlationId });
  return value;
}

function localToday(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
}

function localTimeNow(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(Date.now());
  return parts === "24:00" ? "00:00" : parts;
}

async function branchOf(ctx: ReadContext, actor: ActorContext, branchPublicIdInput: unknown): Promise<Doc<"branches">> {
  const id = requiredText(branchPublicIdInput, "branchId", actor);
  const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique();
  if (!branch || !branch.active) domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
  if (actor.branchScope !== "all" && !actor.branchIds.includes(branch._id)) {
    domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  }
  return branch;
}

async function templateByPublicId(ctx: ReadContext, actor: ActorContext, id: unknown): Promise<Template> {
  const templateId = requiredText(id, "templateId", actor);
  const template = await ctx.db.query("checklistTemplates").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", templateId)).unique();
  if (!template) domainError("NOT_FOUND", "Checklist not found.", { correlationId: actor.correlationId });
  if (actor.branchScope !== "all" && !actor.branchIds.includes(template.branchId)) {
    domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  }
  return template;
}

async function checklistAudit(ctx: MutationCtx, actor: ActorContext, input: { action: string; branchId: Template["branchId"]; entityType: string; entityId: string; entityLabel: string; summary: string; reason?: string; before?: unknown; after?: unknown }): Promise<void> {
  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    branchId: input.branchId,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "operations",
    action: input.action,
    entityType: input.entityType,
    entityPublicId: input.entityId,
    entityLabel: input.entityLabel,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: actor.correlationId,
    occurredAt: Date.now(),
  });
}

function templateView(template: Template, branchPublic: string): Data {
  return {
    id: template.publicId,
    branchId: branchPublic,
    type: template.type,
    name: template.name,
    active: template.active,
    dueTime: template.dueTime,
    assignedRole: template.assignedRole,
    items: template.items.map((item) => ({ ...item })),
    createdAt: new Date(template.createdAt).toISOString(),
    updatedAt: new Date(template.updatedAt).toISOString(),
  };
}

function runProgress(run: Pick<Run, "items">): { done: number; total: number; requiredPending: number; failedRequired: number } {
  const total = run.items.length;
  const done = run.items.filter((item) => item.status !== "pending").length;
  const requiredPending = run.items.filter((item) => item.required && item.status === "pending").length;
  const failedRequired = run.items.filter((item) => item.required && item.status === "failed").length;
  return { done, total, requiredPending, failedRequired };
}

function runView(run: Run, branchPublic: string, timezone: string): Data {
  const today = localToday(timezone);
  const progress = runProgress(run);
  const dueToday = run.localDate === today;
  const pastDue = run.localDate < today || (dueToday && localTimeNow(timezone) > run.dueTime);
  return {
    id: run.publicId,
    templateId: run.templatePublicId,
    branchId: branchPublic,
    type: run.type,
    localDate: run.localDate,
    name: run.templateName,
    dueTime: run.dueTime,
    assignedRole: run.assignedRole,
    items: [...run.items].sort((a, b) => a.order - b.order).map((item) => ({ ...item })),
    progress,
    complete: progress.requiredPending === 0,
    overdue: pastDue && progress.requiredPending > 0,
    createdAt: new Date(run.createdAt).toISOString(),
    updatedAt: new Date(run.updatedAt).toISOString(),
  };
}

function validateItems(input: unknown, actor: ActorContext): Template["items"] {
  if (!Array.isArray(input) || input.length === 0) domainError("VALIDATION_ERROR", "A checklist needs at least one item.", { correlationId: actor.correlationId });
  if (input.length > MAX_ITEMS) domainError("VALIDATION_ERROR", `A checklist holds at most ${MAX_ITEMS} items.`, { correlationId: actor.correlationId });
  return input.map((raw, index) => {
    const value = (raw ?? {}) as Data;
    return {
      id: optionalText(value.id) ?? crypto.randomUUID(),
      label: requiredText(value.label, `Item ${index + 1} label`, actor).slice(0, 120),
      instructions: optionalText(value.instructions)?.slice(0, 400),
      required: value.required !== false,
      order: index,
      zoneId: optionalText(value.zoneId),
      offerMaintenance: value.offerMaintenance === true ? true : undefined,
    };
  });
}

async function ensureRun(ctx: MutationCtx, actor: ActorContext, template: Template, localDate: string): Promise<Run> {
  // One run per template, branch, and local date. Convex mutations are
  // serializable, so read-then-insert inside one transaction cannot race a
  // concurrent request into a duplicate.
  const existing = await ctx.db.query("checklistRuns").withIndex("by_template_date", (q) => q.eq("organizationId", actor.organization._id).eq("templateId", template._id).eq("localDate", localDate)).unique();
  if (existing) return existing;
  const now = Date.now();
  const runId = await ctx.db.insert("checklistRuns", {
    organizationId: actor.organization._id,
    publicId: crypto.randomUUID(),
    branchId: template.branchId,
    templateId: template._id,
    templatePublicId: template.publicId,
    type: template.type,
    localDate,
    templateName: template.name,
    dueTime: template.dueTime,
    assignedRole: template.assignedRole,
    items: [...template.items].sort((a, b) => a.order - b.order).map((item) => ({
      itemId: item.id,
      label: item.label,
      instructions: item.instructions,
      required: item.required,
      order: item.order,
      zoneId: item.zoneId,
      offerMaintenance: item.offerMaintenance,
      status: "pending" as const,
    })),
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(runId))!;
}

export async function checklistsQuery(ctx: ReadContext, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  const timezone = actor.organization.timezone || TZ_FALLBACK;
  switch (operation) {
    case "checklists.templates.list": {
      requirePermission(actor, "operations.manage");
      const branchFilter = optionalText(input.branchId) ? await branchOf(ctx, actor, input.branchId) : undefined;
      const rows = branchFilter
        ? await ctx.db.query("checklistTemplates").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branchFilter._id)).collect()
        : (await ctx.db.query("checklistTemplates").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect())
            .filter((row) => actor.branchScope === "all" || actor.branchIds.includes(row.branchId));
      const branches = new Map((await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect()).map((branch) => [branch._id, publicBranchId(branch)]));
      return rows
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "opening" ? -1 : 1))
        .map((row) => templateView(row, branches.get(row.branchId) ?? ""));
    }

    case "checklists.day": {
      const branch = await branchOf(ctx, actor, input.branchId);
      const date = optionalText(input.date) ?? localToday(timezone);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) domainError("VALIDATION_ERROR", "date must be a calendar date.", { correlationId: actor.correlationId });
      const templates = (await ctx.db.query("checklistTemplates").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect())
        .filter((template) => template.active);
      const runs = await ctx.db.query("checklistRuns").withIndex("by_branch_date", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("localDate", date)).collect();
      const runByTemplate = new Map(runs.map((run) => [run.templatePublicId, run]));
      const branchPublic = publicBranchId(branch);
      const views = templates.map((template) => {
        const run = runByTemplate.get(template.publicId);
        if (run) return runView(run, branchPublic, timezone);
        // A template with no persisted run yet renders as a pending run; the
        // first recorded result creates the durable row idempotently.
        const virtual: Pick<Run, "items"> = { items: template.items.map((item) => ({ itemId: item.id, label: item.label, instructions: item.instructions, required: item.required, order: item.order, zoneId: item.zoneId, offerMaintenance: item.offerMaintenance, status: "pending" as const })) };
        const progress = runProgress(virtual);
        const pastDue = date < localToday(timezone) || (date === localToday(timezone) && localTimeNow(timezone) > template.dueTime);
        return {
          id: undefined,
          templateId: template.publicId,
          branchId: branchPublic,
          type: template.type,
          localDate: date,
          name: template.name,
          dueTime: template.dueTime,
          assignedRole: template.assignedRole,
          items: virtual.items.map((item) => ({ ...item })),
          progress,
          complete: progress.requiredPending === 0,
          overdue: pastDue && progress.requiredPending > 0,
        };
      });
      return { branchId: branchPublic, date, runs: views.sort((a, b) => (a.type === b.type ? String(a.name).localeCompare(String(b.name)) : a.type === "opening" ? -1 : 1)) };
    }

    default:
      domainError("VALIDATION_ERROR", `Unknown checklist operation: ${operation}`, { correlationId: actor.correlationId });
  }
}

export async function checklistsMutation(ctx: MutationCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  const timezone = actor.organization.timezone || TZ_FALLBACK;
  switch (operation) {
    case "checklists.template.upsert": {
      requirePermission(actor, "operations.manage");
      const branch = await branchOf(ctx, actor, input.branchId);
      const type = input.type === "closing" ? "closing" : input.type === "opening" ? "opening" : undefined;
      if (!type) domainError("VALIDATION_ERROR", "type must be opening or closing.", { correlationId: actor.correlationId });
      const name = requiredText(input.name, "Name", actor).slice(0, 80);
      const dueTime = requiredText(input.dueTime, "Due time", actor);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) domainError("VALIDATION_ERROR", "Due time must be HH:MM.", { correlationId: actor.correlationId });
      const assignedRole = requiredText(input.assignedRole, "Responsible role", actor) as OrganizationRole;
      if (!GYM_ROLES.includes(assignedRole)) domainError("VALIDATION_ERROR", "Choose a valid gym role.", { correlationId: actor.correlationId });
      const items = validateItems(input.items, actor);
      const zoneIds = items.flatMap((item) => (item.zoneId ? [item.zoneId] : []));
      for (const zoneId of zoneIds) {
        const zone = await ctx.db.query("zones").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", zoneId)).unique();
        if (!zone || zone.branchId !== branch._id || zone.status !== "active") {
          domainError("VALIDATION_ERROR", "A linked gym space must belong to this branch.", { correlationId: actor.correlationId });
        }
      }
      const active = input.active !== false;
      const now = Date.now();
      const existingId = optionalText(input.templateId);
      if (existingId) {
        const existing = await templateByPublicId(ctx, actor, existingId);
        if (existing.branchId !== branch._id) domainError("VALIDATION_ERROR", "A checklist cannot move between branches.", { correlationId: actor.correlationId });
        const before = templateView(existing, publicBranchId(branch));
        await ctx.db.patch(existing._id, { type, name, dueTime, assignedRole, items, active, updatedAt: now });
        const updated = (await ctx.db.get(existing._id))!;
        const after = templateView(updated, publicBranchId(branch));
        await checklistAudit(ctx, actor, { action: "checklists.template.update", branchId: branch._id, entityType: "checklist_template", entityId: existing.publicId, entityLabel: name, summary: `Checklist "${name}" updated`, before, after });
        return after;
      }
      const publicId = crypto.randomUUID();
      const templateId = await ctx.db.insert("checklistTemplates", { organizationId: actor.organization._id, publicId, branchId: branch._id, type, name, active, dueTime, assignedRole, items, createdAt: now, updatedAt: now });
      const created = templateView((await ctx.db.get(templateId))!, publicBranchId(branch));
      await checklistAudit(ctx, actor, { action: "checklists.template.create", branchId: branch._id, entityType: "checklist_template", entityId: publicId, entityLabel: name, summary: `Checklist "${name}" created`, after: created });
      return created;
    }

    case "checklists.run.ensure": {
      const template = await templateByPublicId(ctx, actor, input.templateId);
      if (!template.active) domainError("VALIDATION_ERROR", "This checklist is disabled.", { correlationId: actor.correlationId });
      const date = optionalText(input.date) ?? localToday(timezone);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) domainError("VALIDATION_ERROR", "date must be a calendar date.", { correlationId: actor.correlationId });
      const run = await ensureRun(ctx, actor, template, date);
      const branch = (await ctx.db.get(template.branchId))!;
      return runView(run, publicBranchId(branch), timezone);
    }

    case "checklists.item.set": {
      const template = await templateByPublicId(ctx, actor, input.templateId);
      const date = optionalText(input.date) ?? localToday(timezone);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) domainError("VALIDATION_ERROR", "date must be a calendar date.", { correlationId: actor.correlationId });
      if (!template.active) domainError("VALIDATION_ERROR", "This checklist is disabled.", { correlationId: actor.correlationId });
      const status = String(input.status ?? "");
      if (!RUN_STATUSES.includes(status as (typeof RUN_STATUSES)[number])) domainError("VALIDATION_ERROR", "Unknown item status.", { correlationId: actor.correlationId });
      const run = await ensureRun(ctx, actor, template, date);
      const itemId = requiredText(input.itemId, "itemId", actor);
      const index = run.items.findIndex((item) => item.itemId === itemId);
      if (index === -1) domainError("NOT_FOUND", "Checklist item not found.", { correlationId: actor.correlationId });
      const current = run.items[index]!;
      const note = optionalText(input.note)?.slice(0, 400);
      const reason = optionalText(input.reason)?.slice(0, 400);
      const isCorrection = current.status !== "pending";
      if (isCorrection) {
        // Recorded results never silently change: corrections carry a reason
        // and an immutable audit row, matching the repository's audit policy.
        requireReason(input.reason, actor.correlationId);
      }
      if ((status === "failed" || status === "skipped") && current.required) {
        requireReason(input.reason, actor.correlationId);
      }
      const now = new Date().toISOString();
      const nextItem = {
        ...current,
        status: status as (typeof RUN_STATUSES)[number],
        actorId: status === "pending" ? undefined : publicUserId(actor.user),
        actorName: status === "pending" ? undefined : actor.user.fullName,
        at: status === "pending" ? undefined : now,
        note,
        reason,
        facilityTaskId: current.facilityTaskId,
      };
      const items = [...run.items];
      items[index] = nextItem;
      await ctx.db.patch(run._id, { items, updatedAt: Date.now() });
      const branch = (await ctx.db.get(template.branchId))!;
      if (isCorrection) {
        await checklistAudit(ctx, actor, { action: "checklists.item.correct", branchId: template.branchId, entityType: "checklist_run", entityId: run.publicId, entityLabel: `${run.templateName} · ${current.label}`, summary: `Corrected "${current.label}" to ${status}`, reason, before: { status: current.status, actorName: current.actorName, at: current.at }, after: { status, actorName: actor.user.fullName, at: now } });
      } else if (status === "failed" || status === "skipped") {
        await checklistAudit(ctx, actor, { action: `checklists.item.${status === "failed" ? "fail" : "skip"}`, branchId: template.branchId, entityType: "checklist_run", entityId: run.publicId, entityLabel: `${run.templateName} · ${current.label}`, summary: `${status === "failed" ? "Failed" : "Skipped"} "${current.label}"`, reason, after: { status } });
      }
      return runView((await ctx.db.get(run._id))!, publicBranchId(branch), timezone);
    }

    case "checklists.item.create_task": {
      // Escalation reuses the existing facility-task contract end to end, so
      // authorization, validation, and auditing stay owned by operations.
      const template = await templateByPublicId(ctx, actor, input.templateId);
      const date = optionalText(input.date) ?? localToday(timezone);
      const run = await ensureRun(ctx, actor, template, date);
      const itemId = requiredText(input.itemId, "itemId", actor);
      const index = run.items.findIndex((item) => item.itemId === itemId);
      if (index === -1) domainError("NOT_FOUND", "Checklist item not found.", { correlationId: actor.correlationId });
      const current = run.items[index]!;
      if (current.facilityTaskId) domainError("CONFLICT", "A maintenance task is already linked to this item.", { correlationId: actor.correlationId });
      const zoneId = optionalText(input.zoneId) ?? current.zoneId;
      if (!zoneId) domainError("VALIDATION_ERROR", "Choose the gym space this task belongs to.", { correlationId: actor.correlationId });
      const branch = (await ctx.db.get(template.branchId))!;
      const task = (await operationsMutation(ctx, actor, "operations.facility_task.upsert", {
        branchId: publicBranchId(branch),
        zoneId,
        kind: "incident",
        severity: current.required ? "high" : "medium",
        title: optionalText(input.title) ?? `${current.label} — ${run.templateName}`,
        notes: optionalText(input.notes) ?? (current.reason ? `From the daily checklist: ${current.reason}` : `From the daily checklist run of ${run.localDate}.`),
      })) as Data;
      const items = [...run.items];
      items[index] = { ...current, facilityTaskId: String(task.id) };
      await ctx.db.patch(run._id, { items, updatedAt: Date.now() });
      await checklistAudit(ctx, actor, { action: "checklists.maintenance_escalated", branchId: template.branchId, entityType: "checklist_run", entityId: run.publicId, entityLabel: `${run.templateName} · ${current.label}`, summary: `Maintenance task created for "${current.label}"`, after: { facilityTaskId: String(task.id) } });
      return runView((await ctx.db.get(run._id))!, publicBranchId(branch), timezone);
    }

    default:
      domainError("VALIDATION_ERROR", `Unknown checklist operation: ${operation}`, { correlationId: actor.correlationId });
  }
}

/**
 * Today-queue contribution, kept separate from the dashboard so the queue
 * wiring stays a one-line integration. Emits due/overdue runs, failed
 * required items, and linked maintenance tasks still open today.
 */
export async function checklistTodayQueueItems(ctx: ReadContext, actor: ActorContext, branchVisible: (branchPublicId: string | undefined) => boolean): Promise<Data[]> {
  const timezone = actor.organization.timezone || TZ_FALLBACK;
  const today = localToday(timezone);
  const nowTime = localTimeNow(timezone);
  const templates = (await ctx.db.query("checklistTemplates").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect())
    .filter((template) => template.active)
    .filter((template) => actor.branchScope === "all" || actor.branchIds.includes(template.branchId));
  if (templates.length === 0) return [];
  const branches = new Map((await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect()).map((branch) => [branch._id, { publicId: publicBranchId(branch), name: branch.name }]));
  const items: Data[] = [];
  for (const template of templates) {
    // Role-safe queue: only the responsible role sees its checklist, plus
    // owner/manager oversight. A coach is never nagged about the desk's list.
    if (actor.role !== template.assignedRole && actor.role !== "owner" && actor.role !== "manager") continue;
    const branch = branches.get(template.branchId);
    if (!branch || !branchVisible(branch.publicId)) continue;
    const run = await ctx.db.query("checklistRuns").withIndex("by_template_date", (q) => q.eq("organizationId", actor.organization._id).eq("templateId", template._id).eq("localDate", today)).unique();
    const progress = run ? runProgress(run) : runProgress({ items: template.items.map((item) => ({ itemId: item.id, label: item.label, required: item.required, order: item.order, status: "pending" as const })) });
    const pastDue = nowTime > template.dueTime;
    if (progress.failedRequired > 0) {
      items.push({
        id: `checklist-failed:${template.publicId}:${today}`,
        kind: "branch_checklist",
        priority: "urgent",
        title: `Fix ${progress.failedRequired} failed ${template.name} item${progress.failedRequired === 1 ? "" : "s"}`,
        detail: `${branch.name} · ${template.type} checklist`,
        branchName: branch.name,
        href: `/checklists?branch=${encodeURIComponent(branch.publicId)}`,
        action: { kind: "navigate", label: "Review" },
      });
    }
    if (progress.requiredPending > 0) {
      items.push({
        id: `checklist-due:${template.publicId}:${today}`,
        kind: "branch_checklist",
        priority: pastDue ? "high" : "normal",
        title: `${pastDue ? "Overdue" : "Due"}: ${template.name}`,
        detail: `${branch.name} · ${progress.done}/${progress.total} done · due ${template.dueTime}`,
        branchName: branch.name,
        overdue: pastDue,
        href: `/checklists?branch=${encodeURIComponent(branch.publicId)}`,
        action: { kind: "navigate", label: "Open" },
      });
    }
  }
  return items;
}
