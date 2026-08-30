"use client";

import { Check, Pencil, Plus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/domain/permissions";
import type { Branch, NotificationSettings, OperationalPolicies, PaymentMethod, RoleKey, StaffUser, WeekdayKey, Zone, ZoneKind } from "@/lib/domain/types";
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

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------
export function OrganizationSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const org = settingsQuery.data?.organization;
  const [form, setForm] = useState({ name: "", timezone: "", locale: "", phoneCountryCallingCode: "962", defaultLanguage: "en" as "en" | "ar" });

  useEffect(() => {
    if (org) setForm({ name: org.name, timezone: org.timezone, locale: org.locale, phoneCountryCallingCode: org.phoneCountryCallingCode, defaultLanguage: org.defaultLanguage });
  }, [org]);

  const save = useApiMutation((api) => api.updateOrganizationSettings(form), {
    onSuccess: async () => {
      toast.success("Organization settings saved — audited.");
      await invalidate([qk.settings]);
    },
  });

  if (settingsQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;

  return (
    <section className="panel max-w-2xl p-5">
      <h2 className="mb-1 font-display text-[15px] font-semibold">Organization</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">Identity and locale for the whole tenant. Currency is fixed to JOD for this deployment.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Timezone">
          <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
            <SelectTrigger aria-label="Timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Amman">Asia/Amman (UTC+3)</SelectItem>
              <SelectItem value="Asia/Riyadh">Asia/Riyadh (UTC+3)</SelectItem>
              <SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Locale">
          <Select value={form.locale} onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}>
            <SelectTrigger aria-label="Locale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-JO">English (Jordan)</SelectItem>
              <SelectItem value="ar-JO">العربية (الأردن)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Default phone country" hint="Used only for local numbers. Numbers beginning with + or 00 keep their own country code.">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center font-mono text-[13px] text-ink-3">+</span>
            <Input
              className="ps-7 font-mono"
              inputMode="numeric"
              aria-label="Default phone country calling code"
              value={form.phoneCountryCallingCode}
              onChange={(event) => setForm((current) => ({ ...current, phoneCountryCallingCode: event.target.value.replace(/\D/g, "").slice(0, 3) }))}
            />
          </div>
        </Field>
        <Field label="Default staff language">
          <Select value={form.defaultLanguage} onValueChange={(v) => setForm((f) => ({ ...f, defaultLanguage: v as "en" | "ar" }))}>
            <SelectTrigger aria-label="Default language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending}>Save changes</Button>
      </div>
    </section>
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
                  {(["manager", "salesperson", "receptionist", "trainer", "auditor"] as RoleKey[]).map((r) => (
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
                {(["manager", "salesperson", "receptionist", "trainer", "auditor"] as RoleKey[]).map((r) => (
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
              <tr key={perm} className="border-b border-line/70 last:border-0 hover:bg-sunken/30">
                <td className="sticky start-0 z-10 bg-surface px-4 py-1.5 font-mono text-[11.5px] text-ink-2">{perm}</td>
                {editableRoles.map((r) => {
                  const checked = r.permissions.includes(perm);
                  return (
                    <td key={r.key} className="px-3 py-1.5 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        aria-label={`${r.label} — ${perm}`}
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
  const roles = (settingsQuery.data?.roles ?? []).filter((r) => r.key !== "owner" && r.key !== "trainer" && r.key !== "auditor");

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

  useEffect(() => {
    if (org) setForm({ receiptPrefix: org.receiptPrefix, receiptFooter: org.receiptFooter, taxRatePercent: org.taxRatePercent });
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

  return (
    <section className="panel max-w-2xl p-5">
      <h2 className="mb-1 font-display text-[15px] font-semibold">Receipts & tax</h2>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Numbering is sequential and collision-safe. Next receipt: <span className="font-mono">{org?.receiptPrefix}{org?.nextReceiptNumber}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Receipt prefix">
          <Input value={form.receiptPrefix} onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value }))} className="font-mono w-28" maxLength={6} />
        </Field>
        <Field label="Sales tax (%)" hint="0 = tax not itemized on receipts.">
          <Input type="number" min={0} max={30} step={0.5} value={form.taxRatePercent} onChange={(e) => setForm((f) => ({ ...f, taxRatePercent: Number(e.target.value) }))} className="font-mono w-28" />
        </Field>
      </div>
      <Field label="Receipt footer" className="mt-4">
        <Textarea rows={2} value={form.receiptFooter} onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))} />
      </Field>
      <div className="mt-5 flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending}>Save changes</Button>
      </div>
    </section>
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
// Operational rules & hours
// ---------------------------------------------------------------------------
const WEEKDAY_ROWS: Array<{ key: WeekdayKey; label: string }> = [
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
];

type OperatingDays = OperationalPolicies["operatingHours"][number]["days"];
type TrialDays = OperationalPolicies["trialSchedules"][number]["days"];

function defaultOperatingDays(): OperatingDays {
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => [key, {
    enabled: key !== "fri",
    opensAt: key === "sat" ? "07:00" : "06:00",
    closesAt: key === "sat" ? "22:00" : "23:00",
  }])) as OperatingDays;
}

function defaultTrialDays(): TrialDays {
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => [key, { enabled: false, opensAt: "09:00", closesAt: "20:00" }])) as TrialDays;
}

function normalizedOperatingDays(days?: OperatingDays): OperatingDays {
  const defaults = defaultOperatingDays();
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => [key, { ...defaults[key], ...(days?.[key] ?? {}) }])) as OperatingDays;
}

function normalizedTrialDays(days?: TrialDays): TrialDays {
  const source: Partial<TrialDays> = days ?? {};
  return Object.fromEntries(WEEKDAY_ROWS.map(({ key }) => {
    const day = source[key] as TrialDays[WeekdayKey] & { slots?: string[] } | undefined;
    if (typeof day?.enabled === "boolean") return [key, day];
    const slots = [...(day?.slots ?? [])].sort();
    const onlySlot = slots.length === 1 ? slots[0] : undefined;
    const [onlyHour = 0, onlyMinute = 0] = onlySlot?.split(":").map(Number) ?? [];
    const legacyClosingMinutes = Math.min(23 * 60 + 59, onlyHour * 60 + onlyMinute + 60);
    return [key, {
      enabled: slots.length > 0,
      opensAt: slots[0] ?? "09:00",
      closesAt: onlySlot ? `${String(Math.floor(legacyClosingMinutes / 60)).padStart(2, "0")}:${String(legacyClosingMinutes % 60).padStart(2, "0")}` : (slots.at(-1) ?? "20:00"),
    }];
  })) as TrialDays;
}

/**
 * New workspaces and older staging tenants may not have the nested policy
 * record yet. Keep the settings screen readable until the owner saves the
 * canonical shape, while preserving any schedules already present.
 */
type OperationalPoliciesInput = {
  entry?: Partial<OperationalPolicies["entry"]>;
  membership?: Partial<OperationalPolicies["membership"]>;
  personalTraining?: Partial<OperationalPolicies["personalTraining"]>;
  referrals?: Partial<OperationalPolicies["referrals"]>;
  memberFreezes?: Partial<OperationalPolicies["memberFreezes"]>;
  operatingHours?: OperationalPolicies["operatingHours"];
  trialSchedules?: OperationalPolicies["trialSchedules"];
};

export function normalizeOperationalPolicies(value?: OperationalPoliciesInput): OperationalPolicies {
  return {
    entry: {
      outstandingBalance: "warn",
      expiryWarningDays: 7,
      duplicateScanWindowMinutes: 2,
      enforceOperatingHours: false,
      ...value?.entry,
    },
    membership: {
      allowOverlappingMemberships: false,
      renewalWindowDays: 14,
      minimumFreezeDays: 1,
      maximumExtensionDays: 365,
      ...value?.membership,
    },
    personalTraining: {
      sessionDurationMinutes: 60,
      bookingHorizonDays: 30,
      cancellationCutoffHours: 12,
      ...value?.personalTraining,
    },
    referrals: {
      enabled: false,
      rewardDays: 7,
      maxRewardDaysPerWindow: 30,
      windowDays: 90,
      ...value?.referrals,
    },
    memberFreezes: {
      requestsEnabled: false,
      freeFreezesPerWindow: 1,
      extraFreezeFeeMinor: 10_000,
      maxDaysPerFreeze: 30,
      windowDays: 365,
      ...value?.memberFreezes,
    },
    operatingHours: Array.isArray(value?.operatingHours)
      ? value.operatingHours.map((schedule) => ({ ...schedule, days: normalizedOperatingDays(schedule.days) }))
      : [],
    trialSchedules: Array.isArray(value?.trialSchedules)
      ? value.trialSchedules.map((schedule) => ({ ...schedule, days: normalizedTrialDays(schedule.days) }))
      : [],
  };
}

export function OperationalRulesSection() {
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const [policies, setPolicies] = useState<OperationalPolicies | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    const branches = settings.branches ?? [];
    const operationalPolicies = normalizeOperationalPolicies(settings.operationalPolicies);
    const branchIds = branches.filter((branch) => branch.status === "active").map((branch) => branch.id);
    setPolicies({
      ...operationalPolicies,
      operatingHours: branchIds.map((branchId) => operationalPolicies.operatingHours.find((schedule) => schedule.branchId === branchId) ?? { branchId, days: defaultOperatingDays() }),
      trialSchedules: branchIds.map((branchId) => {
        const schedule = operationalPolicies.trialSchedules.find((candidate) => candidate.branchId === branchId);
        return schedule ? { ...schedule, days: normalizedTrialDays(schedule.days) } : { branchId, days: defaultTrialDays() };
      }),
    });
    // Branch schedules are edited one concrete branch at a time. Never pick
    // the first branch implicitly after a stale selection or an all-branch
    // scope is restored.
    setSelectedBranchId((current) => branchIds.includes(current) ? current : "");
  }, [settingsQuery.data]);

  const save = useApiMutation((api, value: OperationalPolicies) => api.updateOperationalPolicies(value), {
    onSuccess: async () => {
      toast.success("Operational rules saved and audited.");
      await invalidate([qk.settings, qk.renewalQueue({}), qk.checkIns({})]);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : "Could not save operational rules."),
  });

  if (settingsQuery.isLoading || !policies) return <Skeleton className="h-96 w-full" />;
  if (settingsQuery.isError) return <ErrorState onRetry={() => settingsQuery.refetch()} />;
  const selectedSchedule = policies.operatingHours.find((schedule) => schedule.branchId === selectedBranchId);
  const selectedTrialSchedule = policies.trialSchedules.find((schedule) => schedule.branchId === selectedBranchId);
  const branches = settingsQuery.data?.branches?.filter((branch) => branch.status === "active") ?? [];
  const updateEntry = <K extends keyof OperationalPolicies["entry"]>(key: K, value: OperationalPolicies["entry"][K]) =>
    setPolicies((current) => current ? { ...current, entry: { ...current.entry, [key]: value } } : current);
  const updateReferrals = <K extends keyof OperationalPolicies["referrals"]>(key: K, value: OperationalPolicies["referrals"][K]) =>
    setPolicies((current) => current ? { ...current, referrals: { ...current.referrals, [key]: value } } : current);
  const updateFreezes = <K extends keyof OperationalPolicies["memberFreezes"]>(key: K, value: OperationalPolicies["memberFreezes"][K]) =>
    setPolicies((current) => current ? { ...current, memberFreezes: { ...current.memberFreezes, [key]: value } } : current);
  const updateMembership = <K extends keyof OperationalPolicies["membership"]>(key: K, value: OperationalPolicies["membership"][K]) =>
    setPolicies((current) => current ? { ...current, membership: { ...current.membership, [key]: value } } : current);
  const updateHours = (weekday: WeekdayKey, patch: Partial<OperationalPolicies["operatingHours"][number]["days"][WeekdayKey]>) =>
    setPolicies((current) => current ? {
      ...current,
      operatingHours: current.operatingHours.map((schedule) => schedule.branchId === selectedBranchId ? {
        ...schedule,
        days: { ...schedule.days, [weekday]: { ...schedule.days[weekday], ...patch } },
      } : schedule),
    } : current);
  const updateTrialWindow = (weekday: WeekdayKey, patch: Partial<OperationalPolicies["trialSchedules"][number]["days"][WeekdayKey]>) =>
    setPolicies((current) => current ? {
      ...current,
      trialSchedules: current.trialSchedules.map((schedule) => schedule.branchId === selectedBranchId ? {
        ...schedule,
        days: { ...schedule.days, [weekday]: { ...schedule.days[weekday], ...patch } },
      } : schedule),
    } : current);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)]">
      <div className="space-y-5">
        <section className="panel p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold">Entry rules</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">These rules are evaluated by Convex for every QR scan and manual check-in.</p>
          <div className="space-y-4">
            <Field label="Outstanding balance">
              <Select value={policies.entry.outstandingBalance} onValueChange={(value) => updateEntry("outstandingBalance", value as OperationalPolicies["entry"]["outstandingBalance"])}>
                <SelectTrigger aria-label="Outstanding balance policy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow silently</SelectItem>
                  <SelectItem value="warn">Allow with warning</SelectItem>
                  <SelectItem value="block">Block entry</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry warning (days)"><Input type="number" min={0} max={30} value={policies.entry.expiryWarningDays} onChange={(event) => updateEntry("expiryWarningDays", Number(event.target.value))} /></Field>
              <Field label="Duplicate scan window"><Input type="number" min={1} max={15} value={policies.entry.duplicateScanWindowMinutes} onChange={(event) => updateEntry("duplicateScanWindowMinutes", Number(event.target.value))} /></Field>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
              <span><span className="block text-[13px] font-medium">Enforce operating hours</span><span className="block text-[11.5px] text-ink-3">Outside-hours entries require a manager override.</span></span>
              <Switch checked={policies.entry.enforceOperatingHours} onCheckedChange={(value) => updateEntry("enforceOperatingHours", value)} aria-label="Enforce operating hours" />
            </label>
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold">Membership lifecycle</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">Guardrails for sales, renewals and sensitive date changes.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Renewal window"><Input type="number" min={1} max={90} value={policies.membership.renewalWindowDays} onChange={(event) => updateMembership("renewalWindowDays", Number(event.target.value))} /></Field>
            <Field label="Minimum freeze"><Input type="number" min={1} max={30} value={policies.membership.minimumFreezeDays} onChange={(event) => updateMembership("minimumFreezeDays", Number(event.target.value))} /></Field>
            <Field label="Maximum extension"><Input type="number" min={1} max={365} value={policies.membership.maximumExtensionDays} onChange={(event) => updateMembership("maximumExtensionDays", Number(event.target.value))} /></Field>
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
            <span><span className="block text-[13px] font-medium">Allow overlapping memberships</span><span className="block text-[11.5px] text-ink-3">Off prevents accidental duplicate active terms.</span></span>
            <Switch checked={policies.membership.allowOverlappingMemberships} onCheckedChange={(value) => updateMembership("allowOverlappingMemberships", value)} aria-label="Allow overlapping memberships" />
          </label>
        </section>
        <section className="panel p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold">Referral rewards</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">When a referred person buys their first membership, the referrer gets free days on their active membership — capped per member inside a rolling window.</p>
          <label className="mb-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
            <span><span className="block text-[13px] font-medium">Reward referrals</span><span className="block text-[11.5px] text-ink-3">Off records nothing and grants nothing.</span></span>
            <Switch checked={policies.referrals.enabled} onCheckedChange={(value) => updateReferrals("enabled", value)} aria-label="Reward referrals" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Free days per referral"><Input type="number" min={1} max={90} value={policies.referrals.rewardDays} disabled={!policies.referrals.enabled} onChange={(event) => updateReferrals("rewardDays", Number(event.target.value))} /></Field>
            <Field label="Max days per member"><Input type="number" min={1} max={365} value={policies.referrals.maxRewardDaysPerWindow} disabled={!policies.referrals.enabled} onChange={(event) => updateReferrals("maxRewardDaysPerWindow", Number(event.target.value))} /></Field>
            <Field label="Cap resets after (days)"><Input type="number" min={7} max={365} value={policies.referrals.windowDays} disabled={!policies.referrals.enabled} onChange={(event) => updateReferrals("windowDays", Number(event.target.value))} /></Field>
          </div>
        </section>
        <section className="panel p-5">
          <h2 className="mb-1 font-display text-[15px] font-semibold">Member freeze requests</h2>
          <p className="mb-4 text-[12.5px] text-ink-3">Members ask from their app; your team approves. The policy decides what is free and what carries a fee — for example the first freeze free, the second for 10 JOD.</p>
          <label className="mb-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5">
            <span><span className="block text-[13px] font-medium">Accept freeze requests</span><span className="block text-[11.5px] text-ink-3">Off hides the request option in the member app.</span></span>
            <Switch checked={policies.memberFreezes.requestsEnabled} onCheckedChange={(value) => updateFreezes("requestsEnabled", value)} aria-label="Accept freeze requests" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Free freezes per window"><Input type="number" min={0} max={12} value={policies.memberFreezes.freeFreezesPerWindow} disabled={!policies.memberFreezes.requestsEnabled} onChange={(event) => updateFreezes("freeFreezesPerWindow", Number(event.target.value))} /></Field>
            <Field label="Fee after that (JOD)"><Input type="number" min={0} max={1000} step={0.5} value={policies.memberFreezes.extraFreezeFeeMinor / 1000} disabled={!policies.memberFreezes.requestsEnabled} onChange={(event) => updateFreezes("extraFreezeFeeMinor", Math.round(Number(event.target.value) * 1000))} /></Field>
            <Field label="Max days per freeze"><Input type="number" min={1} max={180} value={policies.memberFreezes.maxDaysPerFreeze} disabled={!policies.memberFreezes.requestsEnabled} onChange={(event) => updateFreezes("maxDaysPerFreeze", Number(event.target.value))} /></Field>
            <Field label="Counter resets after (days)"><Input type="number" min={30} max={730} value={policies.memberFreezes.windowDays} disabled={!policies.memberFreezes.requestsEnabled} onChange={(event) => updateFreezes("windowDays", Number(event.target.value))} /></Field>
          </div>
        </section>
      </div>

      <section className="panel self-start overflow-hidden">
        <header className="border-b border-line p-5">
          <h2 className="font-display text-[15px] font-semibold">Branch hours and free trials</h2>
          <p className="mb-3 text-[12.5px] text-ink-3">Opening hours and trial-request windows use the organization timezone. Members may request any time inside the saved trial window.</p>
          <Select value={selectedBranchId || "none"} onValueChange={(value) => setSelectedBranchId(value === "none" ? "" : value)}>
            <SelectTrigger aria-label="Branch schedule"><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Choose a branch</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        </header>
        <div className="divide-y divide-line">
          {selectedSchedule && selectedTrialSchedule ? WEEKDAY_ROWS.map(({ key, label }) => {
            const day = selectedSchedule.days[key];
            const trialWindow = selectedTrialSchedule.days[key];
            return (
              <div key={key} className="space-y-2 px-5 py-3">
                <div className="grid grid-cols-[110px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr_1fr]">
                  <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium"><Checkbox checked={day.enabled} onCheckedChange={(value) => { const enabled = value === true; updateHours(key, { enabled }); if (!enabled) updateTrialWindow(key, { enabled: false }); }} aria-label={`${label} open`} />{label}</label>
                  {day.enabled ? <><Input type="time" value={day.opensAt} onChange={(event) => updateHours(key, { opensAt: event.target.value })} aria-label={`${label} opening time`} /><Input type="time" value={day.closesAt} onChange={(event) => updateHours(key, { closesAt: event.target.value })} aria-label={`${label} closing time`} /></> : <span className="text-[12px] text-ink-3 sm:col-span-2">Closed</span>}
                </div>
                <div className="grid grid-cols-[110px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr_1fr]">
                  <label className="flex cursor-pointer items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-3">
                    <Checkbox checked={trialWindow.enabled} disabled={!day.enabled} onCheckedChange={(value) => updateTrialWindow(key, { enabled: value === true })} aria-label={`${label} trial requests enabled`} />
                    Trials
                  </label>
                  {day.enabled && trialWindow.enabled ? <>
                    <Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.opensAt} onChange={(event) => updateTrialWindow(key, { opensAt: event.target.value })} aria-label={`${label} trial window opening time`} />
                    <Input type="time" min={day.opensAt} max={day.closesAt} value={trialWindow.closesAt} onChange={(event) => updateTrialWindow(key, { closesAt: event.target.value })} aria-label={`${label} trial window closing time`} />
                  </> : <span className="text-[12px] text-ink-3 sm:col-span-2">{day.enabled ? "Not offered" : "Branch closed"}</span>}
                </div>
              </div>
            );
          }) : <p className="p-5 text-[12.5px] text-ink-3">{branches.length ? "Choose a branch to edit its hours and trial window." : "Create an active branch before setting hours."}</p>}
        </div>
      </section>
      <div className="xl:col-span-2 flex justify-end"><Button onClick={() => save.mutate(policies)} loading={save.isPending}>Save operational rules</Button></div>
    </div>
  );
}
