"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, ImagePlus, Plus, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { qk } from "@/lib/api/keys";
import type { ClassSession, MemberSummary, StaffUser, UpsertClassSessionInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { getApi } from "@/lib/api/client";

const HOURS = Array.from({ length: 17 }, (_, index) => 6 + index); // 06:00 → 22:00 start slots
const DAY_MS = 86_400_000;
const DURATIONS = [30, 45, 60, 90, 120] as const;

/** Weeks start on Sunday, the first working day in Jordan. */
function weekStart(anchor: Date): Date {
  const value = new Date(anchor);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - value.getDay());
  return value;
}

function slotIso(day: Date, hour: number): string {
  const value = new Date(day);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

function dayLabel(day: Date): string {
  return day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
  const canRoster = permissions.can("members.write");
  const invalidate = useInvalidate();
  const branches = session?.branches ?? [];
  const [branchChoice, setBranchChoice] = useState<string>();
  const branchId = branchChoice ?? session?.activeBranchId ?? branches[0]?.id;
  const [weekAnchor, setWeekAnchor] = useState(() => weekStart(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => new Date(weekAnchor.getTime() + index * DAY_MS)), [weekAnchor]);
  const windowFrom = days[0]!.toISOString();
  const windowTo = new Date(days[6]!.getTime() + DAY_MS - 1).toISOString();

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
  const [memberResults, setMemberResults] = useState<MemberSummary[]>([]);
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
    onSuccess: async () => { setMemberSearch(""); setMemberResults([]); await refresh(); },
  });
  const removeAttendee = useApiMutation((api, memberId: string) => api.removeClassAttendee({ sessionId: manageId!, memberId }), { onSuccess: refresh });
  const setAttendance = useApiMutation((api, input: { memberId: string; attended: boolean }) => api.setClassAttendance({ sessionId: manageId!, ...input }), { onSuccess: refresh });

  const searchMembers = async (value: string) => {
    setMemberSearch(value);
    if (value.trim().length < 2) { setMemberResults([]); return; }
    try {
      const page = await getApi().listMembers({ search: value.trim(), pageSize: 6 });
      setMemberResults(page.items.filter((member) => member.status !== "archived"));
    } catch {
      setMemberResults([]);
    }
  };

  const openCreate = (day: Date, hour: number) => {
    if (!canManage || !branchId) return;
    setEditor({ sessionId: crypto.randomUUID(), branchId, name: "", coachUserId: "", startsAt: slotIso(day, hour), durationMinutes: 60, capacity: 12, notes: "", uploading: false });
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

  const sessionsFor = (day: Date, hour: number): ClassSession[] =>
    (sessionsQuery.data ?? []).filter((item) => {
      const starts = new Date(item.startsAt);
      return starts.getFullYear() === day.getFullYear() && starts.getMonth() === day.getMonth() && starts.getDate() === day.getDate() && starts.getHours() === hour;
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
              <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setWeekAnchor((current) => new Date(current.getTime() - 7 * DAY_MS))}><ChevronLeft /></Button>
              <button type="button" className="px-2 text-[12px] font-medium hover:underline" onClick={() => setWeekAnchor(weekStart(new Date()))}>
                {dayLabel(days[0]!)} – {dayLabel(days[6]!)}
              </button>
              <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setWeekAnchor((current) => new Date(current.getTime() + 7 * DAY_MS))}><ChevronRight /></Button>
            </div>
            {canManage ? <Button variant="signal" onClick={() => openCreate(days[0]!, 18)} disabled={!branchId}><Plus /> New class</Button> : null}
          </div>
        </div>

        {!branchId ? <p className="mt-8 border border-line bg-surface px-5 py-8 text-center text-[12.5px] text-ink-3">Join a branch to manage classes.</p> : sessionsQuery.isLoading ? <Skeleton className="mt-6 h-[480px] w-full" /> : (
          <div className="mt-6 overflow-x-auto border border-line bg-surface">
            <div className="min-w-[1180px]">
              <div className="grid" style={{ gridTemplateColumns: `130px repeat(${HOURS.length}, minmax(58px, 1fr))` }}>
                <div className="border-b border-line bg-sunken px-3 py-2 font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Date</div>
                {HOURS.map((hour) => (
                  <div key={hour} className="border-b border-s border-line bg-sunken px-1 py-2 text-center font-mono text-[8px] uppercase tracking-[.05em] text-ink-3">{String(hour).padStart(2, "0")}:00</div>
                ))}
                {days.map((day) => {
                  const isToday = new Date().toDateString() === day.toDateString();
                  return (
                    <div key={day.toISOString()} className="contents">
                      <div className={`border-b border-line px-3 py-3 text-[11.5px] font-semibold ${isToday ? "bg-signal-bg/40" : ""}`}>{dayLabel(day)}{isToday ? <span className="ms-1.5 font-mono text-[7.5px] uppercase tracking-[.1em] text-signal">today</span> : null}</div>
                      {HOURS.map((hour) => {
                        const slotSessions = sessionsFor(day, hour);
                        return (
                          <div key={hour} className={`relative min-h-[52px] border-b border-s border-line ${isToday ? "bg-signal-bg/15" : ""}`}>
                            {slotSessions.length === 0 && canManage ? (
                              <button type="button" aria-label={`Add class on ${dayLabel(day)} at ${String(hour).padStart(2, "0")}:00`} className="absolute inset-0 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100" onClick={() => openCreate(day, hour)}>
                                <span className="flex h-full items-center justify-center text-ink-3"><Plus className="size-3.5" /></span>
                              </button>
                            ) : null}
                            <div className="grid gap-1 p-1">
                              {slotSessions.map((item) => (
                                <button key={item.id} type="button" onClick={() => { setManageId(item.id); setCancelReason(""); setMemberSearch(""); setMemberResults([]); }} className={`w-full rounded-sm border px-1.5 py-1 text-start text-[10px] leading-tight transition-colors ${item.status === "cancelled" ? "border-line bg-sunken text-ink-3 line-through" : "border-signal/40 bg-signal-bg/60 hover:border-signal"}`}>
                                  <span className="block truncate font-semibold">{item.name}</span>
                                  <span className="block truncate text-ink-3">{timeLabel(item.startsAt)} · {item.roster.length}/{item.capacity}</span>
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
                  <label className="grid gap-1.5 text-[12px] font-medium">Coach<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.coachUserId} onChange={(event) => setEditor({ ...editor, coachUserId: event.target.value })}><option value="">No coach assigned</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Starts<Input type="datetime-local" value={editor.startsAt ? new Date(new Date(editor.startsAt).getTime() - new Date(editor.startsAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""} onChange={(event) => { if (event.target.value) setEditor({ ...editor, startsAt: new Date(event.target.value).toISOString() }); }} /></label>
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
              <Button variant="signal" loading={save.isPending} disabled={!editor?.name.trim() || !editor?.startsAt || editor?.uploading} onClick={() => save.mutate()}><Check /> Save class</Button>
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
                    {dayLabel(new Date(managed.startsAt))} · {timeLabel(managed.startsAt)} · {managed.durationMinutes} min{managed.coachName ? ` · ${managed.coachName}` : ""} · {managed.roster.length}/{managed.capacity} booked
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
                          <Input value={memberSearch} onChange={(event) => void searchMembers(event.target.value)} placeholder="Search by name or phone…" />
                        </label>
                        {memberResults.length > 0 ? (
                          <div className="absolute z-10 mt-1 w-full divide-y divide-line border border-line bg-surface shadow-dialog">
                            {memberResults.map((member) => (
                              <button key={member.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" onClick={() => addAttendee.mutate(member.id)}>
                                <span className="truncate">{member.fullName}</span>
                                <span className="flex items-center gap-1 text-ink-3"><UserPlus className="size-3.5" />{member.memberNumber}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
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
