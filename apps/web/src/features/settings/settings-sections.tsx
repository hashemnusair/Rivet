"use client";

import { Check, Pencil, Plus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError, isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { PERMISSIONS, PERMISSION_LABELS, ROLE_LABELS } from "@/lib/domain/permissions";
import type { Branch, NotificationSettings, PaymentMethod, RoleKey, StaffUser, Zone, ZoneKind } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/dates";
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

const RECORD_STATUS: Record<string, { label: string; variant: "success" | "neutral" | "warning" | "outline" }> = {
  active: { label: "Active", variant: "success" },
  inactive: { label: "Inactive", variant: "neutral" },
  archived: { label: "Archived", variant: "neutral" },
  invited: { label: "Invited", variant: "warning" },
  deactivated: { label: "Deactivated", variant: "outline" },
};

function StatusBadge({ status }: { status: string }) {
  const value = RECORD_STATUS[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={value.variant}>{value.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------
const ORGANIZATION_DESCRIPTION = "Identity and locale for the whole gym. Currency is fixed to JOD for this deployment.";

export function OrganizationSection() {
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
      toast.success("Organization settings saved — audited.");
      await invalidate([qk.settings]);
    },
  });

  if (settingsQuery.isLoading) return <SettingsSection title="Organization" description={ORGANIZATION_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Organization" description={ORGANIZATION_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const commit = async () => {
    await save.mutateAsync();
    setBaseline(form);
  };
  const nameMissing = form.name.trim().length === 0;

  return (
    <SettingsSection title="Organization" description={ORGANIZATION_DESCRIPTION}>
      <SettingsPanel className="max-w-3xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name" required error={nameMissing ? "Enter the gym's name." : undefined}><Input value={form.name} aria-invalid={nameMissing || undefined} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Timezone" hint="Shift, report and reminder times follow this zone."><Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}><SelectTrigger aria-label="Timezone"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Asia/Amman">Asia/Amman (UTC+3)</SelectItem><SelectItem value="Asia/Riyadh">Asia/Riyadh (UTC+3)</SelectItem><SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem></SelectContent></Select></Field>
          <Field label="Locale" hint="Number and date formatting across the workspace."><Select value={form.locale} onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}><SelectTrigger aria-label="Locale"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en-JO">English (Jordan)</SelectItem><SelectItem value="ar-JO">العربية (الأردن)</SelectItem></SelectContent></Select></Field>
          <Field label="Default phone country" hint="Used only for local numbers. Numbers beginning with + or 00 keep their own country code."><div className="relative"><span className="pointer-events-none absolute inset-y-0 start-3 flex items-center font-mono text-[13px] text-ink-3" aria-hidden>+</span><Input className="ps-7 font-mono" inputMode="numeric" aria-label="Default phone country calling code" value={form.phoneCountryCallingCode} onChange={(event) => setForm((current) => ({ ...current, phoneCountryCallingCode: event.target.value.replace(/\D/g, "").slice(0, 3) }))} /></div></Field>
          <Field label="Language for emails and documents" hint="Every email RIVET sends to this gym, and the copies of its agreement, use this language. PDFs are English."><Select value={form.defaultLanguage} onValueChange={(v) => setForm((f) => ({ ...f, defaultLanguage: v as "en" | "ar" }))}><SelectTrigger aria-label="Default language"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent></Select></Field>
        </div>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={nameMissing}
        saveDisabledReason={nameMissing ? "Enter the gym's name before saving." : undefined}
        error={save.isError ? errorMessage(save.error, "The organization settings could not be saved. Try again.") : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel="Save organization"
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
const BRANCHES_DESCRIPTION = "The gym's physical locations. Each branch code prefixes its member numbers and appears on receipts.";

export function BranchesSection() {
  const invalidate = useInvalidate();
  const { refreshSession } = useApp();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [dialog, setDialog] = useState<{ open: boolean; branch?: Branch }>({ open: false });
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", capacity: 100, status: "active" as "active" | "inactive" });

  useEffect(() => {
    if (dialog.open) {
      setForm(
        dialog.branch
          ? { name: dialog.branch.name, code: dialog.branch.code, address: dialog.branch.address, phone: dialog.branch.phone, capacity: dialog.branch.capacity, status: dialog.branch.status }
          : { name: "", code: "", address: "", phone: "", capacity: 100, status: "active" },
      );
    }
  }, [dialog]);

  const save = useApiMutation(
    (api) => api.upsertBranch({ id: dialog.branch?.id, ...form, capacity: Number(form.capacity) }),
    {
      onSuccess: async () => {
        toast.success(dialog.branch ? "Branch updated." : "Branch created.");
        setDialog({ open: false });
        await invalidate([qk.settings, qk.session, qk.branches]);
        await refreshSession();
      },
      onError: (e) => toast.error(errorMessage(e, "Could not save the branch.")),
    },
  );

  const addAction = <Button onClick={() => setDialog({ open: true })}><Plus /> Add branch</Button>;

  if (settingsQuery.isLoading) return <SettingsSection title="Branches" description={BRANCHES_DESCRIPTION} actions={addAction}><Skeleton className="h-48 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Branches" description={BRANCHES_DESCRIPTION} actions={addAction}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const branches = settingsQuery.data?.branches ?? [];

  return (
    <SettingsSection title="Branches" description={BRANCHES_DESCRIPTION} actions={addAction}>
      {branches.length === 0 ? (
        <EmptyState layout="section" title="No branches yet" description="Add the first branch to start selling memberships and checking members in." action={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> Add branch</Button>} />
      ) : (
        <SettingsPanel className="max-w-4xl" bodyClassName="p-0">
          <ul className="divide-y divide-line md:hidden" aria-label="Branches">
            {branches.map((b) => (
              <li key={b.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">{b.name}</p>
                    <span className="font-mono text-[12px] text-ink-2">{b.code}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">{b.address || "No address recorded"}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">Capacity <span className="tabular">{b.capacity}</span>{b.phone ? <> · <span dir="ltr">{b.phone}</span></> : null}</p>
                </div>
                <Button variant="secondary" size="sm" aria-label={`Edit ${b.name}`} data-touch-target onClick={() => setDialog({ open: true, branch: b })}><Pencil /> Edit</Button>
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-end">Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="font-mono text-[12px]">{b.code}</TableCell>
                  <TableCell className="max-w-64 truncate text-[12.5px] text-ink-2">{b.address}</TableCell>
                  <TableCell className="text-end tabular">{b.capacity}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-end">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${b.name}`} data-touch-target onClick={() => setDialog({ open: true, branch: b })}>
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
            <DialogTitle>{dialog.branch ? `Edit ${dialog.branch.name}` : "New branch"}</DialogTitle>
            <DialogDescription>Branch codes appear on member numbers and receipts.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
              <Field label="Name" required>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Forge — Khalda" />
              </Field>
              <Field label="Code" required hint="Up to 4 letters">
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="font-mono uppercase" maxLength={4} placeholder="KHA" />
              </Field>
            </div>
            <Field label="Address">
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Phone">
                <Input dir="ltr" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="Capacity">
                <Input type="number" min={1} inputMode="numeric" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "active" | "inactive" }))}>
                  <SelectTrigger aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim() || !form.code.trim()}>
              {dialog.branch ? "Save branch" : "Create branch"}
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
const SPACE_KIND_LABELS: Record<ZoneKind, string> = {
  floor: "General floor",
  studio: "Studio",
  weights: "Weights floor",
  cardio: "Cardio area",
  functional: "Functional training",
  locker_room: "Locker room",
  bathroom: "Bathroom",
  reception: "Reception",
  storage: "Storage",
  other: "Other",
};

const SPACES_DESCRIPTION = "The places inside a branch—for example Reception, Main floor, Studio, or Locker room. RIVET uses them to locate maintenance work and equipment.";

function newSpaceCode(): string {
  return `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function GymSpacesSection() {
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
  const save = useApiMutation(
    (api) => api.upsertZone({
      id: dialog.space?.id,
      branchId,
      code: dialog.space?.code ?? newSpaceCode(),
      name: form.name.trim(),
      kind: form.kind,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      status: form.status,
    }),
    {
      onSuccess: async () => {
        toast.success(dialog.space ? "Gym space updated." : "Gym space added.");
        setDialog({ open: false });
        await invalidate([qk.operations()]);
      },
      onError: (error) => toast.error(errorMessage(error, "Could not save this gym space.")),
    },
  );

  const addAction = <Button onClick={() => setDialog({ open: true })} disabled={!branchId}><Plus /> Add gym space</Button>;

  if (settingsQuery.isLoading) return <SettingsSection title="Gym spaces" description={SPACES_DESCRIPTION} actions={addAction}><Skeleton className="h-48 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Gym spaces" description={SPACES_DESCRIPTION} actions={addAction}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const branchName = activeBranches.find((branch) => branch.id === branchId)?.name;
  const spaces = spacesQuery.data ?? [];

  return (
    <SettingsSection title="Gym spaces" description={SPACES_DESCRIPTION} actions={addAction}>
      {activeBranches.length === 0 ? (
        <EmptyState layout="section" title="No active branches" description="Add or reactivate a branch under Branches before describing the spaces inside it." />
      ) : (
        <SettingsPanel
          className="max-w-4xl"
          bodyClassName="p-0"
          title={branchName ? `Spaces in ${branchName}` : "Spaces"}
          control={
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
              <span>Branch</span>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger aria-label="Gym spaces branch" className="w-52"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
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
              title="No gym spaces in this branch"
              description="Add the few places employees already use when describing where work happened. You can keep this simple."
              action={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> Add first gym space</Button>}
            />
          ) : null}
          {spaces.length > 0 ? (
            <>
              <ul className="divide-y divide-line md:hidden" aria-label="Gym spaces">
                {spaces.map((space) => (
                  <li key={space.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="text-[13.5px] font-medium">{space.name}</p><StatusBadge status={space.status} /></div>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">{SPACE_KIND_LABELS[space.kind]}{space.capacity ? <> · capacity <span className="tabular">{space.capacity.toLocaleString()}</span></> : null}</p>
                    </div>
                    <Button variant="secondary" size="sm" aria-label={`Edit ${space.name}`} data-touch-target onClick={() => setDialog({ open: true, space })}><Pencil /> Edit</Button>
                  </li>
                ))}
              </ul>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-end">Capacity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead><span className="sr-only">Edit</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spaces.map((space) => (
                    <TableRow key={space.id}>
                      <TableCell className="font-medium">{space.name}</TableCell>
                      <TableCell className="text-[12.5px] text-ink-2">{SPACE_KIND_LABELS[space.kind]}</TableCell>
                      <TableCell className="text-end tabular">{space.capacity?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={space.status} /></TableCell>
                      <TableCell className="text-end"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${space.name}`} data-touch-target onClick={() => setDialog({ open: true, space })}><Pencil /></Button></TableCell>
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
            <DialogTitle>{dialog.space ? `Edit ${dialog.space.name}` : "Add gym space"}</DialogTitle>
            <DialogDescription>{branchName ? `In ${branchName}. ` : ""}Use the everyday name employees will recognize immediately.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Name" required hint="For example: Reception, Main floor, Ladies studio, or Locker room.">
              <Input autoFocus value={form.name} maxLength={80} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main floor" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" required>
                <Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value as ZoneKind }))}>
                  <SelectTrigger aria-label="Gym space type"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SPACE_KIND_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Capacity" hint="Optional">
                <Input type="number" min={1} max={100000} inputMode="numeric" value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))} />
              </Field>
              {dialog.space ? (
                <Field label="Status">
                  <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as "active" | "archived" }))}>
                    <SelectTrigger aria-label="Gym space status"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
                  </Select>
                </Field>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!branchId || !form.name.trim() || (form.capacity !== "" && Number(form.capacity) < 1)}>{dialog.space ? "Save changes" : "Add gym space"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const USERS_DESCRIPTION = "Who can sign in, the role they hold and the branches they see. Invitations, role changes and deactivation are audited.";

export function UsersSection() {
  const invalidate = useInvalidate();
  const { session } = useApp();
  const usersQuery = useApiQuery(qk.users({ settings: true }), (api) => api.listUsers({ pageSize: 50 }));
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);

  const branchCodes = (user: StaffUser) => user.branchScope === "all"
    ? "All branches"
    : user.branchIds.map((id) => settingsQuery.data?.branches.find((b) => b.id === id)?.code).filter(Boolean).join(", ") || "No branch";
  const canEdit = (user: StaffUser) => user.role !== "owner" && user.id !== session?.user.id;
  const activity = (user: StaffUser) => user.status === "invited"
    ? <>Invited {user.invitedAt ? formatDateTime(user.invitedAt) : "recently"}</>
    : user.lastActiveAt ? <>Active <RelativeText iso={user.lastActiveAt} /></> : <>Not active yet</>;

  const inviteAction = <Button onClick={() => setInviteOpen(true)}><UserPlus /> Invite user</Button>;
  const users = usersQuery.data?.items ?? [];

  return (
    <SettingsSection title="Users" description={USERS_DESCRIPTION} actions={inviteAction}>
      {usersQuery.isLoading ? <Skeleton className="h-48 w-full" /> : usersQuery.isError ? (
        <ErrorState layout="section" onRetry={() => usersQuery.refetch()} />
      ) : users.length === 0 ? (
        <EmptyState layout="section" title="No staff accounts yet" description="Invite the first colleague. They appear as invited until they sign in." />
      ) : (
        <SettingsPanel bodyClassName="p-0">
          <ul className="divide-y divide-line md:hidden" aria-label="Staff">
            {users.map((u) => (
              <li key={u.id} className="flex items-start gap-3 px-4 py-3">
                <Monogram name={u.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-medium">{u.name}</p>
                    <Badge variant={u.role === "owner" ? "ink" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{u.email}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{branchCodes(u)} · {activity(u)}</p>
                </div>
                {canEdit(u) ? <Button variant="secondary" size="sm" aria-label={`Edit access for ${u.name}`} data-touch-target onClick={() => setEditTarget(u)}><Pencil /> Access</Button> : null}
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
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
                  <TableCell><Badge variant={u.role === "owner" ? "ink" : "neutral"}>{ROLE_LABELS[u.role]}</Badge></TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{branchCodes(u)}</TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px] text-ink-3">{activity(u)}</TableCell>
                  <TableCell className="text-end">
                    {canEdit(u) ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit access for ${u.name}`} data-touch-target onClick={() => setEditTarget(u)}>
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
  const invalidate = useInvalidate();
  const { session } = useApp();
  const [form, setForm] = useState({ name: "", email: "", role: "receptionist" as RoleKey, branchScope: "selected" as "all" | "selected", branchIds: [] as string[] });

  useEffect(() => {
    if (open) setForm({ name: "", email: "", role: "receptionist", branchScope: "selected", branchIds: [] });
  }, [open, session]);

  const mutation = useApiMutation((api) => api.inviteUser(form), {
    onSuccess: async () => {
      toast.success("Invitation created. Its current status is available in the staff list.");
      onOpenChange(false);
      await invalidate();
    },
    onError: (e) => toast.error(errorMessage(e, "Invite failed.")),
  });

  const needsBranches = form.branchScope === "selected" && form.branchIds.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They appear as invited until they sign in. Access is enforced by role and branch scope.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Full name" required>
            <Input value={form.name} autoComplete="off" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email" required hint="The invitation is sent here.">
            <Input type="email" inputMode="email" autoComplete="off" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as RoleKey }))}>
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["manager", "salesperson", "receptionist", "trainer"] as RoleKey[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Branch scope">
              <Select value={form.branchScope} onValueChange={(v) => setForm((f) => ({ ...f, branchScope: v as "all" | "selected" }))}>
                <SelectTrigger aria-label="Branch scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  <SelectItem value="selected">Selected branches</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {form.branchScope === "selected" ? (
            <Field label="Branches" hint={needsBranches ? "Choose at least one branch." : undefined}>
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
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name.trim() || !form.email.trim() || needsBranches}>
            Send invite
          </Button>
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
  const [role, setRole] = useState<RoleKey>(user.role);
  const [status, setStatus] = useState(user.status === "deactivated" ? "deactivated" : "active");
  const deactivating = status === "deactivated" && user.status !== "deactivated";

  const mutation = useApiMutation(
    (api) => api.updateUserAccess(user.id, { role, status: status === "deactivated" ? "deactivated" : "active" }),
    {
      onSuccess: () => onSaved(),
      onError: (e) => toast.error(errorMessage(e, "Could not update access.")),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access for {user.name}</DialogTitle>
          <DialogDescription>Role and account state changes take effect immediately and are audited.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Role">
            <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["manager", "salesperson", "receptionist", "trainer"] as RoleKey[]).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="rounded-md border border-line px-3">
            <SettingsToggleRow label="Account active" hint="Deactivated users lose all access immediately. Their history stays on record." checked={status === "active"} onCheckedChange={(v) => setStatus(v ? "active" : "deactivated")} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} variant={deactivating ? "danger" : "primary"}>
            {deactivating ? "Deactivate and save" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Roles & permissions matrix
// ---------------------------------------------------------------------------
const ROLES_DESCRIPTION = "What each role may do. System roles are defaults you can tune; the owner role always has full access. Changes apply to new sessions and are audited.";

export function RolesSection() {
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
        toast.success("Permissions updated — audited.");
        await invalidate([qk.settings, qk.session]);
      },
      onError: (e) => toast.error(errorMessage(e, "Could not update permissions.")),
    },
  );

  if (settingsQuery.isLoading) return <SettingsSection title="Roles & permissions" description={ROLES_DESCRIPTION}><Skeleton className="h-96 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Roles & permissions" description={ROLES_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const flip = (role: (typeof editableRoles)[number], perm: string, checked: boolean) =>
    toggle.mutate({ role: role.key, permissions: checked ? [...role.permissions, perm] : role.permissions.filter((p) => p !== perm) });
  const pendingFor = (role: RoleKey) => toggle.isPending && toggle.variables?.role === role;

  return (
    <SettingsSection title="Roles & permissions" description={ROLES_DESCRIPTION}>
      {/* Phones: one role at a time, one permission per row. */}
      <div className="md:hidden">
        <SettingsPanel
          title="Permissions by role"
          bodyClassName="p-0"
          control={
            <Select value={selectedPhoneRole?.key ?? ""} onValueChange={(value) => setPhoneRole(value as RoleKey)}>
              <SelectTrigger aria-label="Role to edit" className="w-40"><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent>{editableRoles.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          }
        >
          {selectedPhoneRole ? (
            <div className="px-4">
              <p className="border-b border-line py-3 text-[12.5px] leading-5 text-ink-3">{selectedPhoneRole.description}</p>
              <div className="divide-y divide-line">
                {PERMISSIONS.map((perm) => (
                  <SettingsToggleRow
                    key={perm}
                    label={PERMISSION_LABELS[perm].label}
                    hint={PERMISSION_LABELS[perm].hint}
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
        <SettingsPanel title="Permission matrix" description="Tick a cell to grant that role the permission. Each change is saved as you make it." bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="sticky start-0 z-10 min-w-[240px] bg-surface px-4 py-2.5 text-start text-[11.5px] font-semibold text-ink-3">
                    Permission
                  </th>
                  {editableRoles.map((r) => (
                    <th key={r.key} scope="col" className="min-w-[96px] whitespace-nowrap px-3 py-2.5 text-center text-[11.5px] font-semibold text-ink-3">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="sticky start-0 z-10 bg-surface px-4 py-2 text-start font-normal">
                      <p className="text-[13px] font-medium text-ink">{PERMISSION_LABELS[perm].label}</p>
                      <p className="text-[12px] leading-4 text-ink-3">{PERMISSION_LABELS[perm].hint}</p>
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
                            aria-label={`${r.label} — ${PERMISSION_LABELS[perm].label}`}
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
const PAYMENTS_DESCRIPTION = "Which payment methods the desk can use, and how much discount each role may give without a manager's approval.";

type PaymentsForm = { methods: PaymentMethod[]; limits: Record<string, string> };

function limitsFromRoles(roles: Array<{ key: RoleKey; discountLimitMinor: number }>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const r of roles) next[r.key] = (r.discountLimitMinor / 1000).toFixed(3);
  return next;
}

function parseLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 1000) : null;
}

export function PaymentsSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [form, setForm] = useState<PaymentsForm | null>(null);
  const [baseline, setBaseline] = useState<PaymentsForm | null>(null);
  const dirty = Boolean(form && baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const limitRoles = useMemo(() => (settingsQuery.data?.roles ?? []).filter((r) => r.key !== "owner" && r.key !== "trainer"), [settingsQuery.data?.roles]);

  useEffect(() => {
    if (!settingsQuery.data || dirtyRef.current) return;
    const next: PaymentsForm = { methods: settingsQuery.data.paymentMethods.map((m) => ({ ...m })), limits: limitsFromRoles(limitRoles) };
    setForm(next);
    setBaseline(next);
  }, [limitRoles, settingsQuery.data]);

  const save = useApiMutation(async (api) => {
    if (!form || !baseline) return;
    const saved: PaymentsForm = { methods: baseline.methods, limits: { ...baseline.limits } };
    const failures: string[] = [];
    if (JSON.stringify(form.methods) !== JSON.stringify(baseline.methods)) {
      try {
        await api.updatePaymentMethods(form.methods);
        saved.methods = form.methods;
      } catch (error) {
        failures.push(`Payment methods: ${errorMessage(error, "not saved")}`);
      }
    }
    for (const role of limitRoles) {
      if (form.limits[role.key] === baseline.limits[role.key]) continue;
      const minor = parseLimit(form.limits[role.key] ?? "");
      if (minor === null) continue;
      try {
        await api.updateRolePermissions(role.key, { discountLimitMinor: minor });
        saved.limits[role.key] = (minor / 1000).toFixed(3);
      } catch (error) {
        failures.push(`${role.label} limit: ${errorMessage(error, "not saved")}`);
      }
    }
    setBaseline(saved);
    setForm((current) => current ? { ...current, limits: { ...current.limits, ...Object.fromEntries(Object.entries(saved.limits).filter(([key]) => form.limits[key] !== baseline.limits[key])) } } : current);
    if (failures.length > 0) throw ApiError.of("VALIDATION_ERROR", failures.join(" · "));
  }, {
    onSuccess: async () => {
      toast.success("Payment settings saved — audited.");
      await invalidate([qk.settings]);
    },
    onError: async () => { await invalidate([qk.settings]); },
  });

  if (settingsQuery.isLoading || !form || !baseline) return <SettingsSection title="Payments" description={PAYMENTS_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Payments" description={PAYMENTS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const invalidLimit = limitRoles.some((role) => parseLimit(form.limits[role.key] ?? "") === null);
  const noMethod = form.methods.every((m) => !m.enabled);
  const saveDisabledReason = invalidLimit ? "Enter a discount limit of 0 or more for every role." : noMethod ? "Keep at least one payment method enabled." : undefined;

  return (
    <SettingsSection title="Payments" description={PAYMENTS_DESCRIPTION}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingsPanel title="Payment methods" description="Disabled methods disappear from every collect and checkout flow." bodyClassName="px-4 py-1 sm:px-5">
          <div className="divide-y divide-line">
            {form.methods.map((m) => (
              <SettingsToggleRow
                key={m.key}
                label={m.label}
                hint={m.affectsCashDrawer ? "Counts toward the cash drawer and shift totals." : undefined}
                checked={m.enabled}
                onCheckedChange={(enabled) => setForm((current) => current ? { ...current, methods: current.methods.map((x) => (x.key === m.key ? { ...x, enabled } : x)) } : current)}
              />
            ))}
          </div>
        </SettingsPanel>

        <SettingsPanel title="Discount approval limits" description="Discounts beyond a role's limit are recorded as pending manager approval." bodyClassName="px-4 py-1 sm:px-5">
          <div className="divide-y divide-line">
            {limitRoles.map((r) => {
              const invalid = parseLimit(form.limits[r.key] ?? "") === null;
              return (
                <div key={r.key} className="flex min-h-11 items-center justify-between gap-4 py-2.5">
                  <label htmlFor={`discount-limit-${r.key}`} className="text-[13.5px] font-medium text-ink">{r.label}</label>
                  <SettingsUnitInput
                    id={`discount-limit-${r.key}`}
                    unit="JOD"
                    className="w-36"
                    inputMode="decimal"
                    aria-label={`${r.label} discount limit`}
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
        error={save.isError ? errorMessage(save.error, "The payment settings could not be saved. Try again.") : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel="Save payment settings"
        guardTitle="Unsaved payment settings"
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Receipts & tax
// ---------------------------------------------------------------------------
const RECEIPTS_DESCRIPTION = "How receipts are numbered and what they say. Numbering is sequential and collision-safe.";

export function ReceiptsSection() {
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

  const save = useApiMutation(
    (api) => api.updateOrganizationSettings({ receiptPrefix: form.receiptPrefix, receiptFooter: form.receiptFooter, taxRatePercent: Number(form.taxRatePercent) }),
    {
      onSuccess: async () => {
        toast.success("Receipt settings saved — audited.");
        await invalidate([qk.settings]);
      },
    },
  );

  if (settingsQuery.isLoading) return <SettingsSection title="Receipts & tax" description={RECEIPTS_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Receipts & tax" description={RECEIPTS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const commit = async () => {
    await save.mutateAsync();
    setBaseline(form);
  };
  const tax = Number(form.taxRatePercent);
  const taxInvalid = form.taxRatePercent.trim() === "" || !Number.isFinite(tax) || tax < 0 || tax > 30;
  const prefixInvalid = form.receiptPrefix.trim().length === 0;
  const saveDisabledReason = prefixInvalid ? "Enter a receipt prefix." : taxInvalid ? "Enter a sales tax between 0 and 30 percent." : undefined;

  return (
    <SettingsSection title="Receipts & tax" description={RECEIPTS_DESCRIPTION}>
      <SettingsPanel className="max-w-3xl" title="Numbering and tax" description={<>Next receipt: <span className="font-mono text-ink">{org?.receiptPrefix}{org?.nextReceiptNumber}</span></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receipt prefix" required hint="Up to 6 characters, printed before every receipt number." error={prefixInvalid ? "Enter a receipt prefix." : undefined}>
            <Input value={form.receiptPrefix} aria-invalid={prefixInvalid || undefined} onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value }))} className="w-32 font-mono" maxLength={6} />
          </Field>
          <Field label="Sales tax" hint="0 means tax is not itemized on receipts." error={taxInvalid ? "Enter a rate between 0 and 30." : undefined}>
            <SettingsUnitInput unit="%" type="number" min={0} max={30} step={0.5} inputMode="decimal" className="w-32" aria-invalid={taxInvalid || undefined} value={form.taxRatePercent} onChange={(e) => setForm((f) => ({ ...f, taxRatePercent: e.target.value }))} />
          </Field>
        </div>
        <Field label="Receipt footer" hint="Printed at the bottom of every receipt. Leave empty for none." className="mt-4"><Textarea rows={2} value={form.receiptFooter} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} /></Field>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? errorMessage(save.error, "The receipt settings could not be saved. Try again.") : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel="Save receipt settings"
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const NOTIFICATIONS_DESCRIPTION = "Which events alert managers inside RIVET, and whether automated reminders may leave the sandbox and reach members.";

export function NotificationsSection() {
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
      toast.success("Notification settings saved.");
      await invalidate([qk.settings]);
    },
  });

  if (settingsQuery.isLoading || !form || !baseline) return <SettingsSection title="Notifications" description={NOTIFICATIONS_DESCRIPTION}><Skeleton className="h-64 w-full" /></SettingsSection>;
  if (settingsQuery.isError) return <SettingsSection title="Notifications" description={NOTIFICATIONS_DESCRIPTION}><ErrorState layout="section" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;

  const alerts = form.managerAlerts;
  const alertRows: Array<{ key: keyof typeof alerts; label: string; hint: string }> = [
    { key: "cashVariance", label: "Cash variance", hint: "When a shift closes over or short." },
    { key: "refundOrVoid", label: "Refund or void", hint: "Every refund and void, immediately." },
    { key: "checkinOverride", label: "Check-in override", hint: "When someone is let in against the rules." },
    { key: "discountApproval", label: "Discount approvals", hint: "Discounts waiting for a decision." },
  ];
  const update = (patch: Partial<NotificationSettings>) => setForm((current) => current ? { ...current, ...patch } : current);
  const quietInvalid = !form.quietHoursStart || !form.quietHoursEnd;
  const commit = async () => {
    await save.mutateAsync(form);
    setBaseline(form);
  };

  return (
    <SettingsSection title="Notifications" description={NOTIFICATIONS_DESCRIPTION}>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SettingsPanel title="Manager alerts" description="In-app alerts for sensitive events." bodyClassName="px-4 py-1 sm:px-5">
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

        <SettingsPanel title="Automation delivery" description="Reminders are prepared in the delivery ledger. They reach members only when RIVET's provider is live and external delivery is switched on for this gym." bodyClassName="px-4 py-1 sm:px-5">
          <MessagingStatusPanel />
          <div className="divide-y divide-line">
            <SettingsToggleRow
              label="Renewal recovery"
              hint="Prepare sandbox reminders at 14, 7 and 3 days before expiry, then create a real staff call task one day before."
              checked={form.renewalRecoveryEnabled === true}
              onCheckedChange={(enabled) => update({ renewalRecoveryEnabled: enabled })}
            />
            <SettingsToggleRow
              label="External delivery"
              hint={form.automationDeliveryMode === "live" ? "On. Queued WhatsApp and SMS reminders are handed to RIVET's provider, subject to RIVET's global messaging mode above." : "Off. Reminders stay in the sandbox ledger and no member receives a message."}
              checked={form.automationDeliveryMode === "live"}
              onCheckedChange={(enabled) => update({ automationDeliveryMode: enabled ? "live" : "sandbox" })}
            />
          </div>
          <div className="border-t border-line py-4">
            <p className="text-[13.5px] font-medium text-ink">Quiet hours</p>
            <p className="mt-0.5 text-[12px] leading-5 text-ink-3">Messages queued in this window wait and are sent when it ends, in the gym&rsquo;s timezone.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="From">
                <Input type="time" value={form.quietHoursStart ?? ""} aria-label="Quiet hours from" onChange={(e) => update({ quietHoursStart: e.target.value })} />
              </Field>
              <Field label="To">
                <Input type="time" value={form.quietHoursEnd ?? ""} aria-label="Quiet hours to" onChange={(e) => update({ quietHoursEnd: e.target.value })} />
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
        saveDisabledReason={quietInvalid ? "Set both quiet-hour times before saving." : undefined}
        error={save.isError ? errorMessage(save.error, "The notification settings could not be saved. Try again.") : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel="Save notifications"
        guardTitle="Unsaved notification settings"
      />
    </SettingsSection>
  );
}

const MESSAGING_MODE_LABELS: Record<string, string> = { off: "Off", sandbox: "Sandbox", allowlist: "Allowlist", live: "Live" };

function MessagingStatusPanel() {
  const status = useApiQuery(["settings", "messaging-status"], (api) => api.getMessagingStatus());
  if (!status.data) return null;
  const value = status.data;
  return (
    <div className="my-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-sunken/60 px-3 py-2 text-[12.5px] text-ink-2" data-testid="messaging-status">
      <span className="text-ink-3">RIVET messaging</span>
      <Badge variant={value.mode === "live" ? "success" : value.mode === "off" ? "neutral" : "warning"} dot>{MESSAGING_MODE_LABELS[value.mode] ?? value.mode}</Badge>
      <span className="text-ink-3">{value.provider === "twilio" ? `Provider connected · WhatsApp ${value.whatsappReady ? "ready" : "not configured"} · SMS ${value.smsReady ? "ready" : "not configured"}` : "No provider connected; nothing leaves the sandbox."}</span>
      {value.warning ? <span className="text-warning-deep">{value.warning}</span> : null}
    </div>
  );
}

function MessageTemplateCatalogue() {
  const catalogue = useApiQuery(["settings", "message-template-catalogue"], (api) => api.listMessageTemplateCatalogue());
  const [open, setOpen] = useState(false);
  if (!catalogue.data?.length) return null;
  return (
    <div className="border-t border-line py-3">
      <button type="button" className="flex min-h-9 w-full cursor-pointer items-center justify-between gap-3 text-start text-[13.5px] font-medium text-ink" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span>Reviewed message catalogue <span className="font-normal text-ink-3">· {catalogue.data.length} templates, Arabic and English</span></span>
        <span className="text-[12.5px] font-normal text-ink-3">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <ul className="mt-2 divide-y divide-line" data-testid="message-template-catalogue">
          {catalogue.data.map((template) => (
            <li key={template.key} className="py-3 text-[12.5px]">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-ink">{template.name}</span><span className="text-[12px] text-ink-3">{template.family} · {template.channels.join(" / ")}</span></div>
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
