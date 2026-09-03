"use client";

import { ArrowDown, ArrowUp, ClipboardCheck, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp } from "@/lib/providers/app-providers";
import type { ChecklistRole, ChecklistTemplate, ChecklistType, UpsertChecklistTemplateInput, Zone } from "@/lib/domain/types";

const ROLE_LABELS: Record<ChecklistRole, string> = {
  owner: "Owner",
  manager: "Manager",
  sales: "Sales",
  receptionist: "Reception",
  trainer: "Coach",
};

interface DraftItem {
  id?: string;
  label: string;
  instructions: string;
  required: boolean;
  zoneId: string;
  offerMaintenance: boolean;
}

interface Draft {
  templateId?: string;
  branchId: string;
  type: ChecklistType;
  name: string;
  dueTime: string;
  assignedRole: ChecklistRole;
  active: boolean;
  items: DraftItem[];
}

const EMPTY_ITEM: DraftItem = { label: "", instructions: "", required: true, zoneId: "", offerMaintenance: false };

function draftFrom(template: ChecklistTemplate | undefined, branchId: string, type: ChecklistType): Draft {
  if (!template) return { branchId, type, name: "", dueTime: type === "opening" ? "07:30" : "23:00", assignedRole: "receptionist", active: true, items: [{ ...EMPTY_ITEM }] };
  return {
    templateId: template.id,
    branchId: template.branchId,
    type: template.type,
    name: template.name,
    dueTime: template.dueTime,
    assignedRole: template.assignedRole,
    active: template.active,
    items: template.items.map((item) => ({ id: item.id, label: item.label, instructions: item.instructions ?? "", required: item.required, zoneId: item.zoneId ?? "", offerMaintenance: item.offerMaintenance === true })),
  };
}

