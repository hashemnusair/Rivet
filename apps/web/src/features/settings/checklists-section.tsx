"use client";
import { useFormat } from "@/lib/i18n/format";
import { roleLabel } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
  const f = useFormat();
  const DESCRIPTION = t("settingsDetails.text146");

  const { session } = useApp();
  const invalidate = useInvalidate();
  const branches = session?.branches ?? [];
  const [branchId, setBranchId] = useState(session?.activeBranchId ?? branches[0]?.id ?? "");
  const [draft, setDraft] = useState<Draft | undefined>();

  const templatesQuery = useApiQuery(qk.checklistTemplates(branchId), (api) => api.listChecklistTemplates({ branchId }), { enabled: Boolean(branchId) });
  const zonesQuery = useApiQuery(["zones", branchId], (api) => api.listZones({ branchId }), { enabled: Boolean(branchId) });
  const zones = useMemo(() => zonesQuery.data ?? [], [zonesQuery.data]);

  const save = useApiMutation((api, input: UpsertChecklistTemplateInput) => api.upsertChecklistTemplate(input), {
    successMessage: t("settingsDetails.text147"),
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
  const newAction = <Button onClick={() => setDraft(draftFrom(undefined, branchId, "opening"))} disabled={!branchId}><Plus /> {" "}{t("settingsDetails.text148")}</Button>;

  return (
    <SettingsSection title={t("settingsCore.text193")} description={DESCRIPTION} actions={newAction}>
      {branches.length === 0 ? (
        <EmptyState layout="section" title={t("settingsCore.text034")} description={t("settingsDetails.text149")} />
      ) : (
        <SettingsPanel
          className="max-w-4xl"
          title={branchName ? t("settingsDetails.checklistsFor", { branch: branchName }) : t("settingsDetails.text150")}
          bodyClassName="p-0"
          control={branches.length > 1 ? (
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
              <span>{t("common.label.branch")}</span>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label={t("settingsDetails.text151")} className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          ) : undefined}
        >
          {templatesQuery.isLoading ? <div className="p-4 sm:p-5"><Skeleton className="h-32 w-full" /></div> : templatesQuery.error ? <ErrorState layout="section" className="m-4 sm:m-5" onRetry={() => void templatesQuery.refetch()} /> : templates.length === 0 ? (
            <EmptyState layout="section" className="m-4 sm:m-5" icon={ClipboardCheck} title={t("settingsDetails.text152")} description={t("settingsDetails.text153")} action={<Button size="sm" onClick={() => setDraft(draftFrom(undefined, branchId, "opening"))}><Plus /> {" "}{t("settingsDetails.text148")}</Button>} />
          ) : (
            <ul className="divide-y divide-line" aria-label={t("settingsDetails.text150")}>
              {templates.map((template) => (
                <li key={template.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-medium">{template.name}</p>
                      <Badge variant="neutral">{template.type === "opening" ? t("settingsDetails.text154") : t("settingsDetails.text155")}</Badge>
                      {!template.active ? <Badge variant="outline">{t("settingsDetails.text156")}</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{t("settingsDetails.text144")}{" "}<span className="tabular">{f.clock(template.dueTime)}</span> · {template.assignedUserName ?? roleLabel(t, template.assignedRole)} · {t("settingsDetails.itemCount", { count: template.items.length })}</p>
                  </div>
                  <Button size="sm" variant="secondary" data-touch-target aria-label={t("settingsCore.editNamed", { name: template.name })} onClick={() => setDraft(draftFrom(template, branchId, template.type))}>{t("common.action.edit")}</Button>
                </li>
              ))}
            </ul>
          )}
        </SettingsPanel>
      )}

      <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(undefined); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.templateId ? t("settingsDetails.text157") : t("settingsDetails.text148")}</DialogTitle>
            <DialogDescription>{branchName ? t("settingsDetails.forBranch", { branch: branchName }) : ""}{t("settingsDetails.text158")}</DialogDescription>
          </DialogHeader>
          {draft ? (
            <DialogBody className="space-y-5">
              <FieldGrid className="sm:grid-cols-2">
                <Field label={t("common.label.name")} required><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={t("settingsDetails.text159")} /></Field>
                <Field label={t("members.tabs.checkIns.when")}>
                  <Select value={draft.type} onValueChange={(value) => setDraft({ ...draft, type: value as ChecklistType })}>
                    <SelectTrigger aria-label={t("settingsDetails.text160")}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="opening">{t("settingsDetails.text154")}</SelectItem><SelectItem value="closing">{t("settingsDetails.text155")}</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label={t("settingsDetails.text161")} hint={t("settingsDetails.text162")}><Input type="time" value={draft.dueTime} onChange={(event) => setDraft({ ...draft, dueTime: event.target.value })} /></Field>
                <Field label={t("settingsDetails.text163")}>
                  <Select value={draft.assignedRole} onValueChange={(value) => setDraft({ ...draft, assignedRole: value as ChecklistRole })}>
                    <SelectTrigger aria-label={t("settingsDetails.text163")}><SelectValue /></SelectTrigger>
                    <SelectContent>{(["owner", "manager", "sales", "receptionist", "trainer"] as ChecklistRole[]).map((role) => <SelectItem key={role} value={role}>{roleLabel(t, role)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <ChecklistAssigneeSelect branchId={draft.branchId} value={draft.assignedUserId} onChange={assignedUserId => setDraft({ ...draft, assignedUserId })} />
              </FieldGrid>

              <div>
                <p className="text-[13px] font-medium text-ink">{t("settingsDetails.text164")}</p>
                <ol className="mt-2 space-y-2">
                  {draft.items.map((item, index) => (
                    <li key={index} className="rounded-md border border-line p-3">
                      <div className="flex items-center gap-1.5">
                        <Input value={item.label} onChange={(event) => updateItem(index, { label: event.target.value })} placeholder={t("settingsDetails.text165")} aria-label={t("settingsDetails.itemLabel", { number: index + 1 })} />
                        <Button variant="ghost" size="icon" aria-label={t("settingsDetails.itemUp", { number: index + 1 })} disabled={index === 0} onClick={() => moveItem(index, -1)}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon" aria-label={t("settingsDetails.itemDown", { number: index + 1 })} disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)}><ArrowDown /></Button>
                        <Button variant="ghost" size="icon" aria-label={t("settingsDetails.itemRemove", { number: index + 1 })} disabled={draft.items.length === 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })}><X /></Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
                        <label className="flex min-h-9 cursor-pointer items-center gap-2"><Checkbox checked={item.required} onCheckedChange={(checked: boolean) => updateItem(index, { required: checked })} aria-label={t("settingsDetails.itemRequired", { number: index + 1 })} />{" "}{t("common.state.required")}</label>
                        <label className="flex min-h-9 cursor-pointer items-center gap-2"><Checkbox checked={item.offerMaintenance} onCheckedChange={(checked: boolean) => updateItem(index, { offerMaintenance: checked })} aria-label={t("settingsDetails.itemMaintenance", { number: index + 1 })} /> {" "}{t("settingsDetails.text166")}</label>
                        {zones.length > 0 ? (
                          <Select value={item.zoneId || "none"} onValueChange={(value) => updateItem(index, { zoneId: value === "none" ? "" : value })}>
                            <SelectTrigger sizeVariant="sm" className="w-44" aria-label={t("settingsDetails.itemArea", { number: index + 1 })}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{t("settingsDetails.text167")}</SelectItem>
                              {zones.map((zone: Zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
                <Button variant="secondary" size="sm" className="mt-2" disabled={draft.items.length >= 50} onClick={() => setDraft({ ...draft, items: [...draft.items, { ...EMPTY_ITEM }] })}><Plus /> {" "}{t("settingsDetails.text168")}</Button>
              </div>

              <label className="flex min-h-9 cursor-pointer items-start gap-2.5 text-[13px] text-ink"><Checkbox className="mt-0.5" checked={draft.active} onCheckedChange={(checked: boolean) => setDraft({ ...draft, active: checked })} aria-label={t("settingsDetails.text169")} /> <span>{t("settingsDetails.text170")}</span></label>

              <details className="rounded-md bg-sunken p-3">
                <summary className="cursor-pointer text-[13px] font-medium text-ink">{t("settingsDetails.text171")}</summary>
                <ul className="mt-2 space-y-1.5">
                  {draft.items.filter((item) => item.label.trim()).map((item, index) => (
                    <li key={index} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-[13px]">
                      <span aria-hidden className="size-4 rounded-full border border-line-3" />
                      <span className="flex-1">{item.label}</span>
                      {!item.required ? <span className="text-[12px] text-ink-3">{t("settingsDetails.text173")}</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDraft(undefined)}>{t("common.action.cancel")}</Button>
            <Button loading={save.isPending} disabled={!draft || !draft.name.trim() || draft.items.every((item) => !item.label.trim())} onClick={submit}>{t("settingsDetails.text172")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
