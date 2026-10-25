"use client";
import { useLocale, useT, type TKey } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { ArrowLeft, Check, CheckCircle2, CircleAlert, Clock3, RefreshCcw, Search, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/chrome";
import { FilterPills, PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { ApplicationStatusBadge, NotificationStatusBadge } from "@/components/platform/platform-status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContextLabel } from "@/components/ui/typography";
import { getApi } from "@/lib/api/client";
import { localizeApiError } from "@/lib/api/errors";
import type { GymApplicationStatus, PlatformGymApplication, ProvisionGymInput, ReviewGymApplicationInput } from "@/lib/api/GymOSApi";
import { cn } from "@/lib/utils/cn";
import { money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { isQuotedPlan } from "../../../../convex/planCatalogue";
import { PlatformReviewBrief } from "@/features/assist/platform-review-brief";
import { replaceQueryInPlace } from "@/lib/routing/replace-query";

type Filter = "all" | GymApplicationStatus;

const FILTERS: Array<{ value: Filter; labelKey: TKey }> = [
  { value: "all", labelKey: "platformConsole.applications.all" },
  { value: "pending", labelKey: "platformConsole.status.application.pending" },
  { value: "under_review", labelKey: "platformConsole.status.application.underReview" },
  { value: "approved", labelKey: "platformConsole.applications.approved" },
  { value: "rejected", labelKey: "platformConsole.applications.rejected" },
];

function parseFilter(value: string | null): Filter {
  return FILTERS.some((item) => item.value === value) ? (value as Filter) : "all";
}

/** The open application is split into a few tabs; Workspace exists only once a gym is approved. */
const APPLICATION_TABS = ["applicant", "decision", "workspace"] as const;
type ApplicationTab = (typeof APPLICATION_TABS)[number];

const TAB_KEYS: Record<ApplicationTab, TKey> = {
  applicant: "platformConsole.applications.applicant",
  decision: "platformConsole.applications.decision",
  workspace: "platformConsole.applications.workspace",
};

function parseTab(value: string | null): ApplicationTab | undefined {
  return APPLICATION_TABS.find((tab) => tab === value);
}

function tabsFor(application: PlatformGymApplication): readonly ApplicationTab[] {
  return application.status === "approved" ? APPLICATION_TABS : ["applicant", "decision"];
}

/** An approved gym still waiting for its workspace needs the Workspace tab. */
function workspaceNeedsAction(application: PlatformGymApplication): boolean {
  return application.status === "approved" && application.provisioningStatus !== "completed";
}

export default function PlatformApplicationsPage() {
  const t = useT();
  const f = useFormat();
  const { locale, isolate } = useLocale();
  const [applications, setApplications] = useState<PlatformGymApplication[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState("");
  // Enterprise is sold by quote: approving one records the monthly price.
  const [quote, setQuote] = useState("");
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
  // A tab someone picked stays picked from application to application; until
  // then each application opens on the tab that needs doing.
  const [chosenTab, setChosenTab] = useState<ApplicationTab | undefined>(() => parseTab(searchParams.get("tab")));
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const setParams = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    replaceQueryInPlace(router, query ? `${pathname}?${query}` : pathname);
  };
  const changeFilter = (next: Filter) => {
    setFilter(next);
    setParams({ status: next === "all" ? undefined : next });
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
      if (requestId === loadRequestRef.current && (!isInitialLoad || !liveSnapshotRef.current)) setError(localizeApiError(cause, locale).message || t("platformConsole.applications.loadFailed"));
    } finally {
      if (requestId !== loadRequestRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [locale, t]);

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
      setError(localizeApiError(cause, locale).message || t("platformConsole.applications.refreshFailed"));
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
  }, [locale, t]);

  const counts = useMemo(() => FILTERS.reduce<Record<Filter, number>>((result, item) => {
    result[item.value] = item.value === "all" ? applications.length : applications.filter((application) => application.status === item.value).length;
    return result;
  }, { all: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 }), [applications]);

  const visibleApplications = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesFilter = filter === "all" || application.status === filter;
      const matchesSearch = !normalized || [application.gymName, application.gymAddress ?? "", application.ownerName, application.email, application.contactNumber, application.plan].some((value) => value.toLowerCase().includes(normalized));
      return matchesFilter && matchesSearch;
    });
  }, [applications, filter, search]);

  // Keep the detail pane inside the active filter/search result set. This
  // matters after a decision moves an application out of the current tab.
  const selected = visibleApplications.find((application) => application.id === selectedId) ?? visibleApplications[0];
  const selectedApplicationId = selected?.id;
  const selectedReviewNote = selected?.reviewNotes;
  const selectedQuote = selected?.quotedPriceMinor;

  useEffect(() => {
    if (!selectedApplicationId) return;
    setSelectedId(selectedApplicationId);
    setNote(selectedReviewNote ?? "");
    setQuote(selectedQuote ? toMajorString(money(selectedQuote, "JOD")) : "");
  }, [selectedApplicationId, selectedReviewNote, selectedQuote]);

  // An application opened from a link may sit below the fold of the
  // scrolling list. Only the list moves; on a phone it does not scroll on its
  // own, so this does nothing there.
  useEffect(() => {
    const list = listRef.current;
    const row = selectedApplicationId ? list?.querySelector<HTMLElement>(`[data-application-id="${selectedApplicationId}"]`) : null;
    if (!list || !row) return;
    const bounds = list.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    if (box.bottom > bounds.bottom) list.scrollTop += box.bottom - bounds.bottom;
  }, [selectedApplicationId, loading]);

  const activeTab: ApplicationTab = selected && chosenTab && tabsFor(selected).includes(chosenTab)
    ? chosenTab
    : selected && workspaceNeedsAction(selected) ? "workspace" : "applicant";

  // On a phone the list gives way to the application, so bring its top into view.
  const openApplication = (id: string) => {
    setSelectedId(id);
    setFeedback(undefined);
    setError(undefined);
    setParams({ application: id });
    if (window.matchMedia?.("(min-width: 1024px)").matches) return;
    window.requestAnimationFrame(() => panelRef.current?.scrollIntoView?.({ block: "start" }));
  };

  const review = async (decision: ReviewGymApplicationInput["decision"]) => {
    if (!selected) return;
    if (decision === "rejected" && !note.trim()) {
      setError(t("platformConsole.applications.rejectionNeedsReason"));
      return;
    }
    let quotedPriceMinor: number | undefined;
    if (decision === "approved" && isQuotedPlan(selected.plan)) {
      const parsed = readMoneyInput(quote, "JOD");
      if (!parsed.ok || parsed.money.amount <= 0) {
        setError(t("platformConsole.applications.quoteRequired"));
        return;
      }
      quotedPriceMinor = parsed.money.amount;
    }
    setBusyDecision(decision);
    setError(undefined);
    setFeedback(undefined);
    try {
      const updated = await getApi().reviewGymApplication({ applicationId: selected.id, decision, note: note.trim() || undefined, ...(quotedPriceMinor !== undefined ? { quotedPriceMinor } : {}) });
      setApplications((current) => current.map((application) => application.id === updated.id ? updated : application));
      setNote(updated.reviewNotes ?? "");
      const notification = updated.reviewNotificationStatus === "sent"
        ? t("platformConsole.applications.notificationSent")
        : updated.reviewNotificationStatus === "failed"
          ? t("platformConsole.applications.notificationFailed")
          : t("platformConsole.applications.notificationNotConfigured");
      setFeedback(decision === "under_review" ? t("platformConsole.applications.movedToReview") : decision === "approved"
        ? t("platformConsole.applications.approvalNotification", { notification })
        : t("platformConsole.applications.rejectionNotification", { notification }));
    } catch (cause) {
      const message = localizeApiError(cause, locale).message || t("platformConsole.applications.saveFailed");
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
      setFeedback(t("platformConsole.applications.workspaceCreatedForOwner", { gym: isolate(result.organizationName), email: isolate(result.ownerEmail) }));
    } catch (cause) {
      const message = localizeApiError(cause, locale).message || t("platformConsole.applications.provisioningFailed");
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
        setFeedback(t("platformConsole.applications.workspaceCreatedForOwner", { gym: isolate(authoritative.gymName), email: isolate(authoritative.email) }));
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
      setFeedback(updated.reviewNotes ? t("platformConsole.applications.reviewNoteSaved") : t("platformConsole.applications.reviewNoteCleared"));
    } catch (cause) {
      setError(localizeApiError(cause, locale).message || t("platformConsole.applications.noteSaveFailed"));
    } finally {
      setBusyNote(false);
    }
  };

  const busy = Boolean(busyDecision || busyNote || busyProvisioning);

  return (
    <PlatformPage className="flex flex-col gap-5 lg:h-[calc(100dvh-7rem)] lg:min-h-[600px]">
      <PageHeader
        title={t("platformConsole.applications.title")}
        description={t("platformConsole.applications.description")}
        actions={<Button variant="secondary" onClick={() => void loadApplications(true)} loading={refreshing} disabled={busy}><RefreshCcw />{" "}{t("common.action.refresh")}</Button>}
      />

      {error ? <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-[12.5px] text-danger" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</div> : null}
      {feedback ? <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-[12.5px] text-success-deep" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />{feedback}</div> : null}

      <div ref={panelRef} className="scroll-mt-20 lg:min-h-0 lg:flex-1">
        <PlatformPanel className="overflow-hidden lg:h-full">
          <div className="grid lg:h-full lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className={cn("min-h-0 flex-col border-line lg:border-e", requestedApplicationId ? "hidden lg:flex" : "flex")}>
              <div className="space-y-3 border-b border-line p-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                  <Input className="ps-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("platformConsole.applications.searchPlaceholder")} aria-label={t("platformConsole.applications.searchLabel")} disabled={busy || refreshing} />
                </label>
                <FilterPills label={t("platformConsole.applications.filterLabel")} value={filter} items={FILTERS.map((item) => ({ value: item.value, label: t(item.labelKey), count: counts[item.value] }))} onChange={changeFilter} disabled={busy || refreshing} />
              </div>
              <aside ref={listRef} className="min-h-0 flex-1 lg:overflow-y-auto" aria-label={t("platformConsole.applications.listLabel")}>
                {loading ? <LoadingState label={t("platformConsole.applications.loading")} /> : visibleApplications.length === 0 ? <div className="p-4"><StatePanel layout="section" title={t("platformConsole.applications.noApplications")} description={search || filter !== "all" ? t("platformConsole.applications.trySearchOrStatus") : t("platformConsole.applications.newApplications")} /></div> : (
                  <div className="divide-y divide-line">
                    {visibleApplications.map((application) => (
                      <button key={application.id} type="button" data-application-id={application.id} aria-pressed={selected?.id === application.id} disabled={busy || refreshing} onClick={() => openApplication(application.id)} className={cn("w-full px-4 py-3.5 text-start transition-colors hover:bg-sunken/60 disabled:cursor-not-allowed disabled:opacity-60", selected?.id === application.id && "bg-sunken")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><p dir="auto" className="truncate text-[13.5px] font-semibold">{application.gymName}</p><p dir="auto" className="mt-0.5 truncate text-[12.5px] text-ink-3">{application.ownerName} · {application.plan}</p></div>
                          <ApplicationStatusBadge status={application.status} className="shrink-0" />
                        </div>
                        <p className="mt-2 text-[12.5px] text-ink-3">{t("platformConsole.applications.submitted", { date: f.dateTime(application.submittedAt) })}</p>
                      </button>
                    ))}
                  </div>
                )}
              </aside>
            </div>

            <div className={cn("min-h-0 min-w-0", requestedApplicationId ? "block" : "hidden lg:block")}>
              {selected && !loading ? (
                <ApplicationDetail
                  application={selected}
                  allApplications={applications}
                  tab={activeTab}
                  onTabChange={(next) => { setChosenTab(next); setParams({ tab: next }); }}
                  onBack={() => setParams({ application: undefined })}
                  note={note}
                  setNote={setNote}
                  quote={quote}
                  setQuote={setQuote}
                  busyDecision={busyDecision}
                  busyNote={busyNote}
                  busyProvisioning={busyProvisioning}
                  refreshing={refreshing}
                  onReview={review}
                  onSaveNote={saveNote}
                  onProvision={() => void provision({ applicationId: selected.id })}
                  onRefresh={() => void loadApplications(true)}
                />
              ) : null}
            </div>
          </div>
        </PlatformPanel>
      </div>
    </PlatformPage>
  );
}

/**
 * One application, split into a few tabs so each part fits on screen
 * without scrolling: who applied, the decision, and (once approved) the
 * gym's workspace. Every tab stays mounted, only hidden.
 */
function ApplicationDetail({ application, allApplications, tab, onTabChange, onBack, note, setNote, quote, setQuote, busyDecision, busyNote, busyProvisioning, refreshing, onReview, onSaveNote, onProvision, onRefresh }: { application: PlatformGymApplication; allApplications: readonly PlatformGymApplication[]; tab: ApplicationTab; onTabChange: (tab: ApplicationTab) => void; onBack: () => void; note: string; setNote: (value: string) => void; quote: string; setQuote: (value: string) => void; busyDecision?: ReviewGymApplicationInput["decision"]; busyNote: boolean; busyProvisioning: boolean; refreshing: boolean; onReview: (decision: ReviewGymApplicationInput["decision"]) => Promise<void>; onSaveNote: () => Promise<void>; onProvision: () => void; onRefresh: () => void }) {
  const t = useT();
  const f = useFormat();
  const { isolate } = useLocale();
  // An approved application whose provisioning failed permanently and
  // created no workspace can still be rejected to clear the queue.
  const provisioningDeadEnd = application.status === "approved" && application.provisioningStatus === "failed" && !application.provisionedOrganizationId;
  const finalized = (application.status === "approved" && !provisioningDeadEnd) || application.status === "rejected";
  const noteDirty = note.trim() !== (application.reviewNotes ?? "");
  const tabs = tabsFor(application);
  const panelClass = "mt-0 min-h-0 flex-1 px-4 py-5 @container sm:px-5 lg:overflow-y-auto";
  const billing = application.billingInterval ? t(application.billingInterval === "annual" ? "platformConsole.applications.annualBilling" : "platformConsole.applications.monthlyBilling") : undefined;
  return (
    <article className="flex min-w-0 flex-col lg:h-full" aria-label={application.gymName}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <Button variant="ghost" size="sm" className="-ms-2 mb-2 lg:hidden" onClick={onBack}><ArrowLeft className="rtl:rotate-180" />{t("platformConsole.applications.backToList")}</Button>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 dir="auto" className="text-[20px] font-semibold leading-snug tracking-tight">{application.gymName}</h2>
          <ApplicationStatusBadge status={application.status} />
        </div>
        <p className="mt-1 text-[13px] text-ink-2">
          {[t("platformConsole.applications.applicationPlan", { plan: isolate(application.plan) }), billing, t("platformConsole.applications.submitted", { date: f.dateTime(application.submittedAt) }), t("platformConsole.applications.applicationReference", { id: application.id.slice(0, 8) })].filter(Boolean).join(" · ")}
        </p>
      </header>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as ApplicationTab)} className="mt-3 flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={t("platformConsole.applications.sections")} className="shrink-0 border-line px-2 sm:px-1">
          {tabs.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(TAB_KEYS[value])}
              {value === "workspace" && workspaceNeedsAction(application) ? <span className="size-1.5 rounded-full bg-signal" aria-hidden /> : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="applicant" forceMount hidden={tab !== "applicant"} className={panelClass}>
          <div className="max-w-3xl space-y-6">
            <dl className="grid gap-px overflow-hidden rounded-md border border-line bg-line @lg:grid-cols-2 @lg:[&>*:last-child:nth-child(odd)]:col-span-2">
              <Detail label={t("domain.role.owner")} value={application.ownerName} />
              <Detail label={t("platformConsole.applications.gymAddress")} value={application.gymAddress || t("platformConsole.applications.addressNotProvided")} />
              <Detail label={t("common.label.email")} value={application.email} ltr />
              <Detail label={t("platformConsole.applications.contactNumber")} value={application.contactNumber} ltr />
              <Detail label={t("platformConsole.applications.chosenPlan")} value={billing ? `${application.plan} · ${billing}` : application.plan} />
              {application.websiteRequested ? <Detail label={t("commerce.lines.website")} value={t("commerce.applications.website")} /> : null}
              {application.promoCode ? <Detail label={t("commerce.offer.promoLabel")} value={application.promoCode} ltr /> : null}
              {application.quotedPriceMinor ? <Detail label={t("platformConsole.applications.quotedPrice")} value={t("platformConsole.applications.quotedPriceValue", { amount: f.money(money(application.quotedPriceMinor, "JOD")) })} /> : null}
            </dl>
            <section aria-labelledby={`emails-${application.id}`}>
              <h3 id={`emails-${application.id}`} className="text-[13px] font-semibold text-ink-2">{t("platformConsole.applications.emailDelivery")}</h3>
              <dl className="mt-2 divide-y divide-line rounded-md border border-line">
                <DeliveryRow label={t("platformConsole.applications.receivedConfirmation")} status={application.notificationStatus} />
                <DeliveryRow label={t("platformConsole.applications.decisionEmail")} status={application.reviewNotificationStatus} />
              </dl>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="decision" forceMount hidden={tab !== "decision"} className={panelClass}>
          <div className="max-w-3xl space-y-6">
            <PlatformReviewBrief application={application} all={allApplications} />
            {finalized ? <div className={cn("flex items-start gap-3 rounded-md border p-4 text-[12.5px]", application.status === "approved" ? "border-success/30 bg-success-bg text-success-deep" : "border-danger/30 bg-danger-bg text-danger")}><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>{application.status === "approved" ? t("platformConsole.applications.applicationApproved") : t("platformConsole.applications.applicationRejected")}</strong><p className="mt-1 leading-relaxed opacity-90">{application.reviewedBy ? t("platformConsole.applications.decisionBy", { name: isolate(application.reviewedBy), date: f.dateTime(application.reviewedAt ?? application.updatedAt) }) : t("platformConsole.applications.decisionRecorded")} {application.reviewNotificationStatus === "sent" ? t("platformConsole.applications.ownerNotified") : application.reviewNotificationStatus === "failed" ? t("platformConsole.applications.decisionSavedEmailFailed") : t("platformConsole.applications.ownerEmailNotConfigured")} {application.status === "rejected" ? ` ${t("platformConsole.applications.rejectionFinal")}` : ""}</p></div></div> : null}
            <section>
              <Field label={t("platformConsole.applications.reviewNotes")} hint={t("platformConsole.applications.reviewNotesHint")}>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={Boolean(busyDecision) || busyNote} placeholder={t("platformConsole.applications.reviewNotesPlaceholder")} className="min-h-28" dir="auto" />
              </Field>
              <div className="mt-3 flex justify-end"><Button type="button" variant="secondary" size="sm" onClick={() => void onSaveNote()} loading={busyNote} disabled={!noteDirty || Boolean(busyDecision)}>{noteDirty ? t("memberProfile.note.save") : t("platformConsole.applications.saved")}</Button></div>
            </section>
            {!finalized ? (
              <section className="border-t border-line pt-5">
                {provisioningDeadEnd ? <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">{t("platformConsole.applications.failedProvisionCanOnlyReject")}</p> : null}
                {!provisioningDeadEnd && isQuotedPlan(application.plan) ? (
                  <Field label={t("platformConsole.applications.quoteLabel")} hint={t("platformConsole.applications.quoteHint")} required className="mb-4 max-w-sm">
                    <Input value={quote} onChange={(event) => setQuote(event.target.value)} inputMode="decimal" disabled={Boolean(busyDecision)} />
                  </Field>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {!provisioningDeadEnd ? <><Button onClick={() => void onReview("approved")} loading={busyDecision === "approved"} disabled={Boolean(busyDecision)}><Check />{t("platformConsole.applications.approve")}</Button><Button variant="secondary" onClick={() => void onReview("under_review")} loading={busyDecision === "under_review"} disabled={Boolean(busyDecision) || application.status === "under_review"}><Clock3 />{t("platformConsole.applications.markUnderReview")}</Button></> : null}
                  <Button variant="danger" onClick={() => void onReview("rejected")} loading={busyDecision === "rejected"} disabled={Boolean(busyDecision)}><X />{t("platformConsole.applications.reject")}</Button>
                </div>
                {!provisioningDeadEnd ? <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">{t("platformConsole.applications.provisioningExplainer")}</p> : null}
              </section>
            ) : null}
          </div>
        </TabsContent>

        {tabs.includes("workspace") ? (
          <TabsContent value="workspace" forceMount hidden={tab !== "workspace"} className={panelClass}>
            <div className="max-w-3xl space-y-4">
              <ProvisioningCard application={application} busy={busyProvisioning} refreshing={refreshing} onProvision={onProvision} onRefresh={onRefresh} />
              <p className="text-[12.5px] leading-relaxed text-ink-3">{t("platformConsole.applications.provisioningExplainer")}</p>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </article>
  );
}

function ProvisioningCard({ application, busy, refreshing, onProvision, onRefresh }: { application: PlatformGymApplication; busy: boolean; refreshing: boolean; onProvision: () => void; onRefresh: () => void }) {
  const t = useT();
  const { isolate } = useLocale();
  const status = application.provisioningStatus ?? "not_started";
  if (status === "completed") {
    return <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg p-4 text-[12.5px] text-success-deep"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>{t("platformConsole.applications.workspaceProvisioned")}</strong><p className="mt-1 leading-relaxed opacity-90">{t("platformConsole.applications.provisionedDescription")}</p></div></div>;
  }
  if (status === "failed") {
    const permanent = application.provisioningOutcome === "permanent";
    const partial = application.provisioningOutcome === "partial";
    return <div className="rounded-md border border-danger/30 bg-danger-bg p-4 text-[12.5px] text-danger" role="alert"><div className="flex items-start gap-3"><X className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>{permanent ? t("platformConsole.applications.manualCorrection") : partial ? t("platformConsole.applications.partialRetryable") : t("platformConsole.applications.provisioningAttention")}</strong><p className="mt-1 leading-relaxed opacity-90" dir="auto">{application.provisioningError ?? (permanent ? t("platformConsole.applications.correctConflict") : t("platformConsole.applications.workspaceIncomplete"))}</p></div></div>{permanent ? null : <Button className="mt-4" variant="danger" size="sm" onClick={onProvision} loading={busy}>{t("platformConsole.applications.retryProvisioning")}</Button>}</div>;
  }
  if (status === "in_progress") {
    return <div className="rounded-md border border-warning/30 bg-warning-bg p-4 text-[12.5px] text-warning-deep" role="status"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><strong>{t("platformConsole.applications.inProgress")}</strong><p className="mt-1 leading-relaxed opacity-90">{t("platformConsole.applications.inProgressDescription")}</p></div></div><Button className="mt-4" variant="secondary" size="sm" onClick={onRefresh} loading={refreshing} disabled={busy}><RefreshCcw /> {t("platformConsole.applications.refreshStatus")}</Button></div>;
  }
  return <div className="rounded-md border border-line bg-sunken/60 p-4 text-[12.5px] text-ink-2"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /><div><strong className="text-ink">{t("platformConsole.applications.provisioningReady")}</strong><p className="mt-1 leading-relaxed">{t("platformConsole.applications.provisioningReadyDescription", { plan: isolate(application.plan) })}</p></div></div><Button className="mt-4" variant="signal" size="sm" onClick={onProvision} loading={busy}><Check />{t("platformConsole.applications.provisionWorkspace")}</Button></div>;
}

function Detail({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="bg-surface px-4 py-3.5"><ContextLabel as="dt">{label}</ContextLabel><dd className="mt-1 break-words text-[13.5px] font-medium" dir={ltr ? "ltr" : "auto"}>{value}</dd></div>;
}

function DeliveryRow({ label, status }: { label: string; status: PlatformGymApplication["notificationStatus"] }) {
  return <div className="flex min-h-11 items-center justify-between gap-3 px-4 text-[13px]"><dt className="text-ink-2">{label}</dt><dd><NotificationStatusBadge status={status} /></dd></div>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="grid gap-3 p-5" aria-label={label} role="status">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-md border border-line bg-sunken" />)}</div>;
}
