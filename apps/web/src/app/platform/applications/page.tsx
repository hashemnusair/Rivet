"use client";

import { Check, CheckCircle2, CircleAlert, Clock3, RefreshCcw, Search, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { FilterPills, PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { ApplicationStatusBadge, NotificationStatusBadge } from "@/components/platform/platform-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/states";
import { ContextLabel } from "@/components/ui/typography";
import { getApi } from "@/lib/api/client";
import type { GymApplicationStatus, PlatformGymApplication, ProvisionGymInput, ReviewGymApplicationInput } from "@/lib/api/GymOSApi";
import { cn } from "@/lib/utils/cn";

type Filter = "all" | GymApplicationStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function parseFilter(value: string | null): Filter {
  return FILTERS.some((item) => item.value === value) ? (value as Filter) : "all";
}

export default function PlatformApplicationsPage() {
  const [applications, setApplications] = useState<PlatformGymApplication[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDecision, setBusyDecision] = useState<ReviewGymApplicationInput["decision"]>();
  const [busyNote, setBusyNote] = useState(false);
  const [busyProvisioning, setBusyProvisioning] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedApplicationId = searchParams.get("application")?.trim() || undefined;
  // The status filter lives in the URL so a queue view can be shared and
  // survives refresh; the overview's attention links land on it directly.
  const urlFilter = parseFilter(searchParams.get("status"));
  const [filter, setFilter] = useState<Filter>(urlFilter);
  useEffect(() => { setFilter(urlFilter); }, [urlFilter]);
  const changeFilter = (next: Filter) => {
    setFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("status");
    else params.set("status", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const requestedApplicationIdRef = useRef<string | undefined>(requestedApplicationId);
  const initialLoadRef = useRef(true);
  const liveSnapshotRef = useRef(false);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    requestedApplicationIdRef.current = requestedApplicationId;
    setSelectedId(requestedApplicationId);
  }, [requestedApplicationId]);

  const loadApplications = useCallback(async (background = false): Promise<PlatformGymApplication[] | undefined> => {
    const requestId = ++loadRequestRef.current;
    const isInitialLoad = !background && initialLoadRef.current;
    if (isInitialLoad) initialLoadRef.current = false;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(undefined);
    try {
      const rows = await getApi().listGymApplications();
      // The live subscription is authoritative once it has delivered a
      // snapshot. Do not let a slower one-shot read overwrite it during the
      // initial mount race; explicit refreshes still apply their result.
      if (requestId !== loadRequestRef.current || (isInitialLoad && liveSnapshotRef.current)) return;
      setApplications(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows.find((row) => row.id === requestedApplicationIdRef.current)?.id ?? rows[0]?.id);
      return rows;
    } catch (cause) {
      if (requestId === loadRequestRef.current && (!isInitialLoad || !liveSnapshotRef.current)) setError(cause instanceof Error ? cause.message : "Applications could not be loaded.");
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  // The platform applications screen uses a typed, identity-scoped Convex
  // subscription rather than a direct Convex React query or a polling loop.
  // A review/provisioning change made in another tab now updates this queue
  // without a manual reload or a full-page loading flicker.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const handleError = (cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : "Applications could not be refreshed.");
      setLoading(false);
      setRefreshing(false);
    };

    void getApi().subscribePlatformApplications((rows) => {
      if (cancelled) return;
      liveSnapshotRef.current = true;
      setApplications(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows.find((row) => row.id === requestedApplicationIdRef.current)?.id ?? rows[0]?.id);
      setError(undefined);
      setLoading(false);
      setRefreshing(false);
    }, handleError).then((disposer) => {
      if (cancelled) disposer();
      else unsubscribe = disposer;
    }).catch(handleError);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const counts = useMemo(() => FILTERS.reduce<Record<Filter, number>>((result, item) => {
    result[item.value] = item.value === "all" ? applications.length : applications.filter((application) => application.status === item.value).length;
    return result;
  }, { all: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 }), [applications]);

  const visibleApplications = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesFilter = filter === "all" || application.status === filter;
      const matchesSearch = !normalized || [application.gymName, application.ownerName, application.email, application.contactNumber, application.plan].some((value) => value.toLowerCase().includes(normalized));
      return matchesFilter && matchesSearch;
    });
  }, [applications, filter, search]);

  // Keep the detail pane inside the active filter/search result set. This
  // matters after a decision moves an application out of the current tab.
  const selected = visibleApplications.find((application) => application.id === selectedId) ?? visibleApplications[0];
  const selectedApplicationId = selected?.id;
  const selectedReviewNote = selected?.reviewNotes;

  useEffect(() => {
    if (!selectedApplicationId) return;
    setSelectedId(selectedApplicationId);
    setNote(selectedReviewNote ?? "");
  }, [selectedApplicationId, selectedReviewNote]);

  const review = async (decision: ReviewGymApplicationInput["decision"]) => {
    if (!selected) return;
    if (decision === "rejected" && !note.trim()) {
      setError("Add a reason before rejecting this application.");
      return;
    }
    setBusyDecision(decision);
    setError(undefined);
    setFeedback(undefined);
    try {
      const updated = await getApi().reviewGymApplication({ applicationId: selected.id, decision, note: note.trim() || undefined });
      setApplications((current) => current.map((application) => application.id === updated.id ? updated : application));
      setNote(updated.reviewNotes ?? "");
      const notification = updated.reviewNotificationStatus === "sent"
        ? " The owner was notified by email."
        : updated.reviewNotificationStatus === "failed"
          ? " The decision was saved, but the owner email failed."
          : " The decision was saved; owner email delivery is not configured.";
      setFeedback(decision === "under_review" ? "Application moved to the review queue." : decision === "approved" ? `Application approved.${notification}` : `Application rejected.${notification}`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The review decision could not be saved.";
      // A second operator may have finalized the application while this page
      // was open. Re-read the authoritative row before showing the retryable
      // error so the detail pane does not strand the operator on stale actions.
      await loadApplications(true);
      setError(message);
    } finally {
      setBusyDecision(undefined);
    }
  };

  const provision = async (input: ProvisionGymInput) => {
    setBusyProvisioning(true);
    setError(undefined);
    setFeedback(undefined);
    try {
      const result = await getApi().provisionGym(input);
      setApplications((current) => current.map((application) => application.id === result.applicationId ? {
        ...application,
        provisioningStatus: result.status,
        provisioningCheckpoint: "completed",
        provisioningOutcome: "complete",
        provisioningStartedAt: undefined,
        provisioningError: undefined,
        provisionedAt: new Date().toISOString(),
        provisionedOrganizationId: result.organizationId,
        provisionedBranchId: result.branchId,
        clerkOrganizationId: result.clerkOrganizationId,
        clerkInvitationId: result.clerkInvitationId,
      } : application));
      setFeedback(`Workspace created for ${result.organizationName}. ${result.ownerEmail} was invited as the gym owner.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The gym workspace could not be provisioned.";
      // The action records the provider failure on the application before it
      // rejects. Pull that row back immediately so the detail pane shows the
      // actionable reason (and not only the generic action error).
      const refreshed = await loadApplications(true);
      const authoritative = refreshed?.find((application) => application.id === input.applicationId);
      if (authoritative?.provisioningStatus === "completed") {
        // The external provider may have completed while the final response
        // was interrupted. Trust the durable application row over the action
        // transport error so a successfully provisioned workspace does not
        // leave the operator with a false failure banner.
        setError(undefined);
        setFeedback(`Workspace created for ${authoritative.gymName}. ${authoritative.email} was invited as the gym owner.`);
      } else {
        setError(message);
      }
    } finally {
      setBusyProvisioning(false);
    }
  };

  const saveNote = async () => {
    if (!selected) return;
    setBusyNote(true);
    setError(undefined);
    setFeedback(undefined);
    try {
      const updated = await getApi().saveGymApplicationReviewNote({ applicationId: selected.id, note });
      setApplications((current) => current.map((application) => application.id === updated.id ? updated : application));
      setNote(updated.reviewNotes ?? "");
      setFeedback(updated.reviewNotes ? "Review note saved." : "Review note cleared.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review note could not be saved.");
    } finally {
      setBusyNote(false);
    }
  };

  const busy = Boolean(busyDecision || busyNote || busyProvisioning);

  return (
    <PlatformPage>
      <PageHeader
        title="Gym applications"
        description="Review every gym before provisioning a workspace or sending access. Decisions are recorded for the platform team."
        actions={<Button variant="secondary" onClick={() => void loadApplications(true)} loading={refreshing} disabled={busy}><RefreshCcw /> Refresh</Button>}
      />

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Application totals">
        <PlatformPanel className="p-4"><Stat label="Needs attention" value={String(counts.pending)} context="Waiting for a first review" tone={counts.pending > 0 ? "warning" : undefined} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Under review" value={String(counts.under_review)} context="Follow-up still required" /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Approved" value={String(counts.approved)} context="Ready for provisioning" tone={counts.approved > 0 ? "success" : undefined} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Total applications" value={String(counts.all)} context="All time in this deployment" /></PlatformPanel>
      </section>

      {error ? <div className="mt-5 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-[12.5px] text-danger" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div> : null}
      {feedback ? <div className="mt-5 flex items-start gap-2 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-[12.5px] text-success-deep" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />{feedback}</div> : null}

      <PlatformPanel className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
          <label className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search gym, owner, email, or plan" aria-label="Search gym applications" disabled={busy || refreshing} />
          </label>
          <FilterPills label="Application status filter" value={filter} items={FILTERS.map((item) => ({ ...item, count: counts[item.value] }))} onChange={changeFilter} disabled={busy || refreshing} />
        </div>

        {loading ? <LoadingState /> : visibleApplications.length === 0 ? <div className="p-5"><StatePanel layout="section" title="No applications found" description={search || filter !== "all" ? "Try a different search or status filter." : "New gym applications will appear here."} /></div> : (
          <div className="grid min-h-[560px] lg:grid-cols-[360px_1fr]">
            <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label="Gym applications list">
              <div className="divide-y divide-line">
                {visibleApplications.map((application) => (
                  <button key={application.id} type="button" aria-pressed={selected?.id === application.id} disabled={busy || refreshing} onClick={() => { setSelectedId(application.id); setFeedback(undefined); setError(undefined); }} className={cn("w-full px-4 py-3.5 text-start transition-colors hover:bg-sunken/60 disabled:cursor-not-allowed disabled:opacity-60", selected?.id === application.id && "bg-sunken")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{application.gymName}</p><p className="mt-0.5 truncate text-[12.5px] text-ink-3">{application.ownerName} · {application.plan}</p></div>
                      <ApplicationStatusBadge status={application.status} className="shrink-0" />
                    </div>
                    <p className="mt-2 text-[12.5px] text-ink-3">Submitted {formatDate(application.submittedAt)}</p>
                  </button>
                ))}
              </div>
            </aside>

            {selected ? <ApplicationDetail application={selected} note={note} setNote={setNote} busyDecision={busyDecision} busyNote={busyNote} busyProvisioning={busyProvisioning} refreshing={refreshing} onReview={review} onSaveNote={saveNote} onProvision={() => void provision({ applicationId: selected.id })} onRefresh={() => void loadApplications(true)} /> : null}
          </div>
        )}
      </PlatformPanel>
    </PlatformPage>
  );
}

function ApplicationDetail({ application, note, setNote, busyDecision, busyNote, busyProvisioning, refreshing, onReview, onSaveNote, onProvision, onRefresh }: { application: PlatformGymApplication; note: string; setNote: (value: string) => void; busyDecision?: ReviewGymApplicationInput["decision"]; busyNote: boolean; busyProvisioning: boolean; refreshing: boolean; onReview: (decision: ReviewGymApplicationInput["decision"]) => Promise<void>; onSaveNote: () => Promise<void>; onProvision: () => void; onRefresh: () => void }) {
  // An approved application whose provisioning failed permanently and
  // created no workspace can still be rejected to clear the queue.
  const provisioningDeadEnd = application.status === "approved" && application.provisioningStatus === "failed" && !application.provisionedOrganizationId;
  const finalized = (application.status === "approved" && !provisioningDeadEnd) || application.status === "rejected";
  const noteDirty = note.trim() !== (application.reviewNotes ?? "");
  return (
    <article className="flex min-w-0 flex-col" aria-label={application.gymName}>
      <header className="border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2"><ApplicationStatusBadge status={application.status} /><span className="text-[12.5px] text-ink-3">Submitted {formatDate(application.submittedAt)}</span></div>
        <h2 className="mt-2 text-[20px] font-semibold leading-snug tracking-tight">{application.gymName}</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">{application.plan} plan{application.billingInterval ? ` · ${application.billingInterval === "annual" ? "annual billing" : "monthly billing"}` : ""} · Application <span className="font-mono text-[12px]">{application.id.slice(0, 8)}</span></p>
      </header>

      <div className="grid flex-1 gap-5 px-4 py-4 sm:px-5 xl:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          <section aria-labelledby={`applicant-${application.id}`}>
            <h3 id={`applicant-${application.id}`} className="text-[13px] font-semibold">Applicant</h3>
            <dl className="mt-2 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
              <Detail label="Owner" value={application.ownerName} />
              <Detail label="Email" value={application.email} ltr />
              <Detail label="Contact number" value={application.contactNumber} ltr />
              <Detail label="Chosen plan" value={application.plan} />
            </dl>
          </section>
          <section>
            <Field label="Review notes" hint="A rejection requires a reason. Notes are visible to the platform team only.">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={Boolean(busyDecision) || busyNote} placeholder="Record what you verified, or why the application was rejected." />
            </Field>
            <div className="mt-2 flex justify-end"><Button type="button" variant="secondary" size="sm" onClick={() => void onSaveNote()} loading={busyNote} disabled={!noteDirty || Boolean(busyDecision)}>{noteDirty ? "Save note" : "Saved"}</Button></div>
          </section>
          {finalized ? <div className={cn("flex items-start gap-3 rounded-md border p-4 text-[12.5px]", application.status === "approved" ? "border-success/30 bg-success-bg text-success-deep" : "border-danger/30 bg-danger-bg text-danger")} role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>{application.status === "approved" ? "Application approved" : "Application rejected"}</strong><p className="mt-1 leading-relaxed opacity-90">{application.reviewedBy ? `Decision by ${application.reviewedBy} on ${formatDate(application.reviewedAt ?? application.updatedAt)}.` : "Decision recorded."} {application.reviewNotificationStatus === "sent" ? "The owner was notified by email." : application.reviewNotificationStatus === "failed" ? "The decision was saved, but the email failed." : "The owner notification is not configured."} {application.status === "rejected" ? " This decision is final; the applicant can submit a new application if circumstances change." : ""}</p></div></div> : null}
          {application.status === "approved" ? <ProvisioningCard application={application} busy={busyProvisioning} refreshing={refreshing} onProvision={onProvision} onRefresh={onRefresh} /> : null}
        </div>

        <aside className="space-y-5 border-t border-line pt-5 xl:border-s xl:border-t-0 xl:ps-5 xl:pt-0">
          <section>
            <h3 className="text-[13px] font-semibold">Email delivery</h3>
            <dl className="mt-2 space-y-2.5">
              <DeliveryRow label="Received confirmation" status={application.notificationStatus} />
              <DeliveryRow label="Decision email" status={application.reviewNotificationStatus} />
            </dl>
          </section>
          {!finalized ? (
            <section className="border-t border-line pt-5">
              <h3 className="text-[13px] font-semibold">Decision</h3>
              {provisioningDeadEnd ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">Provisioning failed permanently, so this application can only be rejected (add the reason above).</p> : null}
              <div className="mt-3 grid gap-2">
                {!provisioningDeadEnd ? <><Button onClick={() => void onReview("approved")} loading={busyDecision === "approved"} disabled={Boolean(busyDecision)}><Check />Approve application</Button><Button variant="secondary" onClick={() => void onReview("under_review")} loading={busyDecision === "under_review"} disabled={Boolean(busyDecision) || application.status === "under_review"}><Clock3 />Mark under review</Button></> : null}
                <Button variant="danger" onClick={() => void onReview("rejected")} loading={busyDecision === "rejected"} disabled={Boolean(busyDecision)}><X />Reject application</Button>
              </div>
            </section>
          ) : null}
          <p className="border-t border-line pt-5 text-[12.5px] leading-relaxed text-ink-3">Provisioning creates the tenant, first branch, role definitions, subscription assignment, and owner invitation in one audited workflow.</p>
        </aside>
      </div>
    </article>
  );
}

function ProvisioningCard({ application, busy, refreshing, onProvision, onRefresh }: { application: PlatformGymApplication; busy: boolean; refreshing: boolean; onProvision: () => void; onRefresh: () => void }) {
  const status = application.provisioningStatus ?? "not_started";
  if (status === "completed") {
    return <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg p-4 text-[12.5px] text-success-deep" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>Workspace provisioned</strong><p className="mt-1 leading-relaxed opacity-90">The first branch and owner invitation are ready. The gym can sign in after accepting the invitation.</p></div></div>;
  }
  if (status === "failed") {
    const permanent = application.provisioningOutcome === "permanent";
    const partial = application.provisioningOutcome === "partial";
    return <div className="rounded-md border border-danger/30 bg-danger-bg p-4 text-[12.5px] text-danger" role="alert"><div className="flex items-start gap-3"><X className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>{permanent ? "Provisioning requires manual correction" : partial ? "Workspace partially created — retryable" : "Provisioning needs attention"}</strong><p className="mt-1 leading-relaxed opacity-90">{application.provisioningError ?? (permanent ? "Correct the recorded conflict before trying again." : "The workspace was not completed.")}</p></div></div>{permanent ? null : <Button className="mt-4" variant="danger" size="sm" onClick={onProvision} loading={busy}>Retry provisioning</Button>}</div>;
  }
  if (status === "in_progress") {
    return <div className="rounded-md border border-warning/30 bg-warning-bg p-4 text-[12.5px] text-warning-deep" role="status"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>Provisioning in progress</strong><p className="mt-1 leading-relaxed opacity-90">The workspace request is being completed. Refresh this application in a moment before trying again.</p></div></div><Button className="mt-4" variant="secondary" size="sm" onClick={onRefresh} loading={refreshing} disabled={busy}><RefreshCcw /> Refresh status</Button></div>;
  }
  return <div className="rounded-md border border-line bg-sunken/60 p-4 text-[12.5px] text-ink-2"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /><div><strong className="text-ink">Ready to provision</strong><p className="mt-1 leading-relaxed">Creates the gym workspace, assigns the {application.plan} plan, and emails an owner invitation.</p></div></div><Button className="mt-4" variant="signal" size="sm" onClick={onProvision} loading={busy}><Check />Provision gym workspace</Button></div>;
}

function Detail({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="bg-surface px-3.5 py-3"><ContextLabel as="dt">{label}</ContextLabel><dd className="mt-1 break-words text-[13.5px] font-medium" dir={ltr ? "ltr" : undefined}>{value}</dd></div>;
}

function DeliveryRow({ label, status }: { label: string; status: PlatformGymApplication["notificationStatus"] }) {
  return <div className="flex items-center justify-between gap-3 text-[12.5px]"><dt className="text-ink-2">{label}</dt><dd><NotificationStatusBadge status={status} /></dd></div>;
}

function LoadingState() {
  return <div className="grid gap-3 p-5" aria-label="Loading applications" role="status">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-md border border-line bg-sunken" />)}</div>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
