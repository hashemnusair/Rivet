"use client";
import { useLocale, type TKey } from "@/lib/i18n/provider";

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
import { money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { WhatsAppHandoff } from "./whatsapp-handoff";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits } from "@/lib/utils/text";
import { localizeApiError } from "@/lib/api/errors";
import { useApp } from "@/lib/providers/app-providers";
import { createTranslator } from "@/lib/i18n/core";
import { followUpHandoffDraft } from "../../../convex/followupAssist";

const OFFER_STATUS_KEYS = {
  draft: "crmCompletion.offers.draftStatus",
  sent: "crmCompletion.offers.sentStatus",
  accepted: "crmCompletion.offers.acceptedStatus",
  declined: "crmCompletion.offers.declinedStatus",
  expired: "crmCompletion.offers.expiredStatus",
} satisfies Record<Offer["status"], TKey>;

function parseOfferDays(value: string): number | undefined {
  const normalized = latinDigits(value).trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 60 ? parsed : undefined;
}

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
  const { t, locale, isolateLtr } = useLocale();
  const format = useFormat();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const activePlans = useMemo(() => props.plans.filter((plan) => plan.status === "active"), [props.plans]);
  const [planId, setPlanId] = useState("");
  const [price, setPrice] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open || !activePlans.length) return;
    const selected = activePlans.find((plan) => plan.id === planId) ?? activePlans[0]!;
    setPlanId(selected.id);
    setPrice(toMajorString(selected.basePrice));
  }, [activePlans, open, planId]);

  const priceRead = readMoneyInput(price, props.currency);
  const priceProblem = !priceRead.ok && priceRead.problem !== "empty" ? priceRead.message : undefined;
  const create = useApiMutation(
    (api) => api.createOffer({ leadId: props.leadId, planId, price: priceRead.ok ? priceRead.money : money(0, props.currency), expiresInDays: parseOfferDays(expiresInDays) ?? 1 }),
    {
      onSuccess: async () => {
        toast.success(t("crmCompletion.offers.ready"));
        setOpen(false);
        await invalidate([qk.lead(props.leadId)]);
      },
      onError: (cause) => setError(cause instanceof Error ? localizeApiError(cause, locale).message : t("crmCompletion.offers.createFailed")),
    },
  );

  const sortedOffers = [...props.offers].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <section className="panel p-4" data-testid="offer-work-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          
          <h2 className="mt-1 font-display text-[15px] font-semibold">{t("crmCompletion.offers.title")}</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t("crmCompletion.offers.description")}</p>
        </div>
        <Button type="button" size="sm" onClick={() => { setError(undefined); setOpen(true); }} disabled={!activePlans.length}><Plus /> {t("crmCompletion.offers.new")}</Button>
      </div>

      {sortedOffers.length ? <div className="mt-4 space-y-2">{sortedOffers.map((offer) => <OfferRow key={offer.id} {...props} offer={offer} />)}</div> : <p className="mt-4 rounded-md border border-dashed border-line px-3 py-3 text-[12px] text-ink-3">{t("crmCompletion.offers.empty")}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crmCompletion.offers.createTitle")}</DialogTitle>
            <DialogDescription>{t("crmCompletion.offers.createDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={t("crmCompletion.offers.planLabel")} required>
              <Select value={planId} onValueChange={(value) => { setPlanId(value); const plan = activePlans.find((item) => item.id === value); if (plan) setPrice(toMajorString(plan.basePrice)); }}>
                <SelectTrigger aria-label={t("crmCompletion.offers.planLabel")}><SelectValue placeholder={t("renewFlow.sale.errors.choosePlan")} /></SelectTrigger>
                <SelectContent>{activePlans.map((plan) => <SelectItem key={plan.id} value={plan.id}><span dir="auto">{plan.name}</span> · {format.money(plan.basePrice)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <FieldGrid alignFrom="base" className="grid-cols-2">
              <Field label={t("crmCompletion.offers.priceLabel", { currency: isolateLtr(props.currency) })} required error={priceProblem}><Input inputMode="decimal" dir="ltr" value={price} aria-invalid={priceProblem ? true : undefined} onChange={(event) => setPrice(event.target.value)} /></Field>
              <Field label={t("crmCompletion.offers.expiryLabel")} hint={t("crmCompletion.offers.expiryHint")}><Input type="text" inputMode="numeric" dir="ltr" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)} /></Field>
            </FieldGrid>
          </DialogBody>
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
          <DialogFooter><Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("common.action.cancel")}</Button><Button type="button" loading={create.isPending} disabled={!planId || !priceRead.ok || parseOfferDays(expiresInDays) === undefined} onClick={() => create.mutate()}><Link2 /> {t("crmCompletion.offers.createLink")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OfferRow(props: OfferWorkPanelProps & { offer: Offer }) {
  const { t, locale, isolate, isolateLtr } = useLocale();
  const { session } = useApp();
  const format = useFormat();
  const invalidate = useInvalidate();
  const [origin, setOrigin] = useState("");
  /** How the link was last shared from here; "Confirm sent" records that channel, not a guess. */
  const [shareChannel, setShareChannel] = useState<"whatsapp" | "manual">("manual");
  const { offer } = props;
  const recipientLanguage = followUpHandoffDraft(
    { fullName: props.leadName },
    props.organizationName,
    session?.organization.defaultLanguage,
  ).language;
  const recipientT = createTranslator(recipientLanguage);
  const recipientFirstName = props.leadName.trim().split(/\s+/)[0] || props.leadName;
  const path = offer.publicToken ? `/offers/${offer.publicToken}` : undefined;
  const url = path && origin ? `${origin}${path}` : path;

  useEffect(() => setOrigin(window.location.origin), []);

  const confirmSent = useApiMutation((api) => api.markOfferDelivered(offer.id, { channel: shareChannel, reference: shareChannel === "whatsapp" ? "Branded public offer link · WhatsApp handoff" : "Branded public offer link · shared by hand" }), {
    onSuccess: async () => {
      toast.success(t("crmCompletion.offers.markedSent"));
      await invalidate([qk.lead(props.leadId)]);
    },
    onError: (cause) => toast.error(cause instanceof Error ? localizeApiError(cause, locale).message : t("crmCompletion.offers.markFailed")),
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setShareChannel("manual");
      toast.success(t("crmCompletion.offers.copied"));
    } catch {
      toast.error(t("crmCompletion.offers.copyFailed"));
    }
  };

  const variant = offer.status === "accepted" ? "success" : offer.status === "declined" || offer.status === "expired" ? "neutral" : offer.status === "sent" ? "warning" : "outline";
  return (
    <div className="border-t border-line py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-[12.5px] font-semibold" dir="auto">{offer.planName}</p><p className="mt-0.5 text-[12px] text-ink-3">{format.money(offer.price)}{offer.expiresAt ? <> · {t("crmCompletion.offers.ends", { date: format.dateTime(offer.expiresAt) })}</> : null}</p></div>
        <Badge variant={variant}>{Object.hasOwn(OFFER_STATUS_KEYS, offer.status) ? t(OFFER_STATUS_KEYS[offer.status]) : offer.status}</Badge>
      </div>
      {path ? <a href={path} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center text-[12px] font-medium underline underline-offset-4">{t("crmCompletion.offers.open")}</a> : <p className="mt-2 text-[12px] text-warning-deep">{t("crmCompletion.offers.oldOffer")}</p>}
      {path && offer.status === "draft" ? <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => void copy()}><Copy /> {t("crmCompletion.offers.copyLink")}</Button><WhatsAppHandoff subject="lead" subjectId={props.leadId} recipientName={props.leadName} phone={props.phone} organizationName={props.organizationName} defaultCountryCallingCode={props.defaultCountryCallingCode} initialMessage={recipientT("crmCompletion.offers.whatsappDraft", { name: recipientLanguage === "ar" ? isolate(recipientFirstName) : recipientFirstName, gym: recipientLanguage === "ar" ? isolate(props.organizationName) : props.organizationName, url: isolateLtr(url ?? "") })} buttonLabel={t("crmCompletion.offers.openWhatsApp")} className="" onLogged={() => setShareChannel("whatsapp")} /><Button type="button" size="sm" loading={confirmSent.isPending} onClick={() => confirmSent.mutate()}><Check /> {t(shareChannel === "whatsapp" ? "crmCompletion.offers.confirmSentViaWhatsApp" : "crmCompletion.offers.confirmSent")}</Button></div> : null}
      {offer.status === "sent" ? <p className="mt-3 flex items-center gap-1.5 text-[12px] text-warning-deep"><Clock3 className="size-3.5" /> {t("crmCompletion.offers.waiting")}</p> : null}
      {offer.status === "accepted" ? <p className="mt-3 text-[12px] font-medium text-success-deep">{t("crmCompletion.offers.acceptedDetail")}</p> : null}
      {offer.status === "declined" && offer.responseReason ? <p className="mt-3 text-[12px] text-ink-2" dir="auto">{t("crmCompletion.offers.reason", { reason: isolate(offer.responseReason) })}</p> : null}
    </div>
  );
}
