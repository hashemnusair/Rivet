"use client";

import { Check, Pencil, Plus, UserPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api/errors";
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
import { Checkbox, Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SettingsSaveBar } from "@/features/settings/settings-layout";

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------
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

  if (settingsQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;

  const commit = async () => {
    await save.mutateAsync();
    setBaseline(form);
  };

  return (
    <div className="max-w-2xl pb-4">
      <section className="panel p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Organization</h2>
        <p className="mb-4 text-[12.5px] text-ink-3">Identity and locale for the whole tenant. Currency is fixed to JOD for this deployment.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="Timezone"><Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}><SelectTrigger aria-label="Timezone"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Asia/Amman">Asia/Amman (UTC+3)</SelectItem><SelectItem value="Asia/Riyadh">Asia/Riyadh (UTC+3)</SelectItem><SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem></SelectContent></Select></Field>
          <Field label="Locale"><Select value={form.locale} onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}><SelectTrigger aria-label="Locale"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en-JO">English (Jordan)</SelectItem><SelectItem value="ar-JO">العربية (الأردن)</SelectItem></SelectContent></Select></Field>
          <Field label="Default phone country" hint="Used only for local numbers. Numbers beginning with + or 00 keep their own country code."><div className="relative"><span className="pointer-events-none absolute inset-y-0 start-3 flex items-center font-mono text-[13px] text-ink-3">+</span><Input className="ps-7 font-mono" inputMode="numeric" aria-label="Default phone country calling code" value={form.phoneCountryCallingCode} onChange={(event) => setForm((current) => ({ ...current, phoneCountryCallingCode: event.target.value.replace(/\D/g, "").slice(0, 3) }))} /></div></Field>
          <Field label="Default staff language"><Select value={form.defaultLanguage} onValueChange={(v) => setForm((f) => ({ ...f, defaultLanguage: v as "en" | "ar" }))}><SelectTrigger aria-label="Default language"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent></Select></Field>
        </div>
      </section>
      <SettingsSaveBar dirty={dirty} saving={save.isPending} onSave={commit} onDiscard={() => { if (baseline) setForm(baseline); }} saveLabel="Save organization" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------
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
      onError: (e) => toast.error(isApiError(e) ? e.message : "Could not save the branch."),
    },
  );

  if (settingsQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <section className="panel max-w-3xl overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold">Branches</h2>
          <p className="text-[12.5px] text-ink-3">Physical locations. Codes prefix member numbers.</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true })}>
          <Plus /> Add branch
        </Button>
      </header>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Address</TableHead>
            <TableHead className="text-end">Capacity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead aria-label="Edit" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(settingsQuery.data?.branches ?? []).map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell className="font-mono text-[12px]">{b.code}</TableCell>
              <TableCell className="max-w-56 truncate text-[12.5px] text-ink-2">{b.address}</TableCell>
              <TableCell className="text-end tabular">{b.capacity}</TableCell>
              <TableCell>
                <Badge variant={b.status === "active" ? "success" : "neutral"}>{b.status}</Badge>
              </TableCell>
              <TableCell className="text-end">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${b.name}`} onClick={() => setDialog({ open: true, branch: b })}>
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialog.open} onOpenChange={(v) => setDialog({ open: v })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.branch ? `Edit ${dialog.branch.name}` : "New branch"}</DialogTitle>
            <DialogDescription>Branch codes appear on member numbers and receipts.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <Field label="Name" required>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Forge — Khalda" />
              </Field>
              <Field label="Code" required>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="font-mono uppercase" maxLength={4} placeholder="KHA" />
              </Field>
            </div>
            <Field label="Address">
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Phone">
                <Input dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="Capacity">
                <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))} />
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
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name || !form.code}>
              {dialog.branch ? "Save" : "Create branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
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

function newSpaceCode(): string {
  return `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function GymSpacesSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const activeBranches = (settingsQuery.data?.branches ?? []).filter((branch) => branch.status === "active");
  const [branchId, setBranchId] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; space?: Zone }>({ open: false });
  const [form, setForm] = useState({ name: "", kind: "floor" as ZoneKind, capacity: "", status: "active" as "active" | "archived" });

  useEffect(() => {
    setBranchId((current) => activeBranches.some((branch) => branch.id === current) ? current : activeBranches[0]?.id ?? "");
  }, [activeBranches]);

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
      onError: (error) => toast.error(isApiError(error) ? error.message : "Could not save this gym space."),
    },
  );

  if (settingsQuery.isLoading) return <Skeleton className="h-48 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;

  return (
    <section className="panel max-w-3xl overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-[15px] font-semibold">Gym spaces</h2>
          <p className="mt-1 max-w-2xl text-[12.5px] text-ink-3">The places inside a branch—for example Reception, Main floor, Studio, or Locker room. RIVET uses them to locate maintenance work and equipment.</p>
        </div>
        <Button size="sm" onClick={() => setDialog({ open: true })} disabled={!branchId}>
          <Plus /> Add gym space
        </Button>
      </header>

      <div className="border-b border-line bg-sunken/40 px-5 py-3">
        <label className="block max-w-xs space-y-1.5">
          <span className="text-[12px] font-medium text-ink">Branch</span>
          <Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}>
            <SelectTrigger aria-label="Gym spaces branch"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
            <SelectContent>
              {activeBranches.length === 0 ? <SelectItem value="none">No active branches</SelectItem> : null}
              {activeBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>

      {spacesQuery.isLoading ? <div className="p-5"><Skeleton className="h-32 w-full" /></div> : null}
      {spacesQuery.isError ? <ErrorState className="m-5" onRetry={() => spacesQuery.refetch()} /> : null}
      {!spacesQuery.isLoading && !spacesQuery.isError && (spacesQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          className="m-5"
          compact
          title="No gym spaces in this branch"
          description="Add the few places employees already use when describing where work happened. You can keep this simple."
          action={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus /> Add first gym space</Button>}
        />
      ) : null}
      {(spacesQuery.data?.length ?? 0) > 0 ? (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-end">Capacity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead aria-label="Edit" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {spacesQuery.data?.map((space) => (
              <TableRow key={space.id}>
                <TableCell className="font-medium">{space.name}</TableCell>
                <TableCell className="text-[12.5px] text-ink-2">{SPACE_KIND_LABELS[space.kind]}</TableCell>
                <TableCell className="text-end tabular">{space.capacity?.toLocaleString() ?? "—"}</TableCell>
                <TableCell><Badge variant={space.status === "active" ? "success" : "neutral"}>{space.status}</Badge></TableCell>
                <TableCell className="text-end"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${space.name}`} onClick={() => setDialog({ open: true, space })}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open, space: open ? dialog.space : undefined })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.space ? `Edit ${dialog.space.name}` : "Add gym space"}</DialogTitle>
            <DialogDescription>Use the everyday name employees will recognize immediately.</DialogDescription>
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
    </section>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export function UsersSection() {
  const invalidate = useInvalidate();
  const { session } = useApp();
  const usersQuery = useApiQuery(qk.users({ settings: true }), (api) => api.listUsers({ pageSize: 50 }));
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold">Staff</h2>
            <p className="text-[12.5px] text-ink-3">Invites, roles, branch scope and deactivation — all audited.</p>
          </div>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invite user
          </Button>
        </header>
        {usersQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data?.items ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Monogram name={u.name} size="sm" />
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-[11.5px] text-ink-3">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "owner" ? "ink" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">
                    {u.branchScope === "all" ? "All branches" : u.branchIds.map((id) => settingsQuery.data?.branches.find((b) => b.id === id)?.code).filter(Boolean).join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === "active" ? "success" : u.status === "invited" ? "warning" : "outline"}>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[12px] text-ink-3">
                    {u.status === "invited" ? `invited ${formatDateTime(u.invitedAt ?? "")}` : <RelativeText iso={u.lastActiveAt} />}
                  </TableCell>
                  <TableCell className="text-end">
                    {u.role !== "owner" && u.id !== session?.user.id ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit access for ${u.name}`} onClick={() => setEditTarget(u)}>
                        <Pencil />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

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
    </div>
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
    onError: (e) => toast.error(isApiError(e) ? e.message : "Invite failed."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>They appear as “invited” until they sign in. Access is enforced by role + branch scope.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Full name" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
            <Field label="Branches">
              <div className="flex flex-wrap gap-3">
                {session?.branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 rounded-md border border-line-2 px-2.5 py-1.5 text-[12.5px] cursor-pointer">
                    <Checkbox
                      checked={form.branchIds.includes(b.id)}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({ ...f, branchIds: checked ? [...f.branchIds, b.id] : f.branchIds.filter((id) => id !== b.id) }))
                      }
                      aria-label={b.name}
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!form.name || !form.email || (form.branchScope === "selected" && form.branchIds.length === 0)}>
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

  const mutation = useApiMutation(
    (api) => api.updateUserAccess(user.id, { role, status: status === "deactivated" ? "deactivated" : "active" }),
    {
      onSuccess: () => onSaved(),
      onError: (e) => toast.error(isApiError(e) ? e.message : "Could not update access."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access — {user.name}</DialogTitle>
          <DialogDescription>Role and account state changes are audited immediately.</DialogDescription>
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
          <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 cursor-pointer">
            <span>
              <span className="block text-[13px] font-medium">Account active</span>
              <span className="block text-[12px] text-ink-3">Deactivated users lose all access immediately.</span>
            </span>
            <Switch checked={status === "active"} onCheckedChange={(v) => setStatus(v ? "active" : "deactivated")} aria-label="Account active" />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} variant={status === "deactivated" ? "signal" : "primary"}>
            Save access
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
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const roles = settingsQuery.data?.roles ?? [];
  const editableRoles = roles.filter((r) => r.key !== "owner");

  const toggle = useApiMutation(
    (api, v: { role: RoleKey; permissions: string[] }) => api.updateRolePermissions(v.role, { permissions: v.permissions }),
    {
      onSuccess: async () => {
        toast.success("Permissions updated — audited.");
        await invalidate([qk.settings, qk.session]);
      },
      onError: (e) => toast.error(isApiError(e) ? e.message : "Could not update permissions."),
    },
  );

  if (settingsQuery.isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <section className="panel overflow-hidden">
      <header className="border-b border-line px-5 py-3">
        <h2 className="font-display text-[15px] font-semibold">Permission matrix</h2>
        <p className="text-[12.5px] text-ink-3">
          System roles are defaults, not hardcoded shortcuts — tune them here. The owner role always has full access. Changes apply to new sessions and are audited.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line">
              <th className="sticky start-0 z-10 bg-surface px-4 py-2 text-start font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
                Permission
              </th>
              {editableRoles.map((r) => (
                <th key={r.key} className="px-3 py-2 text-center font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3 whitespace-nowrap">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm) => (
              <tr key={perm} className="border-b border-line/70 last:border-0">
                <td className="sticky start-0 z-10 bg-surface px-4 py-2">
                  <p className="text-[13px] font-medium text-ink">{PERMISSION_LABELS[perm].label}</p>
                  <p className="text-[11.5px] text-ink-3">{PERMISSION_LABELS[perm].hint}</p>
                </td>
                {editableRoles.map((r) => {
                  const checked = r.permissions.includes(perm);
                  return (
                    <td key={r.key} className="px-3 py-1.5 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        aria-label={`${r.label} — ${PERMISSION_LABELS[perm].label}`}
                        onClick={() =>
                          toggle.mutate({
                            role: r.key,
                            permissions: checked ? r.permissions.filter((p) => p !== perm) : [...r.permissions, perm],
                          })
                        }
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-sm border transition-colors cursor-pointer",
                          checked ? "border-ink bg-ink text-paper" : "border-line-3 bg-surface hover:border-ink-3",
                        )}
                      >
                        {checked ? <Check className="size-3" /> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export function PaymentsSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [limits, setLimits] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsQuery.data) {
      const next: Record<string, string> = {};
      for (const r of settingsQuery.data.roles) {
        if (r.key !== "owner") next[r.key] = (r.discountLimitMinor / 1000).toFixed(3);
      }
      setLimits(next);
    }
  }, [settingsQuery.data]);

  const toggleMethod = useApiMutation(
    (api, methods: PaymentMethod[]) => api.updatePaymentMethods(methods),
    {
      onSuccess: async () => {
        await invalidate([qk.settings]);
      },
    },
  );

  const saveLimit = useApiMutation(
    (api, v: { role: RoleKey; minor: number }) => api.updateRolePermissions(v.role, { discountLimitMinor: v.minor }),
    {
      onSuccess: async () => {
        toast.success("Discount limit saved — audited.");
        await invalidate([qk.settings]);
      },
    },
  );

  if (settingsQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  const methods = settingsQuery.data?.paymentMethods ?? [];
  const roles = (settingsQuery.data?.roles ?? []).filter((r) => r.key !== "owner" && r.key !== "trainer");

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel self-start p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Payment methods</h2>
        <p className="mb-4 text-[12.5px] text-ink-3">Disabled methods disappear from every collect flow.</p>
        <ul className="space-y-2">
          {methods.map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium">{m.label}</p>
                {m.affectsCashDrawer ? <p className="text-[11.5px] text-ink-3">Counts toward the cash drawer</p> : null}
              </div>
              <Switch
                checked={m.enabled}
                onCheckedChange={(v) => toggleMethod.mutate(methods.map((x) => (x.key === m.key ? { ...x, enabled: v } : x)))}
                aria-label={`Enable ${m.label}`}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel self-start p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Discount approval limits</h2>
        <p className="mb-4 text-[12.5px] text-ink-3">Discounts beyond the limit are recorded as pending manager approval.</p>
        <ul className="space-y-2">
          {roles.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
              <span className="text-[13px] font-medium">{r.label}</span>
              <span className="flex items-center gap-2">
                <Input
                  className="h-8 w-28 text-end tabular"
                  inputMode="decimal"
                  value={limits[r.key] ?? ""}
                  onChange={(e) => setLimits((l) => ({ ...l, [r.key]: e.target.value }))}
                  aria-label={`${r.label} discount limit`}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!limits[r.key]}
                  onClick={() => saveLimit.mutate({ role: r.key, minor: Math.round(Number(limits[r.key]) * 1000) })}
                >
                  Save
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Receipts & tax
// ---------------------------------------------------------------------------
export function ReceiptsSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const org = settingsQuery.data?.organization;
  const [form, setForm] = useState({ receiptPrefix: "R-", receiptFooter: "", taxRatePercent: 0 });
  const [baseline, setBaseline] = useState<typeof form | null>(null);
  const dirty = Boolean(baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    if (!org || dirtyRef.current) return;
    const next = { receiptPrefix: org.receiptPrefix, receiptFooter: org.receiptFooter, taxRatePercent: org.taxRatePercent };
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

  if (settingsQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;

  const commit = async () => {
    await save.mutateAsync();
    setBaseline(form);
  };

  return (
    <div className="max-w-2xl pb-4">
      <section className="panel p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Receipts & tax</h2>
        <p className="mb-4 text-[12.5px] text-ink-3">Numbering is sequential and collision-safe. Next receipt: <span className="font-mono">{org?.receiptPrefix}{org?.nextReceiptNumber}</span></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receipt prefix"><Input value={form.receiptPrefix} onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value }))} className="w-28 font-mono" maxLength={6} /></Field>
          <Field label="Sales tax (%)" hint="0 = tax not itemized on receipts."><Input type="number" min={0} max={30} step={0.5} value={form.taxRatePercent} onChange={(e) => setForm((f) => ({ ...f, taxRatePercent: Number(e.target.value) }))} className="w-28 font-mono" /></Field>
        </div>
        <Field label="Receipt footer" className="mt-4"><Textarea rows={2} value={form.receiptFooter} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} /></Field>
      </section>
      <SettingsSaveBar dirty={dirty} saving={save.isPending} onSave={commit} onDiscard={() => { if (baseline) setForm(baseline); }} saveLabel="Save receipt settings" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export function NotificationsSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const notifications = settingsQuery.data?.notifications;

  const save = useApiMutation((api, v: NotificationSettings) => api.updateNotificationSettings(v), {
    onSuccess: async () => {
      toast.success("Notification settings saved.");
      await invalidate([qk.settings]);
    },
  });

  if (settingsQuery.isLoading || !notifications) return <Skeleton className="h-64 w-full" />;

  const alerts = notifications.managerAlerts;
  const alertRows: Array<{ key: keyof typeof alerts; label: string; hint: string }> = [
    { key: "cashVariance", label: "Cash variance", hint: "When a shift closes over or short." },
    { key: "refundOrVoid", label: "Refund or void", hint: "Every refund and void, immediately." },
    { key: "checkinOverride", label: "Check-in override", hint: "When someone is let in against the rules." },
    { key: "discountApproval", label: "Discount approvals", hint: "Discounts waiting for a decision." },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel self-start p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Manager alerts</h2>
        <p className="mb-4 text-[12.5px] text-ink-3">In-app alerts for sensitive events.</p>
        <ul className="space-y-2">
          {alertRows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium">{row.label}</p>
                <p className="text-[11.5px] text-ink-3">{row.hint}</p>
              </div>
              <Switch
                checked={alerts[row.key]}
                onCheckedChange={(v) => save.mutate({ ...notifications, managerAlerts: { ...alerts, [row.key]: v } })}
                aria-label={row.label}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel self-start p-5">
        <h2 className="mb-1 font-display text-[15px] font-semibold">Automation delivery</h2>
        <p className="mb-4 text-[12.5px] text-ink-3">Automation messages are retained in the sandbox delivery ledger. No external WhatsApp or SMS provider is configured.</p>
        <label className="mb-3 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
          <div>
            <p className="text-[13px] font-medium">Renewal recovery</p>
            <p className="text-[11.5px] text-ink-3">When enabled, prepare sandbox reminders at 14, 7, and 3 days, then create a real staff call task one day before expiry.</p>
          </div>
          <Switch
            checked={notifications.renewalRecoveryEnabled === true}
            onCheckedChange={(enabled) => save.mutate({ ...notifications, renewalRecoveryEnabled: enabled })}
            aria-label="Renewal recovery"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 cursor-pointer">
          <div>
            <p className="text-[13px] font-medium">External delivery</p>
            <p className="text-[11.5px] text-ink-3">Not configured. Sandbox remains enforced until individual message types are approved.</p>
          </div>
          <Switch
            checked={false}
            disabled
            aria-label="External delivery not configured"
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Quiet hours from">
            <Input
              type="time"
              value={notifications.quietHoursStart ?? "22:00"}
              onChange={(e) => save.mutate({ ...notifications, quietHoursStart: e.target.value })}
            />
          </Field>
          <Field label="Quiet hours to">
            <Input
              type="time"
              value={notifications.quietHoursEnd ?? "07:00"}
              onChange={(e) => save.mutate({ ...notifications, quietHoursEnd: e.target.value })}
            />
          </Field>
        </div>
        <p className="mt-2 text-[11.5px] text-ink-3">Messages queued during quiet hours are delivered after they end.</p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operational rules and hours
// ---------------------------------------------------------------------------
export { HoursAndTrialsSection, OperationalRulesSection, normalizeOperationalPolicies } from "@/features/settings/operational-settings-sections";
