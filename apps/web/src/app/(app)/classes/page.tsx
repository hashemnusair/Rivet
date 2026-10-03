"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { CLASS_WEEKDAYS, classTimeRange, classHourText, classMinuteAtPosition, validClassCapacity, classImageAlt } from "@/lib/i18n/class-schedule";
import { latinDigits } from "@/lib/utils/text";
import { ApiError, ERR, isApiError, localizeApiError } from "@/lib/api/errors";
import { CancelOccurrenceDialog } from "@/features/classes/cancel-occurrence-dialog";

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
import type { ClassAudience, ClassCoach, ClassOccurrence, ClassOccurrenceRosterEntry, ClassSession, MemberSummary, UpsertClassSessionInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { PageHeader } from "@/components/shared/chrome";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { getApi } from "@/lib/api/client";
import { addDays, todayISODate } from "@/lib/utils/dates";

// Default visible day; the window stretches automatically when a class is
// scheduled outside it, so nothing can render off-grid.
const DEFAULT_FIRST_HOUR = 6;
const DEFAULT_LAST_HOUR = 22; // exclusive end of the visible day

const DURATIONS = [30, 45, 60, 90, 120] as const;

// Owner-requested audience colors: pink for women, blue for men, black for
// mixed — the calendar reads at a glance and the printed sheet inherits them.
const AUDIENCE_ACCENT: Record<ClassAudience, string> = { mixed: "#1c1917", women: "#db2777", men: "#2563eb" };
/** 24h "HH:MM" — required as the VALUE format of native time inputs only. */
function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
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
  capacity: string;
  audience: ClassAudience;
  notes: string;
  imageAssetId?: string;
  imageUrl?: string;
  uploading: boolean;
  isNew: boolean;
};



export default function ClassesPage() { return <Suspense><ClassesWorkspace /></Suspense>; }

