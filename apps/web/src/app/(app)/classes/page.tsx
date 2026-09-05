"use client";

import { tabListClassName, tabTriggerClassName } from "@/components/ui/tabs";

import { Check, ImagePlus, Plus, Printer, Trash2, UserPlus, Users, X, Pencil } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { ClassAudience, ClassCoach, ClassOccurrence, ClassSession, MemberSummary, UpsertClassSessionInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { PageHeader } from "@/components/shared/chrome";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { getApi } from "@/lib/api/client";
import { addDays, formatDate, formatDateTime, todayISODate } from "@/lib/utils/dates";

// Default visible day; the window stretches automatically when a class is
// scheduled outside it, so nothing can render off-grid.
const DEFAULT_FIRST_HOUR = 6;
const DEFAULT_LAST_HOUR = 22; // exclusive end of the visible day
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DURATIONS = [30, 45, 60, 90, 120] as const;
const AUDIENCE_LABEL: Record<ClassAudience, string> = { mixed: "Mixed", women: "Women", men: "Men" };
// Owner-requested audience colors: pink for women, blue for men, black for
// mixed — the calendar reads at a glance and the printed sheet inherits them.
const AUDIENCE_ACCENT: Record<ClassAudience, string> = { mixed: "#1c1917", women: "#db2777", men: "#2563eb" };

/** 24h "HH:MM" — required as the VALUE format of native time inputs only. */
function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Owner-requested 12-hour display, e.g. 390 → "6:30 AM"; 1440 → "12:00 AM". */
function meridiemLabel(minute: number, withMeridiem = true): string {
  const hour24 = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")}${withMeridiem ? ` ${hour24 < 12 ? "AM" : "PM"}` : ""}`;
}

function rangeLabel(item: Pick<ClassSession, "startMinute" | "durationMinutes">): string {
  const start = item.startMinute;
  const end = item.startMinute + item.durationMinutes;
  const sameMeridiem = (Math.floor(start / 60) % 24 < 12) === (Math.floor(end / 60) % 24 < 12);
  return `${meridiemLabel(start, !sameMeridiem)}–${meridiemLabel(end)}`;
}

/** Compact hour-column label: "6 AM", "12 PM", "11 PM". */
function hourLabel(hour: number): string {
  const hour24 = hour % 24;
  return `${hour24 % 12 === 0 ? 12 : hour24 % 12} ${hour24 < 12 ? "AM" : "PM"}`;
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



export default function ClassesPage() { return <Suspense><ClassesWorkspace /></Suspense>; }

function ClassesWorkspace() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = params.get("view") === "timetable" ? "timetable" : "agenda";
  const updateView = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => next.set(key, value));
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const { session } = useApp();
  const permissions = usePermissions();
  const canManage = permissions.can("operations.manage");
  const canRoster = permissions.can("members.write") || permissions.can("pt.book_for_member");
  const invalidate = useInvalidate();
  const branches = session?.branches ?? [];
  const requestedBranch = params.get("branch");
  const branchId = branches.find((branch) => branch.id === requestedBranch)?.id ?? session?.activeBranchId ?? branches[0]?.id;
  const setBranchChoice = (branch: string) => updateView({ branch });

  const sessionsQuery = useApiQuery(qk.classSessions(branchId ?? "none"), (api) => api.listClassSessions({ branchId: branchId! }), { enabled: Boolean(branchId) });
  const coachesQuery = useApiQuery(["classCoaches"] as const, (api) => api.listClassCoaches());
  const coaches: ClassCoach[] = coachesQuery.data ?? [];
  // The dated-occurrence window feeds roster management and "Open next dated
  // class"; the calendar is the only visible surface.
  const requestedDate = params.get("from");
  const validDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && Number.isFinite(Date.parse(requestedDate)) && new Date(requestedDate).toISOString().slice(0, 10) === requestedDate;
  const weekStart = validDate ? requestedDate : todayISODate(session?.organization.timezone);
  const weekEnd = addDays(weekStart, 6);
  const occurrencesQuery = useApiQuery(qk.classOccurrences(branchId ?? "none", weekStart, weekEnd, undefined), (api) => api.listClassOccurrences({ branchId: branchId!, fromDate: weekStart, toDate: weekEnd }), { enabled: Boolean(branchId) });
  const calendarBoundsQuery = useApiQuery(qk.classCalendarBounds, (api) => api.getClassCalendarBounds());

  const [editor, setEditor] = useState<EditorState>();
  const [manageId, setManageId] = useState<string>();
  const [manageOccurrenceId, setManageOccurrenceId] = useState<string>();
  const [overrideReason, setOverrideReason] = useState("");
  const [substituteCoachId, setSubstituteCoachId] = useState("");
  const [substituteReason, setSubstituteReason] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<ClassSession>();
  const [deleteReason, setDeleteReason] = useState("");
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const normalizedMemberSearch = memberSearch.trim();
  const memberLookup = useApiQuery(
    qk.members({ search: normalizedMemberSearch, pageSize: 6 }),
    (api) => api.listMembers({ search: normalizedMemberSearch, pageSize: 6 }),
    { enabled: Boolean((manageId || manageOccurrenceId) && canRoster && normalizedMemberSearch.length >= 2) },
  );
  const memberResults: MemberSummary[] = memberLookup.data?.items.filter((member) => member.status !== "archived") ?? [];
  const managed = sessionsQuery.data?.find((item) => item.id === manageId);
  const managedOccurrence = occurrencesQuery.data?.find((item) => item.id === manageOccurrenceId);
  // Booking counts live on dated occurrences, not the weekly template. Each
  // chip and the details popup show the upcoming date's real numbers.
  const nextOccurrenceByTemplate = useMemo(() => {
    const map = new Map<string, ClassOccurrence>();
    for (const occurrence of occurrencesQuery.data ?? []) {
      if (occurrence.status === "cancelled") continue;
      if (!map.has(occurrence.templateId)) map.set(occurrence.templateId, occurrence);
    }
    return map;
  }, [occurrencesQuery.data]);
  const bookedLabel = (session: ClassSession): string => {
    const next = nextOccurrenceByTemplate.get(session.id);
    return next ? `${next.bookedCount}/${next.capacity}` : occurrencesQuery.isError ? "Bookings unavailable" : occurrencesQuery.isLoading ? "Loading bookings" : "No upcoming date";
  };

  const refresh = async () => { await invalidate([qk.classSessions(branchId ?? "none"), qk.classOccurrences(branchId ?? "none", weekStart, weekEnd, undefined)]); };

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
  const addOccurrenceAttendee = useApiMutation(async (api, memberId: string) => {
    const memberships = await api.listMemberships({ memberId, status: "active", pageSize: 50 });
    const membership = memberships.items.find((item) => item.homeBranchId === managedOccurrence?.branchId) ?? memberships.items[0];
    if (!membership) throw new Error("This member has no active membership for this class.");
    return api.addClassOccurrenceAttendee({ occurrenceId: manageOccurrenceId!, memberId, membershipId: membership.id, overrideReason: overrideReason.trim() || undefined });
  }, { onSuccess: async () => { setMemberSearch(""); setOverrideReason(""); await refresh(); } });
  const removeOccurrenceAttendee = useApiMutation((api, bookingId: string) => api.removeClassOccurrenceAttendee({ occurrenceId: manageOccurrenceId!, bookingId, reason: "Removed from the dated roster by staff" }), { onSuccess: refresh });
  const setOccurrenceAttendance = useApiMutation((api, input: { bookingId: string; attended: boolean }) => api.setClassOccurrenceAttendance({ occurrenceId: manageOccurrenceId!, ...input }), { onSuccess: refresh });
  const finalizeOccurrence = useApiMutation((api) => api.finalizeClassOccurrenceAttendance({ occurrenceId: manageOccurrenceId! }), { onSuccess: async () => { setFinalizeOpen(false); await refresh(); }, successMessage: "Attendance finalized. Unmarked bookings were recorded using the gym's no-show policy." });
  const substituteCoach = useApiMutation((api) => api.substituteClassOccurrenceCoach({ occurrenceId: manageOccurrenceId!, coachId: substituteCoachId, reason: substituteReason.trim() }), {
    onSuccess: async () => { setSubstituteCoachId(""); setSubstituteReason(""); await refresh(); },
    successMessage: "Coach substitution recorded for this class only.",
  });

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
    setEditor({ sessionId: target.id, branchId: target.branchId, name: target.name, coachId: target.coachId ?? "", dayOfWeek: target.dayOfWeek, startMinute: target.startMinute, durationMinutes: target.durationMinutes, capacity: target.capacity, audience: target.audience, notes: target.notes ?? "", imageAssetId: target.imageAssetId, imageUrl: target.imageUrl, uploading: false, isNew: false });
  };

  const openNextOccurrence = (templateId: string) => {
    const next = occurrencesQuery.data?.find((occurrence) => occurrence.templateId === templateId && occurrence.status !== "cancelled");
    if (!next) { toast.error("No dated class is available in this seven-day view."); return; }
    setManageOccurrenceId(next.id);
    setMemberSearch("");
    setOverrideReason("");
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
    // Landscape applies only to this print run; receipts keep their own layout.
    const pageStyle = document.createElement("style");
    pageStyle.textContent = "@page { size: A4 landscape; margin: 9mm; }";
    document.head.appendChild(pageStyle);
    const cleanup = () => { document.documentElement.classList.remove("print-schedule"); pageStyle.remove(); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };

  const byDay = useMemo(() => DAYS.map((_, day) => withLanes((sessionsQuery.data ?? []).filter((item) => item.dayOfWeek === day))), [sessionsQuery.data]);

  const { firstHour, visibleHours } = useMemo(() => {
    const sessions = sessionsQuery.data ?? [];
    const bounds = calendarBoundsQuery.data;
    // The window hugs the gym's own classes so the grid always fits without
    // horizontal scrolling; explicit Settings hours widen or pin it, and any
    // class outside them still stretches the window rather than hiding.
    let first = bounds?.startHour ?? (sessions.length ? 23 : DEFAULT_FIRST_HOUR);
    let last = bounds?.endHour ?? (sessions.length ? 1 : DEFAULT_LAST_HOUR);
    for (const item of sessions) {
      first = Math.min(first, Math.floor(item.startMinute / 60));
      last = Math.max(last, Math.ceil((item.startMinute + item.durationMinutes) / 60));
    }
    // Never past midnight; a legacy overnight class renders clipped at 24:00.
    last = Math.min(24, Math.max(last, first + 4));
    return { firstHour: Math.max(0, first), visibleHours: Math.max(1, last - first) };
  }, [sessionsQuery.data, calendarBoundsQuery.data]);

  const rowClick = (day: number) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canManage || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    const minute = firstHour * 60 + Math.floor((ratio * visibleHours * 60) / 30) * 30;
    openCreate(day, minute);
  };

  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "";

  return (
    <div className="space-y-5" data-print-root>
      <div className="print:hidden">
        <PageHeader
          title="Classes"
          description="See the next classes, manage bookings, and record who attended."
          actions={<div className="flex flex-wrap items-center gap-2">
            {branches.length > 1 ? (
              <select aria-label="Branch" className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchId ?? ""} onChange={(event) => setBranchChoice(event.target.value)}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            ) : null}
            {canManage ? <Button variant="secondary" onClick={() => setCoachesOpen(true)}><Users /> Coaches</Button> : null}
            <Button variant="secondary" onClick={printSchedule} disabled={!sessionsQuery.data}><Printer /> Print</Button>
            {canManage ? <Button variant="primary" onClick={() => openCreate(0, 18 * 60)} disabled={!branchId}><Plus /> New class</Button> : null}
          </div>}
        />
      </div>

        <div className="hidden print:block" data-print-header>
          <div className="flex items-end justify-between gap-6 border-b-2 border-black pb-3">
            <div className="flex items-center gap-4">
              {session?.organization.brand?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- print header needs a plain img so browsers reliably render it on paper
                <img src={session.organization.brand.logoUrl} alt="" className="h-12 w-auto max-w-40 object-contain" />
              ) : null}
              <div>
                <p className="font-display text-[24px] font-semibold leading-tight">{session?.organization.name ?? "Weekly class schedule"}</p>
                <p className="text-[12px]">{branchName} · Weekly class schedule</p>
              </div>
            </div>
            <div className="text-end text-[12px] leading-4">
              <p>Printed {formatDate(todayISODate())}</p>
              <p>Operated by RIVET™</p>
            </div>
          </div>
        </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className={tabListClassName} role="group" aria-label="Class view">
          {([['agenda', 'Upcoming classes'], ['timetable', 'Weekly timetable']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} className={tabTriggerClassName} onClick={() => updateView({ view: value })}>{label}</button>)}
        </div>
      {view === "agenda" ? <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" aria-label="Previous seven days" onClick={() => updateView({ from: addDays(weekStart, -7) })}>Previous</Button><span className="text-[12px] tabular-nums">{formatDate(weekStart)} – {formatDate(weekEnd)}</span><Button variant="secondary" size="sm" aria-label="Next seven days" onClick={() => updateView({ from: addDays(weekStart, 7) })}>Next</Button><Button variant="ghost" size="sm" onClick={() => updateView({ from: todayISODate(session?.organization.timezone) })}>Today</Button></div> : <p className="text-[12px] text-ink-2">Repeats weekly · {branchName}</p>}
      </div>
      {sessionsQuery.isBackgroundError ? <ErrorState layout="inline" title="Timetable could not refresh" onRetry={() => sessionsQuery.refetch()} /> : null}
      {view === "agenda" ? <section className="panel overflow-hidden print:hidden" aria-label="Upcoming classes">
        {occurrencesQuery.isBackgroundError ? <ErrorState layout="inline" title="Classes could not refresh" onRetry={() => occurrencesQuery.refetch()} /> : null}
        {!branchId ? <EmptyState layout="section" title="No branch available" description="Ask your manager to assign a branch before opening its classes." className="m-4" /> : occurrencesQuery.isLoading && !occurrencesQuery.data ? <div className="space-y-3 p-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : occurrencesQuery.isError && !occurrencesQuery.data ? <ErrorState layout="section" title="Classes could not be loaded" onRetry={() => occurrencesQuery.refetch()} className="m-4" /> : !occurrencesQuery.data?.length ? <EmptyState layout="section" title="No classes in these seven days" description="Choose another week or check the weekly timetable." className="m-4" /> : <ul className="divide-y divide-line">{occurrencesQuery.data.map((occurrence) => <li key={occurrence.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-[132px_minmax(0,1fr)_auto]" data-testid="class-agenda-row">
          <div className="text-[13px]"><p className="font-semibold">{formatDate(occurrence.date)}</p><p className="mt-1 tabular-nums text-ink-2">{new Intl.DateTimeFormat("en-JO", { hour: "numeric", minute: "2-digit", timeZone: session?.organization.timezone }).format(new Date(occurrence.startsAt))}</p></div>
          <div className="min-w-0"><h2 className="text-[15px] font-semibold break-words">{occurrence.name}</h2><p className="mt-1 text-[13px] text-ink-2">{occurrence.coachName ?? "Coach not assigned"} · {AUDIENCE_LABEL[occurrence.audience]}</p><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2"><span>{occurrence.bookedCount}/{occurrence.capacity} booked</span><span>{occurrence.waitlistCount} waiting</span><span>{occurrence.status === "cancelled" ? "Cancelled" : occurrence.attendanceFinalizedAt ? "Attendance finalized" : "Attendance open"}</span></p></div>
          <div className="flex flex-wrap items-center gap-2 sm:col-start-2 xl:col-start-auto">{occurrence.status !== "cancelled" && canRoster ? <Button variant="secondary" onClick={() => { setManageOccurrenceId(occurrence.id); setMemberSearch(""); }}>Who booked</Button> : null}<Button variant="ghost" onClick={() => setDetailsId(occurrence.templateId)}>Class details</Button></div>
        </li>)}</ul>}
      </section> : null}
      <div className={cn(view === "agenda" && "hidden print:block")}>
        {!branchId ? <p className="mt-8 border border-line bg-surface px-5 py-8 text-center text-[12.5px] text-ink-3">Join a branch to manage classes.</p> : sessionsQuery.isLoading ? <Skeleton className="mt-6 h-[480px] w-full" /> : sessionsQuery.isError ? (
          <div className="mt-6 rounded-lg border border-line bg-surface p-5"><ErrorState title="Classes could not be loaded" description="The timetable is unavailable right now. Your existing schedule has not changed." onRetry={() => sessionsQuery.refetch()} /></div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface" data-print-schedule>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2.5 text-[12px] text-ink-2" aria-label="Audience color legend">
              <span className="text-[12px] text-ink-3">Classes for</span>
              {(["mixed", "women", "men"] as const).map((audience) => (
                <span key={audience} className="inline-flex items-center gap-1.5 font-medium">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: AUDIENCE_ACCENT[audience] }} />
                  {audience === "mixed" ? "Everyone" : AUDIENCE_LABEL[audience]}
                </span>
              ))}
            </div>
            <div className="min-w-[560px]">
              <div className="grid" style={{ gridTemplateColumns: "96px 1fr" }}>
                <div className="border-b border-line" />
                <div className="relative border-b border-line">
                  <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${visibleHours}, 1fr)` }}>
                    {Array.from({ length: visibleHours }, (_, index) => (
                      <div key={index} className="py-2.5 ps-1.5 text-start text-[12px] font-medium text-ink-2">{hourLabel(firstHour + index)}</div>
                    ))}
                  </div>
                </div>
                {DAYS.map((label, day) => {
                  const items = byDay[day]!;
                  const lanes = Math.max(1, items[0]?.laneCount ?? 1);
                  const isToday = new Date().getDay() === day;
                  return (
                    <div key={label} className="contents">
                      <div className={cn("flex items-center gap-1.5 border-b border-line/70 px-3 text-[12px]", isToday ? "font-semibold" : "font-medium text-ink-2")}>
                        {isToday ? <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: "var(--tenant-brand-primary)" }} /> : null}
                        {label}
                      </div>
                      <div
                        className={cn("relative border-b border-line/70", canManage && "cursor-cell", isToday && "bg-sunken/40")}
                        style={{ minHeight: `${Math.max(64, lanes * 58 + 10)}px` }}
                        onClick={rowClick(day)}


                      >
                        <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${visibleHours}, 1fr)` }}>
                          {Array.from({ length: visibleHours }, (_, index) => <div key={index} className="border-s border-line/25 first:border-s-0" />)}
                        </div>
                        {items.map((item) => {
                          const left = ((item.startMinute - firstHour * 60) / (visibleHours * 60)) * 100;
                          const width = (item.durationMinutes / (visibleHours * 60)) * 100;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(event) => { event.stopPropagation(); if (canManage) setDetailsId(item.id); else openNextOccurrence(item.id); }}
                              onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (canManage) setDetailsId(item.id); }}
                              className="group absolute cursor-pointer overflow-hidden rounded-md border border-line-2 bg-paper ps-2.5 pe-2 py-1.5 text-start text-[12px] leading-tight transition-colors duration-150 hover:border-line-3"
                              style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(3.5, Math.min(width, 100 - left))}%`, top: `${5 + item.lane * 58}px`, height: "54px" }}
                              aria-label={`${item.name}, ${DAYS[item.dayOfWeek]} ${rangeLabel(item)}`}
                              title={`${item.name} — ${rangeLabel(item)} · ${bookedLabel(item)} booked${item.coachName ? ` · ${item.coachName}` : ""}`}
                            >
                              <span aria-hidden data-chip-accent className="absolute top-1.5 end-1 size-1.5 rounded-full" style={{ backgroundColor: AUDIENCE_ACCENT[item.audience] }} />
                              <span className="line-clamp-2 block text-[12px] font-semibold leading-[1.2]">{item.name}</span>
                              <span className="mt-0.5 block truncate text-[12px] text-ink-3" dir="ltr">{rangeLabel(item)}</span>
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

      </div>

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
                  <label className="grid gap-1.5 text-[12px] font-medium">Coach<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.coachId} disabled={coachesQuery.isError} onChange={(event) => setEditor({ ...editor, coachId: event.target.value })}><option value="">{coachesQuery.isError ? "Coaches unavailable" : "No coach assigned"}</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select>{coachesQuery.isError ? <span className="text-[12px] font-normal text-danger">The coach directory could not be loaded. Save without a coach or retry the page.</span> : null}</label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Day<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.dayOfWeek} onChange={(event) => setEditor({ ...editor, dayOfWeek: Number(event.target.value) })}>{DAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Starts<Input type="time" value={minuteLabel(editor.startMinute)} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); if (Number.isFinite(hour) && Number.isFinite(minute)) setEditor({ ...editor, startMinute: hour! * 60 + minute! }); }} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Duration<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.durationMinutes} onChange={(event) => setEditor({ ...editor, durationMinutes: Number(event.target.value) })}>{DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Capacity<Input type="number" min={1} max={200} value={editor.capacity} onChange={(event) => setEditor({ ...editor, capacity: Number(event.target.value) })} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Who is it for?<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.audience} onChange={(event) => setEditor({ ...editor, audience: event.target.value as ClassAudience })}>{(Object.keys(AUDIENCE_LABEL) as ClassAudience[]).map((audience) => <option key={audience} value={audience}>{AUDIENCE_LABEL[audience]}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">Photo (optional)
                    <div className="flex items-center gap-2">
                      {editor.imageUrl ? <span className="size-10 shrink-0 rounded-sm border border-line bg-cover bg-center" role="img" aria-label="Class photo" style={{ backgroundImage: `url(${editor.imageUrl})` }} /> : <ImagePlus className="size-5 text-ink-3" aria-hidden />}
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={editor.uploading} className="w-full text-[12px] file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-1" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} />
                    </div>
                  </label>
                </div>
                {editor.startMinute + editor.durationMinutes > 1440 ? <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep">This class would run past midnight. Start it earlier or shorten the duration.</p> : null}
                <label className="grid gap-1.5 text-[12px] font-medium">Notes<Textarea value={editor.notes} maxLength={500} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} placeholder="Bring boxing gloves…" /></label>
              </DialogBody>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditor(undefined)} disabled={save.isPending}>Cancel</Button>
              <Button variant="primary" loading={save.isPending} disabled={!editor?.name.trim() || editor?.uploading || !Number.isSafeInteger(editor.capacity) || editor.capacity < 1 || editor.capacity > 200 || editor.startMinute + editor.durationMinutes > 1440} onClick={() => save.mutate()}><Check /> Save class</Button>
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
                {coaches.length === 0 ? <p className="px-3 py-4 text-center text-[12px] text-ink-3">No coaches yet — add the first one below.</p> : coaches.map((coach) => (
                  <div key={coach.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 text-[12.5px]"><p className="truncate font-semibold">{coach.name}</p><p className="truncate text-[12px] text-ink-3">{[coach.specialty, coach.phone].filter(Boolean).join(" · ") || "—"}</p></div>
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

        <Dialog open={Boolean(managedOccurrence)} onOpenChange={(open) => { if (!open) { setManageOccurrenceId(undefined); setMemberSearch(""); setOverrideReason(""); setSubstituteCoachId(""); setSubstituteReason(""); } }}>
          <DialogContent className="max-w-2xl">
            {managedOccurrence ? <>
              <DialogHeader><DialogTitle>Who booked — {managedOccurrence.name}</DialogTitle><DialogDescription>{formatDateTime(managedOccurrence.startsAt)} · {managedOccurrence.bookedCount}/{managedOccurrence.capacity} booked{managedOccurrence.waitlistCount ? ` · ${managedOccurrence.waitlistCount} waiting` : ""}</DialogDescription></DialogHeader>
              <DialogBody className="grid gap-4">
                {/* The roster IS the page: one big list of everyone booked.
                    Desk tools stay one tap away but never crowd the names. */}
                <section>
                  <div className="divide-y divide-line rounded-md border border-line">{managedOccurrence.roster.filter((entry) => ["booked", "waitlisted", "attended", "no_show"].includes(entry.status)).length ? managedOccurrence.roster.filter((entry) => ["booked", "waitlisted", "attended", "no_show"].includes(entry.status)).map((entry) => <div key={entry.bookingId} className="flex items-center justify-between gap-3 px-4 py-3"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-[14px]"><input type="checkbox" checked={entry.status === "attended"} className="size-5 shrink-0" disabled={setOccurrenceAttendance.isPending || !canRoster || Boolean(managedOccurrence.attendanceFinalizedAt) || entry.status === "waitlisted" || entry.status === "no_show"} onChange={(event) => setOccurrenceAttendance.mutate({ bookingId: entry.bookingId, attended: event.target.checked })} aria-label={`Mark ${entry.name} present`} /><span className="min-w-0"><span className="block break-words font-medium">{entry.name}</span>{entry.noShowCount ? <span className="block text-[12px] text-warning-deep">{entry.noShowCount} recorded no-show{entry.noShowCount === 1 ? "" : "s"}</span> : null}</span>{entry.fromWaitlist ? <span className="rounded-sm bg-success-bg px-1.5 py-0.5 text-[12px] text-success-deep">promoted</span> : null}</label><div className="flex items-center gap-2"><span className="rounded-sm bg-sunken px-2 py-0.5 text-[12px] text-ink-3">{entry.status.replaceAll("_", " ")}</span>{canRoster && !managedOccurrence.attendanceFinalizedAt && ["booked", "waitlisted"].includes(entry.status) ? <Button variant="ghost" size="sm" aria-label={`Remove ${entry.name}`} onClick={() => removeOccurrenceAttendee.mutate(entry.bookingId)}><X /></Button> : null}</div></div>) : <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">No one has booked this date yet.</p>}</div>
                  <p className="mt-1.5 text-[12px] text-ink-3">{managedOccurrence.attendanceFinalizedAt ? `Attendance finalized ${formatDateTime(managedOccurrence.attendanceFinalizedAt)}.` : "Tick who showed up; attendance stays editable until finalized."}</p>
                </section>
                {canRoster && !managedOccurrence.attendanceFinalizedAt ? <details className="rounded-md border border-line"><summary className="px-4 py-2.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">Add a member at the desk</summary><div className="border-t border-line p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.65fr)]"><div className="relative"><Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search member name or phone…" aria-label="Add member to dated class" />{memberLookup.isLoading ? <p className="mt-2 text-[12px] text-ink-3">Searching…</p> : memberLookup.isError ? <div className="mt-2 flex items-center justify-between rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger"><span>Search unavailable</span><Button size="sm" variant="ghost" onClick={() => memberLookup.refetch()}>Retry</Button></div> : memberResults.length ? <div className="mt-2 w-full divide-y divide-line rounded-md border border-line bg-surface">{memberResults.map((member) => <button key={member.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" disabled={addOccurrenceAttendee.isPending} onClick={() => addOccurrenceAttendee.mutate(member.id)}><span className="truncate">{member.fullName}</span><span className="text-[12px] text-ink-3">{member.memberNumber}</span></button>)}</div> : normalizedMemberSearch.length >= 2 ? <p className="mt-2 text-[12px] text-ink-3">No members found.</p> : null}</div><Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Override reason, only if needed" aria-label="Roster override reason" /></div><p className="mt-2 text-[12px] text-ink-3">RIVET asks for a reason only when capacity or the class audience would otherwise block the addition.</p></div></details> : null}
                {canManage && !managedOccurrence.attendanceFinalizedAt ? <details className="rounded-md border border-line"><summary className="px-4 py-2.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">Substitute the coach for this date</summary><div className="border-t border-line p-4"><div className="grid gap-2 sm:grid-cols-2"><select aria-label="Substitute coach" className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[12.5px]" value={substituteCoachId} onChange={(event) => setSubstituteCoachId(event.target.value)}><option value="">Choose substitute</option>{coaches.filter((coach) => coach.id !== managedOccurrence.coachId).map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select><Input aria-label="Substitution reason" value={substituteReason} onChange={(event) => setSubstituteReason(event.target.value)} placeholder="Why is the coach changing?" /></div><div className="mt-2 flex justify-end"><Button size="sm" variant="secondary" loading={substituteCoach.isPending} disabled={!substituteCoachId || !substituteReason.trim()} onClick={() => substituteCoach.mutate()}>Record substitute</Button></div></div></details> : null}
              </DialogBody>
              <DialogFooter><Button variant="secondary" onClick={() => setManageOccurrenceId(undefined)}>Close</Button>{canManage && !managedOccurrence.attendanceFinalizedAt ? <Button variant="primary" loading={finalizeOccurrence.isPending} disabled={Date.parse(managedOccurrence.endsAt) > Date.now()} onClick={() => setFinalizeOpen(true)}><Check /> Finalize attendance</Button> : null}</DialogFooter>
            </> : null}
          </DialogContent>
        </Dialog>

        <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
          <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Finalize attendance?</DialogTitle><DialogDescription>Unmarked confirmed bookings will be recorded as no-shows. Check the roster before continuing. Attendance cannot be edited after finalization.</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setFinalizeOpen(false)}>Review roster</Button><Button loading={finalizeOccurrence.isPending} onClick={() => finalizeOccurrence.mutate()}>Confirm attendance</Button></DialogFooter></DialogContent>
        </Dialog>

        <Dialog open={Boolean(detailsId)} onOpenChange={(open) => { if (!open) setDetailsId(undefined); }}>
          <DialogContent className="max-w-md">
            {(() => {
              const target = sessionsQuery.data?.find((item) => item.id === detailsId);
              if (!target) return null;
              // Bookings live on the dated class, not the weekly template —
              // show the upcoming date's real numbers and names.
              const nextOccurrence = occurrencesQuery.data?.find((occurrence) => occurrence.templateId === target.id && occurrence.status !== "cancelled");
              const attendees = nextOccurrence?.roster.filter((entry) => ["booked", "attended", "waitlisted"].includes(entry.status)) ?? [];
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>{target.name}</DialogTitle>
                    <DialogDescription>Repeats every {DAYS[target.dayOfWeek]}.</DialogDescription>
                  </DialogHeader>
                  <DialogBody className="grid gap-3">
                    {target.imageUrl ? <div className="h-32 rounded-md border border-line bg-cover bg-center" role="img" aria-label={target.imageAltText ?? `${target.name} photo`} style={{ backgroundImage: `url(${target.imageUrl})` }} /> : null}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
                      <div><dt className="text-[12px] text-ink-3">Day</dt><dd className="mt-0.5 font-medium">{DAYS[target.dayOfWeek]}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">Time</dt><dd className="mt-0.5 font-medium">{rangeLabel(target)}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">Duration</dt><dd className="mt-0.5 font-medium">{target.durationMinutes} minutes</dd></div>
                      <div><dt className="text-[12px] text-ink-3">Coach</dt><dd className="mt-0.5 font-medium">{target.coachName ?? "Not assigned"}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">Who is it for?</dt><dd className="mt-0.5 flex items-center gap-1.5 font-medium"><span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: AUDIENCE_ACCENT[target.audience] }} />{AUDIENCE_LABEL[target.audience]}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">Booked{nextOccurrence ? ` · ${formatDate(nextOccurrence.date)}` : ""}</dt><dd className="mt-0.5 font-medium">{bookedLabel(target)}{nextOccurrence?.waitlistCount ? <span className="ms-1 text-[12px] font-normal text-warning-deep">+{nextOccurrence.waitlistCount} waiting</span> : null}</dd></div>
                    </dl>
                    <div>
                      <p className="text-[12px] text-ink-3">Who booked{nextOccurrence ? ` — ${formatDate(nextOccurrence.date)}` : ""}</p>
                      {attendees.length > 0 ? (
                        <ul className="mt-1.5 divide-y divide-line rounded-md border border-line">
                          {attendees.map((entry) => (
                            <li key={entry.bookingId} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                              <span className="min-w-0 truncate font-medium">{entry.name}</span>
                              <span className="shrink-0 rounded-sm bg-sunken px-1.5 py-0.5 text-[12px] text-ink-3">{entry.status.replaceAll("_", " ")}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-[12px] text-ink-3">{nextOccurrence ? "No one has booked this date yet." : "No dated class is available in this seven-day view."}</p>
                      )}
                    </div>
                    {target.notes ? <div><p className="text-[12px] text-ink-3">Notes</p><p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-ink-2">{target.notes}</p></div> : null}
                  </DialogBody>
                  <DialogFooter>
                    {canManage ? <Button variant="secondary" onClick={() => { setDetailsId(undefined); openEdit(target); }} aria-label={`Edit ${target.name}`}><Pencil /> Edit</Button> : null}
                    <Button variant="ghost" onClick={() => setDetailsId(undefined)}>Close</Button>
                    {canRoster ? <Button disabled={occurrencesQuery.isLoading || occurrencesQuery.isError || !nextOccurrence} onClick={() => { setDetailsId(undefined); openNextOccurrence(target.id); }}>Who booked</Button> : null}{canManage ? <Button variant="danger" onClick={() => { setDetailsId(undefined); setDeleteTarget(target); setDeleteReason(""); }}>Remove from schedule</Button> : null}
                  </DialogFooter>
                </>
              );
            })()}
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
                    <p className="context-label">Who is in</p>
                    <div className="mt-2 divide-y divide-line rounded-md border border-line">
                      {managed.roster.length === 0 ? <p className="px-3 py-4 text-center text-[12px] text-ink-3">No one is in this class yet.</p> : managed.roster.map((entry) => (
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
                        {memberLookup.isLoading ? <p className="mt-2 text-[12px] text-ink-3" role="status">Searching members…</p> : memberLookup.isError ? (
                          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger" role="alert"><span>Member search is unavailable.</span><Button size="sm" variant="ghost" onClick={() => memberLookup.refetch()}>Retry</Button></div>
                        ) : memberResults.length > 0 ? (
                          <div className="mt-2 w-full divide-y divide-line rounded-md border border-line bg-surface">
                            {memberResults.map((member) => (
                              <button key={member.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" onClick={() => addAttendee.mutate(member.id)}>
                                <span className="truncate">{member.fullName}</span>
                                <span className="flex items-center gap-1 text-ink-3"><UserPlus className="size-3.5" />{member.memberNumber}</span>
                              </button>
                            ))}
                          </div>
                        ) : normalizedMemberSearch.length >= 2 ? <p className="mt-2 text-[12px] text-ink-3">No members match this search.</p> : null}
                      </div>
                    ) : null}
                  </div>
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setManageId(undefined)}>Close</Button>
                  {canManage ? <Button variant="primary" onClick={() => openEdit(managed)}>Edit class</Button> : null}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
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
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" aria-label="Coach name" />
        <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone (optional)" aria-label="Coach phone" />
        <Input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Specialty (optional)" aria-label="Coach specialty" />
      </div>
      <div className="flex justify-end"><Button size="sm" loading={pending} disabled={!name.trim()} onClick={() => { onSubmit({ name: name.trim(), phone: phone.trim() || undefined, specialty: specialty.trim() || undefined }); setName(""); setPhone(""); setSpecialty(""); }}><Plus /> Add coach</Button></div>
    </div>
  );
}
