"use client";

import { Archive, ArrowRightLeft, Banknote, CalendarClock, CalendarPlus, Camera, MoreHorizontal, Pencil, Phone, Snowflake, Sun, Trash2, WalletCards } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { MemberDetail, MembershipSummary } from "@/lib/domain/types";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { todayISODate } from "@/lib/utils/dates";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { DaysUntilText, MoneyText } from "@/components/shared/data-display";
import { MembershipStatusChip, PaymentStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Monogram } from "@/components/ui/misc";
import { MembershipSaleDialog } from "@/features/membership-actions/sale-dialog";
import { CollectPaymentDialog } from "@/features/membership-actions/payment-dialog";
import { CancelMembershipDialog, ChangeMembershipPlanDialog, ExtendDialog, FreezeDialog, TransferMembershipDialog, UnfreezeDialog } from "@/features/membership-actions/adjustment-dialogs";

type DialogKind = "edit" | "sell" | "renew" | "collect" | "freeze" | "unfreeze" | "extend" | "transfer" | "plan-change" | "cancel" | "archive" | "delete" | null;

export function resolveMemberActionLink(
  searchParams: Pick<URLSearchParams, "get">,
  options: { canCollect: boolean; canSell: boolean; hasRenewableMembership: boolean; outstandingAmount: number },
): Extract<DialogKind, "sell" | "renew" | "collect"> | null {
  const action = searchParams.get("action");
  if (action === "collect" && options.canCollect && options.outstandingAmount > 0) return "collect";
  if (action === "renew" && options.canSell && options.hasRenewableMembership) return "renew";
  if (searchParams.get("sell") === "1" && options.canSell && !options.hasRenewableMembership) return "sell";
  return null;
}

/**
 * Member 360 header: identity, current commercial state, and every action a
 * permitted staff member can take — one deliberate click away.
 */
