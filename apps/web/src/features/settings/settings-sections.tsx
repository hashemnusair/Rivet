"use client";
import type { TFunction } from "@/lib/i18n/core";
import { permissionCopy, roleDescription } from "@/lib/i18n/permissions";
import { paymentMethodLabel, roleLabel } from "@/lib/i18n/labels";
import { useLocale, useT } from "@/lib/i18n/provider";

import { Check, Pencil, Plus, UserPlus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, isApiError, localizeApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { PERMISSIONS } from "@/lib/domain/permissions";
import type { Branch, NotificationSettings, PaymentMethod, RoleKey, StaffUser, Zone, ZoneKind } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { money, parseMoneyInput, toMajorString, toWesternDigits } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits } from "@/lib/utils/text";
import { readSettingsNumber } from "./settings-number";
import { RelativeText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Checkbox } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsPanel, SettingsSaveBar, SettingsSection, SettingsToggleRow, SettingsUnitInput } from "@/features/settings/settings-layout";

function errorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}



function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const RECORD_STATUS: Record<string, { label: string; variant: "success" | "neutral" | "warning" | "outline" }> = {
  active: { label: t("settingsCore.text001"), variant: "success" },
  inactive: { label: t("settingsCore.text002"), variant: "neutral" },
  archived: { label: t("settingsCore.text003"), variant: "neutral" },
  invited: { label: t("settingsCore.text004"), variant: "warning" },
  deactivated: { label: t("settingsCore.text005"), variant: "outline" },
};

  const value = RECORD_STATUS[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={value.variant}>{value.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export function OrganizationSection() {
  const t = useT();
  const ORGANIZATION_DESCRIPTION = t("settingsCore.text006");

  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const org = settingsQuery.data?.organization;
  const [form, setForm] = useState({ name: "", timezone: "", locale: "", phoneCountryCallingCode: "962", defaultLanguage: "en" as "en" | "ar" });
  const [baseline, setBaseline] = useState<typeof form | null>(null);
  const dirty = Boolean(baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!org || dirtyRef.current) return;
    const next = { name: org.name, timezone: org.timezone, locale: org.locale, phoneCountryCallingCode: org.phoneCountryCallingCode, defaultLanguage: org.defaultLanguage };
    setForm(next);
    setBaseline(next);
  }, [org]);

  const save = useApiMutation((api) => api.updateOrganizationSettings(form), {
    onSuccess: async () => {
      toast.success(t("settingsCore.text007"));
      await invalidate([qk.settings]);
    },
  });

  if (settingsQuery.isLoading) return <SettingsSection title={t("settingsCore.text008")} description={ORGANIZATION_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("settingsCore.text008")} description={ORGANIZATION_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const commit = async () => {
    await save.mutateAsync();
    setBaseline(form);
  };
  const nameMissing = form.name.trim().length === 0;

  return (
    <SettingsSection title={t("settingsCore.text008")} description={ORGANIZATION_DESCRIPTION}>
      <SettingsPanel className="max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settingsCore.text009")} required error={nameMissing ? t("settingsCore.text010") : undefined}><Input value={form.name} aria-invalid={nameMissing || undefined} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label={t("settingsCore.text011")} hint={t("settingsCore.text012")}><Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}><SelectTrigger aria-label={t("settingsCore.text011")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Asia/Amman">{t("settingsCore.text013")}</SelectItem><SelectItem value="Asia/Riyadh">{t("settingsCore.text014")}</SelectItem><SelectItem value="Asia/Dubai">{t("settingsCore.text015")}</SelectItem></SelectContent></Select></Field>
          <Field label={t("settingsCore.text016")} hint={t("settingsCore.text017")}><Select value={form.locale} onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}><SelectTrigger aria-label={t("settingsCore.text016")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en-JO">{t("settingsCore.text018")}</SelectItem><SelectItem value="ar-JO">العربية (الأردن)</SelectItem></SelectContent></Select></Field>
          <Field label={t("settingsCore.text019")} hint={t("settingsCore.text020")}><div className="relative"><span className="pointer-events-none absolute inset-y-0 start-3 flex items-center font-mono text-[13px] text-ink-3" aria-hidden>+</span><Input className="ps-7 font-mono" inputMode="numeric" aria-label={t("settingsCore.text021")} value={form.phoneCountryCallingCode} onChange={(event) => setForm((current) => ({ ...current, phoneCountryCallingCode: latinDigits(event.target.value).replace(/\D/g, "").slice(0, 3) }))} /></div></Field>
          <Field label={t("settingsCore.text022")} hint={t("settingsCore.text023")}><Select value={form.defaultLanguage} onValueChange={(v) => setForm((f) => ({ ...f, defaultLanguage: v as "en" | "ar" }))}><SelectTrigger aria-label={t("settingsCore.text024")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">{t("common.language.english")}</SelectItem><SelectItem value="ar">{t("common.language.arabic")}</SelectItem></SelectContent></Select></Field>
        </div>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={nameMissing}
        saveDisabledReason={nameMissing ? t("settingsCore.text025") : undefined}
        error={save.isError ? errorMessage(save.error, t("settingsCore.text026")) : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel={t("settingsCore.text027")}
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export function BranchesSection() {
  const t = useT();
  const f = useFormat();
  const BRANCHES_DESCRIPTION = t("settingsCore.text028");

  const invalidate = useInvalidate();
  const { refreshSession } = useApp();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [dialog, setDialog] = useState<{ open: boolean; branch?: Branch }>({ open: false });
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", capacity: "100", status: "active" as "active" | "inactive" });

  useEffect(() => {
    if (dialog.open) {
      setForm(
        dialog.branch
          ? { name: dialog.branch.name, code: dialog.branch.code, address: dialog.branch.address, phone: dialog.branch.phone, capacity: String(dialog.branch.capacity), status: dialog.branch.status }
          : { name: "", code: "", address: "", phone: "", capacity: "100", status: "active" },
      );
    }
  }, [dialog]);

  const capacity = readSettingsNumber(form.capacity, { min: 1 });
  const capacityError = capacity === null ? t("operationsWorkspace.integerMinimum", { min: 1 }) : undefined;
  const save = useApiMutation(
    (api) => {
      if (capacity === null) throw ApiError.of("VALIDATION_ERROR", "Check the highlighted fields and try again.", { message: { key: "apiErrors.validation" } });
      return api.upsertBranch({ id: dialog.branch?.id, ...form, capacity });
    },
    {
      onSuccess: async () => {
        toast.success(dialog.branch ? t("settingsCore.text029") : t("settingsCore.text030"));
        setDialog({ open: false });
        await invalidate([qk.settings, qk.session, qk.branches]);
        await refreshSession();
      },
      onError: (e) => toast.error(errorMessage(e, t("settingsCore.text031"))),
    },
  );

  const addAction = <Button onClick={() => setDialog({ open: true })}><Plus /> {" "}{t("settingsCore.text032")}</Button>;

  if (settingsQuery.isLoading) return <SettingsSection title={t("settingsCore.text033")} description={BRANCHES_DESCRIPTION} actions={addAction}><Skeleton className="h-48 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("settingsCore.text033")} description={BRANCHES_DESCRIPTION} actions={addAction}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const branches = settingsQuery.data?.branches ?? [];

  return (
    <SettingsSection title={t("settingsCore.text033")} description={BRANCHES_DESCRIPTION} actions={addAction}>
      {branches.length === 0 ? (
        <EmptyState layout="section" title={t("settingsCore.text034")} description={t("settingsCore.text035")} action={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> {" "}{t("settingsCore.text032")}</Button>} />
      ) : (
        <SettingsPanel className="max-w-4xl" bodyClassName="p-0">
          <ul className="divide-y divide-line md:hidden" aria-label={t("settingsCore.text033")}>
            {branches.map((b) => (
              <li key={b.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">{b.name}</p>
                    <span className="font-mono text-[12px] text-ink-2">{b.code}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{b.address || t("settingsCore.text036")}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{t("settingsCore.text037")}{" "}<span className="tabular">{f.number(b.capacity)}</span>{b.phone ? <> · <span dir="ltr">{b.phone}</span></> : null}</p>
                </div>
                <Button variant="secondary" size="sm" aria-label={t("settingsCore.editNamed", { name: b.name })} data-touch-target onClick={() => setDialog({ open: true, branch: b })}><Pencil />{" "}{t("common.action.edit")}</Button>
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.label.name")}</TableHead>
                <TableHead>{t("settingsCore.text038")}</TableHead>
                <TableHead>{t("memberProfile.details.address")}</TableHead>
                <TableHead className="text-end">{t("settingsCore.text037")}</TableHead>
                <TableHead>{t("common.label.status")}</TableHead>
                <TableHead><span className="sr-only">{t("common.action.edit")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="font-mono text-[12px]">{b.code}</TableCell>
                  <TableCell className="max-w-64 truncate text-[12.5px] text-ink-2">{b.address}</TableCell>
                  <TableCell className="text-end tabular">{f.number(b.capacity)}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-end">
                    <Button variant="ghost" size="icon-sm" aria-label={t("settingsCore.editNamed", { name: b.name })} data-touch-target onClick={() => setDialog({ open: true, branch: b })}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsPanel>
      )}

      <Dialog open={dialog.open} onOpenChange={(v) => setDialog({ open: v })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.branch ? t("settingsCore.editNamed", { name: dialog.branch.name }) : t("settingsCore.text032")}</DialogTitle>
            <DialogDescription>{t("settingsCore.text039")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
              <Field label={t("common.label.name")} required>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("settingsCore.text040")} />
              </Field>
              <Field label={t("settingsCore.text038")} required hint={t("settingsCore.text041")}>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="font-mono uppercase" maxLength={4} placeholder="KHA" />
              </Field>
            </div>
            <Field label={t("memberProfile.details.address")}>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={t("common.label.phone")}>
                <Input dir="ltr" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: latinDigits(e.target.value) }))} />
              </Field>
              <Field label={t("settingsCore.text037")} error={capacityError}>
                <Input type="text" dir="ltr" inputMode="numeric" aria-invalid={Boolean(capacityError) || undefined} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: latinDigits(e.target.value) }))} />
              </Field>
              <Field label={t("common.label.status")}>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "active" | "inactive" }))}>
                  <SelectTrigger aria-label={t("common.label.status")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("renewFlow.adjust.membershipStatus.active")}</SelectItem>
                    <SelectItem value="inactive">{t("memberProfile.header.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog({ open: false })}>{t("common.action.cancel")}</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim() || !form.code.trim() || capacity === null}>
              {dialog.branch ? t("settingsCore.text042") : t("settingsCore.text032")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Gym spaces
// ---------------------------------------------------------------------------



function newSpaceCode(): string {
  return `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function GymSpacesSection() {
  const t = useT();
  const f = useFormat();
  const SPACES_DESCRIPTION = t("settingsCore.text053");
  const SPACE_KIND_LABELS: Record<ZoneKind, string> = {
  floor: t("settingsCore.text043"),
  studio: t("settingsCore.text044"),
  weights: t("settingsCore.text045"),
  cardio: t("settingsCore.text046"),
  functional: t("settingsCore.text047"),
  locker_room: t("settingsCore.text048"),
  bathroom: t("settingsCore.text049"),
  reception: t("settingsCore.text050"),
  storage: t("settingsCore.text051"),
  other: t("settingsCore.text052"),
};

  const invalidate = useInvalidate();
  const { session } = useApp();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const activeBranches = useMemo(() => (settingsQuery.data?.branches ?? []).filter((branch) => branch.status === "active"), [settingsQuery.data?.branches]);
  const [branchId, setBranchId] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; space?: Zone }>({ open: false });
  const [form, setForm] = useState({ name: "", kind: "floor" as ZoneKind, capacity: "", status: "active" as "active" | "archived" });

  useEffect(() => {
    setBranchId((current) => activeBranches.some((branch) => branch.id === current)
      ? current
      : activeBranches.find((branch) => branch.id === session?.activeBranchId)?.id ?? activeBranches[0]?.id ?? "");
  }, [activeBranches, session?.activeBranchId]);

  useEffect(() => {
    if (!dialog.open) return;
    setForm(dialog.space
      ? { name: dialog.space.name, kind: dialog.space.kind, capacity: dialog.space.capacity?.toString() ?? "", status: dialog.space.status }
      : { name: "", kind: "floor", capacity: "", status: "active" });
  }, [dialog]);

  const spacesQuery = useApiQuery(
    qk.operations({ kind: "settings-gym-spaces", branchId }),
    (api) => api.listZones({ branchId, includeArchived: true }),
    { enabled: Boolean(branchId) },
  );
  const capacity = form.capacity.trim() === "" ? undefined : readSettingsNumber(form.capacity, { min: 1, max: 100_000 });
  const capacityError = capacity === null ? t("operationsWorkspace.integerRange", { min: 1, max: 100_000 }) : undefined;
  const save = useApiMutation(
    (api) => {
      if (capacity === null) throw ApiError.of("VALIDATION_ERROR", "Check the highlighted fields and try again.", { message: { key: "apiErrors.validation" } });
      return api.upsertZone({
      id: dialog.space?.id,
      branchId,
      code: dialog.space?.code ?? newSpaceCode(),
      name: form.name.trim(),
      kind: form.kind,
      capacity,
      status: form.status,
    });
    },
    {
      onSuccess: async () => {
        toast.success(dialog.space ? t("settingsCore.text054") : t("settingsCore.text055"));
        setDialog({ open: false });
        await invalidate([qk.operations()]);
      },
      onError: (error) => toast.error(errorMessage(error, t("settingsCore.text056"))),
    },
  );

  const addAction = <Button onClick={() => setDialog({ open: true })} disabled={!branchId}><Plus /> {" "}{t("settingsCore.text057")}</Button>;

  if (settingsQuery.isLoading) return <SettingsSection title={t("settingsCore.text058")} description={SPACES_DESCRIPTION} actions={addAction}><Skeleton className="h-48 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("settingsCore.text058")} description={SPACES_DESCRIPTION} actions={addAction}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const branchName = activeBranches.find((branch) => branch.id === branchId)?.name;
  const spaces = spacesQuery.data ?? [];

  return (
    <SettingsSection title={t("settingsCore.text058")} description={SPACES_DESCRIPTION} actions={addAction}>
      {activeBranches.length === 0 ? (
        <EmptyState layout="section" title={t("settingsCore.text059")} description={t("settingsCore.text060")} />
      ) : (
        <SettingsPanel
          className="max-w-4xl"
          bodyClassName="p-0"
          title={branchName ? t("settingsCore.areasIn", { branch: branchName }) : t("settingsCore.text061")}
          control={
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
              <span>{t("common.label.branch")}</span>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label={t("settingsCore.text062")} className="w-52"><SelectValue placeholder={t("renewFlow.adjust.transfer.chooseBranch")} /></SelectTrigger>
                <SelectContent>
                  {activeBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          }
        >
          {spacesQuery.isLoading ? <div className="p-4 sm:p-5"><Skeleton className="h-32 w-full" /></div> : null}
          {spacesQuery.isError ? <ErrorState layout="section" className="m-4 sm:m-5" onRetry={() => spacesQuery.refetch()} /> : null}
          {!spacesQuery.isLoading && !spacesQuery.isError && spaces.length === 0 ? (
            <EmptyState
              className="m-4 sm:m-5"
              layout="section"
              title={t("settingsCore.text063")}
              description={t("settingsCore.text064")}
              action={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> {" "}{t("settingsCore.text065")}</Button>}
            />
          ) : null}
          {spaces.length > 0 ? (
            <>
              <ul className="divide-y divide-line md:hidden" aria-label={t("settingsCore.text058")}>
                {spaces.map((space) => (
                  <li key={space.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-[13.5px] font-medium">{space.name}</p><StatusBadge status={space.status} /></div>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">{SPACE_KIND_LABELS[space.kind]}{space.capacity ? <> {" "}{t("settingsCore.text066")}{" "}<span className="tabular">{f.number(space.capacity)}</span></> : null}</p>
                    </div>
                    <Button variant="secondary" size="sm" aria-label={t("settingsCore.editNamed", { name: space.name })} data-touch-target onClick={() => setDialog({ open: true, space })}><Pencil />{" "}{t("common.action.edit")}</Button>
                  </li>
                ))}
              </ul>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("common.label.name")}</TableHead>
                    <TableHead>{t("common.label.type")}</TableHead>
                    <TableHead className="text-end">{t("settingsCore.text037")}</TableHead>
                    <TableHead>{t("common.label.status")}</TableHead>
                    <TableHead><span className="sr-only">{t("common.action.edit")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spaces.map((space) => (
                    <TableRow key={space.id}>
                      <TableCell className="font-medium">{space.name}</TableCell>
                      <TableCell className="text-[12.5px] text-ink-2">{SPACE_KIND_LABELS[space.kind]}</TableCell>
                      <TableCell className="text-end tabular">{space.capacity === undefined ? "—" : f.number(space.capacity)}</TableCell>
                      <TableCell><StatusBadge status={space.status} /></TableCell>
                      <TableCell className="text-end"><Button variant="ghost" size="icon-sm" aria-label={t("settingsCore.editNamed", { name: space.name })} data-touch-target onClick={() => setDialog({ open: true, space })}><Pencil /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : null}
        </SettingsPanel>
      )}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, space: open ? dialog.space : undefined })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.space ? t("settingsCore.editNamed", { name: dialog.space.name }) : t("settingsCore.text057")}</DialogTitle>
            <DialogDescription>{branchName ? t("settingsCore.inBranch", { branch: branchName ?? "" }) : ""}{t("settingsCore.text067")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={t("common.label.name")} required hint={t("settingsCore.text068")}>
              <Input autoFocus value={form.name} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("settingsCore.text069")} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("common.label.type")} required>
                <Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value as ZoneKind }))}>
                  <SelectTrigger aria-label={t("settingsCore.text070")}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SPACE_KIND_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("settingsCore.text037")} hint={t("settingsCore.text071")} error={capacityError}>
                <Input type="text" dir="ltr" inputMode="numeric" aria-invalid={Boolean(capacityError) || undefined} value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: latinDigits(event.target.value) }))} />
              </Field>
              {dialog.space ? (
                <Field label={t("common.label.status")}>
                  <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "archived" }))}>
                    <SelectTrigger aria-label={t("settingsCore.text072")}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">{t("renewFlow.adjust.membershipStatus.active")}</SelectItem><SelectItem value="archived">{t("members.list.archived")}</SelectItem></SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog({ open: false })}>{t("common.action.cancel")}</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!branchId || !form.name.trim() || capacity === null}>{dialog.space ? t("common.action.saveChanges") : t("settingsCore.text057")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export function UsersSection() {
  const t = useT();
  const f = useFormat();
  const USERS_DESCRIPTION = t("settingsCore.text073");

  const invalidate = useInvalidate();
  const { session } = useApp();
  const usersQuery = useApiQuery(qk.users({ settings: true }), (api) => api.listUsers({ pageSize: 50 }));
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);

  const branchCodes = (user: StaffUser) => user.branchScope === "all"
    ? t("common.label.allBranches")
    : user.branchIds.map((id) => settingsQuery.data?.branches.find((b) => b.id === id)?.code).filter(Boolean).join(", ") || t("settingsCore.text074");
  const canEdit = (user: StaffUser) => user.role !== "owner" && user.id !== session?.user.id;
  const activity = (user: StaffUser) => user.status === "invited"
    ? <>{t("settingsCore.invitedAt", { date: user.invitedAt ? f.dateTime(user.invitedAt) : t("settingsCore.text075") })}</>
    : user.lastActiveAt ? <>{t("renewFlow.adjust.membershipStatus.active")}{" "}<RelativeText iso={user.lastActiveAt} /></> : <>{t("settingsCore.text076")}</>;

  const inviteAction = <Button onClick={() => setInviteOpen(true)}><UserPlus /> {" "}{t("settingsCore.text077")}</Button>;
  const users = usersQuery.data?.items ?? [];

  return (
    <SettingsSection title={t("settingsCore.text078")} description={USERS_DESCRIPTION} actions={inviteAction}>
      {usersQuery.isLoading ? <Skeleton className="h-48 w-full" /> : usersQuery.isError ? (
        <ErrorState layout="section" onRetry={() => usersQuery.refetch()} />
      ) : users.length === 0 ? (
        <EmptyState layout="section" title={t("settingsCore.text079")} description={t("settingsCore.text080")} />
      ) : (
        <SettingsPanel bodyClassName="p-0">
          <ul className="divide-y divide-line md:hidden" aria-label={t("settingsCore.text078")}>
            {users.map((u) => (
              <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                <Monogram name={u.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">{u.name}</p>
                    <Badge variant={u.role === "owner" ? "ink" : "neutral"}>{roleLabel(t, u.role)}</Badge>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{u.email}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{branchCodes(u)} · {activity(u)}</p>
                </div>
                {canEdit(u) ? <Button variant="secondary" size="sm" aria-label={t("settingsCore.editAccessFor", { name: u.name })} data-touch-target onClick={() => setEditTarget(u)}><Pencil /> {" "}{t("settingsCore.text081")}</Button> : null}
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.label.name")}</TableHead>
                <TableHead>{t("common.label.role")}</TableHead>
                <TableHead>{t("settingsCore.text033")}</TableHead>
                <TableHead>{t("common.label.status")}</TableHead>
                <TableHead>{t("settingsCore.text082")}</TableHead>
                <TableHead><span className="sr-only">{t("common.label.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Monogram name={u.name} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium">{u.name}</p>
                        <p className="truncate text-[12px] text-ink-3">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={u.role === "owner" ? "ink" : "neutral"}>{roleLabel(t, u.role)}</Badge></TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{branchCodes(u)}</TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px] text-ink-3">{activity(u)}</TableCell>
                  <TableCell className="text-end">
                    {canEdit(u) ? (
                      <Button variant="ghost" size="icon-sm" aria-label={t("settingsCore.editAccessFor", { name: u.name })} data-touch-target onClick={() => setEditTarget(u)}>
                        <Pencil />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsPanel>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {editTarget ? (
        <EditAccessDialog
          user={editTarget}
          open
          onOpenChange={(v) => !v && setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await invalidate();
          }}
        />
      ) : null}
    </SettingsSection>
  );
}

function InviteUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const invalidate = useInvalidate();
  const { session } = useApp();
  const [form, setForm] = useState({ name: "", email: "", role: "receptionist" as RoleKey, branchScope: "selected" as "all" | "selected", branchIds: [] as string[] });

  useEffect(() => {
    if (open) setForm({ name: "", email: "", role: "receptionist", branchScope: "selected", branchIds: [] });
  }, [open, session]);

  const mutation = useApiMutation((api) => api.inviteUser(form), {
    onSuccess: async () => {
      toast.success(t("settingsCore.text083"));
      onOpenChange(false);
      // The staff list is not part of the default invalidation set, so the
      // new "invited" row must be requested explicitly.
      await invalidate([qk.users()]);
    },
    onError: (e) => toast.error(errorMessage(e, t("settingsCore.text084"))),
  });

  const needsBranches = form.branchScope === "selected" && form.branchIds.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settingsCore.text077")}</DialogTitle>
          <DialogDescription>{t("settingsCore.text085")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label={t("common.label.fullName")} required>
            <Input value={form.name} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label={t("common.label.email")} required hint={t("settingsCore.text086")}>
            <Input type="email" inputMode="email" autoComplete="off" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("common.label.role")}>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as RoleKey }))}>
                <SelectTrigger aria-label={t("common.label.role")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["manager", "salesperson", "receptionist", "trainer"] as RoleKey[]).map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(t, r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("settingsCore.text087")}>
              <Select value={form.branchScope} onValueChange={(v) => setForm((f) => ({ ...f, branchScope: v as "all" | "selected" }))}>
                <SelectTrigger aria-label={t("settingsCore.text087")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.label.allBranches")}</SelectItem>
                  <SelectItem value="selected">{t("settingsCore.text088")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {form.branchScope === "selected" ? (
            <Field label={t("settingsCore.text033")} hint={needsBranches ? t("settingsCore.text089") : undefined}>
              <div className="flex flex-wrap gap-2">
                {session?.branches.map((b) => {
                  const checked = form.branchIds.includes(b.id);
                  return (
                    <label key={b.id} className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] transition-colors", checked ? "border-ink bg-sunken text-ink" : "border-line-2 text-ink-2 hover:border-line-3")} data-touch-target>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          setForm((f) => ({ ...f, branchIds: value ? [...f.branchIds, b.id] : f.branchIds.filter((id) => id !== b.id) }))
                        }
                        aria-label={b.name}
                      />
                      {b.name}
                    </label>
                  );
                })}
              </div>
            </Field>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name.trim() || !form.email.trim() || needsBranches}>
            {" "}{t("settingsCore.text090")}{" "}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditAccessDialog({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: StaffUser;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [role, setRole] = useState<RoleKey>(user.role);
  const [status, setStatus] = useState(user.status === "deactivated" ? "deactivated" : "active");
  const deactivating = status === "deactivated" && user.status !== "deactivated";

  const mutation = useApiMutation(
    (api) => api.updateUserAccess(user.id, { role, status: status === "deactivated" ? "deactivated" : "active" }),
    {
      onSuccess: () => onSaved(),
      onError: (e) => toast.error(errorMessage(e, t("settingsCore.text091"))),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settingsCore.accessFor", { name: user.name })}</DialogTitle>
          <DialogDescription>{t("settingsCore.text092")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label={t("common.label.role")}>
            <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
              <SelectTrigger aria-label={t("common.label.role")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["manager", "salesperson", "receptionist", "trainer"] as RoleKey[]).map((r) => (
                  <SelectItem key={r} value={r}>{roleLabel(t, r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="rounded-md border border-line px-3">
            <SettingsToggleRow label={t("settingsCore.text093")} hint={t("settingsCore.text094")} checked={status === "active"} onCheckedChange={(v) => setStatus(v ? "active" : "deactivated")} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} variant={deactivating ? "danger" : "primary"}>
            {deactivating ? t("settingsCore.text095") : t("settingsCore.text096")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Roles & permissions matrix
// ---------------------------------------------------------------------------


export function RolesSection() {
  const t = useT();
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const roles = settingsQuery.data?.roles ?? [];
  const editableRoles = roles.filter((r) => r.key !== "owner");
  const [phoneRole, setPhoneRole] = useState<RoleKey | "">("");
  const selectedPhoneRole = editableRoles.find((r) => r.key === phoneRole) ?? editableRoles[0];

  const toggle = useApiMutation(
    (api, v: { role: RoleKey; permissions: string[] }) => api.updateRolePermissions(v.role, { permissions: v.permissions }),
    {
      onSuccess: async () => {
        toast.success(t("setup.accessUpdated"));
        await invalidate([qk.settings, qk.session]);
      },
      onError: (e) => toast.error(errorMessage(e, t("setup.accessUpdateFailed"))),
    },
  );

  if (settingsQuery.isLoading) return <SettingsSection title={t("setup.rolesTitle")} description={t("setup.rolesDescription")}><Skeleton className="h-96 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("setup.rolesTitle")} description={t("setup.rolesDescription")}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const flip = (role: (typeof editableRoles)[number], perm: string, checked: boolean) =>
    toggle.mutate({ role: role.key, permissions: checked ? [...role.permissions, perm] : role.permissions.filter((p) => p !== perm) });
  const pendingFor = (role: RoleKey) => toggle.isPending && toggle.variables?.role === role;

  return (
    <SettingsSection title={t("setup.rolesTitle")} description={t("setup.rolesDescription")}>
      {/* Phones: one role at a time, one permission per row. */}
      <div className="md:hidden">
        <SettingsPanel
          title={t("setup.accessByRole")}
          bodyClassName="p-0"
          control={
            <Select value={selectedPhoneRole?.key ?? ""} onValueChange={(value) => setPhoneRole(value as RoleKey)}>
              <SelectTrigger aria-label={t("setup.roleToEdit")} className="w-40"><SelectValue placeholder={t("setup.chooseRole")} /></SelectTrigger>
              <SelectContent>{editableRoles.map((r) => <SelectItem key={r.key} value={r.key}>{roleLabel(t, r.key)}</SelectItem>)}</SelectContent>
            </Select>
          }
        >
          {selectedPhoneRole ? (
            <div className="px-4">
              <p className="border-b border-line py-3 text-[12.5px] leading-5 text-ink-3">{selectedPhoneRole.isSystem ? roleDescription(t, selectedPhoneRole.key) : selectedPhoneRole.description}</p>
              <div className="divide-y divide-line">
                {PERMISSIONS.map((perm) => (
                  <SettingsToggleRow
                    key={perm}
                    label={permissionCopy(t, perm).label}
                    hint={permissionCopy(t, perm).hint}
                    checked={selectedPhoneRole.permissions.includes(perm)}
                    disabled={pendingFor(selectedPhoneRole.key)}
                    onCheckedChange={(checked) => flip(selectedPhoneRole, perm, checked)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </SettingsPanel>
      </div>

      {/* Tablets and desktops: the whole matrix at once. */}
      <div className="hidden md:block">
        <SettingsPanel title={t("setup.eachRole")} description={t("setup.accessHint")} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="sticky start-0 z-10 min-w-[240px] bg-surface px-4 py-2.5 text-start text-[11.5px] font-semibold text-ink-3">
                    {t("setup.accessColumn")}
                  </th>
                  {editableRoles.map((r) => (
                    <th key={r.key} scope="col" className="min-w-[96px] whitespace-nowrap px-3 py-2.5 text-center text-[11.5px] font-semibold text-ink-3">
                      {roleLabel(t, r.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="sticky start-0 z-10 bg-surface px-4 py-2 text-start font-normal">
                      <p className="text-[13px] font-medium text-ink">{permissionCopy(t, perm).label}</p>
                      <p className="text-[12px] leading-4 text-ink-3">{permissionCopy(t, perm).hint}</p>
                    </th>
                    {editableRoles.map((r) => {
                      const checked = r.permissions.includes(perm);
                      const pending = pendingFor(r.key);
                      return (
                        <td key={r.key} className="px-3 py-1 text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={checked}
                            aria-label={`${roleLabel(t, r.key)} — ${permissionCopy(t, perm).label}`}
                            disabled={pending}
                            aria-busy={pending || undefined}
                            data-touch-target
                            onClick={() => flip(r, perm, !checked)}
                            className="group inline-flex size-9 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-sunken disabled:cursor-progress disabled:opacity-60"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "inline-flex size-5 items-center justify-center rounded-sm border transition-colors",
                                checked ? "border-ink bg-ink text-paper" : "border-line-3 bg-surface group-hover:border-ink-3",
                              )}
                            >
                              {checked ? <Check className="size-3" /> : null}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsPanel>
      </div>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

type PaymentsForm = { methods: PaymentMethod[]; limits: Record<string, string> };

function limitsFromRoles(roles: Array<{ key: RoleKey; discountLimitMinor: number }>, currency: string): Record<string, string> {
  const next: Record<string, string> = {};
  for (const r of roles) next[r.key] = toMajorString(money(r.discountLimitMinor, currency));
  return next;
}

/** A discount limit in the gym's currency, read under the shared amount policy; zero is a valid limit. */
function parseLimit(value: string, currency: string): number | null {
  return parseMoneyInput(value, currency)?.amount ?? null;
}

export function PaymentsSection() {
  const { t, locale } = useLocale();
  const PAYMENTS_DESCRIPTION = t("settingsCore.text097");

  const invalidate = useInvalidate();
  const { session } = useApp();
  const currency = session?.organization.currency ?? "JOD";
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [form, setForm] = useState<PaymentsForm | null>(null);
  const [baseline, setBaseline] = useState<PaymentsForm | null>(null);
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const limitRoles = useMemo(() => (settingsQuery.data?.roles ?? []).filter((r) => r.key !== "owner" && r.key !== "trainer"), [settingsQuery.data?.roles]);

  useEffect(() => {
    if (!settingsQuery.data || dirtyRef.current) return;
    const next: PaymentsForm = { methods: settingsQuery.data.paymentMethods.map((m) => ({ ...m })), limits: limitsFromRoles(limitRoles, currency) };
    setForm(next);
    setBaseline(next);
  }, [currency, limitRoles, settingsQuery.data]);

  const save = useApiMutation(async (api) => {
    if (!form || !baseline) return;
    const saved: PaymentsForm = { methods: baseline.methods, limits: { ...baseline.limits } };
    const failures: Array<{ kind: "methods" | "limit"; role?: RoleKey; error: unknown }> = [];
    if (JSON.stringify(form.methods) !== JSON.stringify(baseline.methods)) {
      try {
        await api.updatePaymentMethods(form.methods);
        saved.methods = form.methods;
      } catch (error) {
        failures.push({ kind: "methods", error });
      }
    }
    for (const role of limitRoles) {
      if (form.limits[role.key] === baseline.limits[role.key]) continue;
      const minor = parseLimit(form.limits[role.key] ?? "", currency);
      if (minor === null) continue;
      try {
        await api.updateRolePermissions(role.key, { discountLimitMinor: minor });
        saved.limits[role.key] = toMajorString(money(minor, currency));
      } catch (error) {
        failures.push({ kind: "limit", role: role.key, error });
      }
    }
    setBaseline(saved);
    setForm((current) => current ? { ...current, limits: { ...current.limits, ...Object.fromEntries(Object.entries(saved.limits).filter(([key]) => form.limits[key] !== baseline.limits[key])) } } : current);
    if (failures.length > 0) throw ApiError.of("VALIDATION_ERROR", "Some payment settings could not be saved.", { message: { key: "apiErrors.paymentSettingsPartial" }, details: { settingsFailures: failures } });
  }, {
    onSuccess: async () => {
      toast.success(t("settingsCore.text098"));
      await invalidate([qk.settings]);
    },
    onError: async () => { await invalidate([qk.settings]); },
  });

  if (settingsQuery.isLoading || !form || !baseline) return <SettingsSection title={t("renewFlow.receipt.back")} description={PAYMENTS_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("renewFlow.receipt.back")} description={PAYMENTS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const failures = isApiError(save.error) ? save.error.details?.settingsFailures as Array<{ kind: "methods" | "limit"; role?: RoleKey; error: unknown }> | undefined : undefined;
  const failureMessage = failures?.map(failure => {
    const error = localizeApiError(failure.error, locale).message;
    return failure.kind === "methods" ? t("settingsCore.partialMethods", { error }) : t("settingsCore.partialLimit", { role: roleLabel(t, failure.role), error });
  }).join(" · ");
  const invalidLimit = limitRoles.some((role) => parseLimit(form.limits[role.key] ?? "", currency) === null);
  const noMethod = form.methods.every((m) => !m.enabled);
  const saveDisabledReason = invalidLimit ? t("settingsCore.text099") : noMethod ? t("settingsCore.text100") : undefined;

  return (
    <SettingsSection title={t("renewFlow.receipt.back")} description={PAYMENTS_DESCRIPTION}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingsPanel title={t("settingsCore.text101")} description={t("settingsCore.text102")} bodyClassName="px-4 py-1 sm:px-5">
          <div className="divide-y divide-line">
            {form.methods.map((m) => (
              <SettingsToggleRow
                key={m.key}
                label={paymentMethodLabel(t, m.key)}
                hint={m.affectsCashDrawer ? t("settingsCore.text103") : undefined}
                checked={m.enabled}
                onCheckedChange={(enabled) => setForm((current) => current ? { ...current, methods: current.methods.map((x) => (x.key === m.key ? { ...x, enabled } : x)) } : current)}
              />
            ))}
          </div>
        </SettingsPanel>

        <SettingsPanel title={t("settingsCore.text104")} description={t("settingsCore.text105")} bodyClassName="px-4 py-1 sm:px-5">
          <div className="divide-y divide-line">
            {limitRoles.map((r) => {
              const invalid = parseLimit(form.limits[r.key] ?? "", currency) === null;
              return (
                <div key={r.key} className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                  <label htmlFor={`discount-limit-${r.key}`} className="text-[13.5px] font-medium text-ink">{roleLabel(t, r.key)}</label>
                  <SettingsUnitInput
                    id={`discount-limit-${r.key}`}
                    unit={currency}
                    className="w-36"
                    inputMode="decimal"
                    aria-label={t("settingsCore.roleDiscountLimit", { role: roleLabel(t, r.key) })}
                    aria-invalid={invalid || undefined}
                    value={form.limits[r.key] ?? ""}
                    onChange={(e) => setForm((current) => current ? { ...current, limits: { ...current.limits, [r.key]: e.target.value } } : current)}
                  />
                </div>
              );
            })}
          </div>
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? failureMessage ?? errorMessage(save.error, t("settingsCore.text106")) : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel={t("settingsCore.text107")}
        guardTitle={t("settingsCore.text108")}
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Receipts & tax
// ---------------------------------------------------------------------------

export function ReceiptsSection() {
  const RECEIPTS_DESCRIPTION_KEY = "settingsCore.text109";
  const t = useT();
  const taxInputId = useId();
  const RECEIPTS_DESCRIPTION = t(RECEIPTS_DESCRIPTION_KEY);
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const org = settingsQuery.data?.organization;
  const [form, setForm] = useState({ receiptPrefix: "R-", receiptFooter: "", taxRatePercent: "0" });
  const [baseline, setBaseline] = useState<typeof form | null>(null);
  const dirty = Boolean(baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!org || dirtyRef.current) return;
    const next = { receiptPrefix: org.receiptPrefix, receiptFooter: org.receiptFooter, taxRatePercent: String(org.taxRatePercent) };
    setForm(next);
    setBaseline(next);
  }, [org]);

  const tax = readSettingsNumber(form.taxRatePercent, { min: 0, max: 30, decimalPlaces: "any" });
  const save = useApiMutation(
    (api) => {
      if (tax === null) throw ApiError.of("VALIDATION_ERROR", "Check the highlighted fields and try again.", { message: { key: "apiErrors.validation" } });
      return api.updateOrganizationSettings({ receiptPrefix: form.receiptPrefix, receiptFooter: form.receiptFooter, taxRatePercent: tax });
    },
    {
      onSuccess: async () => {
        toast.success(t("settingsCore.text110"));
        await invalidate([qk.settings]);
      },
    },
  );

  if (settingsQuery.isLoading) return <SettingsSection title={t("settingsCore.text111")} description={RECEIPTS_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("settingsCore.text111")} description={RECEIPTS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const commit = async () => {
    if (tax === null || !form.receiptPrefix.trim()) return;
    await save.mutateAsync();
    setBaseline(form);
  };
  const taxInvalid = tax === null;
  const prefixInvalid = form.receiptPrefix.trim().length === 0;
  const saveDisabledReason = prefixInvalid ? t("settingsCore.text112") : taxInvalid ? t("settingsCore.text113") : undefined;

  return (
    <SettingsSection title={t("settingsCore.text111")} description={RECEIPTS_DESCRIPTION}>
      <SettingsPanel className="max-w-3xl" title={t("settingsCore.text114")} description={<>{t("settingsCore.text115")}{" "}<span className="font-mono text-ink">{org?.receiptPrefix}{org?.nextReceiptNumber}</span></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settingsCore.text116")} required hint={t("settingsCore.text117")} error={prefixInvalid ? t("settingsCore.text112") : undefined}>
            <Input value={form.receiptPrefix} aria-invalid={prefixInvalid || undefined} onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value }))} className="w-32 font-mono" maxLength={6} />
          </Field>
          <Field htmlFor={taxInputId} label={t("settingsCore.text118")} hint={t("settingsCore.text119")} error={taxInvalid ? t("settingsCore.text120") : undefined}>
            <SettingsUnitInput id={taxInputId} aria-describedby={`${taxInputId}-${taxInvalid ? "error" : "hint"}`} unit="%" type="text" dir="ltr" aria-label={t("settingsCore.text118")} inputMode="decimal" className="w-32" aria-invalid={taxInvalid || undefined} value={form.taxRatePercent} onChange={(e) => setForm((f) => ({ ...f, taxRatePercent: toWesternDigits(e.target.value) }))} />
          </Field>
        </div>
        <Field label={t("settingsCore.text121")} hint={t("settingsCore.text122")} className="mt-4"><Textarea rows={2} value={form.receiptFooter} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} /></Field>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? errorMessage(save.error, t("settingsCore.text123")) : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel={t("settingsCore.text124")}
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function NotificationsSection() {
  const t = useT();
  const NOTIFICATIONS_DESCRIPTION = t("settingsCore.text125");

  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const notifications = settingsQuery.data?.notifications;
  const [form, setForm] = useState<NotificationSettings | null>(null);
  const [baseline, setBaseline] = useState<NotificationSettings | null>(null);
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!notifications || dirtyRef.current) return;
    const next: NotificationSettings = {
      ...notifications,
      managerAlerts: { ...notifications.managerAlerts },
      renewalRecoveryEnabled: notifications.renewalRecoveryEnabled === true,
      quietHoursStart: notifications.quietHoursStart ?? "22:00",
      quietHoursEnd: notifications.quietHoursEnd ?? "07:00",
    };
    setForm(next);
    setBaseline(next);
  }, [notifications]);

  const save = useApiMutation((api, v: NotificationSettings) => api.updateNotificationSettings(v), {
    onSuccess: async () => {
      toast.success(t("settingsCore.text126"));
      await invalidate([qk.settings]);
    },
  });

  if (settingsQuery.isLoading || !form || !baseline) return <SettingsSection title={t("palette.notifications.title")} description={NOTIFICATIONS_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title={t("palette.notifications.title")} description={NOTIFICATIONS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const alerts = form.managerAlerts;
  const alertRows: Array<{ key: keyof typeof alerts; label: string; hint: string }> = [
    { key: "cashVariance", label: t("dashboard.today.kind.cash_variance"), hint: t("settingsCore.text127") },
    { key: "refundOrVoid", label: t("settingsCore.text128"), hint: t("settingsCore.text129") },
    { key: "checkinOverride", label: t("settingsCore.text130"), hint: t("settingsCore.text131") },
    { key: "discountApproval", label: t("settingsCore.text132"), hint: t("settingsCore.text133") },
  ];
  const update = (patch: Partial<NotificationSettings>) => setForm((current) => current ? { ...current, ...patch } : current);
  const quietInvalid = !form.quietHoursStart || !form.quietHoursEnd;
  const commit = async () => {
    await save.mutateAsync(form);
    setBaseline(form);
  };

  return (
    <SettingsSection title={t("palette.notifications.title")} description={NOTIFICATIONS_DESCRIPTION}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingsPanel title={t("settingsCore.text134")} description={t("settingsCore.text135")} bodyClassName="px-4 py-1 sm:px-5">
          <div className="divide-y divide-line">
            {alertRows.map((row) => (
              <SettingsToggleRow
                key={row.key}
                label={row.label}
                hint={row.hint}
                checked={alerts[row.key]}
                onCheckedChange={(v) => update({ managerAlerts: { ...alerts, [row.key]: v } })}
              />
            ))}
          </div>
        </SettingsPanel>

        <SettingsPanel title={t("settingsCore.text136")} description={t("settingsCore.text137")} bodyClassName="px-4 py-1 sm:px-5">
          <MessagingStatusPanel />
          <div className="divide-y divide-line">
            <SettingsToggleRow
              label={t("settingsCore.text138")}
              hint={t("settingsCore.text139")}
              checked={form.renewalRecoveryEnabled === true}
              onCheckedChange={(enabled) => update({ renewalRecoveryEnabled: enabled })}
            />
            <SettingsToggleRow
              label={t("settingsCore.text140")}
              hint={form.automationDeliveryMode === "live" ? t("settingsCore.text141") : t("settingsCore.text142")}
              checked={form.automationDeliveryMode === "live"}
              onCheckedChange={(enabled) => update({ automationDeliveryMode: enabled ? "live" : "sandbox" })}
            />
          </div>
          <div className="border-t border-line py-4">
            <p className="text-[13.5px] font-medium text-ink">{t("settingsCore.text143")}</p>
            <p className="mt-0.5 text-[12px] leading-5 text-ink-3">{t("settingsCore.text144")}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label={t("common.label.from")}>
                <Input type="time" value={form.quietHoursStart ?? ""} aria-label={t("settingsCore.text145")} onChange={(e) => update({ quietHoursStart: e.target.value })} />
              </Field>
              <Field label={t("common.label.to")}>
                <Input type="time" value={form.quietHoursEnd ?? ""} aria-label={t("settingsCore.text146")} onChange={(e) => update({ quietHoursEnd: e.target.value })} />
              </Field>
            </div>
          </div>
          <MessageTemplateCatalogue />
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={quietInvalid}
        saveDisabledReason={quietInvalid ? t("settingsCore.text147") : undefined}
        error={save.isError ? errorMessage(save.error, t("settingsCore.text148")) : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel={t("settingsCore.text149")}
        guardTitle={t("settingsCore.text150")}
      />
    </SettingsSection>
  );
}



function MessagingStatusPanel() {
  const t = useT();
  const MESSAGING_MODE_LABELS: Record<string, string> = { off: t("settingsCore.text151"), sandbox: t("settingsCore.text152"), allowlist: t("settingsCore.text153"), live: t("settingsCore.text154") };

  const status = useApiQuery(["settings", "messaging-status"], (api) => api.getMessagingStatus());
  if (!status.data) return null;
  const value = status.data;
  return (
    <div className="my-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-sunken/60 px-3 py-2 text-[12.5px] text-ink-2" data-testid="messaging-status">
      <span className="text-ink-3">{t("settingsCore.text155")}</span>
      <Badge variant={value.mode === "live" ? "success" : value.mode === "off" ? "neutral" : "warning"} dot>{MESSAGING_MODE_LABELS[value.mode] ?? value.mode}</Badge>
      <span className="text-ink-3">{value.provider === "twilio" ? (value.whatsappReady ? t("settingsCore.text156") : t("settingsCore.text157")) : t("settingsCore.text158")}</span>
      {value.warning ? <span className="text-warning-deep">{t("settingsCore.messagingModeWarning")}</span> : null}
    </div>
  );
}


const CHANNEL_LABELS: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS" };

function MessageTemplateCatalogue() {
  const t = useT();
  const TEMPLATE_FAMILY_LABELS: Record<string, string> = { renewal: t("settingsCore.text159"), payment: t("settingsCore.text160"), class: t("settingsCore.text161"), entry: t("settingsCore.text162") };

  const catalogue = useApiQuery(["settings", "message-template-catalogue"], (api) => api.listMessageTemplateCatalogue());
  const [open, setOpen] = useState(false);
  if (!catalogue.data?.length) return null;
  return (
    <div className="border-t border-line py-3">
      <button type="button" className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-3 text-start text-[13.5px] font-medium text-ink" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>{t("settingsCore.text163")}{" "}<span className="font-normal text-ink-3">· {t("settingsCore.templateCount", { count: catalogue.data.length })}</span></span>
        <span className="text-[12.5px] font-normal text-ink-3">{open ? t("settingsCore.text164") : t("settingsCore.text165")}</span>
      </button>
      {open ? (
        <ul className="mt-2 divide-y divide-line" data-testid="message-template-catalogue">
          {catalogue.data.map((template) => (
            <li key={template.key} className="py-3 text-[12.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{templateName(t, template.key, template.name)}</span><span className="text-[12px] text-ink-3">{TEMPLATE_FAMILY_LABELS[template.family] ?? template.family} · {template.channels.map((channel) => CHANNEL_LABELS[channel] ?? channel).join(", ")}</span></div>
              <p className="mt-1.5 leading-5 text-ink-2">{template.bodyEn}</p>
              <p className="mt-1 leading-5 text-ink-2" dir="rtl">{template.bodyAr}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operational rules and hours
// ---------------------------------------------------------------------------
export { HoursAndTrialsSection, OperationalRulesSection, normalizeOperationalPolicies } from "@/features/settings/operational-settings-sections";

function templateName(t: TFunction, key: string, fallback: string): string {
  const names: Record<string, string> = {
    renewal_7d: t("settingsCore.templateRenewal7"), renewal_3d: t("settingsCore.templateRenewal3"),
    renewal_today: t("settingsCore.templateRenewalToday"), renewal_expired_3d: t("settingsCore.templateRenewalExpired"),
    payment_due_3d: t("settingsCore.templatePayment3"), payment_due_today: t("settingsCore.templatePaymentToday"),
    payment_overdue_3d: t("settingsCore.templatePaymentOverdue"), class_booking_confirmation: t("settingsCore.templateClassConfirmation"),
    class_reminder: t("settingsCore.templateClassReminder"), entry_pass: t("settingsCore.templateEntry"),
  };
  return names[key] ?? fallback;
}
