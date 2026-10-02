"use client";
import { useT } from "@/lib/i18n/provider";

import { Archive, ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, MapPin, Receipt, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlatformGymLogo } from "@/components/platform/platform-gym-logo";
import { PlatformPage, PlatformPanel, PlatformPanelHeader, StaleNotice } from "@/components/platform/platform-page";
import { SubscriptionStatusBadge, subscriptionStatusLabel } from "@/components/platform/platform-status";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { qk } from "@/lib/api/keys";
import type { ArchivePlatformGymInput, BillingInterval, PlatformData, PlatformGymDetail, PlatformGymMember, PlatformGymStaff } from "@/lib/api/GymOSApi";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContextLabel, TechnicalLabel } from "@/components/ui/typography";
import { formatDate, formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

type GymArchiveApi = { archivePlatformGym?: (input: ArchivePlatformGymInput) => Promise<void> };

const GYM_TABS = [
  { value: "info", label: "Gym info" },
  { value: "members", label: "Members" },
  { value: "team", label: "Team" },
  { value: "settings", label: "Settings" },
] as const;
type GymTab = (typeof GYM_TABS)[number]["value"];

function isGymTab(value: string | null): value is GymTab {
  return GYM_TABS.some((tab) => tab.value === value);
}

/**
 * Informational gym record. Subscription work — plan, billing, reactivation,
 * suspension, cancellation — deliberately lives on the Billing page; this
 * page keeps the facts, the marketplace listing switch, and archiving.
 * Sections are tabs (Gym info, Members, Team, Settings), synced to `?tab=`.
 */
export default function GymAdminDetail({ gymId }: { gymId: string }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<GymTab>(isGymTab(requestedTab) ? requestedTab : "info");
  const detailQuery = useRealtimeApiQuery({ queryKey: qk.platformGymDetail(gymId), query: (api) => api.getPlatformGymDetail(gymId), subscribe: (api, onValue, onError) => api.subscribePlatformGymDetail(gymId, onValue, onError), enabled: Boolean(gymId) });
  const invalidate = useInvalidate();
  const detail = detailQuery.data;
  const organizationAvailable = detail?.organization.state === "available";
  const [isPublic, setIsPublic] = useState(false);
  const [listingReason, setListingReason] = useState("");
  const [publishPageOpen, setPublishPageOpen] = useState(false);
  const [publishPageReason, setPublishPageReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string>();

  useEffect(() => {
    if (!detail) return;
    setIsPublic(detail.organization.state === "available" && normalizePublicListing(detail.controls.isPublic, detail.controls.status));
  }, [detail]);

  const listingDirty = detail && organizationAvailable ? isPublic !== detail.controls.isPublic : false;

  const saveListing = useApiMutation((api) => {
    if (!organizationAvailable) throw new Error("The public listing is unavailable until this gym is provisioned.");
    return api.updatePlatformGym({ gymId, isPublic: normalizePublicListing(isPublic, detail?.controls.status), reason: listingReason.trim() });
  }, {
    onSuccess: async () => {
      await invalidate([qk.platformGymDetail(gymId)]);
      setListingReason("");
      toast.success("Public listing saved and audited.");
    },
  });

  const publishPage = useApiMutation((api) => api.publishPlatformGymProfile({ gymId, reason: publishPageReason.trim() }), {
    onSuccess: async () => {
      await invalidate([qk.platformGymDetail(gymId)]);
      setPublishPageOpen(false);
      setPublishPageReason("");
    },
    successMessage: "Draft reviewed and published. The public page is live.",
  });

  const archive = useApiMutation<void, ArchivePlatformGymInput>((api, input) => {
    const archivePlatformGym = (api as typeof api & GymArchiveApi).archivePlatformGym;
    if (!archivePlatformGym) throw new Error("Gym archiving is not available in this deployment yet.");
    return archivePlatformGym.call(api, input);
  }, {
    onSuccess: async () => {
      await invalidate([qk.platformGymDetail(gymId)]);
      toast.success("Gym archived. Access and public discovery were removed; history was retained.");
      setDeleteOpen(false);
      router.push("/platform/gyms");
    },
    onError: (error) => setDeleteError(error.message || "The gym could not be archived. No changes were made."),
  });

  if (detailQuery.isLoading || !detail) {
    if (detailQuery.isError) {
      return <PlatformPage><QueryErrorState error={detailQuery.error} notFoundTitle="Gym not found" forbiddenDescription="Your platform role cannot view this gym." onRetry={() => detailQuery.refetch()} /></PlatformPage>;
    }
    return (
      <PlatformPage>
        <div className="space-y-5" role="status" aria-label="Loading gym detail">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
        </div>
      </PlatformPage>
    );
  }

  const publicListingAllowed = Boolean(organizationAvailable) && isPublicSubscriptionStatus(detail.controls.status);
  const marketplaceProfileAvailable = organizationAvailable && isPublicSubscriptionStatus(detail.controls.status) && detail.controls.isPublic;
  const publicPage = detail.publicPage.state === "available" ? detail.publicPage.value : undefined;
  const draftAwaitingReview = Boolean(publicPage && publicPage.draftStatus === "draft" && (publicPage.draftVersion ?? 0) > publicPage.publishedVersion);
  const stale = detailQuery.isBackgroundError || detailQuery.streamState === "fallback";

  return (
    <PlatformPage>
      <Link href="/platform/gyms" className="inline-flex min-h-8 items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />All gyms</Link>

      {stale ? <div className="mt-4"><StaleNotice onRetry={() => detailQuery.refetch()}>Showing the last known gym record while the live connection recovers.</StaleNotice></div> : null}

      <PlatformPanel className="mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <PlatformGymLogo name={detail.name} shortName={detail.shortName} accent={detail.accent} logoUrl={detail.logoUrl?.state === "available" ? detail.logoUrl.value : undefined} className="size-14 rounded-md text-[12px]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">{detail.name}</h1>
                <SubscriptionStatusBadge status={detail.controls.status} />
              </div>
              <p className="mt-1 text-[13px] text-ink-2">
                {detail.controls.plan}
                {detail.subscription.billingInterval?.state === "available" ? ` · ${billingIntervalLabel(detail.subscription.billingInterval.value)}` : ""}
                {detail.subscription.currentPeriodEndsAt.state === "available" ? ` · paid through ${formatDate(detail.subscription.currentPeriodEndsAt.value)}` : ""}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{detail.joinedAt.state === "available" ? `Customer since ${formatDate(detail.joinedAt.value)}` : "Start date not recorded"}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {marketplaceProfileAvailable ? <Button asChild variant="secondary"><Link href={`/customer/gyms/${detail.id}`}>Public page <ExternalLink /></Link></Button> : <Button variant="secondary" disabled title="Hidden from public discovery">Public page <ExternalLink /></Button>}
            {organizationAvailable
              ? <Button asChild><Link href={`/platform/billing?bill=${detail.id}`}><Receipt />Manage subscription</Link></Button>
              : <Button disabled title="Unavailable until this gym is provisioned"><Receipt />Manage subscription</Button>}
          </div>
        </div>
      </PlatformPanel>

      {!organizationAvailable ? <div className="mt-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[12.5px] text-warning-deep" role="status"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Cleanup-only record: no provisioned organization is linked. Resolve it through the applications workflow.</p></div> : null}

      <Tabs className="mt-5 min-w-0" value={activeTab} onValueChange={(tab) => {
        if (!isGymTab(tab)) return;
        setActiveTab(tab);
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "info") params.delete("tab");
        else params.set("tab", tab);
        const query = params.toString();
        router.replace(query ? `/platform/gyms/${gymId}?${query}` : `/platform/gyms/${gymId}`, { scroll: false });
      }}>
        <TabsList aria-label="Gym sections">
          {GYM_TABS.map((tab) => {
            const count = tab.value === "members" ? countOf(detail.members) : tab.value === "team" ? countOf(detail.staff) : undefined;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {count !== undefined ? <span className="tabular text-[12px] font-medium text-ink-3">{count.toLocaleString()}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="info" className="mt-5 grid gap-5">
          <PlatformPanel className="overflow-hidden" aria-label="Usage">
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
              <Usage label={t("members.list.activeMembers")} field={detail.usage.memberCount} />
              <Usage label="Active staff" field={detail.usage.activeStaffCount} />
              <Usage label="Staff plan limit" field={detail.usage.staffLimit} />
              <Usage label="Automation rules" field={detail.usage.automationRuleCount} />
              <Usage label="Payment records" field={detail.usage.paymentTransactionCount} />
              <Usage label="Storage" field={detail.usage.storage} />
            </dl>
          </PlatformPanel>

          <div className="grid gap-5 lg:grid-cols-2">
            <PlatformPanel aria-labelledby="owner-title">
              <PlatformPanelHeader id="owner-title" title="Account owner" />
              <div className="px-4 pt-4 sm:px-5">
                {detail.owner.state === "available"
                  ? <h3 className="text-[15px] font-semibold">{detail.owner.value.name}</h3>
                  : <p className="text-[13px]"><UnavailableValue state={detail.owner.state} /></p>}
              </div>
              <dl className="divide-y divide-line px-4 pb-1.5 sm:px-5">
                <FactRow label={t("common.label.email")}>{detail.owner.state === "available" ? <span dir="ltr">{detail.owner.value.email}</span> : <span className="text-ink-3">Not available</span>}</FactRow>
                <FactRow label={t("common.label.phone")}>{detail.owner.state === "available" && detail.owner.value.phone ? <span dir="ltr">{detail.owner.value.phone}</span> : <span className="text-ink-3">Not available</span>}</FactRow>
                <FactRow label="Subscription agreement">
                  {detail.agreement.state === "available" ? <Link href={`/platform/agreements?agreement=${detail.agreement.value.id}`} className="text-ink underline-offset-4 hover:underline" data-testid="gym-agreement-link"><span className="font-mono text-[12px]">{detail.agreement.value.reference}</span> · {detail.agreement.value.status === "countersigned" ? "countersigned" : "awaiting RIVET"}</Link> : detail.agreement.state === "not_configured" ? <span className="text-warning-deep">Not signed yet</span> : <span className="text-ink-3">Not available</span>}
                </FactRow>
              </dl>
            </PlatformPanel>

            <PlatformPanel aria-labelledby="branches-title">
              <PlatformPanelHeader id="branches-title" title="Branches" />
              {detail.branches.state === "available" && detail.branches.value.length > 0 ? (
                <ul className="divide-y divide-line">
                  {detail.branches.value.map((branch) => (
                    <li key={branch.id} className="flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold">{branch.name}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3"><MapPin className="size-3.5 shrink-0" aria-hidden />{branch.address || "Address not available"}</p>
                        <p className="mt-0.5 text-[12.5px] text-ink-3">Code <span className="font-mono text-[12px]">{branch.code}</span></p>
                      </div>
                      <DirectoryStatus status={branch.status} />
                    </li>
                  ))}
                </ul>
              ) : <UnavailableBlock field={detail.branches} empty="No branches recorded" />}
            </PlatformPanel>
          </div>

          <PlatformPanel className="overflow-hidden" aria-labelledby="subscription-facts-title">
            <PlatformPanelHeader id="subscription-facts-title" title="Subscription facts" actions={<Link href={`/platform/billing?bill=${detail.id}`} className="text-[12.5px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">Manage in Billing</Link>} />
            <dl className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
              <Fact label={t("renewFlow.adjust.planChange.rowPlan")}><FieldValue field={detail.subscription.plan} /></Fact>
              <Fact label={t("common.label.status")}><FieldValue field={detail.subscription.status} render={subscriptionStatusLabel} /></Fact>
              <Fact label="Billing cadence"><FieldValue field={detail.subscription.billingInterval ?? { state: "not_configured" }} render={billingIntervalLabel} /></Fact>
              <Fact label="Recurring amount"><FieldValue field={detail.subscription.recurringAmount} render={(value) => formatMoney(value)} /></Fact>
              <Fact label="Started"><FieldValue field={detail.subscription.startedAt} render={(value) => formatDateTime(value)} /></Fact>
              <Fact label="Trial ends"><FieldValue field={detail.subscription.trialEndsAt} render={(value) => formatDateTime(value)} /></Fact>
              <Fact label="Period ends"><FieldValue field={detail.subscription.currentPeriodEndsAt} render={(value) => formatDateTime(value)} /></Fact>
              <Fact label={t("memberProfile.followUp.evidenceKind.renewal")}><FieldValue field={detail.subscription.renewalDate} render={displayDateOrText} /></Fact>
              <Fact label={t("renewFlow.adjust.membershipStatus.cancelled")}><FieldValue field={detail.subscription.cancelledAt} render={(value) => formatDateTime(value)} /></Fact>
              <Fact label={t("renewFlow.shared.paymentMethodAria")}><FieldValue field={detail.subscription.paymentMethod} /></Fact>
              <Fact label="Invoices"><FieldValue field={detail.subscription.invoices} render={(value) => `${value.length} recorded`} /></Fact>
              <Fact label="Last change reason"><FieldValue field={detail.subscription.statusReason} /></Fact>
            </dl>
          </PlatformPanel>
        </TabsContent>

        <TabsContent value="members" className="mt-5">
          <MemberDirectory field={detail.members} />
        </TabsContent>

        <TabsContent value="team" className="mt-5">
          <StaffDirectory field={detail.staff} />
        </TabsContent>

        <TabsContent value="settings" className="mt-5 grid gap-5">
          <PlatformPanel aria-labelledby="public-presence-title">
            <PlatformPanelHeader id="public-presence-title" title="Public presence" description="What members can see of this gym on RIVET." />
            <div className="divide-y divide-line">
              <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13.5px] font-semibold">Public page</h3>
                  <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">
                    {publicPage
                      ? publicPage.publishedVersion > 0
                        ? <>Live at v{publicPage.publishedVersion}{t("members.bulk.toast.end")}{draftAwaitingReview ? <> Draft v{publicPage.draftVersion} saved {publicPage.draftUpdatedAt ? formatDateTime(publicPage.draftUpdatedAt) : "by the gym"} — awaiting your review.</> : " No draft awaiting review."}</>
                        : draftAwaitingReview
                          ? <>Never published. Draft v{publicPage.draftVersion} is waiting — the gym&rsquo;s first publish is self-serve, but you can publish it for them.</>
                          : "Never published, and the gym has not saved a draft."
                      : "Unavailable until this gym is provisioned."}
                  </p>
                </div>
                {draftAwaitingReview ? <Button onClick={() => { setPublishPageReason(""); setPublishPageOpen(true); }}><Check />Publish draft v{publicPage?.draftVersion}</Button> : null}
              </div>

              <div className="px-4 py-4 sm:px-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13.5px] font-semibold">Public directory listing</h3>
                    <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">{publicListingAllowed ? "Let members discover this gym and request a free trial." : organizationAvailable ? "Suppressed while the subscription is not active. Reactivate from Billing first." : "Suppressed: this row is not provisioned."}</p>
                  </div>
                  <Switch checked={publicListingAllowed && isPublic} onCheckedChange={setIsPublic} disabled={!organizationAvailable || !publicListingAllowed} aria-label="Public directory listing" />
                </div>
                {listingDirty ? (
                  <div className="mt-4 grid gap-3 border-t border-line pt-4">
                    <Field label="Reason for this change"><Textarea value={listingReason} onChange={(event) => setListingReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></Field>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => { setIsPublic(detail.organization.state === "available" && detail.controls.isPublic); setListingReason(""); }}>{t("common.action.cancel")}</Button>
                      <Button size="sm" loading={saveListing.isPending} disabled={!listingReason.trim()} onClick={() => saveListing.mutate()}><Check />Save listing</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </PlatformPanel>

          <PlatformPanel aria-labelledby="timeline-title">
            <PlatformPanelHeader id="timeline-title" title="Platform timeline" description="Operator actions on this gym, from the immutable platform audit." />
            {detail.activity.state === "available" && detail.activity.value.length > 0 ? (
              <div className="divide-y divide-line">
                {detail.activity.value.map((event) => (
                  <div key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4 sm:px-5">
                    <span className="text-[12.5px] text-ink-3">{formatDateTime(event.occurredAt)}</span>
                    <div className="min-w-0"><p className="text-[13.5px] font-medium">{event.summary}</p><p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3"><TechnicalLabel as="span">{event.action}</TechnicalLabel><span>{event.actorName}</span></p></div>
                  </div>
                ))}
              </div>
            ) : <UnavailableBlock field={detail.activity} empty="No platform activity recorded" />}
          </PlatformPanel>

          <PlatformPanel className="flex flex-wrap items-center justify-between gap-4 border-danger/25 px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Remove gym access</h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">Archiving removes access and public discovery. All records and history are kept, and the change is audited.</p>
            </div>
            <Button variant="danger" onClick={() => { setDeleteError(undefined); setDeleteConfirmation(""); setDeleteReason(""); setDeleteOpen(true); }}><Archive />Archive gym</Button>
          </PlatformPanel>
        </TabsContent>
      </Tabs>

      <Dialog open={publishPageOpen} onOpenChange={(open) => { if (!publishPage.isPending) setPublishPageOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish {detail.name}&rsquo;s draft v{publicPage?.draftVersion}?</DialogTitle>
            <DialogDescription>The saved draft replaces the live public page immediately. Review it in the gym&rsquo;s support ticket or preview before publishing.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Reason for this change" htmlFor="publish-page-reason"><Textarea id="publish-page-reason" value={publishPageReason} onChange={(event) => setPublishPageReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPublishPageOpen(false)} disabled={publishPage.isPending}>{t("common.action.cancel")}</Button>
            <Button loading={publishPage.isPending} disabled={!publishPageReason.trim()} onClick={() => publishPage.mutate()}><Check />Publish draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!archive.isPending) setDeleteOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {detail.name}?</DialogTitle>
            <DialogDescription>This removes the gym from active RIVET workspaces and public discovery. Financial, subscription, and audit history are retained for compliance and future review.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="Type the gym name to confirm" htmlFor="delete-gym-confirmation"><Input id="delete-gym-confirmation" value={deleteConfirmation} onChange={(event) => { setDeleteConfirmation(event.target.value); setDeleteError(undefined); }} placeholder={detail.name} autoComplete="off" /></Field>
            <Field label={t("members.bulk.archiveReason")} htmlFor="delete-gym-reason"><Textarea id="delete-gym-reason" value={deleteReason} onChange={(event) => { setDeleteReason(event.target.value); setDeleteError(undefined); }} placeholder="Required for the platform audit trail" /></Field>
            {deleteConfirmation.length > 0 && deleteConfirmation !== detail.name ? <p className="text-[12.5px] text-danger" role="alert">The confirmation must match “{detail.name}” exactly.</p> : null}
            {deleteError ? <p className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{deleteError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={archive.isPending}>{t("common.action.cancel")}</Button>
            <Button variant="danger" loading={archive.isPending} disabled={deleteConfirmation !== detail.name || !deleteReason.trim()} onClick={() => archive.mutate({ gymId, confirmation: deleteConfirmation, reason: deleteReason.trim() })}><Archive />Archive gym</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformPage>
  );
}

function FieldValue<T>({ field, render }: { field: PlatformData<T>; render?: (value: T) => React.ReactNode }) {
  return field.state === "available" ? <>{render ? render(field.value) : String(field.value)}</> : <UnavailableValue state={field.state} />;
}

function UnavailableValue({ state, className }: { state: "not_available" | "not_configured"; className?: string }) {
  return <span className={className ?? "text-ink-3"}>{state === "not_configured" ? "Not configured" : "Not available"}</span>;
}

function UnavailableBlock<T>({ field, empty }: { field: PlatformData<T>; empty: string }) {
  return <div className="px-5 py-8 text-center text-[12.5px] text-ink-3">{field.state === "available" ? empty : <UnavailableValue state={field.state} />}</div>;
}

/** A stored renewal value may be a timestamp or plain text; only real dates are reformatted. */
function displayDateOrText(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && /\d{4}-\d{2}-\d{2}/.test(value) ? formatDateTime(value) : value;
}

function isPublicSubscriptionStatus(status: PlatformGymDetail["controls"]["status"] | undefined): boolean {
  return status === "active" || status === "trial";
}

function normalizePublicListing(isPublic: boolean, status: PlatformGymDetail["controls"]["status"] | undefined): boolean {
  return isPublic && isPublicSubscriptionStatus(status);
}

function billingIntervalLabel(value: BillingInterval): string {
  return value === "annual" ? "Annual · saves 20%" : "Monthly";
}

function Usage({ label, field }: { label: string; field: PlatformData<number | string> }) {
  return <div className="bg-surface px-4 py-3.5 sm:px-5"><ContextLabel as="dt">{label}</ContextLabel><dd className="mt-1.5 text-[18px] font-semibold leading-6 tabular"><FieldValue field={field} render={(value) => typeof value === "number" ? value.toLocaleString() : value} /></dd></div>;
}

/** Label-over-value cell for the subscription grid; every cell lines up on the same baseline. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="bg-surface px-4 py-3.5 sm:px-5"><ContextLabel as="dt">{label}</ContextLabel><dd className="mt-1 truncate text-[13.5px] font-medium">{children}</dd></div>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-2.5 text-[13px]"><dt className="shrink-0 text-ink-3">{label}</dt><dd className="min-w-0 truncate text-end font-medium">{children}</dd></div>;
}

function countOf<T>(field: PlatformData<T[]>): number | undefined {
  return field.state === "available" ? field.value.length : undefined;
}

const DIRECTORY_PAGE_SIZE = 20;

function StaffDirectory({ field }: { field: PlatformData<PlatformGymStaff[]> }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const rows = field.state === "available" ? field.value : [];
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter((staff) => [staff.name, staff.email, staff.role, staff.status, staff.branchNames.join(" "), staff.invitationStatus ?? ""].join(" ").toLocaleLowerCase().includes(needle));
  }, [field, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * DIRECTORY_PAGE_SIZE, safePage * DIRECTORY_PAGE_SIZE);

  return (
    <PlatformPanel aria-labelledby="team-directory-title">
      <PlatformPanelHeader id="team-directory-title" title="Team directory" description="Every staff account, role, and branch scope for this gym." />
      {field.state === "available" ? (
        <>
          <DirectorySearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} label="Search team" placeholder="Search staff, role, or branch" />
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-4 sm:ps-5">{t("common.label.name")}</TableHead>
                  <TableHead>{t("common.label.role")}</TableHead>
                  <TableHead className="hidden md:table-cell">Branches</TableHead>
                  <TableHead className="pe-4 text-end sm:pe-5">{t("common.label.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="ps-4 sm:ps-5"><p className="font-semibold">{staff.name}</p><p className="mt-0.5 text-[12.5px] text-ink-3" dir="ltr">{staff.email}</p></TableCell>
                    <TableCell className="whitespace-nowrap text-ink-2">{labelize(staff.role)}</TableCell>
                    <TableCell className="hidden text-ink-2 md:table-cell">{staff.branchScope === "all" ? t("common.label.allBranches") : staff.branchNames.length > 0 ? staff.branchNames.join(", ") : "No active branch"}</TableCell>
                    <TableCell className="pe-4 text-end sm:pe-5"><DirectoryStatus status={staff.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyDirectory text={search ? "No team members match this search." : "No staff accounts recorded."} />}
          <DirectoryPager page={safePage} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
        </>
      ) : <UnavailableBlock field={field} empty="No staff accounts recorded" />}
    </PlatformPanel>
  );
}

function MemberDirectory({ field }: { field: PlatformData<PlatformGymMember[]> }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const rows = field.state === "available" ? field.value : [];
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter((member) => [member.name, member.memberNumber, member.status, member.membershipStatus ?? "", member.planName ?? "", member.branchName ?? ""].join(" ").toLocaleLowerCase().includes(needle));
  }, [field, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * DIRECTORY_PAGE_SIZE, safePage * DIRECTORY_PAGE_SIZE);

  return (
    <PlatformPanel aria-labelledby="member-directory-title">
      <PlatformPanelHeader id="member-directory-title" title="Member directory" description="Every current member record, with status and membership context." />
      {field.state === "available" ? (
        <>
          <DirectorySearch value={search} onChange={(value) => { setSearch(value); setPage(1); }} label={t("members.list.searchLabel")} placeholder="Search by name, number, plan, or branch" />
          {filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-4 sm:ps-5">{t("palette.kind.member")}</TableHead>
                  <TableHead className="hidden sm:table-cell">Number</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("common.label.branch")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("renewFlow.adjust.planChange.rowPlan")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("memberProfile.followUp.membershipFallback")}</TableHead>
                  <TableHead className="pe-4 text-end sm:pe-5">{t("common.label.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="ps-4 font-semibold sm:ps-5">{member.name}</TableCell>
                    <TableCell className="hidden whitespace-nowrap font-mono text-[12px] text-ink-2 sm:table-cell">{member.memberNumber}</TableCell>
                    <TableCell className="hidden text-ink-2 lg:table-cell">{member.branchName || <span className="text-ink-3">Not recorded</span>}</TableCell>
                    <TableCell className="hidden text-ink-2 md:table-cell">{member.planName || <span className="text-ink-3">No plan</span>}</TableCell>
                    <TableCell className="hidden text-ink-2 md:table-cell">{member.membershipStatus ? <>{labelize(member.membershipStatus)}{member.membershipEndDate ? <span className="text-ink-3"> · through {formatDate(member.membershipEndDate)}</span> : null}</> : <span className="text-ink-3">None</span>}</TableCell>
                    <TableCell className="pe-4 text-end sm:pe-5"><DirectoryStatus status={member.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyDirectory text={search ? "No members match this search." : "No member records recorded."} />}
          <DirectoryPager page={safePage} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
        </>
      ) : <UnavailableBlock field={field} empty="No member records recorded" />}
    </PlatformPanel>
  );
}

function DirectorySearch({ value, onChange, label, placeholder }: { value: string; onChange: (value: string) => void; label: string; placeholder: string }) {
  return <div className="border-b border-line px-4 py-3 sm:px-5"><label className="sr-only" htmlFor={`${label.replaceAll(" ", "-")}-input`}>{label}</label><div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input id={`${label.replaceAll(" ", "-")}-input`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="ps-8" /></div></div>;
}

function DirectoryPager({ page, totalPages, totalItems, onPageChange }: { page: number; totalPages: number; totalItems: number; onPageChange: (page: number) => void }) {
  const t = useT();
  if (totalItems === 0) return null;
  const first = (page - 1) * DIRECTORY_PAGE_SIZE + 1;
  const last = Math.min(page * DIRECTORY_PAGE_SIZE, totalItems);
  return <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12px] text-ink-3 sm:px-5"><span>Showing {first}–{last} of {totalItems}</span><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.pagination.previous")} disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="rtl:rotate-180" aria-hidden /></Button><span className="min-w-12 text-center tabular">{page} / {totalPages}</span><Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.pagination.next")} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight className="rtl:rotate-180" aria-hidden /></Button></div></div>;
}

function DirectoryStatus({ status }: { status: string }) {
  const tone = status === "active" ? "border-success/30 bg-success-bg text-success-deep" : status === "invited" ? "border-warning/30 bg-warning-bg text-warning-deep" : "border-line-2 bg-sunken text-ink-3";
  return <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{labelize(status)}</span>;
}

function EmptyDirectory({ text }: { text: string }) {
  return <div className="px-5 py-8 text-center text-[12.5px] text-ink-3">{text}</div>;
}

function labelize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
