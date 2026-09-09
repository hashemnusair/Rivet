"use client";

import { ChecklistAssigneeSelect } from "@/features/checklists/checklist-assignment";

import { ArrowDown, ArrowUp, ClipboardCheck, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp } from "@/lib/providers/app-providers";
import type { ChecklistRole, ChecklistTemplate, ChecklistType, UpsertChecklistTemplateInput, Zone } from "@/lib/domain/types";
import { SettingsPanel, SettingsSection } from "@/features/settings/settings-layout";

const ROLE_LABELS: Record<ChecklistRole, string> = {
  owner: "Owner",
  manager: "Manager",
  sales: "Sales",
  receptionist: "Reception",
  trainer: "Coach",
};

const DESCRIPTION = "Opening and closing walkthroughs your team runs every day. Each branch keeps its own lists; staff tick items off on the Daily checklist page.";

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
  assignedUserId?: string;
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
    assignedUserId: template.assignedUserId,
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
      assignedUserId: draft.assignedUserId,
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
  const branchName = branches.find((branch) => branch.id === branchId)?.name;
  const newAction = <Button onClick={() => setDraft(draftFrom(undefined, branchId, "opening"))} disabled={!branchId}><Plus /> New checklist</Button>;

  return (
    <SettingsSection title="Daily checklists" description={DESCRIPTION} actions={newAction}>
      {branches.length === 0 ? (
        <EmptyState layout="section" title="No branches yet" description="Add a branch under Branches before creating its daily checklists." />
      ) : (
        <SettingsPanel
          className="max-w-4xl"
          title={branchName ? `Checklists for ${branchName}` : "Checklists"}
          bodyClassName="p-0"
          control={branches.length > 1 ? (
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
              <span>Branch</span>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label="Checklist branch" className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          ) : undefined}
        >
          {templatesQuery.isLoading ? <div className="p-4 sm:p-5"><Skeleton className="h-32 w-full" /></div> : templatesQuery.error ? <ErrorState layout="section" className="m-4 sm:m-5" onRetry={() => void templatesQuery.refetch()} /> : templates.length === 0 ? (
            <EmptyState layout="section" className="m-4 sm:m-5" icon={ClipboardCheck} title="No checklists yet" description="Create the branch's opening walkthrough first — the desk sees it tomorrow morning." action={<Button size="sm" onClick={() => setDraft(draftFrom(undefined, branchId, "opening"))}><Plus /> New checklist</Button>} />
          ) : (
            <ul className="divide-y divide-line" aria-label="Checklists">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-medium">{template.name}</p>
                      <Badge variant="neutral">{template.type === "opening" ? "Opening" : "Closing"}</Badge>
                      {!template.active ? <Badge variant="outline">Disabled</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">Due <span className="tabular">{template.dueTime}</span> · {template.assignedUserName ?? ROLE_LABELS[template.assignedRole]} · {template.items.length} item{template.items.length === 1 ? "" : "s"}</p>
                  </div>
                  <Button size="sm" variant="secondary" data-touch-target aria-label={`Edit ${template.name}`} onClick={() => setDraft(draftFrom(template, branchId, template.type))}>Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </SettingsPanel>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(undefined); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.templateId ? "Edit checklist" : "New checklist"}</DialogTitle>
            <DialogDescription>{branchName ? `For ${branchName}. ` : ""}Items appear to the assigned role in this order.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <DialogBody className="space-y-5">
              <FieldGrid className="sm:grid-cols-2">
                <Field label="Name" required><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Opening walkthrough" /></Field>
                <Field label="When">
                  <Select value={draft.type} onValueChange={(value) => setDraft({ ...draft, type: value as ChecklistType })}>
                    <SelectTrigger aria-label="Checklist type"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="opening">Opening</SelectItem><SelectItem value="closing">Closing</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Due by" hint="Branch time"><Input type="time" value={draft.dueTime} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></Field>
                <Field label="Who runs it">
                  <Select value={draft.assignedRole} onValueChange={(value) => setDraft({ ...draft, assignedRole: value as ChecklistRole })}>
                    <SelectTrigger aria-label="Responsible role"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(ROLE_LABELS) as ChecklistRole[]).map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <ChecklistAssigneeSelect branchId={draft.branchId} value={draft.assignedUserId} onChange={assignedUserId => setDraft({ ...draft, assignedUserId })} />
              </FieldGrid>

              <div>
                <p className="text-[13px] font-medium text-ink">Items, in order</p>
                <ol className="mt-2 space-y-2">
                  {draft.items.map((item, index) => (
                    <li key={index} className="rounded-md border border-line p-3">
                      <div className="flex items-center gap-1.5">
                        <Input value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} placeholder="What needs doing?" aria-label={`Item ${index + 1} label`} />
                        <Button variant="ghost" size="icon" aria-label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Move item ${index + 1} down`} disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove item ${index + 1}`} disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}><X /></Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
                        <label className="flex min-h-9 cursor-pointer items-center gap-2"><Checkbox checked={item.required} onCheckedChange={(checked: boolean) => updateItem(index, { required: checked })} aria-label={`Item ${index + 1} required`} /> Required</label>
                        <label className="flex min-h-9 cursor-pointer items-center gap-2"><Checkbox checked={item.offerMaintenance} onCheckedChange={(checked: boolean) => updateItem(index, { offerMaintenance: checked })} aria-label={`Item ${index + 1} offers maintenance task`} /> Offer a maintenance task on failure</label>
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
                    </li>
                  ))}
                </ol>
                <Button variant="secondary" size="sm" className="mt-2" disabled={draft.items.length >= 50} onClick={() => setDraft({ ...draft, items: [...draft.items, { ...EMPTY_ITEM }] })}><Plus /> Add item</Button>
              </div>

              <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-[13px] text-ink"><Checkbox className="mt-0.5" checked={draft.active} onCheckedChange={(checked: boolean) => setDraft({ ...draft, active: checked })} aria-label="Checklist active" /> <span>Active — the team sees it every day. Turning this off keeps past runs.</span></label>

              <details className="rounded-md bg-sunken p-3">
                <summary className="cursor-pointer text-[13px] font-medium text-ink">Preview what staff will see</summary>
                <ul className="mt-2 space-y-1.5">
                  {draft.items.filter((item) => item.label.trim()).map((item, index) => (
                    <li key={index} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-[13px]">
                      <span aria-hidden className="size-4 rounded-full border border-line-3" />
                      <span className="flex-1">{item.label}</span>
                      {!item.required ? <span className="text-[12px] text-ink-3">optional</span> : null}
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
    </SettingsSection>
  );
}
