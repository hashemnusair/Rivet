"use client";

import { Archive, ArrowRightLeft, Banknote, CalendarClock, CalendarPlus, MoreHorizontal, Pencil, Phone, Snowflake, Sun, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { MemberDetail, MembershipSummary } from "@/lib/domain/types";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { formatDate } from "@/lib/utils/dates";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { DaysUntilText, MoneyText } from "@/components/shared/data-display";
import { MembershipStatusChip, PaymentStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
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

type DialogKind = "edit" | "sell" | "renew" | "collect" | "freeze" | "unfreeze" | "extend" | "transfer" | "plan-change" | "cancel" | "archive" | null;

/**
 * Member 360 header: identity, current commercial state, and every action a
 * permitted staff member can take — one deliberate click away.
 */
export function MemberHeader({
  member,
  currentMembership,
  branchName,
}: {
  member: MemberDetail;
  currentMembership?: MembershipSummary;
  branchName: string;
}) {
  const { can } = usePermissions();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [editForm, setEditForm] = useState({ fullName: member.fullName, fullNameAr: member.fullNameAr ?? "", phone: member.phone, email: member.email ?? "", homeBranchId: member.homeBranchId, preferredLanguage: member.preferredLanguage, tags: member.tags.join(", "), emergencyContactName: member.emergencyContactName ?? "", emergencyContactPhone: member.emergencyContactPhone ?? "", notes: member.notes ?? "", marketingOptIn: member.marketingOptIn, marketingPreferenceSource: undefined as "staff_selected" | undefined });

  useEffect(() => {
    if (dialog === "edit") setEditForm({ fullName: member.fullName, fullNameAr: member.fullNameAr ?? "", phone: member.phone, email: member.email ?? "", homeBranchId: member.homeBranchId, preferredLanguage: member.preferredLanguage, tags: member.tags.join(", "), emergencyContactName: member.emergencyContactName ?? "", emergencyContactPhone: member.emergencyContactPhone ?? "", notes: member.notes ?? "", marketingOptIn: member.marketingOptIn, marketingPreferenceSource: undefined });
  }, [dialog, member]);

  const archive = useApiMutation((api) => api.archiveMember(member.id, { reason: archiveReason }), {
    onSuccess: async () => {
      toast.success("Member archived.");
      await invalidate();
      setDialog(null);
    },
  });
  const updateProfile = useApiMutation((api) => api.updateMember(member.id, {
    ...editForm,
    fullNameAr: editForm.fullNameAr.trim() || undefined,
    email: editForm.email.trim() || undefined,
    emergencyContactName: editForm.emergencyContactName.trim() || undefined,
    emergencyContactPhone: editForm.emergencyContactPhone.trim() || undefined,
    notes: editForm.notes.trim() || undefined,
    tags: editForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    marketingOptIn: editForm.marketingOptIn,
    marketingPreferenceSource: editForm.marketingPreferenceSource,
  }), {
    onSuccess: async () => {
      toast.success("Member profile updated — audited.");
      setDialog(null);
      await invalidate();
    },
  });

  const outstanding = member.outstanding;
  const canSell = can("memberships.sell");
  const usable = currentMembership && (currentMembership.status === "active" || currentMembership.status === "expiring" || currentMembership.status === "frozen");

  return (
    <header className="panel overflow-hidden">
      {outstanding.amount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-warning/40 bg-warning-bg/50 px-5 py-2.5">
          <p className="flex-1 text-[13px] text-warning-deep">
            <strong className="font-semibold">
              <MoneyText money={outstanding} />
            </strong>{" "}
            outstanding on this account.
          </p>
          {can("payments.collect") ? (
            <Button size="sm" onClick={() => setDialog("collect")} data-testid="collect-outstanding">
              <Banknote /> Collect now
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-5 px-5 py-5">
        <Monogram name={member.fullName} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-[24px] font-semibold leading-none tracking-tight">{member.fullName}</h1>
            {member.fullNameAr ? <span className="text-[15px] text-ink-3" dir="rtl">{member.fullNameAr}</span> : null}
            <MembershipStatusChip status={member.membershipStatus} />
            {currentMembership ? <PaymentStatusChip status={currentMembership.paymentStatus} /> : null}
            {member.status !== "active" ? (
              <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[11px] font-medium text-signal-deep uppercase tracking-wide">
                {member.status}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
            <span className="font-mono text-[12.5px]">{member.memberNumber}</span>
            <a href={`tel:${member.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 font-mono text-[12.5px] hover:text-ink" dir="ltr">
              <Phone className="size-3.5 text-ink-3" /> {member.phone}
            </a>
            <span>{branchName}</span>
            {member.tags.map((t) => (
              <span key={t} className="rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] text-ink-2">
                {t}
              </span>
            ))}
          </div>
          {currentMembership ? (
            <p className="mt-2 text-[12.5px] text-ink-3">
              {currentMembership.planName} · {formatDate(currentMembership.startDate)} → {formatDate(currentMembership.endDate)}{" "}
              <DaysUntilText date={currentMembership.endDate} />
              {currentMembership.remainingVisits != null ? (
                <span className="ms-2 tabular">· {currentMembership.remainingVisits}/{currentMembership.totalVisits} visits left</span>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] text-ink-3">No membership on file.</p>
          )}
        </div>

        {/* On phones the actions drop to a full-width row below the identity,
            so the name/meta column is never squeezed between avatar and buttons. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full">
          {canSell ? (
            usable ? (
              <Button onClick={() => setDialog("renew")} data-testid="renew-membership">
                <WalletCards /> Renew
              </Button>
            ) : (
              <Button onClick={() => setDialog("sell")} data-testid="sell-membership">
                <WalletCards /> Sell membership
              </Button>
            )
          ) : null}
          {can("payments.collect") && outstanding.amount > 0 ? (
            <Button variant="secondary" onClick={() => setDialog("collect")}>
              <Banknote /> Collect
            </Button>
          ) : null}
          {can("members.write") || canSell || can("memberships.freeze") || can("memberships.override_dates") || can("members.archive") ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {can("members.write") ? (
                  <DropdownMenuItem onClick={() => setDialog("edit")}>
                    <Pencil /> Edit profile…
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.freeze") && currentMembership && !currentMembership.activeFreeze && (currentMembership.status === "active" || currentMembership.status === "expiring") ? (
                  <DropdownMenuItem onClick={() => setDialog("freeze")}>
                    <Snowflake /> Freeze…
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.freeze") && currentMembership?.activeFreeze ? (
                  <DropdownMenuItem onClick={() => setDialog("unfreeze")}>
                    <Sun /> End freeze early…
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.override_dates") && currentMembership && !currentMembership.cancelledAt ? (
                  <DropdownMenuItem onClick={() => setDialog("extend")}>
                    <CalendarPlus /> Extend…
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.override_dates") && currentMembership && !currentMembership.cancelledAt && (session?.branches.length ?? 0) > 1 ? (
                  <DropdownMenuItem onClick={() => setDialog("transfer")}>
                    <ArrowRightLeft /> Transfer branch…
                  </DropdownMenuItem>
                ) : null}
                {canSell && currentMembership && !currentMembership.cancelledAt ? (
                  <DropdownMenuItem onClick={() => setDialog("plan-change")}>
                    <ArrowRightLeft /> Change plan…
                  </DropdownMenuItem>
                ) : null}
                {can("memberships.freeze") && currentMembership && !currentMembership.cancelledAt ? (
                  <DropdownMenuItem destructive onClick={() => setDialog("cancel")}>
                    <CalendarClock /> Cancel membership…
                  </DropdownMenuItem>
                ) : null}
                {can("members.archive") && member.status === "active" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onClick={() => setDialog("archive")}>
                      <Archive /> Archive member…
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
          renewalOf={dialog === "renew" ? currentMembership : undefined}
          onCompleted={(result) => {
            toast.success(
              result.receipt
                ? `Done — receipt ${result.receipt.receiptNumber} issued.`
                : "Membership recorded with an outstanding balance.",
            );
          }}
        />
      ) : null}
      <CollectPaymentDialog
        open={dialog === "collect"}
        onOpenChange={(v) => !v && setDialog(null)}
        member={member}
        onCollected={(receipt) => toast.success(`Collected — receipt ${receipt.receipt.receiptNumber}.`)}
      />
      {currentMembership ? (
        <>
          <FreezeDialog
            open={dialog === "freeze"}
            onOpenChange={(v) => !v && setDialog(null)}
            membership={currentMembership}
            allowanceRemaining={Math.max(0, currentMembership.planFreezeAllowanceDays - currentMembership.frozenDaysUsed)}
            onDone={() => toast.success("Membership frozen.")}
          />
          <UnfreezeDialog open={dialog === "unfreeze"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} onDone={() => toast.success("Freeze ended.")} />
          <ExtendDialog open={dialog === "extend"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} onDone={() => toast.success("Membership extended.")} />
          <TransferMembershipDialog open={dialog === "transfer"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} branches={session?.branches ?? []} onDone={() => toast.success("Membership transferred.")} />
          <CancelMembershipDialog open={dialog === "cancel"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} onDone={() => toast.success("Membership cancelled.")} />
          <ChangeMembershipPlanDialog open={dialog === "plan-change"} onOpenChange={(v) => !v && setDialog(null)} membership={currentMembership} allowImmediate={can("memberships.override_dates")} onDone={() => toast.success("Membership plan changed — successor term created.")} />
        </>
      ) : null}

      <Dialog open={dialog === "edit"} onOpenChange={(value) => !value && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit member profile</DialogTitle>
            <DialogDescription>Identity, contact, branch and service notes. Changes are authorized and audited server-side.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required><Input value={editForm.fullName} onChange={(event) => setEditForm((form) => ({ ...form, fullName: event.target.value }))} /></Field>
              <Field label="Arabic name"><Input dir="rtl" value={editForm.fullNameAr} onChange={(event) => setEditForm((form) => ({ ...form, fullNameAr: event.target.value }))} /></Field>
              <Field label="Phone" required><Input dir="ltr" value={editForm.phone} onChange={(event) => setEditForm((form) => ({ ...form, phone: event.target.value }))} /></Field>
              <Field label="Email"><Input type="email" value={editForm.email} onChange={(event) => setEditForm((form) => ({ ...form, email: event.target.value }))} /></Field>
              <Field label="Home branch">
                <Select value={editForm.homeBranchId} onValueChange={(value) => setEditForm((form) => ({ ...form, homeBranchId: value }))}>
                  <SelectTrigger aria-label="Home branch"><SelectValue /></SelectTrigger>
                  <SelectContent>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Preferred language">
                <Select value={editForm.preferredLanguage} onValueChange={(value) => setEditForm((form) => ({ ...form, preferredLanguage: value as "en" | "ar" }))}>
                  <SelectTrigger aria-label="Preferred language"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Emergency contact"><Input value={editForm.emergencyContactName} onChange={(event) => setEditForm((form) => ({ ...form, emergencyContactName: event.target.value }))} /></Field>
              <Field label="Emergency phone"><Input dir="ltr" value={editForm.emergencyContactPhone} onChange={(event) => setEditForm((form) => ({ ...form, emergencyContactPhone: event.target.value }))} /></Field>
            </div>
            <Field label="Tags" hint="Comma-separated"><Input value={editForm.tags} onChange={(event) => setEditForm((form) => ({ ...form, tags: event.target.value }))} placeholder="VIP, morning, personal training" /></Field>
            <Field label="Service notes"><Textarea value={editForm.notes} onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))} placeholder="Non-sensitive operational context for staff" /></Field>
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-sunken/30 px-3 py-3">
              <div>
                <p className="text-[13px] font-medium">Marketing messages</p>
                <p className="text-[12px] text-ink-3">Changing this records who changed the preference and when. Service messages are separate.</p>
              </div>
              <Switch checked={editForm.marketingOptIn} onCheckedChange={(checked) => setEditForm((form) => ({ ...form, marketingOptIn: checked, marketingPreferenceSource: "staff_selected" }))} aria-label="Marketing opt-in" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={editForm.fullName.trim().length < 2 || editForm.phone.trim().length < 5} loading={updateProfile.isPending} onClick={() => updateProfile.mutate()}>Save profile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "archive"} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive member</DialogTitle>
            <DialogDescription>
              {member.fullName} will no longer appear in active lists. History, payments and audit records are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Reason" required>
              <Textarea value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="e.g. Duplicate profile, merged after verification" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Back
            </Button>
            <Button variant="signal" disabled={archiveReason.trim().length < 3} loading={archive.isPending} onClick={() => archive.mutate()}>
              Archive member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
