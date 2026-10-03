"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";

import { useState } from "react";
import { Ban, CircleAlert, Receipt, RotateCcw } from "lucide-react";
import Link from "next/link";
import { PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { SubscriptionStatusBadge } from "@/components/platform/platform-status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { useApiMutation } from "@/lib/hooks/use-api";

type StatusAction = { gym: MarketplaceGym; kind: "suspend" | "cancel" };

/**
 * The single home for tenant subscription work: every provisioned gym with
 * its live plan, cadence, status, and paid-through date, plus the actions.
 * Plan/cadence changes and reactivation go through the billing wizard so
 * they always issue the term invoice; suspend and cancel are status-only.
 */
export function GymSubscriptions({ gyms, onBill }: {
  gyms: MarketplaceGym[];
  onBill: (gymId: string) => void;
}) {
  const t = useT();
  const { isolate } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
  const [action, setAction] = useState<StatusAction>();
  const [reason, setReason] = useState("");
  const tenants = gyms.filter((gym) => gym.isProvisioned === true && !gym.isArchived);

  const applyStatus = useApiMutation((api) => {
    if (!action) throw new Error(t("platformFinance.subscriptions.chooseAction"));
    return api.updatePlatformGym({ gymId: action.gym.id, status: action.kind === "suspend" ? "suspended" : "cancelled", reason: reason.trim() });
  }, {
    onSuccess: () => { setAction(undefined); setReason(""); },
    successMessage: t("platformFinance.subscriptions.saveAudit"),
  });

  return (
    <PlatformPanel className="mt-5 overflow-hidden" aria-labelledby="gym-subscriptions-heading">
      <PlatformPanelHeader id="gym-subscriptions-heading" title={t("platformFinance.subscriptions.title")} description={t("platformFinance.subscriptions.description")} />
      {tenants.length === 0 ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3">{t("platformFinance.subscriptions.empty")}</p> : (
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4 sm:ps-5">{t("shell.topbar.gym")}</TableHead>
              <TableHead>{t("platformFinance.subscriptions.planBilling")}</TableHead>
              <TableHead>{t("common.label.status")}</TableHead>
              <TableHead>{t("platformFinance.subscriptions.paidThrough")}</TableHead>
              <TableHead className="pe-4 text-end sm:pe-5">{t("common.label.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((gym) => {
              const active = gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial";
              return (
                <TableRow key={gym.id}>
                  <TableCell className="ps-4 sm:ps-5"><Link href={`/platform/gyms/${gym.id}`} className="text-[13px] font-semibold underline-offset-4 hover:underline">{gym.name}</Link></TableCell>
                  <TableCell className="text-[13px] text-ink-2"><bdi dir="ltr">{gym.rivetPlan}</bdi> · {gym.billingInterval === "annual" ? t("platformFinance.wizard.annual") : t("platformFinance.wizard.monthly")}</TableCell>
                  <TableCell><SubscriptionStatusBadge status={gym.subscriptionStatus} /></TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{gym.subscriptionStatus === "trial" && gym.trialEndsAt ? t("platformFinance.subscriptions.trialEnds", { date: f.date(gym.trialEndsAt) }) : gym.currentPeriodEndsAt ? f.date(gym.currentPeriodEndsAt) : t("platformFinance.subscriptions.notRecorded")}</TableCell>
                  <TableCell className="pe-4 sm:pe-5">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant={active ? "secondary" : "primary"} onClick={() => onBill(gym.id)}>{active ? <><Receipt />{" "}{t("renewFlow.adjust.planChange.submit")}</> : <><RotateCcw />{t("platformFinance.subscriptions.reactivateAndBill")}</>}</Button>
                      {active ? <Button size="sm" variant="secondary" onClick={() => { setReason(""); setAction({ gym, kind: "suspend" }); }}><CircleAlert />{t("platformFinance.subscriptions.suspend")}</Button> : null}
                      {gym.subscriptionStatus !== "cancelled" ? <Button size="sm" variant="secondary" onClick={() => { setReason(""); setAction({ gym, kind: "cancel" }); }}><Ban />{" "}{t("platformFinance.subscriptions.cancelSubscription")}</Button> : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!applyStatus.isPending && !open) setAction(undefined); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action ? action.kind === "suspend" ? t("platformFinance.subscriptions.suspendTitle", { gym: isolate(action.gym.name) }) : t("platformFinance.subscriptions.cancelTitle", { gym: isolate(action.gym.name) }) : ""}</DialogTitle>
            <DialogDescription>{action?.kind === "suspend" ? t("platformFinance.subscriptions.suspendDescription") : t("platformFinance.subscriptions.cancelDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={t("platformFinance.subscriptions.reason")} htmlFor="subscription-status-reason"><Textarea id="subscription-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("platformFinance.subscriptions.auditReasonPlaceholder")} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAction(undefined)} disabled={applyStatus.isPending}>{t("platformFinance.subscriptions.keepAsIs")}</Button>
            <Button variant="danger" loading={applyStatus.isPending} disabled={!reason.trim()} onClick={() => applyStatus.mutate()}>{action?.kind === "suspend" ? <><CircleAlert />{t("platformFinance.subscriptions.suspendGym")}</> : <><Ban />{t("platformFinance.subscriptions.cancelSubscription")}</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformPanel>
  );
}
