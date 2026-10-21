"use client";

import { ArrowLeft, AtSign, CalendarClock, Check, CircleAlert, Copy, ExternalLink, Facebook, Instagram, MessageCircle, Pencil, Phone, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { ActivityEntry } from "@/components/shared/activity-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TechnicalLabel } from "@/components/ui/typography";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale, useT, type TFunction } from "@/lib/i18n/provider";
import {
  PROSPECT_DRAFT_STATUSES,
  PROSPECT_STAGES,
  followUpState,
  instagramHandle,
  isValidCalendarDate,
  linkHost,
  nextProspectStage,
  phoneHref,
  whatsappHref,
  type PlatformProspect,
  type PlatformProspectHistoryEntry,
  type PlatformProspectOwner,
  type ProspectChange,
  type ProspectChanges,
  type ProspectDraftStatus,
  type ProspectStage,
} from "@/lib/platform/prospects";
import { cn } from "@/lib/utils/cn";
import { BATCH_KEYS, DRAFT_STATUS_COPY, EVIDENCE_COPY, FIELD_KEYS, NEXT_STEP_KEYS, PROSPECT_TABS, SHORT_VALUE_FIELDS, STAGE_COPY, TAB_KEYS, type ProspectTab } from "./prospect-copy";
import { ProspectFormDialog } from "./prospect-form-dialog";
import { useProspectUpdate } from "./use-prospects";

const PLATFORM_TIMEZONE = "Asia/Amman";
const NO_OWNER = "none";
/** Arabic messages read in Plex Sans Arabic even when the console is in English. */
const ARABIC_TEXT: CSSProperties = { fontFamily: "var(--font-plex-arabic), var(--font-sans)" };

type Save = (changes: ProspectChanges, options?: { quiet?: boolean; onDone?: () => void }) => void;

/**
 * One gym, split into a few tabs so each part fits on screen without
 * scrolling. Every tab stays mounted (only hidden), so an unsaved note or a
 * half-edited message survives a look at another tab.
 */
export function ProspectDetail({ prospect, owners, today, tab, onTabChange, onBack }: { prospect: PlatformProspect; owners: PlatformProspectOwner[]; today: string; tab: ProspectTab; onTabChange: (tab: ProspectTab) => void; onBack: () => void }) {
  const t = useT();
  const update = useProspectUpdate();
  const [editing, setEditing] = useState(false);
  const next = nextProspectStage(prospect.stage);
  const save: Save = (changes, options) => update.mutate({ prospectId: prospect.id, changes }, {
    onSuccess: () => {
      if (!options?.quiet) toast.success(t("platformConsole.prospects.saved"));
      options?.onDone?.();
    },
  });
  const panelClass = "mt-0 min-h-0 flex-1 px-4 py-5 @container sm:px-5 lg:overflow-y-auto";

  return (
    <article className="flex min-w-0 flex-col lg:h-full" aria-labelledby={`prospect-${prospect.id}-name`} data-testid="prospect-detail">
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <Button variant="ghost" size="sm" className="-ms-2 mb-2 lg:hidden" onClick={onBack}><ArrowLeft className="rtl:rotate-180" />{t("platformConsole.prospects.backToList")}</Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 id={`prospect-${prospect.id}-name`} dir="auto" className="text-[20px] font-semibold leading-snug tracking-tight">{prospect.gymName}</h2>
              <Badge variant="outline">{t(BATCH_KEYS[prospect.batch])}</Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
              <TechnicalLabel as="span">{prospect.code}</TechnicalLabel>
              {prospect.area ? <><span className="text-ink-4" aria-hidden>·</span><span dir="auto">{prospect.area}</span></> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil />{t("platformConsole.prospects.detail.editDetails")}</Button>
            {next ? <Button size="sm" onClick={() => save({ stage: next })} disabled={update.isPending} data-testid="prospect-next-step"><Check />{t(NEXT_STEP_KEYS[next]!)}</Button> : null}
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as ProspectTab)} className="mt-3 flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={t("platformConsole.prospects.detail.sections")} className="shrink-0 border-line px-2 sm:px-1">
          {PROSPECT_TABS.map((value) => <TabsTrigger key={value} value={value}>{t(TAB_KEYS[value])}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="progress" forceMount hidden={tab !== "progress"} className={panelClass}>
          <ProgressSection prospect={prospect} owners={owners} today={today} save={save} pending={update.isPending} />
        </TabsContent>
        <TabsContent value="contact" forceMount hidden={tab !== "contact"} className={panelClass}>
          <ContactSection prospect={prospect} />
        </TabsContent>
        <TabsContent value="messages" forceMount hidden={tab !== "messages"} className={panelClass}>
          <MessagesSection prospect={prospect} save={save} pending={update.isPending} />
        </TabsContent>
        <TabsContent value="history" forceMount hidden={tab !== "history"} className={panelClass}>
          <HistorySection prospectId={prospect.id} />
        </TabsContent>
      </Tabs>

      <ProspectFormDialog open={editing} onOpenChange={setEditing} prospect={prospect} />
    </article>
  );
}

function ProgressSection({ prospect, owners, today, save, pending }: { prospect: PlatformProspect; owners: PlatformProspectOwner[]; today: string; save: Save; pending: boolean }) {
  const t = useT();
  const [nextAction, setNextAction] = useState(prospect.nextAction);
  const [notes, setNotes] = useState(prospect.notes);
  useEffect(() => { setNextAction(prospect.nextAction); }, [prospect.nextAction]);
  useEffect(() => { setNotes(prospect.notes); }, [prospect.notes]);
  const textChanges: ProspectChanges = {
    ...(nextAction.trim() !== prospect.nextAction ? { nextAction } : {}),
    ...(notes.trim() !== prospect.notes ? { notes } : {}),
  };
  const textDirty = Object.keys(textChanges).length > 0;
  // Someone who has left the RIVET team stays selectable on their own gyms.
  const ownerOptions = prospect.owner && !owners.some((owner) => owner.id === prospect.owner?.id) ? [...owners, prospect.owner] : owners;
  const id = `prospect-${prospect.id}`;

  return (
    <div className="max-w-3xl">
      <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Field label={t("platformConsole.prospects.field.stage")} htmlFor={`${id}-stage`}>
          <Select value={prospect.stage} onValueChange={(value) => save({ stage: value as ProspectStage })} disabled={pending}>
            <SelectTrigger id={`${id}-stage`}><SelectValue /></SelectTrigger>
            <SelectContent>{PROSPECT_STAGES.map((stage) => <SelectItem key={stage} value={stage}>{t(STAGE_COPY[stage].labelKey)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t("platformConsole.prospects.field.ownerId")} htmlFor={`${id}-owner`}>
          <Select value={prospect.owner?.id ?? NO_OWNER} onValueChange={(value) => save({ ownerId: value === NO_OWNER ? "" : value })} disabled={pending}>
            <SelectTrigger id={`${id}-owner`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_OWNER}>{t("platformConsole.prospects.row.noOwner")}</SelectItem>
              {ownerOptions.map((owner) => <SelectItem key={owner.id} value={owner.id}>{owner.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <FollowUpField id={`${id}-follow-up`} value={prospect.followUpOn} today={today} disabled={pending} onSave={(followUpOn) => save({ followUpOn })} />
      </div>
      <div className="mt-5 grid gap-4">
        <Field label={t("platformConsole.prospects.field.nextAction")}>
          <Input id={`${id}-next-action`} dir="auto" value={nextAction} maxLength={200} onChange={(event) => setNextAction(event.target.value)} placeholder={t("platformConsole.prospects.detail.nextActionPlaceholder")} />
        </Field>
        <Field label={t("platformConsole.prospects.field.notes")}>
          <Textarea id={`${id}-notes`} dir="auto" value={notes} maxLength={2000} className="min-h-32" onChange={(event) => setNotes(event.target.value)} placeholder={t("platformConsole.prospects.detail.notesPlaceholder")} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="secondary" size="sm" disabled={!textDirty || pending} onClick={() => save(textChanges)}>
          {textDirty ? t("platformConsole.prospects.detail.saveNotes") : t("platformConsole.prospects.detail.notesSaved")}
        </Button>
      </div>
    </div>
  );
}

/**
 * A date field saves on its own once it holds a whole date. Typing a year
 * passes through dates like 0002-10-20, so it waits for a short pause and a
 * plausible year before saving, and never sends the same date twice.
 */
function FollowUpField({ id, value, today, disabled, onSave }: { id: string; value: string; today: string; disabled: boolean; onSave: (value: string) => void }) {
  const t = useT();
  const f = useFormat(PLATFORM_TIMEZONE);
  const [draft, setDraft] = useState(value);
  const sent = useRef(value);
  const save = useRef(onSave);
  useEffect(() => { save.current = onSave; }, [onSave]);
  useEffect(() => { setDraft(value); sent.current = value; }, [value]);
  useEffect(() => {
    if (draft === value || draft === sent.current) return;
    if (draft && !(isValidCalendarDate(draft) && draft >= "2020-01-01" && draft <= "2100-12-31")) return;
    const timer = window.setTimeout(() => { sent.current = draft; save.current(draft); }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, value]);
  const state = followUpState(value, today);
  return (
    <Field label={t("platformConsole.prospects.field.followUpOn")} htmlFor={id}>
      <div className="flex items-center gap-1">
        <Input id={id} type="date" dir="ltr" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} className={cn(state === "overdue" && "border-danger/50 text-danger")} />
        {draft ? <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={() => setDraft("")} aria-label={t("platformConsole.prospects.detail.clearFollowUp")}><X /></Button> : null}
      </div>
      {state === "overdue" ? <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-danger"><CalendarClock className="size-3.5" aria-hidden />{t("platformConsole.prospects.row.followUpOverdue", { date: f.date(value) })}</p> : null}
    </Field>
  );
}

function MessagesSection({ prospect, save, pending }: { prospect: PlatformProspect; save: Save; pending: boolean }) {
  const t = useT();
  const [askSent, setAskSent] = useState(false);
  const id = `prospect-${prospect.id}`;
  const approved = prospect.draftStatus === "approved" || prospect.draftStatus === "sent";
  const markSent = () => save({ draftStatus: "sent", ...(prospect.stage === "not_contacted" ? { stage: "contacted" as const } : {}) }, { onDone: () => setAskSent(false) });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[12.5px] text-ink-3">{t("platformConsole.prospects.detail.messagesHint")}</p>
        <div className="flex items-center gap-2">
          <label htmlFor={`${id}-draft-status`} className="text-[12.5px] text-ink-3">{t("platformConsole.prospects.field.draftStatus")}</label>
          <Select value={prospect.draftStatus} onValueChange={(value) => save({ draftStatus: value as ProspectDraftStatus })} disabled={pending}>
            <SelectTrigger id={`${id}-draft-status`} sizeVariant="sm" className="w-auto min-w-[148px]"><SelectValue /></SelectTrigger>
            <SelectContent>{PROSPECT_DRAFT_STATUSES.map((status) => <SelectItem key={status} value={status}>{t(DRAFT_STATUS_COPY[status].labelKey)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 grid gap-5 @2xl:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <MessageBlock
            label={t("platformConsole.prospects.field.openingMessage")}
            text={prospect.openingMessage}
            lang="ar"
            pending={pending}
            onSave={(openingMessage, done) => save({ openingMessage }, { onDone: done })}
            testId="prospect-opening-message"
            actions={prospect.openingMessage ? (
              <>
                <CopyButton text={prospect.openingMessage} />
                {prospect.whatsapp ? (
                  <Button asChild variant="secondary" size="sm">
                    <a href={whatsappHref(prospect.whatsapp, prospect.openingMessage)} target="_blank" rel="noopener noreferrer" onClick={() => setAskSent(true)} data-testid="prospect-whatsapp-link">
                      <MessageCircle />{t("platformConsole.prospects.detail.sendWhatsApp")}<ExternalLink className="text-ink-3" aria-hidden />
                    </a>
                  </Button>
                ) : null}
                {!approved ? <span className="flex items-center gap-1 text-[12.5px] text-warning-deep"><CircleAlert className="size-3.5 shrink-0" aria-hidden />{t("platformConsole.prospects.detail.notApproved")}</span> : null}
              </>
            ) : null}
          />
          {askSent && prospect.draftStatus !== "sent" ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-sunken/60 px-3.5 py-2.5 text-[13px]" role="status">
              <span className="font-medium">{t("platformConsole.prospects.detail.sentPrompt")}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAskSent(false)}>{t("platformConsole.prospects.detail.notYet")}</Button>
                <Button size="sm" onClick={markSent} loading={pending}>{t("platformConsole.prospects.detail.markSent")}</Button>
              </span>
            </div>
          ) : null}
        </div>
        <MessageBlock
          label={t("platformConsole.prospects.field.proposalMessage")}
          text={prospect.proposalMessage}
          lang="ar"
          pending={pending}
          onSave={(proposalMessage, done) => save({ proposalMessage }, { onDone: done })}
          actions={prospect.proposalMessage ? <CopyButton text={prospect.proposalMessage} /> : null}
        />
      </div>
      <div className="mt-5">
        <MessageBlock
          label={t("platformConsole.prospects.field.draftNotes")}
          text={prospect.draftNotes}
          pending={pending}
          onSave={(draftNotes, done) => save({ draftNotes }, { onDone: done })}
        />
      </div>
    </div>
  );
}

function MessageBlock({ label, text, lang, pending, onSave, actions, testId }: { label: string; text: string; lang?: "ar"; pending: boolean; onSave: (text: string, done: () => void) => void; actions?: ReactNode; testId?: string }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const arabic = lang === "ar";
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink-2">{label}</h3>
        {!editing ? <Button variant="ghost" size="xs" onClick={() => { setDraft(text); setEditing(true); }} aria-label={`${t("common.action.edit")}: ${label}`}><Pencil />{t("common.action.edit")}</Button> : null}
      </div>
      {editing ? (
        <div>
          <Textarea
            dir={arabic ? "rtl" : "auto"}
            lang={lang}
            style={arabic ? ARABIC_TEXT : undefined}
            className={cn("min-h-40", arabic && "text-[15px] leading-7")}
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={label}
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>{t("common.action.cancel")}</Button>
            <Button size="sm" loading={pending} disabled={draft.trim() === text} onClick={() => onSave(draft, () => setEditing(false))}>{t("common.action.save")}</Button>
          </div>
        </div>
      ) : text ? (
        <p
          dir={arabic ? "rtl" : "auto"}
          lang={lang}
          style={arabic ? ARABIC_TEXT : undefined}
          className={cn("whitespace-pre-wrap rounded-md border border-line px-4 py-3", arabic ? "bg-sunken/40 text-[15px] leading-7 text-ink" : "text-[13px] leading-relaxed text-ink-2")}
        >
          {text}
        </p>
      ) : (
        <p className="rounded-md border border-dashed border-line-2 px-4 py-3 text-[12.5px] text-ink-3">{t("platformConsole.prospects.detail.noMessage")}</p>
      )}
      {!editing && actions ? <div className="mt-2 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function CopyButton({ text, label, iconOnly = false }: { text: string; label?: string; iconOnly?: boolean }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("platformConsole.prospects.detail.copied"));
    } catch {
      toast.error(t("platformConsole.prospects.detail.copyFailed"));
    }
  };
  const name = label ? `${t("platformConsole.prospects.detail.copy")}: ${label}` : undefined;
  if (iconOnly) return <Button type="button" variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label={name ?? t("platformConsole.prospects.detail.copy")}>{copied ? <Check /> : <Copy />}</Button>;
  return <Button type="button" variant="secondary" size="sm" onClick={() => void copy()} aria-label={name}>{copied ? <Check /> : <Copy />}{t("platformConsole.prospects.detail.copy")}</Button>;
}

function ContactSection({ prospect }: { prospect: PlatformProspect }) {
  const t = useT();
  const { isolate } = useLocale();
  const f = useFormat(PLATFORM_TIMEZONE);
  const channels: Array<{ key: "phone" | "whatsapp" | "instagram" | "facebook" | "email"; icon: LucideIcon; value: string; href?: string; display?: string; copy?: boolean }> = [
    { key: "phone", icon: Phone, value: prospect.phone, href: prospect.phone ? phoneHref(prospect.phone) : undefined, copy: true },
    { key: "whatsapp", icon: MessageCircle, value: prospect.whatsapp, href: prospect.whatsapp ? whatsappHref(prospect.whatsapp) : undefined, copy: true },
    { key: "instagram", icon: Instagram, value: prospect.instagram, href: prospect.instagram || undefined, display: prospect.instagram ? instagramHandle(prospect.instagram) : undefined },
    { key: "facebook", icon: Facebook, value: prospect.facebook, href: prospect.facebook || undefined, display: t("platformConsole.prospects.detail.facebookPage") },
    { key: "email", icon: AtSign, value: prospect.email, href: prospect.email ? `mailto:${prospect.email}` : undefined, copy: true },
  ];
  const known = channels.filter((channel) => channel.value);
  const unknown = channels.filter((channel) => !channel.value).map((channel) => t(FIELD_KEYS[channel.key]));
  const evidence = EVIDENCE_COPY[prospect.evidence];
  const external = (href: string) => href.startsWith("http");

  return (
    <div className="grid gap-6 @2xl:grid-cols-2 @2xl:gap-0">
      <div className="min-w-0 @2xl:pe-6">
        {prospect.route ? <p dir="auto" className="text-[13px] text-ink-2">{t("platformConsole.prospects.detail.bestWay", { route: isolate(prospect.route) })}</p> : null}
        {known.length ? (
          <ul className={cn("divide-y divide-line rounded-md border border-line", prospect.route && "mt-3")}>
            {known.map((channel) => (
              <li key={channel.key} className="flex min-h-11 items-center gap-3 px-3 text-[13px]">
                <channel.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                <span className="w-[72px] shrink-0 text-[12.5px] text-ink-3">{t(FIELD_KEYS[channel.key])}</span>
                <a
                  href={channel.href}
                  dir="ltr"
                  className="min-w-0 truncate font-medium text-ink underline decoration-line-3 underline-offset-4 hover:decoration-ink"
                  {...(channel.href && external(channel.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  {channel.display ?? channel.value}
                </a>
                {channel.copy ? <span className="ms-auto"><CopyButton text={channel.value} label={t(FIELD_KEYS[channel.key])} iconOnly /></span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {unknown.length ? <p className="mt-2.5 text-[12.5px] text-ink-3">{t("platformConsole.prospects.detail.notKnown", { channels: unknown.join(", ") })}</p> : null}
      </div>

      <div className="min-w-0 border-t border-line pt-6 @2xl:border-s @2xl:border-t-0 @2xl:ps-6 @2xl:pt-0">
        <h3 className="text-[13px] font-semibold text-ink-2">{t("platformConsole.prospects.field.evidence")}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={evidence.tone} dot>{t(evidence.labelKey)}</Badge>
          {prospect.checkedOn ? <span className="text-[12px] text-ink-3">{t("platformConsole.prospects.detail.checkedOn", { date: f.date(prospect.checkedOn) })}</span> : null}
        </div>
        {prospect.contactNotes ? <p dir="auto" className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{prospect.contactNotes}</p> : null}
        {prospect.sources.length ? (
          <>
            <h3 className="mt-6 text-[13px] font-semibold text-ink-2">{t("platformConsole.prospects.detail.sources")}</h3>
            <ul className="mt-1.5 space-y-1.5">
              {prospect.sources.map((source) => (
                <li key={source}>
                  <a href={source} target="_blank" rel="noopener noreferrer" dir="ltr" className="inline-flex max-w-full items-center gap-1 text-[13px] text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink hover:decoration-ink">
                    <span className="truncate">{linkHost(source)}</span><ExternalLink className="size-3 shrink-0" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function changeLine(change: ProspectChange, t: TFunction, date: (iso: string) => string, isolate: (text: string) => string): string {
  const field = t(FIELD_KEYS[change.field]);
  if (!SHORT_VALUE_FIELDS.has(change.field)) return t("platformConsole.prospects.detail.historyEdited", { field });
  if (!change.to) return t("platformConsole.prospects.detail.historyCleared", { field });
  const value = (() => {
    switch (change.field) {
      case "stage": return change.to in STAGE_COPY ? t(STAGE_COPY[change.to as ProspectStage].labelKey) : change.to;
      case "batch": return change.to in BATCH_KEYS ? t(BATCH_KEYS[change.to as keyof typeof BATCH_KEYS]) : change.to;
      case "draftStatus": return change.to in DRAFT_STATUS_COPY ? t(DRAFT_STATUS_COPY[change.to as ProspectDraftStatus].labelKey) : change.to;
      case "evidence": return change.to in EVIDENCE_COPY ? t(EVIDENCE_COPY[change.to as keyof typeof EVIDENCE_COPY].labelKey) : change.to;
      case "followUpOn":
      case "checkedOn": return isValidCalendarDate(change.to) ? date(change.to) : change.to;
      default: return isolate(change.to);
    }
  })();
  return t("platformConsole.prospects.detail.historyChanged", { field, value });
}

function HistorySection({ prospectId }: { prospectId: string }) {
  const t = useT();
  const { isolate } = useLocale();
  const f = useFormat(PLATFORM_TIMEZONE);
  const history = useApiQuery(qk.platformProspectHistory(prospectId), (api) => api.listPlatformProspectHistory(prospectId));
  const headline = (entry: PlatformProspectHistoryEntry) => entry.action === "imported" ? [t("platformConsole.prospects.detail.historyImported")] : entry.action === "created" ? [t("platformConsole.prospects.detail.historyCreated")] : entry.changes.map((change) => changeLine(change, t, f.date, isolate));
  if (history.isLoading) return <div className="space-y-2" role="status" aria-label={t("platformConsole.prospects.detail.historyLoading")}><Skeleton className="h-4 w-4/5 max-w-md" /><Skeleton className="h-4 w-3/5 max-w-sm" /></div>;
  if (history.isError || !history.data) return <p className="text-[12.5px] text-ink-3" role="status">{t("platformConsole.prospects.detail.historyFailed")} <button type="button" className="font-medium text-ink underline underline-offset-4" onClick={() => void history.refetch()}>{t("platformConsole.shared.retry")}</button></p>;
  return (
    <ol className="max-w-2xl space-y-4 border-s border-line ps-4" data-testid="prospect-history">
      {history.data.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -start-[21px] top-1.5 size-2 rounded-full border border-line-3 bg-surface" aria-hidden />
          {(() => {
            const [title = "", ...rest] = headline(entry);
            return <ActivityEntry title={title} description={rest} actor={entry.actorName} occurredAt={entry.occurredAt} timeZone={PLATFORM_TIMEZONE} />;
          })()}
        </li>
      ))}
    </ol>
  );
}
