"use client";

import { useState } from "react";
import { Ban, CircleAlert, Receipt, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { useApiMutation } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
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
    <section className="mt-7 border border-line bg-surface" aria-labelledby="gym-subscriptions-heading">
      <div className="border-b border-line px-5 py-4"><p className="context-label">Subscriptions</p><h2 id="gym-subscriptions-heading" className="mt-1 text-[17px] font-semibold">Gym subscriptions</h2><p className="mt-1 text-[12px] text-ink-3">Every provisioned tenant. Plan, billing, reactivation, suspension, and cancellation all live here; gym pages stay informational.</p></div>
      {tenants.length === 0 ? <p className="px-5 py-10 text-center text-[12px] text-ink-3">No provisioned gyms yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-start">
            <thead><tr className="border-b border-line text-[11.5px] font-medium text-ink-3"><th className="px-5 py-3 text-start">Gym</th><th className="px-4 py-3 text-start">Plan · billing</th><th className="px-4 py-3 text-start">Status</th><th className="px-4 py-3 text-start">Paid through</th><th className="px-5 py-3 text-end">Actions</th></tr></thead>
            <tbody>
              {tenants.map((gym) => {
                const active = gym.subscriptionStatus === "active" || gym.subscriptionStatus === "trial";
                return (
                  <tr key={gym.id} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-4"><Link href={`/platform/gyms/${gym.id}`} className="text-[12.5px] font-semibold hover:underline">{gym.name}</Link></td>
                    <td className="px-4 py-4 text-[11.5px] text-ink-2">{gym.rivetPlan} · {gym.billingInterval === "annual" ? "annual" : "monthly"}</td>
                    <td className="px-4 py-4"><StatusBadge status={gym.subscriptionStatus} /></td>
                    <td className="px-4 py-4 text-[11px] text-ink-3">{gym.subscriptionStatus === "trial" && gym.trialEndsAt ? `Trial ends ${formatBillingDate(new Date(gym.trialEndsAt))}` : gym.currentPeriodEndsAt ? formatBillingDate(new Date(gym.currentPeriodEndsAt)) : "Not recorded"}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant={active ? "secondary" : "primary"} onClick={() => onBill(gym.id)}>{active ? <><Receipt /> Change plan</> : <><RotateCcw /> Reactivate & bill</>}</Button>
                        {active ? <Button size="sm" variant="secondary" onClick={() => { setReason(""); setAction({ gym, kind: "suspend" }); }}><CircleAlert /> Suspend</Button> : null}
                        {gym.subscriptionStatus !== "cancelled" ? <Button size="sm" variant="secondary" onClick={() => { setReason(""); setAction({ gym, kind: "cancel" }); }}><Ban /> Cancel</Button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!applyStatus.isPending && !open) setAction(undefined); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.kind === "suspend" ? `Suspend ${action.gym.name}?` : `Cancel ${action?.gym.name}'s subscription?`}</DialogTitle>
            <DialogDescription>{action?.kind === "suspend" ? "Access is removed immediately and the gym leaves public discovery. No invoice is issued; the paid-through date stays on record, and reactivating later bills a fresh term." : "The subscription ends and the gym leaves public discovery. No invoice is issued. Reactivating later bills a fresh term."}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="subscription-status-reason">Reason for this change<Textarea id="subscription-status-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></label>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAction(undefined)} disabled={applyStatus.isPending}>Keep as is</Button>
            <Button variant="danger" loading={applyStatus.isPending} disabled={!reason.trim()} onClick={() => applyStatus.mutate()}>{action?.kind === "suspend" ? <><CircleAlert /> Suspend gym</> : <><Ban /> Cancel subscription</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function StatusBadge({ status }: { status: MarketplaceGym["subscriptionStatus"] }) {
  const label = status === "overdue" ? "past due" : status;
  return <span className={cn("rounded-sm px-2 py-1 text-[11px] font-medium capitalize", status === "active" ? "bg-success-bg text-success-deep" : status === "trial" ? "bg-sunken text-ink-2" : "bg-signal-bg text-signal-deep")}>{label}</span>;
}
