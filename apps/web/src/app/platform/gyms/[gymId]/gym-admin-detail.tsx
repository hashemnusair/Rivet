"use client";

import { Archive, ArrowLeft, Building2, CalendarClock, Check, CircleAlert, CreditCard, ExternalLink, Mail, MapPin, Phone, Receipt, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlatformGymLogo } from "@/components/platform/platform-gym-logo";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { qk } from "@/lib/api/keys";
import type { ArchivePlatformGymInput, BillingInterval, PlatformData, PlatformGymDetail } from "@/lib/api/GymOSApi";
import { Switch } from "@/components/ui/switch";
import { Input, Textarea } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

type GymArchiveApi = { archivePlatformGym?: (input: ArchivePlatformGymInput) => Promise<void> };

/**
 * Informational gym record. Subscription work — plan, billing, reactivation,
 * suspension, cancellation — deliberately lives on the Billing page; this
 * page keeps the facts, the marketplace listing switch, and archiving.
 */
export default function GymAdminDetail({ gymId }: { gymId: string }) {
  const router = useRouter();
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
      return <div className="p-10"><QueryErrorState error={detailQuery.error} notFoundTitle="Gym not found" forbiddenDescription="Your platform role cannot view this gym." onRetry={() => detailQuery.refetch()} /></div>;
    }
    return <div className="space-y-5 p-6 sm:p-8" role="status" aria-label="Loading gym detail"><Skeleton className="h-4 w-24" /><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div></div>;
  }

  const publicListingAllowed = Boolean(organizationAvailable) && isPublicSubscriptionStatus(detail.controls.status);
  const marketplaceProfileAvailable = organizationAvailable && isPublicSubscriptionStatus(detail.controls.status) && detail.controls.isPublic;
  const publicPage = detail.publicPage.state === "available" ? detail.publicPage.value : undefined;
  const draftAwaitingReview = Boolean(publicPage && publicPage.draftStatus === "draft" && (publicPage.draftVersion ?? 0) > publicPage.publishedVersion);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <Link href="/platform/gyms" className="inline-flex items-center gap-2 text-[11.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5 rtl:rotate-180" />All gyms</Link>

        {detailQuery.isBackgroundError || detailQuery.streamState === "fallback" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-bg px-4 py-3 text-[11.5px] text-warning-deep" role="status" aria-live="polite">
            <span>Showing the last known gym record while the live connection recovers.</span>
            <Button variant="secondary" size="sm" onClick={() => detailQuery.refetch()}>Retry</Button>
          </div>
        ) : null}

        <section className="mt-6 border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-5">
              <PlatformGymLogo name={detail.name} shortName={detail.shortName} accent={detail.accent} logoUrl={detail.logoUrl?.state === "available" ? detail.logoUrl.value : undefined} className="size-16 text-[12px]" />
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[26px] font-semibold tracking-tight">{detail.name}</h1>
                  <HeroStatus status={detail.controls.status} />
                </div>
                <p className="mt-1.5 text-[12px] text-ink-2">
                  {detail.controls.plan}
                  {detail.subscription.billingInterval?.state === "available" ? ` · ${detail.subscription.billingInterval.value}` : ""}
                  {detail.subscription.currentPeriodEndsAt.state === "available" ? ` · paid through ${formatDateTime(detail.subscription.currentPeriodEndsAt.value).split(",")[0]}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">Customer since <FieldValue field={detail.joinedAt} render={(value) => value.slice(0, 10)} /></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {marketplaceProfileAvailable ? <Button asChild variant="secondary"><Link href={`/customer/gyms/${detail.id}`}>Public page <ExternalLink /></Link></Button> : <Button variant="secondary" disabled title="Hidden from public discovery">Public page <ExternalLink /></Button>}
              {organizationAvailable
                ? <Button asChild variant="signal"><Link href={`/platform/billing?bill=${detail.id}`}><Receipt />Manage subscription</Link></Button>
                : <Button variant="signal" disabled title="Unavailable until this gym is provisioned"><Receipt />Manage subscription</Button>}
            </div>
          </div>
        </section>

        {!organizationAvailable ? <div className="mt-5 flex items-start gap-3 border border-warning/30 bg-warning-bg px-4 py-3 text-[11.5px] text-warning-deep" role="status"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Cleanup-only record: no provisioned organization is linked. Resolve it through the applications workflow.</p></div> : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
          <section className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><p className="context-label">Organization</p><h2 className="mt-1 text-[17px] font-semibold">Branches and usage</h2></div>
            <div className="divide-y divide-line">
              {detail.branches.state === "available" && detail.branches.value.length > 0 ? detail.branches.value.map((branch) => (
                <div key={branch.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div><p className="text-[13px] font-semibold">{branch.name}</p><p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3"><MapPin className="size-3" />{branch.address || "Not available"}</p><p className="mt-1 text-[12px] text-ink-3">Code {branch.code} · {branch.status}</p></div>
                  <p className="text-[11px] text-ink-3">Branch actions are not configured</p>
                </div>
              )) : <UnavailableBlock field={detail.branches} empty="No branches recorded" />}
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
              <Usage icon={<Users />} label="Active staff" field={detail.usage.activeStaffCount} />
              <Usage icon={<Users />} label="Staff plan limit" field={detail.usage.staffLimit} />
              <Usage icon={<Building2 />} label="Storage" field={detail.usage.storage} />
              <Usage icon={<CalendarClock />} label="Automation rules" field={detail.usage.automationRuleCount} />
              <Usage icon={<CreditCard />} label="Payment records" field={detail.usage.paymentTransactionCount} />
            </div>
          </section>

          <div className="grid gap-5">
            <section className="border border-line bg-surface p-5">
              <p className="context-label">Account owner</p>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-[12px]">
                <span className="text-ink-3">Subscription agreement</span>
                {detail.agreement.state === "available" ? <Link href={`/platform/agreements?agreement=${detail.agreement.value.id}`} className="font-medium text-ink underline-offset-2 hover:underline" data-testid="gym-agreement-link">{detail.agreement.value.reference} · {detail.agreement.value.status === "countersigned" ? "countersigned" : "awaiting RIVET"}</Link> : detail.agreement.state === "not_configured" ? <span className="text-warning-deep">Not signed yet</span> : <span className="text-ink-3">Not available</span>}
              </div>
              {detail.owner.state === "available" ? <><h2 className="mt-2 text-[17px] font-semibold">{detail.owner.value.name}</h2><div className="mt-5 grid gap-3 text-[11.5px] text-ink-2"><p className="flex items-center gap-2"><Mail className="size-3.5 text-ink-3" />{detail.owner.value.email}</p><p className="flex items-center gap-2"><Phone className="size-3.5 text-ink-3" />{detail.owner.value.phone || "Not available"}</p></div></> : <UnavailableValue state={detail.owner.state} className="mt-3" />}
            </section>
            <section className="night-surface bg-night p-5 text-night-ink">
              <div className="flex items-baseline justify-between gap-3">
                <p className="context-label">Subscription facts</p>
                <Link href={`/platform/billing?bill=${detail.id}`} className="text-[12px] text-night-ink-3 underline-offset-2 hover:text-night-ink hover:underline">Manage in Billing</Link>
              </div>
              <dl className="mt-5 grid gap-3 text-[12px]">
                <FactRow label="Plan"><FieldValue field={detail.subscription.plan} /></FactRow>
                <FactRow label="Billing cadence"><FieldValue field={detail.subscription.billingInterval ?? { state: "not_configured" }} render={billingIntervalLabel} /></FactRow>
                <FactRow label="Status"><FieldValue field={detail.subscription.status} render={statusLabel} /></FactRow>
                <FactRow label="Started"><FieldValue field={detail.subscription.startedAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Trial ends"><FieldValue field={detail.subscription.trialEndsAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Period ends"><FieldValue field={detail.subscription.currentPeriodEndsAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Cancelled"><FieldValue field={detail.subscription.cancelledAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Last change reason"><FieldValue field={detail.subscription.statusReason} /></FactRow>
                <FactRow label="Recurring amount"><FieldValue field={detail.subscription.recurringAmount} render={(value) => formatMoney(value)} /></FactRow>
                <FactRow label="Renewal"><FieldValue field={detail.subscription.renewalDate} /></FactRow>
                <FactRow label="Payment method"><FieldValue field={detail.subscription.paymentMethod} /></FactRow>
                <FactRow label="Invoices"><FieldValue field={detail.subscription.invoices} render={(value) => `${value.length} recorded`} /></FactRow>
              </dl>
            </section>
          </div>
        </div>

        <section className="mt-5 border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="context-label">Marketplace</p>
              <h2 className="mt-1 text-[16px] font-semibold">Public page</h2>
              <p className="mt-1 text-[11px] text-ink-2">
                {publicPage
                  ? publicPage.publishedVersion > 0
                    ? <>Live at v{publicPage.publishedVersion}.{draftAwaitingReview ? <> Draft v{publicPage.draftVersion} saved {publicPage.draftUpdatedAt ? formatDateTime(publicPage.draftUpdatedAt) : "by the gym"} — awaiting your review.</> : " No draft awaiting review."}</>
                    : draftAwaitingReview
                      ? <>Never published. Draft v{publicPage.draftVersion} is waiting — the gym&rsquo;s first publish is self-serve, but you can publish it for them.</>
                      : "Never published, and the gym has not saved a draft."
                  : "Unavailable until this gym is provisioned."}
              </p>
            </div>
            {draftAwaitingReview ? <Button variant="signal" onClick={() => { setPublishPageReason(""); setPublishPageOpen(true); }}><Check />Publish draft v{publicPage?.draftVersion}</Button> : null}
          </div>
        </section>

        <Dialog open={publishPageOpen} onOpenChange={(open) => { if (!publishPage.isPending) setPublishPageOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish {detail.name}&rsquo;s draft v{publicPage?.draftVersion}?</DialogTitle>
              <DialogDescription>The saved draft replaces the live public page immediately. Review it in the gym&rsquo;s support ticket or preview before publishing.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="publish-page-reason">Reason for this change<Textarea id="publish-page-reason" value={publishPageReason} onChange={(event) => setPublishPageReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></label>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setPublishPageOpen(false)} disabled={publishPage.isPending}>Cancel</Button>
              <Button variant="signal" loading={publishPage.isPending} disabled={!publishPageReason.trim()} onClick={() => publishPage.mutate()}><Check />Publish draft</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="mt-5 border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="context-label">Marketplace</p>
              <h2 className="mt-1 text-[16px] font-semibold">Public directory listing</h2>
              <p className="mt-1 text-[12px] text-ink-3">{publicListingAllowed ? "Let members discover this gym and request a free trial." : organizationAvailable ? "Suppressed while the subscription is not active. Reactivate from Billing first." : "Suppressed: this row is not provisioned."}</p>
            </div>
            <Switch checked={publicListingAllowed && isPublic} onCheckedChange={setIsPublic} disabled={!organizationAvailable || !publicListingAllowed} aria-label="Public directory listing" />
          </div>
          {listingDirty ? (
            <div className="mt-4 grid gap-3 border-t border-line pt-4">
              <label className="grid gap-1.5 text-[12px] font-medium">Reason for this change<Textarea value={listingReason} onChange={(event) => setListingReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => { setIsPublic(detail.organization.state === "available" && detail.controls.isPublic); setListingReason(""); }}>Cancel</Button>
                <Button variant="signal" size="sm" loading={saveListing.isPending} disabled={!listingReason.trim()} onClick={() => saveListing.mutate()}><Check />Save listing</Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-danger/30 bg-danger-bg p-5">
          <div>
            <p className="context-label text-danger">Danger zone</p>
            <h2 className="mt-1 text-[16px] font-semibold">Remove gym access</h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-danger">Archiving removes access and public discovery. All records and history are kept.</p>
          </div>
          <Button variant="danger" onClick={() => { setDeleteError(undefined); setDeleteConfirmation(""); setDeleteReason(""); setDeleteOpen(true); }}><Archive />Archive gym</Button>
        </section>

        <Dialog open={deleteOpen} onOpenChange={(open) => { if (!archive.isPending) setDeleteOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive {detail.name}?</DialogTitle>
              <DialogDescription>This removes the gym from active RIVET workspaces and public discovery. Financial, subscription, and audit history are retained for compliance and future review.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-4">
              <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="delete-gym-confirmation">Type the gym name to confirm<Input id="delete-gym-confirmation" value={deleteConfirmation} onChange={(event) => { setDeleteConfirmation(event.target.value); setDeleteError(undefined); }} placeholder={detail.name} autoComplete="off" /></label>
              <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="delete-gym-reason">Reason for archiving<Textarea id="delete-gym-reason" value={deleteReason} onChange={(event) => { setDeleteReason(event.target.value); setDeleteError(undefined); }} placeholder="Required for the platform audit trail" /></label>
              {deleteConfirmation.length > 0 && deleteConfirmation !== detail.name ? <p className="text-[12px] text-danger" role="alert">The confirmation must match “{detail.name}” exactly.</p> : null}
              {deleteError ? <p className="border border-danger/30 bg-danger-bg px-3 py-2.5 text-[11.5px] text-danger" role="alert">{deleteError}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={archive.isPending}>Cancel</Button>
              <Button variant="danger" loading={archive.isPending} disabled={deleteConfirmation !== detail.name || !deleteReason.trim()} onClick={() => archive.mutate({ gymId, confirmation: deleteConfirmation, reason: deleteReason.trim() })}><Archive />Archive gym</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="mt-5 border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><p className="context-label">Account activity</p><h2 className="mt-1 text-[17px] font-semibold">Platform timeline</h2></div>
          {detail.activity.state === "available" && detail.activity.value.length > 0 ? <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">{detail.activity.value.map((event) => <div key={event.id} className="p-5"><p className="font-mono text-[10.5px] uppercase tracking-[.1em] text-ink-3">{formatDateTime(event.occurredAt)}</p><p className="mt-3 text-[12.5px] font-semibold">{event.summary}</p><p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">{event.action} · {event.actorName}</p></div>)}</div> : <UnavailableBlock field={detail.activity} empty="No platform activity recorded" />}
        </section>
      </div>
    </div>
  );
}

function FieldValue<T>({ field, render }: { field: PlatformData<T>; render?: (value: T) => React.ReactNode }) {
  return field.state === "available" ? <>{render ? render(field.value) : String(field.value)}</> : <UnavailableValue state={field.state} />;
}

function UnavailableValue({ state, className }: { state: "not_available" | "not_configured"; className?: string }) {
  return <span className={className ?? "text-ink-3"}>{state === "not_configured" ? "Not configured" : "Not available"}</span>;
}

function UnavailableBlock<T>({ field, empty }: { field: PlatformData<T>; empty: string }) {
  return <div className="px-5 py-8 text-[12px] text-ink-3">{field.state === "available" ? empty : <UnavailableValue state={field.state} />}</div>;
}

function statusLabel(value: string) {
  return value === "overdue" ? "Past due" : value.replaceAll("_", " ");
}

function HeroStatus({ status }: { status: PlatformGymDetail["controls"]["status"] }) {
  const label = status === "overdue" ? "past due" : status;
  const tone = status === "active" ? "bg-success-bg text-success-deep" : status === "trial" ? "bg-sunken text-ink-2" : "bg-signal-bg text-signal-deep";
  return <span className={`rounded-sm px-2 py-1 font-mono text-[10.5px] uppercase tracking-[.12em] ${tone}`}>{label}</span>;
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

function Usage({ icon, label, field }: { icon: React.ReactNode; label: string; field: PlatformData<number | string> }) {
  return <div className="bg-surface p-4"><span className="text-ink-3 [&_svg]:size-3.5">{icon}</span><p className="mt-4 font-mono text-[10.5px] uppercase tracking-[.1em] text-ink-3">{label}</p><p className="mt-1 text-[12px] font-semibold"><FieldValue field={field} render={(value) => typeof value === "number" ? value.toLocaleString() : value} /></p></div>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-night-line/60 pb-2.5"><dt className="text-night-ink-3">{label}</dt><dd className="text-end font-medium">{children}</dd></div>;
}
