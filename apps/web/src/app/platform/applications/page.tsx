"use client";

import {
  Check,
  CheckCircle2,
  Clock3,
  Mail,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/states";
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

export default function PlatformApplicationsPage() {
  const [applications, setApplications] = useState<PlatformGymApplication[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDecision, setBusyDecision] = useState<ReviewGymApplicationInput["decision"]>();
  const [busyProvisioning, setBusyProvisioning] = useState(false);
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();

  const loadApplications = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(undefined);
    try {
      const rows = await getApi().listGymApplications();
      setApplications(rows);
      setSelectedId((current) => current && rows.some((row) => row.id === current) ? current : rows[0]?.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Applications could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  // The platform applications screen uses the shared API seam rather than a
  // direct Convex React query. Refresh the active list frequently so a form
  // submission, review decision, or provisioning failure made in another tab
  // appears without asking the operator to reload the page.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadApplications(true);
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [loadApplications]);

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

  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setNote(selected.reviewNotes ?? "");
  }, [selected]);

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
      setError(cause instanceof Error ? cause.message : "The review decision could not be saved.");
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
      await loadApplications(true);
      setError(message);
    } finally {
      setBusyProvisioning(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Network control</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-tight">Gym applications</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">Review every gym before provisioning a workspace or sending access. Decisions are recorded for the platform team.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void loadApplications(true)} loading={refreshing}>
            <RefreshCcw /> Refresh
          </Button>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Total applications" value={counts.all} detail="All time in this deployment" />
          <Kpi label="Needs attention" value={counts.pending} detail="Waiting for a first review" tone="warning" />
          <Kpi label="Under review" value={counts.under_review} detail="Follow-up still required" />
          <Kpi label="Approved" value={counts.approved} detail="Ready for provisioning" tone="success" />
        </section>

        {error ? <div className="mt-5 border border-danger/30 bg-danger-bg px-4 py-3 text-[12px] text-danger" role="alert">{error}</div> : null}
        {feedback ? <div className="mt-5 flex items-center gap-2 border border-success/30 bg-success-bg px-4 py-3 text-[12px] text-success" role="status"><CheckCircle2 className="size-4" />{feedback}</div> : null}

        <section className="mt-5 border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
            <label className="relative min-w-[240px] flex-1">
              <Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
              <Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search gym, owner, email, or plan" aria-label="Search gym applications" />
            </label>
            <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Application status filter">
              {FILTERS.map((item) => (
                <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => setFilter(item.value)} className={cn("whitespace-nowrap rounded-md px-3 py-2 text-[11px] transition-colors", filter === item.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken hover:text-ink")}>
                  {item.label} <span className="ms-1 font-mono text-[9px] opacity-70">{counts[item.value]}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? <LoadingState /> : visibleApplications.length === 0 ? <StatePanel title="No applications found" description={search || filter !== "all" ? "Try a different search or status filter." : "New gym applications will appear here."} className="m-5" /> : (
            <div className="grid min-h-[620px] lg:grid-cols-[390px_1fr]">
              <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label="Gym applications list">
                <div className="divide-y divide-line">
                  {visibleApplications.map((application) => (
                    <button key={application.id} type="button" onClick={() => { setSelectedId(application.id); setFeedback(undefined); setError(undefined); }} className={cn("w-full p-4 text-start transition-colors hover:bg-sunken", selected?.id === application.id && "bg-sunken shadow-[inset_3px_0_0_#d9232b]")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate text-[13px] font-semibold">{application.gymName}</p><p className="mt-1 truncate text-[10.5px] text-ink-3">{application.ownerName} · {application.plan}</p></div>
                        <Status status={application.status} />
                      </div>
                      <p className="mt-3 flex items-center gap-1.5 text-[9.5px] text-ink-3"><Clock3 className="size-3" />{formatDate(application.submittedAt)}</p>
                    </button>
                  ))}
                </div>
              </aside>

              {selected ? <ApplicationDetail application={selected} note={note} setNote={setNote} busyDecision={busyDecision} busyProvisioning={busyProvisioning} onReview={review} onProvision={() => void provision({ applicationId: selected.id })} /> : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ApplicationDetail({ application, note, setNote, busyDecision, busyProvisioning, onReview, onProvision }: { application: PlatformGymApplication; note: string; setNote: (value: string) => void; busyDecision?: ReviewGymApplicationInput["decision"]; busyProvisioning: boolean; onReview: (decision: ReviewGymApplicationInput["decision"]) => Promise<void>; onProvision: () => void }) {
  const finalized = application.status === "approved" || application.status === "rejected";
  return (
    <article className="flex min-w-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Status status={application.status} /><span className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Submitted {formatDate(application.submittedAt)}</span></div>
          <h2 className="mt-3 text-[22px] font-semibold tracking-tight">{application.gymName}</h2>
          <p className="mt-1 text-[11px] text-ink-3">{application.plan} plan · Application {application.id.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-ink-3"><ShieldCheck className="size-4 text-success" />Platform review required</div>
      </header>

      <div className="grid flex-1 gap-5 p-5 sm:p-6 xl:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <section><p className="eyebrow">Applicant details</p><div className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2"><Detail icon={<UserRound />} label="Owner" value={application.ownerName} /><Detail icon={<Mail />} label="Email" value={application.email} /><Detail icon={<Phone />} label="Contact number" value={application.contactNumber} /><Detail icon={<CheckCircle2 />} label="Chosen plan" value={application.plan} /></div></section>
          <section><p className="eyebrow">Review notes</p><Textarea className="mt-3" value={note} onChange={(event) => setNote(event.target.value)} disabled={finalized || Boolean(busyDecision)} placeholder="Record what you verified, or why the application was rejected." aria-label="Review notes" /><p className="mt-2 text-[10px] text-ink-3">A rejection requires a reason. Notes are visible to the platform team only.</p></section>
          {finalized ? <div className={cn("flex items-start gap-3 border p-4 text-[12px]", application.status === "approved" ? "border-success/30 bg-success-bg text-success" : "border-danger/30 bg-danger-bg text-danger")}><CheckCircle2 className="mt-0.5 size-4" /><div><strong>{application.status === "approved" ? "Application approved" : "Application rejected"}</strong><p className="mt-1 text-[11px] opacity-80">{application.reviewedBy ? `Decision by ${application.reviewedBy} on ${formatDate(application.reviewedAt ?? application.updatedAt)}.` : "Decision recorded."} {application.reviewNotificationStatus === "sent" ? "The owner was notified by email." : application.reviewNotificationStatus === "failed" ? "The decision was saved, but the email failed." : "The owner notification is not configured."}</p></div></div> : null}
          {application.status === "approved" ? <ProvisioningCard application={application} busy={busyProvisioning} onProvision={onProvision} /> : null}
        </div>

        <aside className="space-y-5 border-t border-line pt-5 xl:border-s xl:border-t-0 xl:ps-5 xl:pt-0">
          <section><p className="eyebrow">Email delivery</p><div className="mt-3 space-y-3"><DeliveryRow label="Received confirmation" status={application.notificationStatus} /><DeliveryRow label="Decision email" status={application.reviewNotificationStatus} /></div></section>
          {!finalized ? <section className="border-t border-line pt-5"><p className="eyebrow">Decision</p><div className="mt-3 grid gap-2"><Button variant="secondary" onClick={() => void onReview("under_review")} loading={busyDecision === "under_review"} disabled={Boolean(busyDecision) || application.status === "under_review"}><Clock3 />Mark under review</Button><Button variant="signal" onClick={() => void onReview("approved")} loading={busyDecision === "approved"} disabled={Boolean(busyDecision)}><Check />Approve application</Button><Button variant="danger" onClick={() => void onReview("rejected")} loading={busyDecision === "rejected"} disabled={Boolean(busyDecision)}><X />Reject application</Button></div></section> : null}
          <section className="border-t border-line pt-5 text-[10.5px] leading-relaxed text-ink-3"><p>Provisioning creates the tenant, first branch, role definitions, subscription assignment, and owner invitation in one audited workflow.</p></section>
        </aside>
      </div>
    </article>
  );
}

function ProvisioningCard({ application, busy, onProvision }: { application: PlatformGymApplication; busy: boolean; onProvision: () => void }) {
  const status = application.provisioningStatus ?? "not_started";
  if (status === "completed") {
    return <div className="mt-5 flex items-start gap-3 border border-success/30 bg-success-bg p-4 text-[12px] text-success"><CheckCircle2 className="mt-0.5 size-4" /><div><strong>Workspace provisioned</strong><p className="mt-1 text-[11px] opacity-80">The first branch and owner invitation are ready. The gym can now sign in after accepting the Clerk invitation.</p></div></div>;
  }
  if (status === "failed") {
    return <div className="mt-5 border border-danger/30 bg-danger-bg p-4 text-[12px] text-danger"><div className="flex items-start gap-3"><X className="mt-0.5 size-4" /><div><strong>Provisioning needs attention</strong><p className="mt-1 text-[11px] opacity-80">{application.provisioningError ?? "The workspace was not completed."}</p></div></div><Button className="mt-4" variant="danger" size="sm" onClick={onProvision} loading={busy}>Retry provisioning</Button></div>;
  }
  if (status === "in_progress") {
    return <div className="mt-5 border border-warning/30 bg-warning-bg p-4 text-[12px] text-warning" role="status"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-4" /><div><strong>Provisioning in progress</strong><p className="mt-1 text-[11px] opacity-80">The workspace request is being completed. Refresh this application in a moment before trying again.</p></div></div></div>;
  }
  return <div className="mt-5 border border-info/30 bg-info-bg p-4 text-[12px] text-info"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4" /><div><strong>Ready to provision</strong><p className="mt-1 text-[11px] opacity-80">Creates the gym workspace, assigns the {application.plan} plan, and emails an owner invitation.</p></div></div><Button className="mt-4" variant="signal" size="sm" onClick={onProvision} loading={busy}><Check />Provision gym workspace</Button></div>;
}

function Kpi({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: "default" | "warning" | "success" }) {
  return <div className="border border-line bg-surface p-5"><p className="font-mono text-[8px] uppercase tracking-[.12em] text-ink-3">{label}</p><p className={cn("mt-2 text-[28px] font-semibold tracking-tight", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{value}</p><p className="mt-2 text-[10.5px] text-ink-3">{detail}</p></div>;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-surface p-4"><div className="flex items-center gap-2 text-ink-3 [&_svg]:size-3.5">{icon}<span className="font-mono text-[8px] uppercase tracking-[.12em]">{label}</span></div><p className="mt-2 break-words text-[12.5px] font-medium">{value}</p></div>;
}

function DeliveryRow({ label, status }: { label: string; status: PlatformGymApplication["notificationStatus"] }) {
  const sent = status === "sent";
  return <div className="flex items-center justify-between gap-3 text-[11px]"><span className="text-ink-2">{label}</span><span className={cn("rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[.08em]", sent ? "bg-success-bg text-success" : status === "failed" ? "bg-danger-bg text-danger" : "bg-sunken text-ink-3")}>{status.replaceAll("_", " ")}</span></div>;
}

function Status({ status }: { status: GymApplicationStatus }) {
  const styles: Record<GymApplicationStatus, string> = { pending: "bg-warning-bg text-warning", under_review: "bg-info-bg text-info", approved: "bg-success-bg text-success", rejected: "bg-danger-bg text-danger" };
  return <span className={cn("shrink-0 rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[.08em]", styles[status])}>{status.replaceAll("_", " ")}</span>;
}

function LoadingState() {
  return <div className="grid gap-3 p-5" aria-label="Loading applications" role="status">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse border border-line bg-sunken" />)}</div>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
