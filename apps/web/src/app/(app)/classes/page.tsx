"use client";

import { Check, ImagePlus, Plus, Printer, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { ClassAudience, ClassCoach, ClassSession, MemberSummary, UpsertClassSessionInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { getApi } from "@/lib/api/client";

// Default visible day; the window stretches automatically when a class is
// scheduled outside it, so nothing can render off-grid.
const DEFAULT_FIRST_HOUR = 6;
const DEFAULT_LAST_HOUR = 22; // exclusive end of the visible day
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DURATIONS = [30, 45, 60, 90, 120] as const;
const AUDIENCE_LABEL: Record<ClassAudience, string> = { mixed: "Mixed", women: "Women", men: "Men" };

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function rangeLabel(item: Pick<ClassSession, "startMinute" | "durationMinutes">): string {
  return `${minuteLabel(item.startMinute)}–${minuteLabel(item.startMinute + item.durationMinutes)}`;
}

/** Greedy lane packing so overlapping classes stack instead of colliding. */
function withLanes(items: ClassSession[]): Array<ClassSession & { lane: number; laneCount: number }> {
  const sorted = [...items].sort((left, right) => left.startMinute - right.startMinute || right.durationMinutes - left.durationMinutes);
  const laneEnds: number[] = [];
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMinute);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = item.startMinute + item.durationMinutes;
    return { ...item, lane, laneCount: 0 };
  });
  return placed.map((item) => ({ ...item, laneCount: laneEnds.length }));
}

type EditorState = {
  sessionId?: string;
  branchId: string;
  name: string;
  coachId: string;
  dayOfWeek: number;
  startMinute: number;
  durationMinutes: number;
  capacity: number;
  audience: ClassAudience;
  notes: string;
  imageAssetId?: string;
  imageUrl?: string;
  uploading: boolean;
  isNew: boolean;
};

type MenuState = { sessionId: string; x: number; y: number };

