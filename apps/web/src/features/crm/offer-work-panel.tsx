"use client";

import { Check, Clock3, Copy, Link2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { qk } from "@/lib/api/keys";
import type { MembershipPlan, Offer } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { formatDateTime } from "@/lib/utils/dates";
import { formatMoney, fromMajor, toMajor } from "@/lib/utils/money";
import { WhatsAppHandoff } from "./whatsapp-handoff";

interface OfferWorkPanelProps {
  leadId: string;
  leadName: string;
  phone: string;
  organizationName: string;
  currency: string;
  offers: Offer[];
  plans: MembershipPlan[];
  defaultCountryCallingCode?: string;
}

export function OfferWorkPanel(props: OfferWorkPanelProps) {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const activePlans = useMemo(() => props.plans.filter((plan) => plan.status === "active"), [props.plans]);
  const [planId, setPlanId] = useState("");
  const [price, setPrice] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");

  useEffect(() => {
    if (!open || !activePlans.length) return;
    const selected = activePlans.find((plan) => plan.id === planId) ?? activePlans[0]!;
    setPlanId(selected.id);
    setPrice(String(toMajor(selected.basePrice)));
  }, [activePlans, open, planId]);

  const create = useApiMutation(
    (api) => api.createOffer({ leadId: props.leadId, planId, price: fromMajor(Number(price), props.currency), expiresInDays: Number(expiresInDays) }),
    {
      onSuccess: async () => {
        toast.success("Offer link created. Share it, then confirm when it has actually been sent.");
        setOpen(false);
        await invalidate([qk.lead(props.leadId)]);
      },
    },
  );

  const sortedOffers = [...props.offers].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <section className="panel p-4" data-testid="offer-work-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="context-label">Optional sales tool</p>
          <h2 className="mt-1 font-display text-[15px] font-semibold">Membership offers</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Send a branded link the lead can accept or decline without creating an account.</p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={!activePlans.length}><Plus /> New offer</Button>
      </div>

      {sortedOffers.length ? <div className="mt-4 space-y-2">{sortedOffers.map((offer) => <OfferRow key={offer.id} {...props} offer={offer} />)}</div> : <p className="mt-4 rounded-md border border-dashed border-line px-3 py-3 text-[12px] text-ink-3">No offers yet. The direct membership-sale flow remains available.</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create membership offer</DialogTitle>
            <DialogDescription>Choose the plan, price, and response window. The link stays private until you share it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Membership plan" required>
              <Select value={planId} onValueChange={(value) => { setPlanId(value); const plan = activePlans.find((item) => item.id === value); if (plan) setPrice(String(toMajor(plan.basePrice))); }}>
                <SelectTrigger aria-label="Offer membership plan"><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                <SelectContent>{activePlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name} · {formatMoney(plan.basePrice)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <FieldGrid alignFrom="base" className="grid-cols-2">
              <Field label={`Offer price (${props.currency})`} required><Input type="number" min="0" step="0.001" value={price} onChange={(event) => setPrice(event.target.value)} /></Field>
              <Field label="Expires after" hint="1–60 days"><Input type="number" min="1" max="60" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} /></Field>
            </FieldGrid>
          </DialogBody>
          <DialogFooter><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" loading={create.isPending} disabled={!planId || !price || Number(price) < 0 || Number(expiresInDays) < 1 || Number(expiresInDays) > 60} onClick={() => create.mutate()}><Link2 /> Create link</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OfferRow(props: OfferWorkPanelProps & { offer: Offer }) {
  const invalidate = useInvalidate();
  const [origin, setOrigin] = useState("");
  const { offer } = props;
  const path = offer.publicToken ? `/offers/${offer.publicToken}` : undefined;
  const url = path && origin ? `${origin}${path}` : path;

  useEffect(() => setOrigin(window.location.origin), []);

  const confirmSent = useApiMutation((api) => api.markOfferDelivered(offer.id, { channel: "whatsapp", reference: "Branded public offer link" }), {
    onSuccess: async () => {
      toast.success("Offer marked sent. The public link can now accept a response.");
      await invalidate([qk.lead(props.leadId)]);
    },
  });

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Offer link copied.");
  };

  const variant = offer.status === "accepted" ? "success" : offer.status === "declined" || offer.status === "expired" ? "neutral" : offer.status === "sent" ? "warning" : "outline";
  return (
    <div className="rounded-md border border-line bg-sunken/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold">{offer.planName}</p><p className="mt-0.5 text-[11px] text-ink-3">{formatMoney(offer.price)}{offer.expiresAt ? <> · expires {formatDateTime(offer.expiresAt)}</> : null}</p></div>
        <Badge variant={variant}>{offer.status}</Badge>
      </div>
      {path ? <p className="mt-2 truncate font-mono text-[10.5px] text-ink-4">{path}</p> : <p className="mt-2 text-[11px] text-warning-deep">Legacy offer — create a new offer to get a public link.</p>}
      {path && offer.status === "draft" ? <div className="mt-3 grid gap-2 sm:grid-cols-3"><Button type="button" variant="ghost" size="sm" onClick={() => void copy()}><Copy /> Copy link</Button><WhatsAppHandoff subject="lead" subjectId={props.leadId} recipientName={props.leadName} phone={props.phone} organizationName={props.organizationName} defaultCountryCallingCode={props.defaultCountryCallingCode} initialMessage={`Hi ${props.leadName.split(/\s+/)[0]}, ${props.organizationName} prepared a membership offer for you: ${url}`} buttonLabel="Open WhatsApp" className="w-full" /><Button type="button" size="sm" loading={confirmSent.isPending} onClick={() => confirmSent.mutate()}><Check /> Confirm sent</Button></div> : null}
      {offer.status === "sent" ? <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-warning-deep"><Clock3 className="size-3.5" /> Waiting for the recipient&apos;s response.</p> : null}
      {offer.status === "accepted" ? <p className="mt-3 text-[11.5px] font-medium text-success-deep">Accepted. Complete the membership sale when payment and dates are agreed.</p> : null}
      {offer.status === "declined" && offer.responseReason ? <p className="mt-3 text-[11.5px] text-ink-2">Reason: {offer.responseReason}</p> : null}
    </div>
  );
}
