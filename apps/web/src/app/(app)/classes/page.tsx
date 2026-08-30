"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, ImagePlus, Plus, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { ClassSession, MemberSummary, StaffUser, UpsertClassSessionInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { getApi } from "@/lib/api/client";
import { addDays, endOfDayInTz, localDateTimeToISO, partsInTimeZone, startOfDayInTz, TENANT_TIMEZONE, todayISODate } from "@/lib/utils/dates";

const HOURS = Array.from({ length: 17 }, (_, index) => 6 + index); // 06:00 → 22:00 start slots
const DURATIONS = [30, 45, 60, 90, 120] as const;

/** Weeks start on Sunday, the first working day in Jordan. */
function weekStart(anchor: string): string {
  const value = new Date(`${anchor}T12:00:00.000Z`);
  return addDays(anchor, -value.getUTCDay());
}

function slotIso(day: string, hour: number, timezone: string): string {
  return localDateTimeToISO(day, `${String(hour).padStart(2, "0")}:00`, timezone);
}

function dayLabel(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00.000Z`));
}

function timeLabel(iso: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
}

function localInputValue(iso: string, timezone: string): string {
  const parts = partsInTimeZone(new Date(iso), timezone);
  return `${parts.date}T${parts.time.slice(0, 5)}`;
}

type EditorState = {
  sessionId?: string;
  branchId: string;
  name: string;
  coachUserId: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  notes: string;
  imageAssetId?: string;
  imageUrl?: string;
  uploading: boolean;
};

export default function ClassesPage() {
  const { session } = useApp();
  const permissions = usePermissions();
  const canManage = permissions.can("operations.manage");
  const canRoster = permissions.can("members.write") || permissions.can("pt.book_for_member");
  const invalidate = useInvalidate();
  const timezone = session?.organization.timezone ?? TENANT_TIMEZONE;
  const locale = session?.organization.locale ?? "en-JO";
  const branches = session?.branches ?? [];
  const [branchChoice, setBranchChoice] = useState<string>();
  const branchId = branchChoice ?? session?.activeBranchId ?? branches[0]?.id;
  const [weekOffset, setWeekOffset] = useState(0);
  const currentTenantDate = todayISODate(timezone);
  const weekAnchor = addDays(weekStart(currentTenantDate), weekOffset * 7);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekAnchor, index)), [weekAnchor]);
  const windowFrom = startOfDayInTz(days[0]!, timezone).toISOString();
  const windowTo = endOfDayInTz(days[6]!, timezone).toISOString();

  const sessionsQuery = useApiQuery(
    qk.classSessions(branchId ?? "none", windowFrom, windowTo),
    (api) => api.listClassSessions({ branchId: branchId!, from: windowFrom, to: windowTo }),
    { enabled: Boolean(branchId) },
  );
  const staffQuery = useApiQuery(["classCoaches"] as const, (api) => api.listUsers({ status: "active", pageSize: 100 }));
  const coaches: StaffUser[] = staffQuery.data?.items ?? [];

  const [editor, setEditor] = useState<EditorState>();
  const [manageId, setManageId] = useState<string>();
  const [cancelReason, setCancelReason] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const normalizedMemberSearch = memberSearch.trim();
  const memberLookup = useApiQuery(
    qk.members({ search: normalizedMemberSearch, pageSize: 6 }),
    (api) => api.listMembers({ search: normalizedMemberSearch, pageSize: 6 }),
    { enabled: Boolean(manageId && canRoster && normalizedMemberSearch.length >= 2) },
  );
  const memberResults: MemberSummary[] = memberLookup.data?.items.filter((member) => member.status !== "archived") ?? [];
  const managed = sessionsQuery.data?.find((item) => item.id === manageId);

  const refresh = async () => { await invalidate([qk.classSessions(branchId ?? "none", windowFrom, windowTo)]); };

  const save = useApiMutation((api) => {
    if (!editor) throw new Error("Nothing to save.");
    const input: UpsertClassSessionInput = {
      sessionId: editor.sessionId,
      branchId: editor.branchId,
      name: editor.name.trim(),
      coachUserId: editor.coachUserId || undefined,
      startsAt: new Date(editor.startsAt).toISOString(),
      durationMinutes: editor.durationMinutes,
      capacity: editor.capacity,
      notes: editor.notes.trim() || undefined,
      imageAssetId: editor.imageAssetId,
    };
    return api.upsertClassSession(input);
  }, {
    onSuccess: async () => { setEditor(undefined); await refresh(); },
    successMessage: "Class saved.",
  });

  const cancelSession = useApiMutation((api) => api.cancelClassSession({ sessionId: manageId!, reason: cancelReason.trim() }), {
    onSuccess: async () => { setCancelReason(""); await refresh(); },
    successMessage: "Class cancelled.",
  });

  const addAttendee = useApiMutation((api, memberId: string) => api.addClassAttendee({ sessionId: manageId!, memberId }), {
    onSuccess: async () => { setMemberSearch(""); await refresh(); },
  });
  const removeAttendee = useApiMutation((api, memberId: string) => api.removeClassAttendee({ sessionId: manageId!, memberId }), { onSuccess: refresh });
  const setAttendance = useApiMutation((api, input: { memberId: string; attended: boolean }) => api.setClassAttendance({ sessionId: manageId!, ...input }), { onSuccess: refresh });

  const openCreate = (day: string, hour: number) => {
    if (!canManage || !branchId) return;
    setEditor({ sessionId: crypto.randomUUID(), branchId, name: "", coachUserId: "", startsAt: slotIso(day, hour, timezone), durationMinutes: 60, capacity: 12, notes: "", uploading: false });
  };

  const openDefaultCreate = () => {
    const tenantNow = partsInTimeZone(new Date(), timezone);
    const day = days.includes(tenantNow.date) ? tenantNow.date : days[0]!;
    const hour = day === tenantNow.date ? Math.min(22, Math.max(6, tenantNow.hour + 1)) : 18;
    openCreate(day, hour);
  };

  const openEdit = (target: ClassSession) => {
    setManageId(undefined);
    setEditor({ sessionId: target.id, branchId: target.branchId, name: target.name, coachUserId: target.coachUserId ?? "", startsAt: target.startsAt, durationMinutes: target.durationMinutes, capacity: target.capacity, notes: target.notes ?? "", imageAssetId: target.imageAssetId, imageUrl: target.imageUrl, uploading: false });
  };

  const uploadImage = async (file: File) => {
    if (!editor) return;
    setEditor((current) => current ? { ...current, uploading: true } : current);
    try {
      const asset = await getApi().uploadMediaAsset({ ownerType: "class_image", ownerId: editor.sessionId ?? "", altText: `${editor.name.trim() || "Class"} photo`, file });
      setEditor((current) => current ? { ...current, imageAssetId: asset.id, imageUrl: asset.url, uploading: false } : current);
    } catch (error) {
      setEditor((current) => current ? { ...current, uploading: false } : current);
      toast.error(error instanceof Error ? error.message : "The image could not be uploaded.");
    }
  };

  const sessionsFor = (day: string, hour: number): ClassSession[] =>
    (sessionsQuery.data ?? []).filter((item) => {
      const starts = partsInTimeZone(new Date(item.startsAt), timezone);
      return starts.date === day && starts.hour === hour;
    });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="eyebrow">Studio</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Classes</h1><p className="mt-2 text-[12.5px] text-ink-2">Press any open slot to schedule a class; press a class to manage its roster.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {branches.length > 1 ? (
              <select aria-label="Branch" className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchId ?? ""} onChange={(event) => setBranchChoice(event.target.value)}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            ) : null}
            <div className="flex items-center rounded-md border border-line-2">
              <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setWeekOffset((current) => current - 1)}><ChevronLeft /></Button>
              <button type="button" className="min-h-9 px-2 text-[12px] font-medium hover:underline" onClick={() => setWeekOffset(0)}>
                {dayLabel(days[0]!, locale)} – {dayLabel(days[6]!, locale)}
              </button>
              <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setWeekOffset((current) => current + 1)}><ChevronRight /></Button>
            </div>
            {canManage ? <Button variant="signal" onClick={openDefaultCreate} disabled={!branchId}><Plus /> New class</Button> : null}
          </div>
        </div>

        {!branchId ? <p className="mt-8 border border-line bg-surface px-5 py-8 text-center text-[12.5px] text-ink-3">Join a branch to manage classes.</p> : sessionsQuery.isLoading ? <Skeleton className="mt-6 h-[480px] w-full" /> : sessionsQuery.isError ? (
          <div className="mt-6 border border-line bg-surface p-5"><ErrorState title="Classes could not be loaded" description="The calendar is unavailable right now. Your existing schedule has not changed." onRetry={() => sessionsQuery.refetch()} /></div>
        ) : (
          <div className="mt-6 overflow-x-auto border border-line bg-surface">
            <div className="min-w-[1180px]">
              <div className="grid" style={{ gridTemplateColumns: `130px repeat(${HOURS.length}, minmax(58px, 1fr))` }}>
                <div className="border-b border-line bg-sunken px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-ink-3">Date</div>
                {HOURS.map((hour) => (
                  <div key={hour} className="border-b border-s border-line bg-sunken px-1 py-2 text-center font-mono text-[10px] uppercase tracking-[.05em] text-ink-3">{String(hour).padStart(2, "0")}:00</div>
                ))}
                {days.map((day) => {
                  const isToday = currentTenantDate === day;
                  return (
                    <div key={day} className="contents">
                      <div className={`border-b border-line px-3 py-3 text-[12px] font-semibold ${isToday ? "bg-signal-bg/40" : ""}`}>{dayLabel(day, locale)}{isToday ? <span className="ms-1.5 font-mono text-[9px] uppercase tracking-[.1em] text-signal">today</span> : null}</div>
                      {HOURS.map((hour) => {
                        const slotSessions = sessionsFor(day, hour);
                        return (
                          <div key={hour} className={`relative min-h-14 border-b border-s border-line ${isToday ? "bg-signal-bg/15" : ""}`}>
                            {slotSessions.length === 0 && canManage ? (
                              <button type="button" aria-label={`Add class on ${dayLabel(day, locale)} at ${String(hour).padStart(2, "0")}:00`} className="absolute inset-0 opacity-25 transition-opacity hover:bg-sunken hover:opacity-100 focus-visible:bg-sunken focus-visible:opacity-100" onClick={() => openCreate(day, hour)}>
                                <span className="flex h-full items-center justify-center text-ink-3"><Plus className="size-3.5" /></span>
                              </button>
                            ) : null}
                            <div className="grid gap-1 p-1">
                              {slotSessions.map((item) => (
                                <button key={item.id} type="button" onClick={() => { setManageId(item.id); setCancelReason(""); setMemberSearch(""); }} className={`min-h-11 w-full rounded-sm border px-1.5 py-1 text-start text-[11px] leading-tight transition-colors ${item.status === "cancelled" ? "border-line bg-sunken text-ink-3 line-through" : "border-signal/40 bg-signal-bg/60 hover:border-signal"}`}>
                                  <span className="block truncate font-semibold">{item.name}</span>
                                  <span className="block truncate text-ink-3">{timeLabel(item.startsAt, locale, timezone)} · {item.roster.length}/{item.capacity}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open && !save.isPending) setEditor(undefined); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editor?.sessionId && sessionsQuery.data?.some((item) => item.id === editor.sessionId) ? "Edit class" : "New class"}</DialogTitle>
              <DialogDescription>Everything here is visible to your team on the calendar.</DialogDescription>
            </DialogHeader>
            {editor ? (
              <DialogBody className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[12px] font-medium">Class name<Input value={editor.name} maxLength={80} autoFocus onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Morning HIIT" /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Coach<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.coachUserId} disabled={staffQuery.isError} onChange={(event) => setEditor({ ...editor, coachUserId: event.target.value })}><option value="">{staffQuery.isError ? "Coaches unavailable" : "No coach assigned"}</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select>{staffQuery.isError ? <span className="text-[11px] font-normal text-danger">Staff could not be loaded. Save without a coach or retry the page.</span> : null}</label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Starts<Input type="datetime-local" value={editor.startsAt ? localInputValue(editor.startsAt, timezone) : ""} onChange={(event) => { const [date, time] = event.target.value.split("T"); if (date && time) setEditor({ ...editor, startsAt: localDateTimeToISO(date, time, timezone) }); }} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Duration<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.durationMinutes} onChange={(event) => setEditor({ ...editor, durationMinutes: Number(event.target.value) })}>{DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Capacity<Input type="number" min={1} max={200} value={editor.capacity} onChange={(event) => setEditor({ ...editor, capacity: Number(event.target.value) })} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Photo (optional)
                    <div className="flex items-center gap-2">
                      {editor.imageUrl ? <span className="size-10 shrink-0 rounded-sm border border-line bg-cover bg-center" role="img" aria-label="Class photo" style={{ backgroundImage: `url(${editor.imageUrl})` }} /> : <ImagePlus className="size-5 text-ink-3" aria-hidden />}
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={editor.uploading} className="w-full text-[11px] file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-1" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} />
                    </div>
                  </label>
                </div>
                <label className="grid gap-1.5 text-[12px] font-medium">Notes<Textarea value={editor.notes} maxLength={500} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} placeholder="Bring boxing gloves…" /></label>
              </DialogBody>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditor(undefined)} disabled={save.isPending}>Cancel</Button>
              <Button variant="signal" loading={save.isPending} disabled={!editor?.name.trim() || !editor?.startsAt || editor?.uploading || !Number.isSafeInteger(editor.capacity) || editor.capacity < 1 || editor.capacity > 200} onClick={() => save.mutate()}><Check /> Save class</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(managed)} onOpenChange={(open) => { if (!open) setManageId(undefined); }}>
          <DialogContent className="max-w-xl">
            {managed ? (
              <>
                <DialogHeader>
                  <DialogTitle>{managed.name}</DialogTitle>
                  <DialogDescription>
                    {dayLabel(partsInTimeZone(new Date(managed.startsAt), timezone).date, locale)} · {timeLabel(managed.startsAt, locale, timezone)} · {managed.durationMinutes} min{managed.coachName ? ` · ${managed.coachName}` : ""} · {managed.roster.length}/{managed.capacity} booked
                    {managed.status === "cancelled" ? ` · cancelled${managed.cancelReason ? `: ${managed.cancelReason}` : ""}` : ""}
                  </DialogDescription>
                </DialogHeader>
                <DialogBody className="grid gap-4">
                  {managed.imageUrl ? <div className="h-28 rounded-sm border border-line bg-cover bg-center" role="img" aria-label={managed.imageAltText ?? `${managed.name} photo`} style={{ backgroundImage: `url(${managed.imageUrl})` }} /> : null}
                  <div>
                    <p className="eyebrow">Who is in</p>
                    <div className="mt-2 divide-y divide-line border border-line">
                      {managed.roster.length === 0 ? <p className="px-3 py-4 text-center text-[11.5px] text-ink-3">No one is booked yet.</p> : managed.roster.map((entry) => (
                        <div key={entry.memberId} className="flex items-center justify-between gap-2 px-3 py-2">
                          <label className="flex min-w-0 items-center gap-2.5 text-[12.5px]">
                            <input type="checkbox" checked={entry.attended} disabled={!canRoster || managed.status === "cancelled"} onChange={(event) => setAttendance.mutate({ memberId: entry.memberId, attended: event.target.checked })} aria-label={`Mark ${entry.name} present`} />
                            <span className={`truncate ${entry.attended ? "font-semibold" : ""}`}>{entry.name}</span>
                          </label>
                          {canRoster ? <Button variant="ghost" size="sm" aria-label={`Remove ${entry.name}`} onClick={() => removeAttendee.mutate(entry.memberId)}><X /></Button> : null}
                        </div>
                      ))}
                    </div>
                    {canRoster && managed.status !== "cancelled" ? (
                      <div className="relative mt-2">
                        <label className="grid gap-1.5 text-[12px] font-medium">Add member
                          <Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by name or phone…" />
                        </label>
                        {memberLookup.isLoading ? <p className="mt-2 text-[11.5px] text-ink-3" role="status">Searching members…</p> : memberLookup.isError ? (
                          <div className="mt-2 flex items-center justify-between gap-3 border border-danger/30 bg-danger-bg px-3 py-2 text-[11.5px] text-danger" role="alert"><span>Member search is unavailable.</span><Button size="sm" variant="ghost" onClick={() => memberLookup.refetch()}>Retry</Button></div>
                        ) : memberResults.length > 0 ? (
                          <div className="absolute z-10 mt-1 w-full divide-y divide-line border border-line bg-surface shadow-dialog">
                            {memberResults.map((member) => (
                              <button key={member.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" onClick={() => addAttendee.mutate(member.id)}>
                                <span className="truncate">{member.fullName}</span>
                                <span className="flex items-center gap-1 text-ink-3"><UserPlus className="size-3.5" />{member.memberNumber}</span>
                              </button>
                            ))}
                          </div>
                        ) : normalizedMemberSearch.length >= 2 ? <p className="mt-2 text-[11.5px] text-ink-3">No members match this search.</p> : null}
                      </div>
                    ) : null}
                  </div>
                  {canManage && managed.status !== "cancelled" ? (
                    <div className="border-t border-line pt-3">
                      <label className="grid gap-1.5 text-[12px] font-medium">Cancel this class<Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Reason members and the audit trail will see" /></label>
                      <div className="mt-2 flex justify-end"><Button variant="danger" size="sm" loading={cancelSession.isPending} disabled={!cancelReason.trim()} onClick={() => cancelSession.mutate()}><CalendarDays /> Cancel class</Button></div>
                    </div>
                  ) : null}
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setManageId(undefined)}>Close</Button>
                  {canManage && managed.status !== "cancelled" ? <Button variant="signal" onClick={() => openEdit(managed)}>Edit class</Button> : null}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