function ClassesWorkspace() {
  const { t, locale, dir, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const timeZone = useFormattingTimeZone();
  const DAYS = CLASS_WEEKDAYS.map(day => t(`errorValues.weekday.${day}`));
  const AUDIENCE_LABEL: Record<ClassAudience, string> = { mixed: t("classWorkspace.mixed"), women: t("classWorkspace.women"), men: t("classWorkspace.men") };
  const statuses: Record<ClassOccurrenceRosterEntry["status"], string> = { booked: t("classWorkspace.booked"), waitlisted: t("classWorkspace.waiting"), cancelled: t("classWorkspace.cancelled"), late_cancelled: t("classWorkspace.lateCancelled"), attended: t("classWorkspace.attended"), no_show: t("classWorkspace.noShow") };
  const rosterStatusLabel = (status: ClassOccurrenceRosterEntry["status"]) => statuses[status];
  const rangeLabel = (item: Pick<ClassSession, "startMinute" | "durationMinutes">) => classTimeRange(item.startMinute, item.durationMinutes, locale);
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
  const [removeTarget, setRemoveTarget] = useState<ClassOccurrenceRosterEntry>();
  const [removeReason, setRemoveReason] = useState("");
  const [detailsId, setDetailsId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<ClassSession>();
  const [deleteReason, setDeleteReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ClassOccurrence>();
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
    const now = Date.now();
    for (const occurrence of occurrencesQuery.data ?? []) {
      if (occurrence.status === "cancelled") continue;
      const current = map.get(occurrence.templateId);
      // Prefer the next date still to come; an ended date is only a fallback
      // so its attendance can still be reviewed.
      if (!current || (Date.parse(current.endsAt) <= now && Date.parse(occurrence.endsAt) > now)) map.set(occurrence.templateId, occurrence);
    }
    return map;
  }, [occurrencesQuery.data]);
  const bookedLabel = (session: ClassSession): string => {
    const next = nextOccurrenceByTemplate.get(session.id);
    return next ? isolateLtr(`${f.number(next.bookedCount)}/${f.number(next.capacity)}`) : occurrencesQuery.isError ? t("classWorkspace.bookingsFailed") : occurrencesQuery.isLoading ? t("classWorkspace.bookingsLoading") : t("classWorkspace.noUpcoming");
  };

  const refresh = async () => { await invalidate([qk.classSessions(branchId ?? "none"), qk.classOccurrences(branchId ?? "none", weekStart, weekEnd, undefined)]); };

  const save = useApiMutation((api) => {
    if (!editor) throw new Error(t("classWorkspace.nothingSave"));
    const input: UpsertClassSessionInput = {
      sessionId: editor.sessionId,
      branchId: editor.branchId,
      name: editor.name.trim(),
      coachId: editor.coachId || undefined,
      dayOfWeek: editor.dayOfWeek,
      startMinute: editor.startMinute,
      durationMinutes: editor.durationMinutes,
      capacity: Number(latinDigits(editor.capacity)),
      audience: editor.audience,
      notes: editor.notes.trim() || undefined,
      imageAssetId: editor.imageAssetId,
    };
    return api.upsertClassSession(input);
  }, {
    onSuccess: async () => { setEditor(undefined); await refresh(); },
    successMessage: t("classWorkspace.saved"),
  });

  const remove = useApiMutation((api) => api.deleteClassSession({ sessionId: deleteTarget!.id, reason: deleteReason.trim() }), {
    onSuccess: async () => { setDeleteTarget(undefined); setDeleteReason(""); await refresh(); },
    successMessage: t("classWorkspace.removed"),
  });

  const addAttendee = useApiMutation((api, memberId: string) => api.addClassAttendee({ sessionId: manageId!, memberId }), {
    onSuccess: async () => { setMemberSearch(""); await refresh(); },
  });
  const removeAttendee = useApiMutation((api, memberId: string) => api.removeClassAttendee({ sessionId: manageId!, memberId }), { onSuccess: refresh });
  const setAttendance = useApiMutation((api, input: { memberId: string; attended: boolean }) => api.setClassAttendance({ sessionId: manageId!, ...input }), { onSuccess: refresh });
  const addOccurrenceAttendee = useApiMutation(async (api, memberId: string) => {
    const memberships = await api.listMemberships({ memberId, status: "active", pageSize: 50 });
    const membership = memberships.items.find((item) => item.homeBranchId === managedOccurrence?.branchId) ?? memberships.items[0];
    if (!membership) throw ApiError.of(ERR.VALIDATION, "This member has no active membership for this class.", { message: { key: "apiErrors.classMembershipRequired" } });
    return api.addClassOccurrenceAttendee({ occurrenceId: manageOccurrenceId!, memberId, membershipId: membership.id, overrideReason: overrideReason.trim() || undefined });
  }, {
    onSuccess: async (occurrence, memberId) => {
      // The server decides between a place and the waitlist; say which.
      const entry = occurrence.roster.find((item) => item.memberId === memberId && ["booked", "waitlisted"].includes(item.status));
      const position = occurrence.roster.filter((item) => item.status === "waitlisted").findIndex((item) => item.bookingId === entry?.bookingId) + 1;
      toast.success(entry?.status === "waitlisted" ? t("classWorkspace.waitlistedToast", { name: isolate(entry.name), position: f.number(position) }) : t("classWorkspace.bookedToast", { name: isolate(entry?.name ?? t("classWorkspace.memberFallback")) }));
      setMemberSearch("");
      setOverrideReason("");
      await refresh();
    },
  });
  const removeOccurrenceAttendee = useApiMutation((api, input: { bookingId: string; reason: string }) => api.removeClassOccurrenceAttendee({ occurrenceId: manageOccurrenceId!, bookingId: input.bookingId, reason: input.reason }), {
    onSuccess: async (occurrence, input) => {
      const removed = managedOccurrence?.roster.find((item) => item.bookingId === input.bookingId);
      const promoted = occurrence.roster.filter((item) => item.status === "booked" && item.fromWaitlist && managedOccurrence?.roster.some((previous) => previous.bookingId === item.bookingId && previous.status === "waitlisted"));
      toast.success([t("classWorkspace.removedToast", { name: isolate(removed?.name ?? t("classWorkspace.memberFallback")) }), ...(promoted.length ? [t("classWorkspace.promotedToast", { names: promoted.map(item => isolate(item.name)).join(locale === "ar" ? "، " : ", ") })] : [])].join(" "));
      setRemoveTarget(undefined);
      setRemoveReason("");
      await refresh();
    },
  });
  const setOccurrenceAttendance = useApiMutation((api, input: { bookingId: string; attended: boolean }) => api.setClassOccurrenceAttendance({ occurrenceId: manageOccurrenceId!, ...input }), { onSuccess: refresh });
  const finalizeOccurrence = useApiMutation((api) => api.finalizeClassOccurrenceAttendance({ occurrenceId: manageOccurrenceId! }), { onSuccess: async () => { setFinalizeOpen(false); await refresh(); }, successMessage: t("classWorkspace.attendanceSaved") });
  const substituteCoach = useApiMutation((api) => api.substituteClassOccurrenceCoach({ occurrenceId: manageOccurrenceId!, coachId: substituteCoachId, reason: substituteReason.trim() }), {
    onSuccess: async () => { setSubstituteCoachId(""); setSubstituteReason(""); await refresh(); },
    successMessage: t("classWorkspace.coachChanged"),
  });

  const upsertCoach = useApiMutation((api, input: { name: string; phone?: string; specialty?: string }) => api.upsertClassCoach(input), {
    onSuccess: async () => { await invalidate([["classCoaches"]]); },
    successMessage: t("classWorkspace.coachSaved"),
  });
  const removeCoach = useApiMutation((api, coachId: string) => api.removeClassCoach(coachId), {
    onSuccess: async () => { await invalidate([["classCoaches"], qk.classSessions(branchId ?? "none")]); },
    successMessage: t("classWorkspace.coachRemoved"),
  });

  const openCreate = (dayOfWeek: number, startMinute: number) => {
    if (!canManage || !branchId) return;
    setEditor({ sessionId: crypto.randomUUID(), branchId, name: "", coachId: "", dayOfWeek, startMinute, durationMinutes: 60, capacity: "12", audience: "mixed", notes: "", uploading: false, isNew: true });
  };

  const openEdit = (target: ClassSession) => {
    setManageId(undefined);
    setEditor({ sessionId: target.id, branchId: target.branchId, name: target.name, coachId: target.coachId ?? "", dayOfWeek: target.dayOfWeek, startMinute: target.startMinute, durationMinutes: target.durationMinutes, capacity: String(target.capacity), audience: target.audience, notes: target.notes ?? "", imageAssetId: target.imageAssetId, imageUrl: target.imageUrl, uploading: false, isNew: false });
  };

  const openNextOccurrence = (templateId: string) => {
    const next = nextOccurrenceByTemplate.get(templateId);
    if (!next) { toast.error(t("classWorkspace.noUpcomingWeek")); return; }
    setManageOccurrenceId(next.id);
    setMemberSearch("");
    setOverrideReason("");
  };

  const uploadImage = async (file: File) => {
    if (!editor) return;
    setEditor((current) => current ? { ...current, uploading: true } : current);
    try {
      const asset = await getApi().uploadMediaAsset({ ownerType: "class_image", ownerId: editor.sessionId ?? "", altText: editor.name.trim() || "Class photo", file });
      setEditor((current) => current ? { ...current, imageAssetId: asset.id, imageUrl: asset.url, uploading: false } : current);
    } catch (error) {
      setEditor((current) => current ? { ...current, uploading: false } : current);
      toast.error(isApiError(error) ? localizeApiError(error, locale).message : t("classWorkspace.imageFailed"));
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

  const byDay = useMemo(() => CLASS_WEEKDAYS.map((_, day) => withLanes((sessionsQuery.data ?? []).filter((item) => item.dayOfWeek === day))), [sessionsQuery.data]);

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
    const minute = classMinuteAtPosition(event.clientX, rect.left, rect.width, firstHour, visibleHours, dir === "rtl");
    openCreate(day, minute);
  };

  const branchName = branches.find((branch) => branch.id === branchId)?.name ?? "";

  return (
    <div className="space-y-5" data-print-root>
      <div className="print:hidden">
        <PageHeader
          title={t("nav.item.classes")}
          description={t("classWorkspace.hint")}
          actions={<div className="flex flex-wrap items-center gap-2">
            {branches.length > 1 ? (
              <select aria-label={t("common.label.branch")} className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchId ?? ""} onChange={(event) => setBranchChoice(event.target.value)}>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            ) : null}
            {canManage ? <Button variant="secondary" onClick={() => setCoachesOpen(true)}><Users /> {" "}{t("classWorkspace.coaches")}</Button> : null}
            <Button variant="secondary" onClick={printSchedule} disabled={!sessionsQuery.data}><Printer />{" "}{t("common.action.print")}</Button>
            {canManage ? <Button variant="primary" onClick={() => openCreate(0, 18 * 60)} disabled={!branchId}><Plus /> {" "}{t("classWorkspace.newClass")}</Button> : null}
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
                <p className="font-display text-[24px] font-semibold leading-tight">{session?.organization.name ?? t("classWorkspace.weeklySchedule")}</p>
                <p className="text-[12px]">{t("classWorkspace.printTitle", { branch: isolate(branchName) })}</p>
              </div>
            </div>
            <div className="text-end text-[12px] leading-4">
              <p>{t("classWorkspace.printedOn", { date: isolate(f.date(todayISODate(timeZone))) })}</p>
              <p>{t("nav.sidebar.operatedBy")}</p>
            </div>
          </div>
        </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className={tabListClassName} role="group" aria-label={t("classWorkspace.view")}>
          {([['agenda', t("classWorkspace.upcoming")], ['timetable', t("classWorkspace.timetable")]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} className={tabTriggerClassName} onClick={() => updateView({ view: value })}>{label}</button>)}
        </div>
      {view === "agenda" ? <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" aria-label={t("classWorkspace.previousWeek")} onClick={() => updateView({ from: addDays(weekStart, -7) })}>{t("classWorkspace.previous")}</Button><span className="text-[12px] tabular-nums">{t("classWorkspace.dateRange", { start: isolate(f.date(weekStart)), end: isolate(f.date(weekEnd)) })}</span><Button variant="secondary" size="sm" aria-label={t("classWorkspace.nextWeek")} onClick={() => updateView({ from: addDays(weekStart, 7) })}>{t("common.action.next")}</Button><Button variant="ghost" size="sm" onClick={() => updateView({ from: todayISODate(session?.organization.timezone) })}>{t("common.time.today")}</Button></div> : <p className="text-[12px] text-ink-2">{t("classWorkspace.repeatsBranch", { branch: isolate(branchName) })}</p>}
      </div>
      {sessionsQuery.isBackgroundError ? <ErrorState layout="inline" title={t("classWorkspace.timetableRefreshFailed")} onRetry={() => sessionsQuery.refetch()} /> : null}
      {view === "agenda" ? <section className="panel overflow-hidden print:hidden" aria-label={t("classWorkspace.upcoming")}>
        {occurrencesQuery.isBackgroundError ? <ErrorState layout="inline" title={t("classWorkspace.classesRefreshFailed")} onRetry={() => occurrencesQuery.refetch()} /> : null}
        {!branchId ? <EmptyState layout="section" title={t("classWorkspace.noBranch")} description={t("classWorkspace.askBranch")} className="m-4" /> : occurrencesQuery.isLoading && !occurrencesQuery.data ? <div className="space-y-3 p-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div> : occurrencesQuery.isError && !occurrencesQuery.data ? <ErrorState layout="section" title={t("classWorkspace.loadFailed")} onRetry={() => occurrencesQuery.refetch()} className="m-4" /> : !occurrencesQuery.data?.length ? <EmptyState layout="section" title={t("classWorkspace.noWeekClasses")} description={t("classWorkspace.chooseWeek")} className="m-4" /> : <ul className="divide-y divide-line">{occurrencesQuery.data.map((occurrence) => <li key={occurrence.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-[132px_minmax(0,1fr)_auto]" data-testid="class-agenda-row" data-occurrence-id={occurrence.id}>
          <div className="text-[13px]" dir="ltr"><p className="font-semibold">{f.date(occurrence.date)}</p><p className="mt-1 tabular-nums text-ink-2">{locale === "ar" ? f.time(occurrence.startsAt) : new Intl.DateTimeFormat("en-JO", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(occurrence.startsAt))}</p></div>
          <div className="min-w-0"><h2 className="text-[15px] font-semibold break-words">{occurrence.name}</h2><p className="mt-1 text-[13px] text-ink-2">{occurrence.coachName ?? t("classWorkspace.noCoachYet")} · {AUDIENCE_LABEL[occurrence.audience]}</p><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2"><span>{t("classWorkspace.bookedCapacity", { booked: f.number(occurrence.bookedCount), capacity: f.number(occurrence.capacity) })}</span><span>{t("classWorkspace.waitingCount", { count: occurrence.waitlistCount })}</span><span>{occurrence.status === "cancelled" ? occurrence.cancelReason ? t("classWorkspace.cancelledReason", { reason: isolate(occurrence.cancelReason) }) : t("classWorkspace.cancelled") : occurrence.attendanceFinalizedAt ? t("classWorkspace.attendanceFinished") : Date.parse(occurrence.endsAt) <= Date.now() ? t("classWorkspace.endedOpen") : Date.parse(occurrence.startsAt) <= Date.now() ? t("classWorkspace.inProgressOpen") : t("classWorkspace.attendanceOpen")}</span></p></div>
          <div className="flex flex-wrap items-center gap-2 sm:col-start-2 xl:col-start-auto">{occurrence.status !== "cancelled" && canRoster ? <Button variant="secondary" onClick={() => { setManageOccurrenceId(occurrence.id); setMemberSearch(""); }}>{t("classWorkspace.whoBooked")}</Button> : null}<Button variant="ghost" onClick={() => setDetailsId(occurrence.templateId)}>{t("classWorkspace.details")}</Button>{canManage && occurrence.status === "scheduled" && Date.parse(occurrence.startsAt) > Date.now() ? <Button variant="ghost" onClick={() => setCancelTarget(occurrence)}>{t("classWorkspace.cancelClass")}</Button> : null}</div>
        </li>)}</ul>}
      </section> : null}
      <div className={cn(view === "agenda" && "hidden print:block")}>
        {!branchId ? <p className="mt-8 border border-line bg-surface px-5 py-8 text-center text-[12.5px] text-ink-3">{t("classWorkspace.joinBranch")}</p> : sessionsQuery.isLoading ? <Skeleton className="mt-6 h-[480px] w-full" /> : sessionsQuery.isError ? (
          <div className="mt-6 rounded-lg border border-line bg-surface p-5"><ErrorState title={t("classWorkspace.loadFailed")} description={t("classWorkspace.timetableFailedHint")} onRetry={() => sessionsQuery.refetch()} /></div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface" data-print-schedule>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2.5 text-[12px] text-ink-2" aria-label={t("classWorkspace.colorsHint")}>
              <span className="text-[12px] text-ink-3">{t("classWorkspace.audienceLegend")}</span>
              {(["mixed", "women", "men"] as const).map((audience) => (
                <span key={audience} className="inline-flex items-center gap-1.5 font-medium">
                  <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: AUDIENCE_ACCENT[audience] }} />
                  {audience === "mixed" ? t("classWorkspace.everyone") : AUDIENCE_LABEL[audience]}
                </span>
              ))}
            </div>
            <div className="min-w-[560px]">
              <div className="grid" style={{ gridTemplateColumns: "96px 1fr" }}>
                <div className="border-b border-line" />
                <div className="relative border-b border-line">
                  <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${visibleHours}, 1fr)` }}>
                    {Array.from({ length: visibleHours }, (_, index) => (
                      <div key={index} className="py-2.5 ps-1.5 text-start text-[12px] font-medium text-ink-2">{classHourText(firstHour + index, locale)}</div>
                    ))}
                  </div>
                </div>
                {DAYS.map((label, day) => {
                  const items = byDay[day]!;
                  const lanes = Math.max(1, items[0]?.laneCount ?? 1);
                  const isToday = new Date(`${todayISODate(timeZone)}T12:00:00Z`).getUTCDay() === day;
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
                              style={{ insetInlineStart: `${Math.max(0, left)}%`, width: `${Math.max(3.5, Math.min(width, 100 - left))}%`, top: `${5 + item.lane * 58}px`, height: "54px" }}
                              aria-label={t("classWorkspace.chipLabel", { name: item.name, day: DAYS[item.dayOfWeek]!, time: rangeLabel(item) })}
                              title={t("classWorkspace.chipTitle", { name: isolate(item.name), time: isolateLtr(rangeLabel(item)), bookings: nextOccurrenceByTemplate.has(item.id) ? t("classWorkspace.bookedCapacity", { booked: f.number(nextOccurrenceByTemplate.get(item.id)!.bookedCount), capacity: f.number(nextOccurrenceByTemplate.get(item.id)!.capacity) }) : bookedLabel(item) }) + (item.coachName ? ` · ${isolate(item.coachName)}` : "")}
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
              <DialogTitle>{editor?.isNew ? t("classWorkspace.newClass") : t("classWorkspace.editClass")}</DialogTitle>
              <DialogDescription>{t("classWorkspace.repeatsHint")}</DialogDescription>
            </DialogHeader>
            {editor ? (
              <DialogBody className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("classWorkspace.className")}<Input value={editor.name} maxLength={80} autoFocus onChange={(event) => setEditor({ ...editor, name: event.target.value })} placeholder={t("classWorkspace.classExample")} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("classWorkspace.coach")}<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.coachId} disabled={coachesQuery.isError} onChange={(event) => setEditor({ ...editor, coachId: event.target.value })}><option value="">{coachesQuery.isError ? t("classWorkspace.coachesNotLoaded") : t("classWorkspace.noCoach")}</option>{coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select>{coachesQuery.isError ? <span className="text-[12px] font-normal text-danger">{t("classWorkspace.coachLoadHint")}</span> : null}</label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("classWorkspace.day")}<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.dayOfWeek} onChange={(event) => setEditor({ ...editor, dayOfWeek: Number(event.target.value) })}>{DAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("renewFlow.adjust.planChange.starts")}<Input type="time" lang={locale} dir="ltr" value={minuteLabel(editor.startMinute)} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); if (Number.isFinite(hour) && Number.isFinite(minute)) setEditor({ ...editor, startMinute: hour! * 60 + minute! }); }} /></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("crm.lead.membership.durationColumn")}<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.durationMinutes} onChange={(event) => setEditor({ ...editor, durationMinutes: Number(event.target.value) })}>{DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{t("classWorkspace.minutes", { count: minutes })}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("classWorkspace.capacity")}<Input type="text" inputMode="numeric" dir="ltr" value={editor.capacity} aria-invalid={!validClassCapacity(editor.capacity)} onChange={(event) => setEditor({ ...editor, capacity: latinDigits(event.target.value) })} />{!validClassCapacity(editor.capacity) ? <span role="alert" className="text-danger">{t("classWorkspace.capacityHint")}</span> : null}</label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("classWorkspace.audience")}<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={editor.audience} onChange={(event) => setEditor({ ...editor, audience: event.target.value as ClassAudience })}>{(Object.keys(AUDIENCE_LABEL) as ClassAudience[]).map((audience) => <option key={audience} value={audience}>{AUDIENCE_LABEL[audience]}</option>)}</select></label>
                  <label className="grid gap-1.5 text-[12px] font-medium">{t("classWorkspace.photoOptional")}{" "}<div className="flex items-center gap-2">
                      {editor.imageUrl ? <span className="size-10 shrink-0 rounded-sm border border-line bg-cover bg-center" role="img" aria-label={t("classWorkspace.classPhoto")} style={{ backgroundImage: `url(${editor.imageUrl})` }} /> : <ImagePlus className="size-5 text-ink-3" aria-hidden />}
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={editor.uploading} className="w-full text-[12px] file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-1" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} />
                    </div>
                  </label>
                </div>
                {editor.startMinute + editor.durationMinutes > 1440 ? <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep">{t("classWorkspace.overnightHint")}</p> : null}
                <label className="grid gap-1.5 text-[12px] font-medium">{t("common.label.notes")}<Textarea value={editor.notes} maxLength={500} onChange={(event) => setEditor({ ...editor, notes: event.target.value })} placeholder={t("classWorkspace.notesExample")} /></label>
              </DialogBody>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditor(undefined)} disabled={save.isPending}>{t("common.action.cancel")}</Button>
              <Button variant="primary" loading={save.isPending} disabled={!editor?.name.trim() || editor?.uploading || !validClassCapacity(editor.capacity) || editor.startMinute + editor.durationMinutes > 1440} onClick={() => save.mutate()}><Check /> {" "}{t("classWorkspace.saveClass")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !remove.isPending) setDeleteTarget(undefined); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("classWorkspace.removeClassTitle", { name: isolate(deleteTarget?.name ?? "") })}</DialogTitle>
              <DialogDescription>{t("classWorkspace.removeHint")}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <label className="grid gap-1.5 text-[12px] font-medium">{t("common.label.reason")}<Textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder={t("classWorkspace.removeReason")} /></label>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteTarget(undefined)} disabled={remove.isPending}>{t("classWorkspace.keepClass")}</Button>
              <Button variant="danger" loading={remove.isPending} disabled={!deleteReason.trim()} onClick={() => remove.mutate()}><Trash2 /> {" "}{t("classWorkspace.removeClass")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={coachesOpen} onOpenChange={setCoachesOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("classWorkspace.coaches")}</DialogTitle>
              <DialogDescription>{t("classWorkspace.coachesHint")}</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-3">
              {coachesQuery.isLoading ? <Skeleton className="h-28 w-full" /> : coachesQuery.isError ? (
                <ErrorState title={t("classWorkspace.coachesFailed")} description={t("classWorkspace.coachesFailedHint")} onRetry={() => coachesQuery.refetch()} />
              ) : <div className="divide-y divide-line rounded-md border border-line">
                {coaches.length === 0 ? <p className="px-3 py-4 text-center text-[12px] text-ink-3">{t("classWorkspace.noCoaches")}</p> : coaches.map((coach) => (
                  <div key={coach.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 text-[12.5px]"><p className="truncate font-semibold">{coach.name}</p><p className="truncate text-[12px] text-ink-3">{[coach.specialty, coach.phone].filter(Boolean).join(" · ") || "—"}</p></div>
                    <Button variant="ghost" size="sm" aria-label={t("classWorkspace.removePerson", { name: coach.name })} loading={removeCoach.isPending} onClick={() => removeCoach.mutate(coach.id)}><X /></Button>
                  </div>
                ))}
              </div>}
              {!coachesQuery.isError ? <CoachForm onSubmit={(input) => upsertCoach.mutate(input)} pending={upsertCoach.isPending} /> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCoachesOpen(false)}>{t("common.action.done")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(managedOccurrence)} onOpenChange={(open) => { if (!open) { setManageOccurrenceId(undefined); setMemberSearch(""); setOverrideReason(""); setSubstituteCoachId(""); setSubstituteReason(""); } }}>
          <DialogContent className="max-w-2xl">
            {managedOccurrence ? <>
              <DialogHeader><DialogTitle>{t("classWorkspace.whoBookedTitle", { name: isolate(managedOccurrence.name) })}</DialogTitle><DialogDescription>{isolate(f.dateTime(managedOccurrence.startsAt))} · {t("classWorkspace.bookedCapacity", { booked: f.number(managedOccurrence.bookedCount), capacity: f.number(managedOccurrence.capacity) })}{managedOccurrence.waitlistCount ? ` · ${t("classWorkspace.waitingCount", { count: managedOccurrence.waitlistCount })}` : ""}{managedOccurrence.attendanceFinalizedAt ? ` · ${t("classWorkspace.attendanceFinished")}` : Date.parse(managedOccurrence.endsAt) <= Date.now() ? ` · ${t("classWorkspace.ended")}` : Date.parse(managedOccurrence.startsAt) <= Date.now() ? ` · ${t("classWorkspace.inProgress")}` : ""}</DialogDescription></DialogHeader>
              <DialogBody className="grid gap-4">
                {/* The roster IS the page: one big list of everyone booked.
                    Desk tools stay one tap away but never crowd the names. */}
                <section>
                  <div className="divide-y divide-line rounded-md border border-line">{managedOccurrence.roster.filter((entry) => ["booked", "waitlisted", "attended", "no_show"].includes(entry.status)).length ? managedOccurrence.roster.filter((entry) => ["booked", "waitlisted", "attended", "no_show"].includes(entry.status)).map((entry) => <div key={entry.bookingId} className="flex items-center justify-between gap-3 px-4 py-3"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-[14px]"><input type="checkbox" checked={entry.status === "attended"} className="size-5 shrink-0" disabled={setOccurrenceAttendance.isPending || !canRoster || Boolean(managedOccurrence.attendanceFinalizedAt) || entry.status === "waitlisted" || entry.status === "no_show"} onChange={(event) => setOccurrenceAttendance.mutate({ bookingId: entry.bookingId, attended: event.target.checked })} aria-label={t("classWorkspace.presentLabel", { name: entry.name })} /><span className="min-w-0"><span className="block break-words font-medium">{entry.name}</span>{entry.noShowCount ? <span className="block text-[12px] text-warning-deep">{t("classWorkspace.pastNoShows", { count: entry.noShowCount })}</span> : null}</span>{entry.fromWaitlist ? <span className="rounded-sm bg-success-bg px-1.5 py-0.5 text-[12px] text-success-deep">{t("classWorkspace.fromWaitlist")}</span> : null}</label><div className="flex items-center gap-2"><span className="rounded-sm bg-sunken px-2 py-0.5 text-[12px] text-ink-3">{rosterStatusLabel(entry.status)}</span>{canRoster && !managedOccurrence.attendanceFinalizedAt && Date.parse(managedOccurrence.endsAt) > Date.now() && ["booked", "waitlisted"].includes(entry.status) ? <Button variant="ghost" size="sm" aria-label={t("classWorkspace.removePerson", { name: entry.name })} disabled={removeOccurrenceAttendee.isPending} onClick={() => { setRemoveTarget(entry); setRemoveReason(""); }}><X /></Button> : null}</div></div>) : <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">{t("classWorkspace.noBookings")}</p>}</div>
                  <p className="mt-1.5 text-[12px] text-ink-3">{managedOccurrence.attendanceFinalizedAt ? t("classWorkspace.finishedOn", { date: isolate(f.dateTime(managedOccurrence.attendanceFinalizedAt)) }) : t("classWorkspace.attendanceHint")}</p>
                </section>
                {canRoster && !managedOccurrence.attendanceFinalizedAt && Date.parse(managedOccurrence.endsAt) > Date.now() ? <details className="rounded-md border border-line"><summary className="px-4 py-2.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">{t("classWorkspace.addAtDesk")}</summary><div className="border-t border-line p-4"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.65fr)]"><div className="relative"><Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={t("classWorkspace.searchPlaceholder")} aria-label={t("classWorkspace.addMemberLabel")} />{memberLookup.isLoading ? <p className="mt-2 text-[12px] text-ink-3">{t("common.state.searching")}</p> : memberLookup.isError ? <div className="mt-2 flex items-center justify-between rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger"><span>{t("classWorkspace.searchFailed")}</span><Button size="sm" variant="ghost" onClick={() => memberLookup.refetch()}>{t("common.action.retry")}</Button></div> : memberResults.length ? <div className="mt-2 w-full divide-y divide-line rounded-md border border-line bg-surface">{memberResults.map((member) => <button key={member.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" disabled={addOccurrenceAttendee.isPending} onClick={() => addOccurrenceAttendee.mutate(member.id)}><span className="truncate">{member.fullName}</span><span className="text-[12px] text-ink-3">{member.memberNumber}</span></button>)}</div> : normalizedMemberSearch.length >= 2 ? <p className="mt-2 text-[12px] text-ink-3">{t("classWorkspace.noMembers")}</p> : null}</div><Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder={t("classWorkspace.overridePlaceholder")} aria-label={t("classWorkspace.overrideLabel")} /></div><p className="mt-2 text-[12px] text-ink-3">{t("classWorkspace.waitlistHint")}</p></div></details> : null}
                {canManage && !managedOccurrence.attendanceFinalizedAt ? <details className="rounded-md border border-line"><summary className="px-4 py-2.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">{t("classWorkspace.changeCoachTitle")}</summary><div className="border-t border-line p-4"><div className="grid gap-2 sm:grid-cols-2"><select aria-label={t("classWorkspace.newCoach")} className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[12.5px]" value={substituteCoachId} onChange={(event) => setSubstituteCoachId(event.target.value)}><option value="">{t("classWorkspace.chooseCoach")}</option>{coaches.filter((coach) => coach.id !== managedOccurrence.coachId).map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select><Input aria-label={t("renewFlow.sale.changeReason")} value={substituteReason} onChange={(event) => setSubstituteReason(event.target.value)} placeholder={t("classWorkspace.coachReason")} /></div><div className="mt-2 flex justify-end"><Button size="sm" variant="secondary" loading={substituteCoach.isPending} disabled={!substituteCoachId || !substituteReason.trim()} onClick={() => substituteCoach.mutate()}>{t("classWorkspace.changeCoach")}</Button></div></div></details> : null}
              </DialogBody>
              <DialogFooter><Button variant="secondary" onClick={() => setManageOccurrenceId(undefined)}>{t("common.action.close")}</Button>{canManage && !managedOccurrence.attendanceFinalizedAt ? <Button variant="primary" loading={finalizeOccurrence.isPending} disabled={Date.parse(managedOccurrence.endsAt) > Date.now()} onClick={() => setFinalizeOpen(true)}><Check /> {" "}{t("classWorkspace.finishAttendance")}</Button> : null}</DialogFooter>
            </> : null}
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(removeTarget)} onOpenChange={(open) => { if (!open && !removeOccurrenceAttendee.isPending) setRemoveTarget(undefined); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{removeTarget?.status === "waitlisted" ? t("classWorkspace.removeWaitlistTitle", { name: isolate(removeTarget?.name ?? "") }) : t("classWorkspace.removeBookingTitle", { name: isolate(removeTarget?.name ?? ""), className: isolate(managedOccurrence?.name ?? "") })}</DialogTitle>
              <DialogDescription>{removeTarget?.status === "waitlisted" ? t("classWorkspace.removeWaitingHint") : t("classWorkspace.removeBookedHint")}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <label className="grid gap-1.5 text-[12px] font-medium">{t("common.label.reason")}<Textarea value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} placeholder={t("classWorkspace.removePersonReason")} /></label>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setRemoveTarget(undefined)} disabled={removeOccurrenceAttendee.isPending}>{t("classWorkspace.keepPerson")}</Button>
              <Button variant="danger" loading={removeOccurrenceAttendee.isPending} disabled={!removeReason.trim()} onClick={() => removeOccurrenceAttendee.mutate({ bookingId: removeTarget!.bookingId, reason: removeReason.trim() })}><X />{" "}{t("common.action.remove")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {cancelTarget ? <CancelOccurrenceDialog key={cancelTarget.id} occurrence={cancelTarget} onClose={() => setCancelTarget(undefined)} onSaved={refresh} /> : null}

        <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
          <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t("classWorkspace.finishTitle")}</DialogTitle><DialogDescription>{t("classWorkspace.finishHint")}</DialogDescription></DialogHeader><DialogFooter><Button variant="secondary" onClick={() => setFinalizeOpen(false)}>{t("classWorkspace.checkList")}</Button><Button loading={finalizeOccurrence.isPending} onClick={() => finalizeOccurrence.mutate()}>{t("classWorkspace.confirmAttendance")}</Button></DialogFooter></DialogContent>
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
                    <DialogDescription>{t("classWorkspace.repeatsDay", { day: DAYS[target.dayOfWeek]! })}</DialogDescription>
                  </DialogHeader>
                  <DialogBody className="grid gap-3">
                    {target.imageUrl ? <div className="h-32 rounded-md border border-line bg-cover bg-center" role="img" aria-label={classImageAlt(t, target.name, target.imageAltText)} style={{ backgroundImage: `url(${target.imageUrl})` }} /> : null}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
                      <div><dt className="text-[12px] text-ink-3">{t("classWorkspace.day")}</dt><dd className="mt-0.5 font-medium">{DAYS[target.dayOfWeek]}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">{t("common.label.time")}</dt><dd className="mt-0.5 font-medium" dir="ltr">{rangeLabel(target)}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">{t("crm.lead.membership.durationColumn")}</dt><dd className="mt-0.5 font-medium">{t("classWorkspace.minutes", { count: target.durationMinutes })}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">{t("classWorkspace.coach")}</dt><dd className="mt-0.5 font-medium">{target.coachName ?? t("classWorkspace.noCoachYet")}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">{t("classWorkspace.audience")}</dt><dd className="mt-0.5 flex items-center gap-1.5 font-medium"><span aria-hidden className="inline-block size-2 rounded-full" style={{ backgroundColor: AUDIENCE_ACCENT[target.audience] }} />{AUDIENCE_LABEL[target.audience]}</dd></div>
                      <div><dt className="text-[12px] text-ink-3">{t("memberProfile.pt.bookingStatus.reserved")}{nextOccurrence ? ` · ${f.date(nextOccurrence.date)}` : ""}</dt><dd className="mt-0.5 font-medium" dir="ltr">{bookedLabel(target)}{nextOccurrence?.waitlistCount ? <span className="ms-1 text-[12px] font-normal text-warning-deep">{t("classWorkspace.waitingCount", { count: nextOccurrence.waitlistCount })}</span> : null}</dd></div>
                    </dl>
                    <div>
                      <p className="text-[12px] text-ink-3">{t("classWorkspace.whoBooked")}{nextOccurrence ? ` — ${f.date(nextOccurrence.date)}` : ""}</p>
                      {attendees.length > 0 ? (
                        <ul className="mt-1.5 divide-y divide-line rounded-md border border-line">
                          {attendees.map((entry) => (
                            <li key={entry.bookingId} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
                              <span className="min-w-0 truncate font-medium">{entry.name}</span>
                              <span className="shrink-0 rounded-sm bg-sunken px-1.5 py-0.5 text-[12px] text-ink-3">{rosterStatusLabel(entry.status)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-[12px] text-ink-3">{nextOccurrence ? t("classWorkspace.noBookings") : t("classWorkspace.noClassWeek")}</p>
                      )}
                    </div>
                    {target.notes ? <div><p className="text-[12px] text-ink-3">{t("common.label.notes")}</p><p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-ink-2">{target.notes}</p></div> : null}
                  </DialogBody>
                  <DialogFooter>
                    {canManage ? <Button variant="secondary" onClick={() => { setDetailsId(undefined); openEdit(target); }} aria-label={t("classWorkspace.editNamed", { name: target.name })}><Pencil />{" "}{t("common.action.edit")}</Button> : null}
                    <Button variant="ghost" onClick={() => setDetailsId(undefined)}>{t("common.action.close")}</Button>
                    {canRoster ? <Button disabled={occurrencesQuery.isLoading || occurrencesQuery.isError || !nextOccurrence} onClick={() => { setDetailsId(undefined); openNextOccurrence(target.id); }}>{t("classWorkspace.whoBooked")}</Button> : null}{canManage ? <Button variant="danger" onClick={() => { setDetailsId(undefined); setDeleteTarget(target); setDeleteReason(""); }}>{t("classWorkspace.removeFromSchedule")}</Button> : null}
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
                    {t("classWorkspace.rosterSummary", { day: DAYS[managed.dayOfWeek]!, time: isolateLtr(rangeLabel(managed)), audience: AUDIENCE_LABEL[managed.audience], bookings: t("classWorkspace.bookedCapacity", { booked: f.number(managed.roster.length), capacity: f.number(managed.capacity) }) })}{managed.coachName ? ` · ${isolate(managed.coachName)}` : ""}
                  </DialogDescription>
                </DialogHeader>
                <DialogBody className="grid gap-4">
                  {managed.imageUrl ? <div className="h-28 rounded-sm border border-line bg-cover bg-center" role="img" aria-label={classImageAlt(t, managed.name, managed.imageAltText)} style={{ backgroundImage: `url(${managed.imageUrl})` }} /> : null}
                  <div>
                    <p className="context-label">{t("classWorkspace.whoIsBooked")}</p>
                    <div className="mt-2 divide-y divide-line rounded-md border border-line">
                      {managed.roster.length === 0 ? <p className="px-3 py-4 text-center text-[12px] text-ink-3">{t("classWorkspace.noBookings")}</p> : managed.roster.map((entry) => (
                        <div key={entry.memberId} className="flex items-center justify-between gap-2 px-3 py-2">
                          <label className="flex min-w-0 items-center gap-2.5 text-[12.5px]">
                            <input type="checkbox" checked={entry.attended} disabled={!canRoster} onChange={(event) => setAttendance.mutate({ memberId: entry.memberId, attended: event.target.checked })} aria-label={t("classWorkspace.presentLabel", { name: entry.name })} />
                            <span className={`truncate ${entry.attended ? "font-semibold" : ""}`}>{entry.name}</span>
                          </label>
                          {canRoster ? <Button variant="ghost" size="sm" aria-label={t("classWorkspace.removePerson", { name: entry.name })} onClick={() => removeAttendee.mutate(entry.memberId)}><X /></Button> : null}
                        </div>
                      ))}
                    </div>
                    {canRoster ? (
                      <div className="relative mt-2">
                        <label className="grid gap-1.5 text-[12px] font-medium">{t("palette.actions.newMember.title")}<Input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={t("classWorkspace.searchByNamePhone")} />
                        </label>
                        {memberLookup.isLoading ? <p className="mt-2 text-[12px] text-ink-3" role="status">{t("classWorkspace.searching")}</p> : memberLookup.isError ? (
                          <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger" role="alert"><span>{t("classWorkspace.memberSearchFailed")}</span><Button size="sm" variant="ghost" onClick={() => memberLookup.refetch()}>{t("common.action.retry")}</Button></div>
                        ) : memberResults.length > 0 ? (
                          <div className="mt-2 w-full divide-y divide-line rounded-md border border-line bg-surface">
                            {memberResults.map((member) => (
                              <button key={member.id} type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" onClick={() => addAttendee.mutate(member.id)}>
                                <span className="truncate">{member.fullName}</span>
                                <span className="flex items-center gap-1 text-ink-3"><UserPlus className="size-3.5" />{member.memberNumber}</span>
                              </button>
                            ))}
                          </div>
                        ) : normalizedMemberSearch.length >= 2 ? <p className="mt-2 text-[12px] text-ink-3">{t("classWorkspace.noMembers")}</p> : null}
                      </div>
                    ) : null}
                  </div>
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setManageId(undefined)}>{t("common.action.close")}</Button>
                  {canManage ? <Button variant="primary" onClick={() => openEdit(managed)}>{t("classWorkspace.editClass")}</Button> : null}
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
    </div>
  );
}

function CoachForm({ onSubmit, pending }: { onSubmit: (input: { name: string; phone?: string; specialty?: string }) => void; pending: boolean }) {
  const t = useT();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  return (
    <div className="grid gap-2 rounded-md border border-dashed border-line-2 p-3">
      <p className="text-[12px] font-medium">{t("classWorkspace.addCoachTitle")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("common.label.name")} aria-label={t("classWorkspace.coachName")} />
        <Input dir="ltr" inputMode="tel" value={phone} onChange={(event) => setPhone(latinDigits(event.target.value))} placeholder={t("classWorkspace.phoneOptional")} aria-label={t("classWorkspace.coachPhone")} />
        <Input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder={t("classWorkspace.specialtyOptional")} aria-label={t("classWorkspace.coachSpecialty")} />
      </div>
      <div className="flex justify-end"><Button size="sm" loading={pending} disabled={!name.trim()} onClick={() => { onSubmit({ name: name.trim(), phone: phone.trim() || undefined, specialty: specialty.trim() || undefined }); setName(""); setPhone(""); setSpecialty(""); }}><Plus /> {" "}{t("classWorkspace.addCoach")}</Button></div>
    </div>
  );
}