export default function ClassesPage() {
  const { session } = useApp();
  const permissions = usePermissions();
  const canManage = permissions.can("operations.manage");
  const canRoster = permissions.can("members.write") || permissions.can("pt.book_for_member");
  const invalidate = useInvalidate();
  const branches = session?.branches ?? [];
  const [branchChoice, setBranchChoice] = useState<string>();
  const branchId = branchChoice ?? session?.activeBranchId ?? branches[0]?.id;

  const sessionsQuery = useApiQuery(qk.classSessions(branchId ?? "none"), (api) => api.listClassSessions({ branchId: branchId! }), { enabled: Boolean(branchId) });
  const coachesQuery = useApiQuery(["classCoaches"] as const, (api) => api.listClassCoaches());
  const coaches: ClassCoach[] = coachesQuery.data ?? [];

  const [editor, setEditor] = useState<EditorState>();
  const [manageId, setManageId] = useState<string>();
  const [menu, setMenu] = useState<MenuState>();
  const [deleteTarget, setDeleteTarget] = useState<ClassSession>();
  const [deleteReason, setDeleteReason] = useState("");
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const normalizedMemberSearch = memberSearch.trim();
  const memberLookup = useApiQuery(
    qk.members({ search: normalizedMemberSearch, pageSize: 6 }),
    (api) => api.listMembers({ search: normalizedMemberSearch, pageSize: 6 }),
    { enabled: Boolean(manageId && canRoster && normalizedMemberSearch.length >= 2) },
  );
  const memberResults: MemberSummary[] = memberLookup.data?.items.filter((member) => member.status !== "archived") ?? [];
  const managed = sessionsQuery.data?.find((item) => item.id === manageId);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", close); };
  }, [menu]);

  const refresh = async () => { await invalidate([qk.classSessions(branchId ?? "none")]); };

  const save = useApiMutation((api) => {
    if (!editor) throw new Error("Nothing to save.");
    const input: UpsertClassSessionInput = {
      sessionId: editor.sessionId,
      branchId: editor.branchId,
      name: editor.name.trim(),
      coachId: editor.coachId || undefined,
      dayOfWeek: editor.dayOfWeek,
      startMinute: editor.startMinute,
      durationMinutes: editor.durationMinutes,
      capacity: editor.capacity,
      audience: editor.audience,
      notes: editor.notes.trim() || undefined,
      imageAssetId: editor.imageAssetId,
    };
    return api.upsertClassSession(input);
  }, {
    onSuccess: async () => { setEditor(undefined); await refresh(); },
    successMessage: "Schedule saved.",
  });

  const remove = useApiMutation((api) => api.deleteClassSession({ sessionId: deleteTarget!.id, reason: deleteReason.trim() }), {
    onSuccess: async () => { setDeleteTarget(undefined); setDeleteReason(""); await refresh(); },
    successMessage: "Class removed from the weekly schedule.",
  });

  const addAttendee = useApiMutation((api, memberId: string) => api.addClassAttendee({ sessionId: manageId!, memberId }), {
    onSuccess: async () => { setMemberSearch(""); await refresh(); },
  });
  const removeAttendee = useApiMutation((api, memberId: string) => api.removeClassAttendee({ sessionId: manageId!, memberId }), { onSuccess: refresh });
  const setAttendance = useApiMutation((api, input: { memberId: string; attended: boolean }) => api.setClassAttendance({ sessionId: manageId!, ...input }), { onSuccess: refresh });

  const upsertCoach = useApiMutation((api, input: { name: string; phone?: string; specialty?: string }) => api.upsertClassCoach(input), {
    onSuccess: async () => { await invalidate([["classCoaches"]]); },
    successMessage: "Coach saved.",
  });
  const removeCoach = useApiMutation((api, coachId: string) => api.removeClassCoach(coachId), {
    onSuccess: async () => { await invalidate([["classCoaches"], qk.classSessions(branchId ?? "none")]); },
    successMessage: "Coach removed.",
  });

  const openCreate = (dayOfWeek: number, startMinute: number) => {
    if (!canManage || !branchId) return;
    setEditor({ sessionId: crypto.randomUUID(), branchId, name: "", coachId: "", dayOfWeek, startMinute, durationMinutes: 60, capacity: 12, audience: "mixed", notes: "", uploading: false, isNew: true });
  };

  const openEdit = (target: ClassSession) => {
    setManageId(undefined);
    setMenu(undefined);
    setEditor({ sessionId: target.id, branchId: target.branchId, name: target.name, coachId: target.coachId ?? "", dayOfWeek: target.dayOfWeek, startMinute: target.startMinute, durationMinutes: target.durationMinutes, capacity: target.capacity, audience: target.audience, notes: target.notes ?? "", imageAssetId: target.imageAssetId, imageUrl: target.imageUrl, uploading: false, isNew: false });
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

  const printSchedule = () => {
    document.documentElement.classList.add("print-schedule");
    const cleanup = () => { document.documentElement.classList.remove("print-schedule"); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  const byDay = useMemo(() => DAYS.map((_, day) => withLanes((sessionsQuery.data ?? []).filter((item) => item.dayOfWeek === day))), [sessionsQuery.data]);

  const { firstHour, visibleHours } = useMemo(() => {
    let first = DEFAULT_FIRST_HOUR;
    let last = DEFAULT_LAST_HOUR;
    for (const item of sessionsQuery.data ?? []) {
      first = Math.min(first, Math.floor(item.startMinute / 60));
      last = Math.max(last, Math.ceil((item.startMinute + item.durationMinutes) / 60));
    }
    return { firstHour: first, visibleHours: Math.max(1, last - first) };
  }, [sessionsQuery.data]);

  const rowClick = (day: number) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canManage || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const minute = firstHour * 60 + Math.floor((ratio * visibleHours * 60) / 30) * 30;
    openCreate(day, minute);
  };

  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "";

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8" data-print-root>
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
          <div><p className="eyebrow">Studio</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Weekly class schedule</h1><p className="mt-2 text-[12.5px] text-ink-2">One timetable for every week. Select a class to manage its roster; managers can edit it from there.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {branches.length > 1 ? (
              <select aria-label="Branch" className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchId ?? ""} onChange={(event) => setBranchChoice(event.target.value)}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            ) : null}
            {canManage ? <Button variant="secondary" onClick={() => setCoachesOpen(true)}><Users /> Coaches</Button> : null}
            <Button variant="secondary" onClick={printSchedule} disabled={!sessionsQuery.data}><Printer /> Print</Button>
            {canManage ? <Button variant="signal" onClick={() => openCreate(0, 18 * 60)} disabled={!branchId}><Plus /> New class</Button> : null}
          </div>
        </div>

        <div className="hidden print:block"><p className="text-[20px] font-semibold">{branchName} — weekly class schedule</p></div>

        {!branchId ? <p className="mt-8 border border-line bg-surface px-5 py-8 text-center text-[12.5px] text-ink-3">Join a branch to manage classes.</p> : sessionsQuery.isLoading ? <Skeleton className="mt-6 h-[480px] w-full" /> : sessionsQuery.isError ? (
          <div className="mt-6 rounded-lg border border-line bg-surface p-5"><ErrorState title="Classes could not be loaded" description="The timetable is unavailable right now. Your existing schedule has not changed." onRetry={() => sessionsQuery.refetch()} /></div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface" data-print-schedule>
            <div style={{ minWidth: `${110 + visibleHours * 72}px` }}>
              <div className="grid" style={{ gridTemplateColumns: "110px 1fr" }}>
                <div className="border-b border-line bg-sunken px-3 py-2 font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Day</div>
                <div className="relative border-b border-s border-line bg-sunken">
                  <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${visibleHours}, 1fr)` }}>
                    {Array.from({ length: visibleHours }, (_, index) => (
                      <div key={index} className="border-s border-line/60 py-2 text-center font-mono text-[8px] uppercase tracking-[.05em] text-ink-3 first:border-s-0">{String(firstHour + index).padStart(2, "0")}:00</div>
                    ))}
                  </div>
                </div>
                {DAYS.map((label, day) => {
                  const items = byDay[day]!;
                  const lanes = Math.max(1, items[0]?.laneCount ?? 1);
                  return (
                    <div key={label} className="contents">
                      <div className="border-b border-line px-3 py-3 text-[11.5px] font-semibold">{label}</div>
                      <div
                        className={`relative border-b border-s border-line ${canManage ? "cursor-cell" : ""}`}
                        style={{ minHeight: `${Math.max(56, lanes * 52 + 8)}px` }}
                        onClick={rowClick(day)}
                        role={canManage ? "button" : undefined}
                        aria-label={canManage ? `Add a class on ${label}` : undefined}
                      >
                        <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${visibleHours}, 1fr)` }}>
                          {Array.from({ length: visibleHours }, (_, index) => <div key={index} className="border-s border-line/40 first:border-s-0" />)}
                        </div>
                        {items.map((item) => {
                          const left = ((item.startMinute - firstHour * 60) / (visibleHours * 60)) * 100;
                          const width = (item.durationMinutes / (visibleHours * 60)) * 100;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(event) => { event.stopPropagation(); setManageId(item.id); setMemberSearch(""); }}
                              onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (canManage) setMenu({ sessionId: item.id, x: event.clientX, y: event.clientY }); }}
                              className="absolute overflow-hidden rounded-md border border-signal/50 bg-signal-bg/70 px-2 py-1 text-start text-[10px] leading-tight shadow-sm transition-colors hover:border-signal"
                              style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(3, Math.min(width, 100 - left))}%`, top: `${4 + item.lane * 52}px`, height: "48px" }}
                              aria-label={`${item.name}, ${DAYS[item.dayOfWeek]} ${rangeLabel(item)}`}
                              title={`${item.name} — ${rangeLabel(item)} · ${item.roster.length}/${item.capacity}${item.coachName ? ` · ${item.coachName}` : ""}`}
                            >
                              <span className="flex items-center gap-1">
                                <span className="truncate font-semibold">{item.name}</span>
                                {item.audience !== "mixed" ? <span className="shrink-0 rounded-sm bg-night px-1 font-mono text-[7px] uppercase text-night-ink">{item.audience === "women" ? "W" : "M"}</span> : null}
                              </span>
                              <span className="block truncate text-ink-3">{item.roster.length}/{item.capacity}{item.coachName ? ` · ${item.coachName.split(" ")[0]}` : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {menu ? (
          <div className="fixed z-50 w-44 overflow-hidden rounded-md border border-line bg-surface shadow-dialog" style={{ left: menu.x, top: menu.y }} role="menu">
            {(() => {
              const target = sessionsQuery.data?.find((item) => item.id === menu.sessionId);
              if (!target) return null;
              return (
                <>
                  <button type="button" role="menuitem" className="block w-full px-3 py-2 text-start text-[12.5px] hover:bg-sunken" onClick={() => openEdit(target)}>Edit class</button>
                  <button type="button" role="menuitem" className="block w-full px-3 py-2 text-start text-[12.5px] hover:bg-sunken" onClick={() => { setMenu(undefined); setManageId(target.id); }}>Who is in</button>
                  <button type="button" role="menuitem" className="block w-full px-3 py-2 text-start text-[12.5px] text-danger hover:bg-danger-bg" onClick={() => { setMenu(undefined); setDeleteTarget(target); setDeleteReason(""); }}>Remove from schedule</button>
                </>
              );
            })()}
          </div>
        ) : null}

        <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open && !save.isPending) setEditor(undefined); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editor?.isNew ? "New class" : "Edit class"}</DialogTitle>
              <DialogDescription>This slot repeats every week until you change it.</DialogDescription>
            </DialogHeader>
            {editor ? (
              <DialogBody className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[12px] font-medium">Class name<Input value={editor.name} maxLength={80} autoFocus onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder="Morning HIIT" /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Coach<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.coachId} disabled={coachesQuery.isError} onChange={(event) => setEditor({ ...editor, coachId: event.target.value })}><option value="">{coachesQuery.isError ? "Coaches unavailable" : "No coach assigned"}</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select>{coachesQuery.isError ? <span className="text-[11px] font-normal text-danger">The coach directory could not be loaded. Save without a coach or retry the page.</span> : null}</label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Day<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.dayOfWeek} onChange={(event) => setEditor({ ...editor, dayOfWeek: Number(event.target.value) })}>{DAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Starts<Input type="time" value={minuteLabel(editor.startMinute)} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); if (Number.isFinite(hour) && Number.isFinite(minute)) setEditor({ ...editor, startMinute: hour! * 60 + minute! }); }} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Duration<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.durationMinutes} onChange={(event) => setEditor({ ...editor, durationMinutes: Number(event.target.value) })}>{DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Capacity<Input type="number" min={1} max={200} value={editor.capacity} onChange={(event) => setEditor({ ...editor, capacity: Number(event.target.value) })} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Who is it for?<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.audience} onChange={(event) => setEditor({ ...editor, audience: event.target.value as ClassAudience })}>{(Object.keys(AUDIENCE_LABEL) as ClassAudience[]).map((audience) => <option key={audience} value={audience}>{AUDIENCE_LABEL[audience]}</option>)}</select></label>
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
              <Button variant="signal" loading={save.isPending} disabled={!editor?.name.trim() || editor?.uploading || !Number.isSafeInteger(editor.capacity) || editor.capacity < 1 || editor.capacity > 200} onClick={() => save.mutate()}><Check /> Save class</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleteTarget(undefined); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
              <DialogDescription>The class leaves the weekly schedule for good; its audit history is kept.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <label className="grid gap-1.5 text-[12px] font-medium">Reason<Textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Required for the audit trail" /></label>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteTarget(undefined)} disabled={remove.isPending}>Keep it</Button>
              <Button variant="danger" loading={remove.isPending} disabled={!deleteReason.trim()} onClick={() => remove.mutate()}><Trash2 /> Remove class</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={coachesOpen} onOpenChange={setCoachesOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Coaches</DialogTitle>
              <DialogDescription>The directory the class scheduler picks from.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              {coachesQuery.isLoading ? <Skeleton className="h-28 w-full" /> : coachesQuery.isError ? (
                <ErrorState title="Coaches could not be loaded" description="The directory is unavailable right now. No coach records have changed." onRetry={() => coachesQuery.refetch()} />
              ) : <div className="divide-y divide-line rounded-md border border-line">
                {coaches.length === 0 ? <p className="px-3 py-4 text-center text-[11.5px] text-ink-3">No coaches yet — add the first one below.</p> : coaches.map((coach) => (
                  <div key={coach.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 text-[12.5px]"><p className="truncate font-semibold">{coach.name}</p><p className="truncate text-[10.5px] text-ink-3">{[coach.specialty, coach.phone].filter(Boolean).join(" · ") || "—"}</p></div>
                    <Button variant="ghost" size="sm" aria-label={`Remove ${coach.name}`} loading={removeCoach.isPending} onClick={() => removeCoach.mutate(coach.id)}><X /></Button>
                  </div>
                ))}
              </div>}
              {!coachesQuery.isError ? <CoachForm onSubmit={(input) => upsertCoach.mutate(input)} pending={upsertCoach.isPending} /> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCoachesOpen(false)}>Done</Button>
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
                    {DAYS[managed.dayOfWeek]} · {rangeLabel(managed)}{managed.coachName ? ` · ${managed.coachName}` : ""} · {AUDIENCE_LABEL[managed.audience]} · {managed.roster.length}/{managed.capacity} in
                  </DialogDescription>
                </DialogHeader>
                <DialogBody className="grid gap-4">
                  {managed.imageUrl ? <div className="h-28 rounded-sm border border-line bg-cover bg-center" role="img" aria-label={managed.imageAltText ?? `${managed.name} photo`} style={{ backgroundImage: `url(${managed.imageUrl})` }} /> : null}
                  <div>
                    <p className="eyebrow">Who is in</p>
                    <div className="mt-2 divide-y divide-line rounded-md border border-line">
                      {managed.roster.length === 0 ? <p className="px-3 py-4 text-center text-[11.5px] text-ink-3">No one is in this class yet.</p> : managed.roster.map((entry) => (
                        <div key={entry.memberId} className="flex items-center justify-between gap-2 px-3 py-2">
                          <label className="flex min-w-0 items-center gap-2.5 text-[12.5px]">
                            <input type="checkbox" checked={entry.attended} disabled={!canRoster} onChange={(event) => setAttendance.mutate({ memberId: entry.memberId, attended: event.target.checked })} aria-label={`Mark ${entry.name} present`} />
                            <span className={`truncate ${entry.attended ? "font-semibold" : ""}`}>{entry.name}</span>
                          </label>
                          {canRoster ? <Button variant="ghost" size="sm" aria-label={`Remove ${entry.name}`} onClick={() => removeAttendee.mutate(entry.memberId)}><X /></Button> : null}
                        </div>
                      ))}
                    </div>
                    {canRoster ? (
                      <div className="relative mt-2">
                        <label className="grid gap-1.5 text-[12px] font-medium">Add member
                          <Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by name or phone…" />
                        </label>
                        {memberLookup.isLoading ? <p className="mt-2 text-[11.5px] text-ink-3" role="status">Searching members…</p> : memberLookup.isError ? (
                          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[11.5px] text-danger" role="alert"><span>Member search is unavailable.</span><Button size="sm" variant="ghost" onClick={() => memberLookup.refetch()}>Retry</Button></div>
                        ) : memberResults.length > 0 ? (
                          <div className="absolute z-10 mt-1 w-full divide-y divide-line rounded-md border border-line bg-surface shadow-dialog">
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
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setManageId(undefined)}>Close</Button>
                  {canManage ? <Button variant="signal" onClick={() => openEdit(managed)}>Edit class</Button> : null}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function CoachForm({ onSubmit, pending }: { onSubmit: (input: { name: string; phone?: string; specialty?: string }) => void; pending: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  return (
    <div className="grid gap-2 rounded-md border border-dashed border-line-2 p-3">
      <p className="text-[12px] font-medium">Add a coach</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" aria-label="Coach name" />
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone (optional)" aria-label="Coach phone" />
        <Input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Specialty (optional)" aria-label="Coach specialty" />
      </div>
      <div className="flex justify-end"><Button size="sm" loading={pending} disabled={!name.trim()} onClick={() => { onSubmit({ name: name.trim(), phone: phone.trim() || undefined, specialty: specialty.trim() || undefined }); setName(""); setPhone(""); setSpecialty(""); }}><Plus /> Add coach</Button></div>
    </div>
  );
}