export function ChecklistsSection() {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const branches = session?.branches ?? [];
  const [branchId, setBranchId] = useState(session?.activeBranchId ?? branches[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft | undefined>();

  const templatesQuery = useApiQuery(qk.checklistTemplates(branchId), (api) => api.listChecklistTemplates({ branchId }), { enabled: Boolean(branchId) });
  const zonesQuery = useApiQuery(["zones", branchId], (api) => api.listZones({ branchId }), { enabled: Boolean(branchId) });
  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);

  const save = useApiMutation((api, input: UpsertChecklistTemplateInput) => api.upsertChecklistTemplate(input), {
    successMessage: "Checklist saved and audited.",
    onSuccess: async () => {
      setDraft(undefined);
      await invalidate([qk.checklistTemplates(branchId)]);
    },
  });

  const submit = () => {
    if (!draft) return;
    save.mutate({
      templateId: draft.templateId,
      branchId: draft.branchId,
      type: draft.type,
      name: draft.name,
      dueTime: draft.dueTime,
      assignedRole: draft.assignedRole,
      active: draft.active,
      items: draft.items
        .filter((item) => item.label.trim())
        .map((item) => ({ id: item.id, label: item.label, instructions: item.instructions.trim() || undefined, required: item.required, zoneId: item.zoneId || undefined, offerMaintenance: item.offerMaintenance || undefined })),
    });
  };

  const updateItem = (index: number, patch: Partial<DraftItem>) =>
    setDraft((current) => current ? { ...current, items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) } : current);
  const moveItem = (index: number, delta: -1 | 1) =>
    setDraft((current) => {
      if (!current) return current;
      const target = index + delta;
      if (target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      const [moved] = items.splice(index, 1);
      items.splice(target, 0, moved!);
      return { ...current, items };
    });

  const templates = templatesQuery.data ?? [];

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold">Daily checklists</h2>
          <p className="mt-1 max-w-2xl text-[12px] text-ink-3">Opening and closing walkthroughs your team runs every day. Each branch keeps its own lists; staff tick items off on the Daily checklist page.</p>
        </div>
        <Button size="sm" onClick={() => setDraft(draftFrom(undefined, branchId, "opening"))} disabled={!branchId}><Plus /> New checklist</Button>
      </div>

      {branches.length > 1 ? (
        <label className="mt-4 grid w-56 gap-1 text-[11px] text-ink-3">Branch
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger sizeVariant="sm" aria-label="Checklist branch"><SelectValue /></SelectTrigger>
            <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>
      ) : null}

      <div className="mt-4">
        {templatesQuery.isLoading ? <Skeleton className="h-32 w-full" /> : templatesQuery.error ? <ErrorState onRetry={() => void templatesQuery.refetch()} /> : templates.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No checklists yet" description="Create the branch's opening walkthrough first — the desk sees it tomorrow morning." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium">
                    {template.name}
                    {!template.active ? <Badge variant="outline">Disabled</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">{template.type === "opening" ? "Opening" : "Closing"} · due {template.dueTime} · {ROLE_LABELS[template.assignedRole]} · {template.items.length} item{template.items.length === 1 ? "" : "s"}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setDraft(draftFrom(template, branchId, template.type))}>Edit</Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(undefined); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{draft?.templateId ? "Edit checklist" : "New checklist"}</DialogTitle></DialogHeader>
          {draft ? (
            <DialogBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[11px] text-ink-3">Name<Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Opening walkthrough" /></label>
                <label className="grid gap-1 text-[11px] text-ink-3">When
                  <Select value={draft.type} onValueChange={(value) => setDraft({ ...draft, type: value as ChecklistType })}>
                    <SelectTrigger aria-label="Checklist type"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="opening">Opening</SelectItem><SelectItem value="closing">Closing</SelectItem></SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1 text-[11px] text-ink-3">Due by (branch time)<Input type="time" value={draft.dueTime} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></label>
                <label className="grid gap-1 text-[11px] text-ink-3">Who runs it
                  <Select value={draft.assignedRole} onValueChange={(value) => setDraft({ ...draft, assignedRole: value as ChecklistRole })}>
                    <SelectTrigger aria-label="Responsible role"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(ROLE_LABELS) as ChecklistRole[]).map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              </div>

              <div>
                <p className="text-[12px] font-medium">Items, in order</p>
                <div className="mt-2 space-y-2">
                  {draft.items.map((item, index) => (
                    <div key={index} className="rounded-md border border-line p-2.5">
                      <div className="flex items-center gap-2">
                        <Input value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} placeholder="What needs doing?" aria-label={`Item ${index + 1} label`} />
                        <Button variant="ghost" size="sm" aria-label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp /></Button>
                        <Button variant="ghost" size="sm" aria-label={`Move item ${index + 1} down`} disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown /></Button>
                        <Button variant="ghost" size="sm" aria-label={`Remove item ${index + 1}`} disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}><X /></Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
                        <label className="flex cursor-pointer items-center gap-1.5"><Checkbox checked={item.required} onCheckedChange={(checked: boolean) => updateItem(index, { required: checked })} aria-label={`Item ${index + 1} required`} /> Required</label>
                        <label className="flex cursor-pointer items-center gap-1.5"><Checkbox checked={item.offerMaintenance} onCheckedChange={(checked: boolean) => updateItem(index, { offerMaintenance: checked })} aria-label={`Item ${index + 1} offers maintenance task`} /> Offer maintenance task on failure</label>
                        {zones.length > 0 ? (
                          <Select value={item.zoneId || "none"} onValueChange={(value) => updateItem(index, { zoneId: value === "none" ? "" : value })}>
                            <SelectTrigger sizeVariant="sm" className="w-44" aria-label={`Item ${index + 1} gym space`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No gym space</SelectItem>
                              {zones.map((zone: Zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="secondary" size="sm" className="mt-2" disabled={draft.items.length >= 50} onClick={() => setDraft({ ...draft, items: [...draft.items, { ...EMPTY_ITEM }] })}><Plus /> Add item</Button>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[12.5px]"><Checkbox checked={draft.active} onCheckedChange={(checked: boolean) => setDraft({ ...draft, active: checked })} aria-label="Checklist active" /> Active — the team sees it every day. Turning this off keeps past runs.</label>

              <details className="rounded-md border border-line bg-sunken p-3">
                <summary className="cursor-pointer text-[12px] font-medium">Preview what staff will see</summary>
                <ul className="mt-2 space-y-1.5">
                  {draft.items.filter((item) => item.label.trim()).map((item, index) => (
                    <li key={index} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-[13px]">
                      <span aria-hidden className="size-4 rounded-full border border-line-3" />
                      <span className="flex-1">{item.label}</span>
                      {!item.required ? <span className="text-[10.5px] text-ink-3">optional</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDraft(undefined)}>Cancel</Button>
            <Button loading={save.isPending} disabled={!draft || !draft.name.trim() || draft.items.every((item) => !item.label.trim())} onClick={submit}>Save checklist</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