export function MemberHeader({
  member,
  currentMembership,
  renewalTarget,
  upcomingMembership,
  branchName,
}: {
  member: MemberDetail;
  /** The term in force (or the depleted/scheduled one), used for freeze, extend, transfer and cancel. */
  currentMembership?: MembershipSummary;
  /** The latest non-cancelled term; a renewal chains from it. Expired terms still renew, with lineage. */
  renewalTarget?: MembershipSummary;
  /** A successor already sold, so staff see the member has renewed before selling another term. */
  upcomingMembership?: MembershipSummary;
  branchName: string;
}) {
  const { can } = usePermissions();
  const { session } = useApp();
  const { t, isolate, isolateLtr } = useLocale();
  const format = useFormat();
  const outstanding = member.outstanding;
  const canSell = can("memberships.sell");
  const canCollect = can("payments.collect");
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidate = useInvalidate();
  const today = todayISODate(session?.organization.timezone ?? "Asia/Amman");
  // Money taken from this screen goes into the drawer of the branch the
  // operator is working, when that is a concrete branch.
  const operatingBranchId = visibleBranchId(session?.branches, session?.activeBranchId);
  const shownMembership = currentMembership ?? renewalTarget;
  const [dialog, setDialog] = useState<DialogKind>(() => resolveMemberActionLink(searchParams, {
    canCollect,
    canSell,
    hasRenewableMembership: Boolean(renewalTarget),
    outstandingAmount: outstanding.amount,
  }));
  const handledActionLink = useRef(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const memberOwnsProfile = Boolean(member.customerProfileId);
  const [editForm, setEditForm] = useState({ fullName: member.fullName, fullNameAr: member.fullNameAr ?? "", phone: member.phone, email: member.email ?? "", homeBranchId: member.homeBranchId, preferredLanguage: member.preferredLanguage, tags: member.tags.join(", "), emergencyContactName: member.emergencyContactName ?? "", emergencyContactPhone: member.emergencyContactPhone ?? "", notes: member.notes ?? "", marketingOptIn: member.marketingOptIn, marketingPreferenceSource: undefined as "staff_selected" | undefined });

  useEffect(() => {
    if (dialog === "edit") setEditForm({ fullName: member.fullName, fullNameAr: member.fullNameAr ?? "", phone: member.phone, email: member.email ?? "", homeBranchId: member.homeBranchId, preferredLanguage: member.preferredLanguage, tags: member.tags.join(", "), emergencyContactName: member.emergencyContactName ?? "", emergencyContactPhone: member.emergencyContactPhone ?? "", notes: member.notes ?? "", marketingOptIn: member.marketingOptIn, marketingPreferenceSource: undefined });
  }, [dialog, member]);

  const archive = useApiMutation((api) => api.archiveMember(member.id, { reason: archiveReason }), {
    onSuccess: async () => {
      toast.success(t("memberProfile.archive.archived"));
      await invalidate();
      setDialog(null);
    },
  });
  const deleteMember = useApiMutation((api) => api.deleteMember(member.id, { reason: deleteReason, confirmation: deleteConfirmation }), {
    onSuccess: async () => {
      toast.success(t("memberProfile.delete.deleted"));
      await invalidate();
      router.push("/members");
    },
  });
  const updateProfile = useApiMutation((api) => {
    const { marketingOptIn, marketingPreferenceSource, ...profileFields } = editForm;
    return api.updateMember(member.id, {
      ...profileFields,
      fullNameAr: editForm.fullNameAr.trim() || undefined,
      email: editForm.email.trim() || undefined,
      emergencyContactName: editForm.emergencyContactName.trim() || undefined,
      emergencyContactPhone: editForm.emergencyContactPhone.trim() || undefined,
      notes: editForm.notes.trim() || undefined,
      tags: editForm.tags.split(/[,،]/).map((tag) => tag.trim()).filter(Boolean),
      ...(marketingPreferenceSource ? { marketingOptIn, marketingPreferenceSource } : {}),
    });
  }, {
    onSuccess: async () => {
      toast.success(t("memberProfile.edit.saved"));
      setDialog(null);
      await invalidate();
    },
  });
  const uploadPhoto = useApiMutation((api, file: File) => api.uploadMediaAsset({ ownerType: "member_photo", ownerId: member.id, file }), { onSuccess: async () => { toast.success(t("memberProfile.toast.photoSaved")); await invalidate(); } });

  useEffect(() => {
    if (handledActionLink.current) return;
    const requestedDialog = resolveMemberActionLink(searchParams, {
      canCollect,
      canSell,
      hasRenewableMembership: Boolean(renewalTarget),
      outstandingAmount: outstanding.amount,
    });
    if (requestedDialog) {
      handledActionLink.current = true;
      setDialog(requestedDialog);
    }
  }, [canCollect, canSell, renewalTarget, outstanding.amount, searchParams]);

  return (
    <header className="panel overflow-hidden">
      {outstanding.amount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning-bg/50 px-5 py-2.5">
          <p className="flex-1 text-[13px] text-warning-deep">
            {t("memberProfile.header.owes")}{" "}
            <strong className="font-semibold">
              <MoneyText money={outstanding} />
            </strong>{t("memberProfile.header.owesEnd")}
          </p>
          {can("payments.collect") ? (
            <Button size="sm" onClick={() => setDialog("collect")} data-testid="collect-outstanding">
              <Banknote /> {t("memberProfile.header.collectPayment")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-5 px-5 py-5">
        <div className="grid shrink-0 gap-1.5">{member.photoUrl ? <span role="img" aria-label={t("memberProfile.header.photoAlt", { name: isolate(member.fullName) })} className="size-14 rounded-md bg-cover bg-center" style={{ backgroundImage: `url(${member.photoUrl})` }} /> : <Monogram name={member.fullName} size="xl" />}{can("members.write") ? <label className="inline-flex cursor-pointer items-center justify-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink"><Camera className="size-3" />{uploadPhoto.isPending ? t("memberProfile.header.uploading") : t("memberProfile.header.photo")}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadPhoto.isPending} onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadPhoto.mutate(file); event.currentTarget.value = ""; }} /></label> : null}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-[24px] font-semibold leading-none tracking-tight" dir="auto">{member.fullName}</h1>
            {member.fullNameAr ? <span className="text-[15px] text-ink-3" dir="rtl">{member.fullNameAr}</span> : null}
            <MembershipStatusChip status={member.membershipStatus} />
            {currentMembership ? <PaymentStatusChip status={currentMembership.paymentStatus} /> : null}
            {member.status !== "active" ? (
              <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[12px] font-medium text-signal-deep">
                {member.status === "archived" ? t("memberProfile.header.archived") : t("memberProfile.header.inactive")}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <bdi dir="ltr" className="font-mono text-[12.5px]">{member.memberNumber}</bdi>
            <a href={`tel:${member.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-[12.5px] hover:text-ink" dir="ltr">
              <Phone className="size-3.5 text-ink-3" /> {member.phone}
            </a>
            <bdi>{branchName}</bdi>
            {member.tags.map((tag) => (
              <span key={tag} className="rounded-sm bg-sunken px-1.5 py-0.5 text-[12px] text-ink-2">
                <bdi>{tag}</bdi>
              </span>
            ))}
          </div>
          {shownMembership ? (
            <p className="mt-2 text-[12.5px] text-ink-3" data-testid="member-current-term">
              <bdi>{shownMembership.planName}</bdi> · {t("memberProfile.shared.dateRange", { start: isolate(format.date(shownMembership.startDate)), end: isolate(format.date(shownMembership.endDate)) })}{" "}
              {shownMembership.status === "scheduled" ? (
                <span>· {t("memberProfile.header.starts")} <DaysUntilText date={shownMembership.startDate} /></span>
              ) : shownMembership.status === "expired" ? (
                <span>· {t("memberProfile.header.ended")} <DaysUntilText date={shownMembership.endDate} /></span>
              ) : (
                <DaysUntilText date={shownMembership.endDate} />
              )}
              {shownMembership.remainingVisits != null ? (
                <span className="ms-2 tabular">· {t("memberProfile.shared.visitsLeft", { remaining: shownMembership.remainingVisits, total: shownMembership.totalVisits ?? "" })}</span>
              ) : null}
              {shownMembership.activeFreeze ? (
                <span className="ms-2">
                  · {shownMembership.activeFreeze.startDate <= today
                    ? t("memberProfile.header.frozenUntil", { date: isolate(format.date(shownMembership.activeFreeze.endDate)) })
                    : t("memberProfile.header.freezePlanned", { start: isolate(format.date(shownMembership.activeFreeze.startDate)), end: isolate(format.date(shownMembership.activeFreeze.endDate)) })}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-3">{t("memberProfile.header.noMembership")}</p>
          )}
          {upcomingMembership ? (
            <p className="mt-1 text-[12.5px] text-ink-3" data-testid="member-next-term">
              {t("memberProfile.header.alreadyRenewed", { plan: isolate(upcomingMembership.planName), start: isolate(format.date(upcomingMembership.startDate)), end: isolate(format.date(upcomingMembership.endDate)) })}
            </p>
          ) : null}
        </div>

        {/* On phones the actions drop to a full-width row below the identity,
            so the name/meta column is never squeezed between avatar and buttons. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>button:not([aria-label])]:flex-1">
          {canSell ? (
            renewalTarget ? (
              <Button onClick={() => setDialog("renew")} data-testid="renew-membership">
                <WalletCards /> {t("memberProfile.header.renew")}
              </Button>
            ) : (
              <Button onClick={() => setDialog("sell")} data-testid="sell-membership">
                <WalletCards /> {t("memberProfile.header.sell")}
              </Button>
            )
          ) : null}
          {can("payments.collect") && outstanding.amount > 0 ? (
            <Button variant="secondary" onClick={() => setDialog("collect")}>
              <Banknote /> {t("memberProfile.header.collect")}
            </Button>
          ) : null}
          {can("members.write") || canSell || can("memberships.freeze") || can("memberships.override_dates") || can("members.archive") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label={t("memberProfile.header.moreActions")}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can("members.write") ? (
                  <DropdownMenuItem onClick={() => setDialog("edit")}>
                    <Pencil /> {t("memberProfile.header.menu.editProfile")}
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.freeze") && currentMembership && !currentMembership.activeFreeze && (currentMembership.status === "active" || currentMembership.status === "expiring") ? (
                  <DropdownMenuItem onClick={() => setDialog("freeze")}>
                    <Snowflake /> {t("memberProfile.header.menu.freeze")}
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.freeze") && currentMembership?.activeFreeze && currentMembership.activeFreeze.startDate <= today ? (
                  <DropdownMenuItem onClick={() => setDialog("unfreeze")}>
                    <Sun /> {t("memberProfile.header.menu.endFreeze")}
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.override_dates") && currentMembership && !currentMembership.cancelledAt ? (
                  <DropdownMenuItem onClick={() => setDialog("extend")}>
                    <CalendarPlus /> {t("memberProfile.header.menu.extend")}
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.override_dates") && currentMembership && !currentMembership.cancelledAt && (session?.branches.length ?? 0) > 1 ? (
                  <DropdownMenuItem onClick={() => setDialog("transfer")}>
                    <ArrowRightLeft /> {t("memberProfile.header.menu.transfer")}
                  </DropdownMenuItem>
                ) : null}
                {canSell && currentMembership && !currentMembership.cancelledAt ? (
                  <DropdownMenuItem onClick={() => setDialog("plan-change")}>
                    <ArrowRightLeft /> {t("memberProfile.header.menu.changePlan")}
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.freeze") && currentMembership && !currentMembership.cancelledAt ? (
                  <DropdownMenuItem destructive onClick={() => setDialog("cancel")}>
                    <CalendarClock /> {t("memberProfile.header.menu.cancelMembership")}
                  </DropdownMenuItem>
                ) : null}
                {can("members.archive") && member.status === "active" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={() => setDialog("archive")}>
                      <Archive /> {t("memberProfile.header.menu.archive")}
                    </DropdownMenuItem>
                  </>
                ) : null}
                {can("members.archive") && member.status === "archived" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={() => setDialog("delete")}>
                      <Trash2 /> {t("memberProfile.header.menu.delete")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* Dialogs */}
      {canSell ? (
        <MembershipSaleDialog
          open={dialog === "sell" || dialog === "renew"}
          onOpenChange={(v) => !v && setDialog(null)}
          member={member}
          renewalOf={dialog === "renew" ? renewalTarget : undefined}
          branchId={operatingBranchId}
          onCompleted={(result) => {
            toast.success(
              result.receipt
                ? t("memberProfile.toast.saleDone", { receipt: isolateLtr(result.receipt.receiptNumber) })
                : t("memberProfile.toast.saleSaved"),
            );
          }}
        />
      ) : null}
      <CollectPaymentDialog
        open={dialog === "collect"}
        onOpenChange={(v) => !v && setDialog(null)}
        member={member}
        branchId={operatingBranchId}
      />
      {currentMembership ? (
        <>
          <FreezeDialog
            open={dialog === "freeze"}
            onOpenChange={(v) => !v && setDialog(null)}
            membership={currentMembership}
            allowanceRemaining={Math.max(0, currentMembership.planFreezeAllowanceDays - currentMembership.frozenDaysUsed)}
            onDone={() => toast.success(t("memberProfile.toast.frozen"))}
          />
          <UnfreezeDialog open={dialog === "unfreeze"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} onDone={() => toast.success(t("memberProfile.toast.freezeEnded"))} />
          <ExtendDialog open={dialog === "extend"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} onDone={() => toast.success(t("memberProfile.toast.extended"))} />
          <TransferMembershipDialog open={dialog === "transfer"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} branches={session?.branches ?? []} onDone={() => toast.success(t("memberProfile.toast.transferred"))} />
          <CancelMembershipDialog open={dialog === "cancel"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} onDone={() => toast.success(t("memberProfile.toast.cancelled"))} />
          <ChangeMembershipPlanDialog open={dialog === "plan-change"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} allowImmediate={can("memberships.override_dates")} onDone={() => toast.success(t("memberProfile.toast.planChanged"))} />
        </>
      ) : null}

      <Dialog open={dialog === "edit"} onOpenChange={(value) => !value && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("memberProfile.edit.title")}</DialogTitle>
            <DialogDescription>{memberOwnsProfile ? t("memberProfile.edit.descriptionOwned") : t("memberProfile.edit.description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <FieldGrid className="sm:grid-cols-2">
              <Field label={t("memberProfile.edit.fullName")} required><Input disabled={memberOwnsProfile} dir="auto" value={editForm.fullName} onChange={(event) => setEditForm((form) => ({ ...form, fullName: event.target.value }))} /></Field>
              <Field label={t("memberProfile.edit.arabicName")}><Input disabled={memberOwnsProfile} dir="rtl" value={editForm.fullNameAr} onChange={(event) => setEditForm((form) => ({ ...form, fullNameAr: event.target.value }))} /></Field>
              <Field label={t("common.label.phone")} required><Input disabled={memberOwnsProfile} dir="ltr" value={editForm.phone} onChange={(event) => setEditForm((form) => ({ ...form, phone: event.target.value }))} /></Field>
              <Field label={t("common.label.email")}><Input disabled={memberOwnsProfile} type="email" dir="ltr" value={editForm.email} onChange={(event) => setEditForm((form) => ({ ...form, email: event.target.value }))} /></Field>
              <Field label={t("memberProfile.edit.homeBranch")}>
                <Select value={editForm.homeBranchId} onValueChange={(value) => setEditForm((form) => ({ ...form, homeBranchId: value }))}>
                  <SelectTrigger aria-label={t("memberProfile.edit.homeBranch")}><SelectValue /></SelectTrigger>
                  <SelectContent>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("memberProfile.edit.preferredLanguage")}>
                <Select disabled={memberOwnsProfile} value={editForm.preferredLanguage} onValueChange={(value) => setEditForm((form) => ({ ...form, preferredLanguage: value as "en" | "ar" }))}>
                  <SelectTrigger aria-label={t("memberProfile.edit.preferredLanguage")}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="en">{t("common.language.english")}</SelectItem><SelectItem value="ar">{t("common.language.arabic")}</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label={t("memberProfile.edit.emergencyContact")}><Input disabled={memberOwnsProfile} dir="auto" value={editForm.emergencyContactName} onChange={(event) => setEditForm((form) => ({ ...form, emergencyContactName: event.target.value }))} /></Field>
              <Field label={t("memberProfile.edit.emergencyPhone")}><Input disabled={memberOwnsProfile} dir="ltr" value={editForm.emergencyContactPhone} onChange={(event) => setEditForm((form) => ({ ...form, emergencyContactPhone: event.target.value }))} /></Field>
            </FieldGrid>
            <Field label={t("memberProfile.edit.tags")} hint={t("memberProfile.edit.tagsHint")}><Input dir="auto" value={editForm.tags} onChange={(event) => setEditForm((form) => ({ ...form, tags: event.target.value }))} placeholder={t("memberProfile.edit.tagsPlaceholder")} /></Field>
            <Field label={t("memberProfile.edit.staffNotes")}><Textarea dir="auto" value={editForm.notes} onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))} placeholder={t("memberProfile.edit.staffNotesPlaceholder")} /></Field>
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-sunken/30 px-3 py-3">
              <div>
                <p className="text-[13px] font-medium">{t("memberProfile.edit.marketing")}</p>
                <p className="text-[12px] text-ink-3">{t("memberProfile.edit.marketingHint")}</p>
              </div>
              <Switch checked={editForm.marketingOptIn} onCheckedChange={(checked) => setEditForm((form) => ({ ...form, marketingOptIn: checked, marketingPreferenceSource: "staff_selected" }))} aria-label={t("memberProfile.edit.marketing")} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>{t("common.action.cancel")}</Button>
            <Button disabled={editForm.fullName.trim().length < 2 || editForm.phone.trim().length < 5} loading={updateProfile.isPending} onClick={() => updateProfile.mutate()}>{t("memberProfile.edit.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "archive"} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("memberProfile.archive.title")}</DialogTitle>
            <DialogDescription>
              {t("memberProfile.archive.description", { name: isolate(member.fullName) })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={t("common.label.reason")} required>
              <Textarea dir="auto" value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder={t("memberProfile.archive.reasonPlaceholder")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              {t("common.action.back")}
            </Button>
            <Button variant="signal" disabled={archiveReason.trim().length < 3} loading={archive.isPending} onClick={() => archive.mutate()}>
              {t("memberProfile.archive.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("memberProfile.delete.title")}</DialogTitle>
            <DialogDescription>
              {t("memberProfile.delete.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label={t("memberProfile.delete.confirmLabel", { name: isolate(member.fullName) })} required>
              <Input dir="auto" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
            </Field>
            <Field label={t("common.label.reason")} required>
              <Textarea dir="auto" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder={t("memberProfile.delete.reasonPlaceholder")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>{t("common.action.cancel")}</Button>
            <Button
              variant="signal"
              disabled={deleteConfirmation.trim() !== member.fullName || deleteReason.trim().length < 3}
              loading={deleteMember.isPending}
              onClick={() => deleteMember.mutate()}
            >
              <Trash2 /> {t("memberProfile.delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
