"use client";

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
import { formatBillingDate } from "@/lib/platform/subscription-billing";

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
  const [action, setAction] = useState<StatusAction>();
  const [reason, setReason] = useState("");
  const tenants = gyms.filter((gym) => gym.isProvisioned === true && !gym.isArchived);

  const applyStatus = useApiMutation((api) => {
    if (!action) throw new Error("Choose a subscription action first.");
    return api.updatePlatformGym({ gymId: action.gym.id, status: action.kind === "suspend" ? "suspended" : "cancelled", reason: reason.trim() });
  }, {
    onSuccess: () => { setAction(undefined); setReason(""); },
    successMessage: "Subscription status saved and audited.",
  });

  return (
    <PlatformPanel className="mt-5 overflow-hidden" aria-labelledby="gym-subscriptions-heading">
      <PlatformPanelHeader id="gym-subscriptions-heading" title="Gym subscriptions" description="Every provisioned tenant. Plan, billing, reactivation, suspension and cancellation all live here; gym pages stay informational." />
      {tenants.length === 0 ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3">No provisioned gyms yet.</p> : (
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4 sm:ps-5">Gym</TableHead>
              <TableHead>Plan · billing</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid through</TableHead>
              <TableHead className="pe-4 text-end sm:pe-5">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((gym) => {
              const active = gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial";
              return (
                <TableRow key={gym.id}>
                  <TableCell className="ps-4 sm:ps-5"><Link href={`/platform/gyms/${gym.id}`} className="text-[13px] font-semibold underline-offset-4 hover:underline">{gym.name}</Link></TableCell>
                  <TableCell className="text-[13px] text-ink-2">{gym.rivetPlan} · {gym.billingInterval === "annual" ? "annual" : "monthly"}</TableCell>
                  <TableCell><SubscriptionStatusBadge status={gym.subscriptionStatus} /></TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{gym.subscriptionStatus === "trial" && gym.trialEndsAt ? `Trial ends ${formatBillingDate(new Date(gym.trialEndsAt))}` : gym.currentPeriodEndsAt ? formatBillingDate(new Date(gym.currentPeriodEndsAt)) : "Not recorded"}</TableCell>
                  <TableCell className="pe-4 sm:pe-5">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant={active ? "secondary" : "primary"} onClick={() => onBill(gym.id)}>{active ? <><Receipt /> Change plan</> : <><RotateCcw /> Reactivate & bill</>}</Button>
                      {active ? <Button size="sm" variant="secondary" onClick={() => { setReason(""); setAction({ gym, kind: "suspend" }); }}><CircleAlert /> Suspend</Button> : null}
                      {gym.subscriptionStatus !== "cancelled" ? <Button size="sm" variant="secondary" onClick={() => { setReason(""); setAction({ gym, kind: "cancel" }); }}><Ban /> Cancel</Button> : null}
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
            <DialogTitle>{action?.kind === "suspend" ? `Suspend ${action.gym.name}?` : `Cancel ${action?.gym.name}'s subscription?`}</DialogTitle>
            <DialogDescription>{action?.kind === "suspend" ? "Access is removed immediately and the gym leaves public discovery. No invoice is issued; the paid-through date stays on record, and reactivating later bills a fresh term." : "The subscription ends and the gym leaves public discovery. No invoice is issued. Reactivating later bills a fresh term."}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Reason for this change" htmlFor="subscription-status-reason"><Textarea id="subscription-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAction(undefined)} disabled={applyStatus.isPending}>Keep as is</Button>
            <Button variant="danger" loading={applyStatus.isPending} disabled={!reason.trim()} onClick={() => applyStatus.mutate()}>{action?.kind === "suspend" ? <><CircleAlert /> Suspend gym</> : <><Ban /> Cancel subscription</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformPanel>
  );
}
