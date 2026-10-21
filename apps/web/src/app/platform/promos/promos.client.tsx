"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Pause, Pencil, Play, Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { InvoiceStatusBadge } from "@/components/platform/platform-status";
import { formatPublicJod } from "@/components/public/public-plan-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { QueryErrorState, StatePanel } from "@/components/ui/states";
import { Checkbox, Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePromoDescription } from "@/features/billing/promo-description";
import type { CreatePromoCodeInput, PlatformBillingInvoice, PlatformCommerceView, PlatformPromoCode, PlatformSaasPlan, PromoTarget } from "@/lib/api/GymOSApi";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { readMoneyInput, toMajorString, money } from "@/lib/utils/money";
import { latinDigits } from "@/lib/utils/text";
import { PROMO_TARGETS, normalizePromoCode, validPromoCodeShape } from "../../../../convex/firstPayment";

const PLANS: Array<PlatformSaasPlan["name"]> = ["Basic", "Pro"];
const STATE_VARIANT = { active: "success", paused: "neutral", expired: "outline", used_up: "warning" } as const;

function wholeNumber(raw: string): number | undefined {
  const value = latinDigits(raw.trim());
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Platform console → Promos: the free website offer (and the gyms holding its
 * places) and the promo codes gyms can enter when they apply. Every change
 * asks for a reason and lands in the platform audit trail.
 */
export function PlatformPromos() {
  const { t } = useLocale();
  const query = useApiQuery(qk.platformCommerce, (api) => api.getPlatformCommerce());
  if (query.isLoading) {
    return <PlatformPage><div className="space-y-3" role="status" aria-label={t("commerce.promos.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div></PlatformPage>;
  }
  if (query.isError || !query.data) {
    return <PlatformPage><QueryErrorState error={query.error} onRetry={() => void query.refetch()} /></PlatformPage>;
  }
  return (
    <PlatformPage>
      <PageHeader title={t("commerce.promos.title")} description={t("commerce.promos.description")} />
      <div className="mt-6 grid gap-6">
        <WebsiteOfferPanel view={query.data} />
        <PromoCodesPanel view={query.data} />
      </div>
    </PlatformPage>
  );
}

function useCommerceCache() {
  const queryClient = useQueryClient();
  return (view: PlatformCommerceView) => {
    queryClient.setQueryData(qk.platformCommerce, view);
  };
}

function WebsiteOfferPanel({ view }: { view: PlatformCommerceView }) {
  const { t, locale, isolateLtr } = useLocale();
  const f = useFormat();
  const [editing, setEditing] = useState(false);
  const offer = view.websiteOffer;
  return (
    <PlatformPanel aria-labelledby="website-offer-heading">
      <PlatformPanelHeader
        id="website-offer-heading"
        title={t("commerce.promos.website.title")}
        description={t("commerce.promos.website.description")}
        actions={<Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden />{t("commerce.promos.website.edit")}</Button>}
      />
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[18rem_1fr]">
        <dl className="grid content-start gap-3 text-[13.5px]">
          <div className="flex items-center gap-2">
            <Badge variant={offer.enabled ? "success" : "neutral"} dot>{offer.enabled ? t("commerce.promos.website.on") : t("commerce.promos.website.off")}</Badge>
          </div>
          <div>
            <dt className="sr-only">{t("commerce.promos.website.places")}</dt>
            <dd className="font-medium">{t("commerce.promos.website.claimed", { claimed: f.number(offer.claimed), places: f.number(offer.places) })}</dd>
            <div className="mt-2 flex gap-1" aria-hidden>
              {Array.from({ length: offer.places }, (_, index) => (
                <span key={index} className={index < offer.claimed ? "h-2 flex-1 rounded-[2px] bg-ink" : "h-2 flex-1 rounded-[2px] border border-line-3"} />
              ))}
            </div>
          </div>
          <div>
            <dt className="text-[12px] text-ink-3">{t("commerce.promos.website.price")}</dt>
            <dd className="tabular mt-0.5 font-medium">{isolateLtr(formatPublicJod(offer.priceMinor, f, locale))}</dd>
          </div>
        </dl>
        <div>
          <h3 className="text-[13px] font-semibold text-ink-2">{t("commerce.promos.website.holders")}</h3>
          {offer.holders.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-3">{t("commerce.promos.website.empty")}</p>
          ) : (
            <ol className="mt-2 divide-y divide-line rounded-md border border-line">
              {offer.holders.map((holder) => (
                <li key={holder.invoiceId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px]">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="tabular text-ink-3">{t("commerce.promos.website.place", { place: f.number(holder.place) })}</span>
                    <span className="truncate font-medium" dir="auto">{holder.gym}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-[11.5px] text-ink-3" dir="ltr">{holder.invoiceId}</span>
                    <InvoiceStatusBadge status={holder.status as PlatformBillingInvoice["status"]} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {editing ? <WebsiteOfferDialog view={view} onClose={() => setEditing(false)} /> : null}
    </PlatformPanel>
  );
}

function WebsiteOfferDialog({ view, onClose }: { view: PlatformCommerceView; onClose: () => void }) {
  const { t } = useLocale();
  const cache = useCommerceCache();
  const offer = view.websiteOffer;
  const [enabled, setEnabled] = useState(offer.enabled);
  const [places, setPlaces] = useState(String(offer.places));
  const [price, setPrice] = useState(toMajorString(money(offer.priceMinor, "JOD")));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ places?: string; price?: string; reason?: string }>({});
  const mutation = useApiMutation((api, input: { enabled: boolean; places: number; priceMinor: number; reason: string }) => api.updateWebsiteOffer(input), {
    successMessage: t("commerce.promos.website.saved"),
    onSuccess: (next) => {
      cache(next);
      onClose();
    },
  });
  const submit = () => {
    const parsedPlaces = wholeNumber(places);
    const parsedPrice = readMoneyInput(price, "JOD");
    const next: typeof errors = {};
    if (parsedPlaces === undefined || parsedPlaces > 3) next.places = t("commerce.promos.form.errors.maxUses");
    if (!parsedPrice.ok) next.price = parsedPrice.message;
    if (reason.trim().length < 3) next.reason = t("commerce.promos.website.reason");
    setErrors(next);
    if (Object.keys(next).length > 0 || parsedPlaces === undefined || !parsedPrice.ok) return;
    mutation.mutate({ enabled, places: parsedPlaces, priceMinor: parsedPrice.money.amount, reason: reason.trim() });
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("commerce.promos.website.title")}</DialogTitle>
          <DialogDescription>{t("commerce.promos.website.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <label className="flex items-center justify-between gap-3 text-[13.5px] font-medium">
            {t("commerce.promos.website.enabled")}
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("commerce.promos.website.enabled")} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("commerce.promos.website.places")} error={errors.places} required>
              <Input inputMode="numeric" value={places} onChange={(event) => setPlaces(event.target.value)} dir="ltr" />
            </Field>
            <Field label={t("commerce.promos.website.priceField")} error={errors.price} required>
              <Input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} dir="ltr" />
            </Field>
          </div>
          <Field label={t("commerce.promos.website.reason")} error={errors.reason} required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button onClick={submit} loading={mutation.isPending} disabled={!reason.trim()}>{t("commerce.promos.website.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PromoCodesPanel({ view }: { view: PlatformCommerceView }) {
  const { t, isolateLtr } = useLocale();
  const f = useFormat();
  const describe = usePromoDescription();
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<PlatformPromoCode>();
  return (
    <PlatformPanel aria-labelledby="promo-codes-heading">
      <PlatformPanelHeader
        id="promo-codes-heading"
        title={t("commerce.promos.codes.title")}
        description={t("commerce.promos.codes.description")}
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus aria-hidden />{t("commerce.promos.codes.create")}</Button>}
      />
      {view.promoCodes.length === 0 ? (
        <StatePanel compact title={t("commerce.promos.codes.empty")} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("commerce.promos.codes.code")}</TableHead>
                <TableHead>{t("commerce.promos.codes.discount")}</TableHead>
                <TableHead>{t("commerce.promos.codes.plans")}</TableHead>
                <TableHead>{t("commerce.promos.codes.uses")}</TableHead>
                <TableHead>{t("commerce.promos.codes.expires")}</TableHead>
                <TableHead>{t("commerce.promos.codes.status")}</TableHead>
                <TableHead className="text-end">{t("commerce.promos.codes.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.promoCodes.map((promo) => (
                <TableRow key={promo.id}>
                  <TableCell>
                    <span className="font-mono text-[12.5px] font-semibold" dir="ltr">{promo.code}</span>
                    {promo.note ? <span className="mt-0.5 block text-[12px] text-ink-3" dir="auto">{promo.note}</span> : null}
                  </TableCell>
                  <TableCell className="text-[13px]">{describe(promo)}</TableCell>
                  <TableCell className="text-[13px]">{promo.plans.length ? isolateLtr(promo.plans.join(", ")) : t("commerce.promos.codes.allPlans")}</TableCell>
                  <TableCell className="tabular text-[13px]">{promo.maxRedemptions !== undefined ? t("commerce.promos.codes.usesOf", { uses: f.number(promo.uses), max: f.number(promo.maxRedemptions) }) : f.number(promo.uses)}</TableCell>
                  <TableCell className="text-[13px]">{promo.expiresOn ? f.date(promo.expiresOn) : t("commerce.promos.codes.noEnd")}</TableCell>
                  <TableCell><Badge variant={STATE_VARIANT[promo.state]}>{t(`commerce.promos.codes.state.${promo.state}`)}</Badge></TableCell>
                  <TableCell className="text-end">
                    <Button variant="ghost" size="sm" onClick={() => setToggling(promo)}>
                      {promo.active ? <><Pause aria-hidden />{t("commerce.promos.codes.pause")}</> : <><Play aria-hidden />{t("commerce.promos.codes.resume")}</>}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {creating ? <CreatePromoDialog onClose={() => setCreating(false)} /> : null}
      {toggling ? <TogglePromoDialog promo={toggling} onClose={() => setToggling(undefined)} /> : null}
    </PlatformPanel>
  );
}

type CreateErrors = Partial<Record<"code" | "discount" | "maxUses" | "reason", string>>;

function CreatePromoDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const cache = useCommerceCache();
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<PromoTarget>("subscription");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [plans, setPlans] = useState<Array<PlatformSaasPlan["name"]>>([]);
  const [maxUses, setMaxUses] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<CreateErrors>({});
  const mutation = useApiMutation((api, input: CreatePromoCodeInput) => api.createPromoCode(input), {
    successMessage: t("commerce.promos.form.created"),
    onSuccess: (next) => {
      cache(next);
      onClose();
    },
    onError: (error) => {
      const fields = isApiError(error) ? error.sourceFieldErrors : undefined;
      if (fields?.code) setErrors((current) => ({ ...current, code: fields.code?.[0] === "Taken" ? t("commerce.promos.form.errors.taken") : t("commerce.promos.form.errors.code") }));
      if (fields?.discount) setErrors((current) => ({ ...current, discount: t("commerce.promos.form.errors.discount") }));
    },
  });
  const submit = () => {
    const normalized = normalizePromoCode(code);
    const next: CreateErrors = {};
    if (!validPromoCodeShape(normalized)) next.code = t("commerce.promos.form.errors.code");
    let percentOff: number | undefined;
    let amountOffMinor: number | undefined;
    if (kind === "percent") {
      percentOff = wholeNumber(value);
      if (percentOff === undefined || percentOff < 1 || percentOff > 100) next.discount = t("commerce.promos.form.errors.discount");
    } else {
      const parsed = readMoneyInput(value, "JOD");
      if (parsed.ok && parsed.money.amount > 0) amountOffMinor = parsed.money.amount;
      else next.discount = t("commerce.promos.form.errors.discount");
    }
    const parsedMax = maxUses.trim() ? wholeNumber(maxUses) : undefined;
    if (maxUses.trim() && (parsedMax === undefined || parsedMax < 1)) next.maxUses = t("commerce.promos.form.errors.maxUses");
    if (reason.trim().length < 3) next.reason = t("commerce.promos.form.reason");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    mutation.mutate({
      code: normalized,
      note: note.trim(),
      target,
      ...(percentOff !== undefined ? { percentOff } : { amountOffMinor }),
      plans,
      ...(parsedMax !== undefined ? { maxRedemptions: parsedMax } : {}),
      ...(expiresOn ? { expiresOn } : {}),
      reason: reason.trim(),
    });
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("commerce.promos.form.title")}</DialogTitle>
          <DialogDescription>{t("commerce.promos.form.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label={t("commerce.promos.form.code")} hint={t("commerce.promos.form.codeHint")} error={errors.code} required>
            <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} dir="ltr" autoComplete="off" maxLength={24} className="font-mono uppercase" />
          </Field>
          <Field label={t("commerce.promos.form.target")} required>
            <RadioGroup value={target} onValueChange={(next) => setTarget(next as PromoTarget)} aria-label={t("commerce.promos.form.target")} className="grid-cols-2">
              {PROMO_TARGETS.map((item) => (
                <RadioCard key={item} value={item} className="text-[13px]">{t(`commerce.promos.form.targets.${item}`)}</RadioCard>
              ))}
            </RadioGroup>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("commerce.promos.form.kind")} required>
              <RadioGroup value={kind} onValueChange={(next) => setKind(next as "percent" | "amount")} aria-label={t("commerce.promos.form.kind")} className="grid-cols-2">
                <RadioCard value="percent" className="text-[13px]">{t("commerce.promos.form.percent")}</RadioCard>
                <RadioCard value="amount" className="text-[13px]">{t("commerce.promos.form.amount")}</RadioCard>
              </RadioGroup>
            </Field>
            <Field label={kind === "percent" ? t("commerce.promos.form.percentValue") : t("commerce.promos.form.amountValue")} error={errors.discount} required>
              <Input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} dir="ltr" />
            </Field>
          </div>
          <fieldset>
            <legend className="text-[13px] font-medium text-ink">{t("commerce.promos.form.plans")}</legend>
            <p className="mt-0.5 text-[12px] text-ink-3">{t("commerce.promos.form.plansHint")}</p>
            <div className="mt-2 flex flex-wrap gap-4">
              {PLANS.map((plan) => (
                <label key={plan} className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={plans.includes(plan)} onCheckedChange={(checked) => setPlans((current) => checked === true ? [...current, plan] : current.filter((item) => item !== plan))} />
                  <span dir="ltr">{plan}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("commerce.promos.form.maxUses")} error={errors.maxUses}>
              <Input inputMode="numeric" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} dir="ltr" />
            </Field>
            <Field label={t("commerce.promos.form.expiresOn")}>
              <Input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
            </Field>
          </div>
          <Field label={t("commerce.promos.form.note")}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} dir="auto" />
          </Field>
          <Field label={t("commerce.promos.form.reason")} error={errors.reason} required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button onClick={submit} loading={mutation.isPending} disabled={!reason.trim()}>{t("commerce.promos.form.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TogglePromoDialog({ promo, onClose }: { promo: PlatformPromoCode; onClose: () => void }) {
  const { t, isolateLtr } = useLocale();
  const cache = useCommerceCache();
  const [reason, setReason] = useState("");
  const mutation = useApiMutation((api, input: { promoId: string; active: boolean; reason: string }) => api.setPromoCodeActive(input), {
    successMessage: t("commerce.promos.codes.updated"),
    onSuccess: (next) => {
      cache(next);
      onClose();
    },
  });
  const title = promo.active ? t("commerce.promos.codes.pauseTitle", { code: isolateLtr(promo.code) }) : t("commerce.promos.codes.resumeTitle", { code: isolateLtr(promo.code) });
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("commerce.promos.codes.toggleBody")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t("commerce.promos.codes.reason")} required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button onClick={() => mutation.mutate({ promoId: promo.id, active: !promo.active, reason: reason.trim() })} loading={mutation.isPending} disabled={reason.trim().length < 3}>
            {promo.active ? t("commerce.promos.codes.pause") : t("commerce.promos.codes.resume")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
