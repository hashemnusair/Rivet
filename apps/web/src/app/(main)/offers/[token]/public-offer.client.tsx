"use client";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { isolate } from "@/lib/i18n/bidi";
import { useT } from "@/lib/i18n/provider";

import { ArrowLeft, Check, Clock3, ShieldCheck, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { OfferOutcome, PublicOffer } from "@/lib/domain/types";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";

type ResponseMode = OfferOutcome | undefined;

export default function PublicOfferClient({ token }: { token: string }) {
  const t = useT();
  const { locale } = useLocale();
  const f = useFormat();
  const offerQuery = useApiQuery(qk.publicOffer(token), (api) => api.getPublicOffer(token), {
    retry: false,
    refetchInterval: (query) => query.state.data?.status === "preparing" ? 3_000 : false,
  });
  const [response, setResponse] = useState<PublicOffer>();
  const [mode, setMode] = useState<ResponseMode>();
  const [reason, setReason] = useState("");
  const offer = response?.token === token ? response : offerQuery.data;

  const respond = useApiMutation(
    (api, outcome: OfferOutcome) => api.respondToPublicOffer(token, { outcome, reason: reason.trim() || undefined }),
    {
      onSuccess: (updated) => {
        setResponse(updated);
        setMode(undefined);
        setReason("");
      },
    },
  );

  if (offerQuery.isLoading) return <OfferFrame><div className="mx-auto w-full max-w-xl space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-72 w-full" /></div></OfferFrame>;
  if (offerQuery.isError && !(isApiError(offerQuery.error) && offerQuery.error.code === "NOT_FOUND") && !offer) return <OfferFrame><div className="mx-auto max-w-2xl"><ErrorState title={t("customerPortal.offerLoadFailed")} description={t("customerPortal.offerUnchanged")} onRetry={() => offerQuery.refetch()} /></div></OfferFrame>;
  if (!offer) return <OfferFrame><StatusCard icon={X} context={t("customerPortal.offerUnavailable")} title={t("customerPortal.offerLinkInvalid")} description={t("customerPortal.offerLinkHint")} /></OfferFrame>;

  const brandStyle = {
    "--offer-primary": offer.brand.tokens.primary,
    "--offer-primary-foreground": offer.brand.tokens.primaryForeground,
    "--offer-primary-soft": offer.brand.tokens.primarySoft,
  } as CSSProperties;

  return (
    <OfferFrame>
      {offerQuery.isBackgroundError ? <div className="mx-auto mb-4 max-w-2xl"><ErrorState layout="inline" title={t("customerPortal.offerRefreshFailed")} onRetry={() => offerQuery.refetch()} /></div> : null}
      <article className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-surface" style={brandStyle}>
        <header className="border-b border-line bg-surface px-6 py-6 text-ink sm:px-9">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-medium opacity-75">{t("customerPortal.membershipOffer")}</p>
              <h1 className="mt-2 break-words text-[26px] font-semibold tracking-tight">{offer.organizationName}</h1>
            </div>
            {offer.brand.logoUrl ? <Image src={offer.brand.logoUrl} alt={offer.brand.logoAltText ?? t("customerPortal.offerLogo", { gym: locale === "ar" ? isolate(offer.organizationName) : offer.organizationName })} width={56} height={56} className="size-14 rounded-md border border-current/20 bg-white object-contain p-1" /> : <span className="flex size-14 items-center justify-center rounded-md border border-current/25 font-mono text-[11px] font-semibold uppercase">{offer.organizationName.slice(0, 3)}</span>}
          </div>
        </header>

        <div className="px-6 py-7 sm:px-9 sm:py-9">
          {offer.status === "preparing" ? <StatusCard icon={Clock3} context={t("customerPortal.almostReady")} title={t("customerPortal.offerPreparing", { name: locale === "ar" ? isolate(offer.recipientName) : offer.recipientName })} description={t("customerPortal.offerPreparingHint")} compact /> : null}
          {offer.status === "expired" ? <StatusCard icon={Clock3} context={t("customerPortal.offerExpired")} title={t("customerPortal.offerNoLongerActive")} description={t("customerPortal.offerAskNew", { gym: locale === "ar" ? isolate(offer.organizationName) : offer.organizationName })} compact /> : null}
          {offer.status === "accepted" ? <StatusCard icon={Check} context={t("customerPortal.responseRecorded")} title={t("customerPortal.offerAccepted")} description={t("customerPortal.offerAcceptedHint", { gym: locale === "ar" ? isolate(offer.organizationName) : offer.organizationName })} compact /> : null}
          {offer.status === "declined" ? <StatusCard icon={X} context={t("customerPortal.responseRecorded")} title={t("customerPortal.offerDeclined")} description={t("customerPortal.offerDeclinedHint", { gym: locale === "ar" ? isolate(offer.organizationName) : offer.organizationName })} compact /> : null}

          {offer.status === "available" ? (
            <>
              <p className="text-[14px] text-ink-2">{t("customerPortal.preparedFor")}{" "}<span className="font-semibold text-ink">{offer.recipientName}</span></p>
              <div className="mt-6 border-y border-line py-6">
                <p className="context-label">{t("memberProfile.followUp.membershipFallback")}</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="break-words text-[26px] font-semibold tracking-tight">{offer.planName}</h2>
                  <p className="text-[22px] font-semibold tabular">{f.money(offer.price)}</p>
                </div>
                {offer.expiresAt ? <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ink-3"><Clock3 className="size-3.5" /> {" "}{t("customerPortal.respondBy")}{" "}{f.dateTime(offer.expiresAt)}</p> : null}
              </div>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Button type="button" className="bg-[var(--offer-primary)] text-[var(--offer-primary-foreground)] hover:opacity-90" onClick={() => setMode("accepted")}><Check /> {" "}{t("customerPortal.acceptOffer")}</Button>
                <Button type="button" variant="secondary" onClick={() => setMode("declined")}><X /> {" "}{t("customerPortal.declineOffer")}</Button>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> {" "}{t("customerPortal.acceptanceHint")}</p>
            </>
          ) : null}
        </div>
      </article>

      <Dialog open={Boolean(mode)} onOpenChange={(open) => { if (!open) setMode(undefined); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "accepted" ? t("customerPortal.acceptOfferTitle") : t("customerPortal.declineOfferTitle")}</DialogTitle>
            <DialogDescription>{mode === "accepted" ? t("customerPortal.acceptConfirmHint", { gym: locale === "ar" ? isolate(offer.organizationName) : offer.organizationName }) : t("customerPortal.declineConfirmHint", { gym: locale === "ar" ? isolate(offer.organizationName) : offer.organizationName })}</DialogDescription>
          </DialogHeader>
          {mode === "declined" ? <DialogBody><label className="grid gap-2 text-[12.5px] font-medium">{t("customerPortal.optionalNote")}<Textarea dir="auto" rows={3} value={reason} onChange={(event) => setReason(event.target.value.slice(0, 240))} placeholder={t("customerPortal.offerReasonPlaceholder")} /></label></DialogBody> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setMode(undefined)}>{t("common.action.goBack")}</Button>
            <Button type="button" loading={respond.isPending} onClick={() => mode && respond.mutate(mode)}>{mode === "accepted" ? <><Check /> {" "}{t("customerPortal.confirmAcceptance")}</> : <><X /> {" "}{t("customerPortal.confirmDecline")}</>}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OfferFrame>
  );
}

function OfferFrame({ children }: { children: React.ReactNode }) {
  const t = useT();
  return <main className="min-h-screen bg-paper px-5 py-8 sm:px-8 sm:py-12"><div className="mx-auto mb-6 flex max-w-2xl items-center justify-between"><Link href="/" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-3.5 rtl:rotate-180" />{" "}{t("common.brand.name")}</Link><span className="text-[12px] font-medium text-ink-4">{t("customerPortal.securePage")}</span></div>{children}<p className="mx-auto mt-6 max-w-2xl text-center text-[12px] text-ink-4">{t("customerPortal.poweredBy")}</p></main>;
}

function StatusCard({ icon: Icon, context, title, description, compact = false }: { icon: typeof Check; context: string; title: string; description: string; compact?: boolean }) {
  const Heading = compact ? "h2" : "h1";
  return <section className={compact ? "py-3" : "mx-auto max-w-xl rounded-lg border border-line bg-surface p-7 sm:p-9"}><span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink"><Icon className="size-5" /></span><p className="context-label mt-5">{context}</p><Heading className="mt-2 text-[20px] font-semibold tracking-tight">{title}</Heading><p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">{description}</p></section>;
}
