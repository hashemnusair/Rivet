"use client";
import { useT } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { ArrowUpRight, MessageSquareText, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState, StatePanel } from "@/components/ui/states";
import { getApi } from "@/lib/api/client";
import type { CreateSupportCaseInput, PlatformSupportCase, SupportPaymentRequest } from "@/lib/api/GymOSApi";
import { PaymentProgress } from "@/features/billing/payment-progress";
import { paymentNoteReference } from "../../../../convex/firstPayment";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { localizeApiError } from "@/lib/api/errors";

const STATUS_PRESENTATION: Record<PlatformSupportCase["status"], { key: "staffTools.support.status.open" | "staffTools.support.status.waiting" | "staffTools.support.status.resolved"; variant: "neutral" | "warning" | "success" }> = {
  open: { key: "staffTools.support.status.open", variant: "neutral" },
  waiting: { key: "staffTools.support.status.waiting", variant: "warning" },
  resolved: { key: "staffTools.support.status.resolved", variant: "success" },
};
const NATIVE_SELECT = "h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]";

function CaseStatusBadge({ status }: { status: PlatformSupportCase["status"] }) {
  const t = useT();
  const presentation = STATUS_PRESENTATION[status];
  return <Badge variant={presentation?.variant ?? "neutral"}>{presentation ? t(presentation.key) : String(status)}</Badge>;
}

export default function GymSupportPage() {
  const t = useT();
  const { locale, isolate } = useLocale();
  const format = useFormat();
  const { session } = useApp();
  const canChangePlan = session?.permissions?.includes("settings.manage") ?? false;
  const [cases, setCases] = useState<PlatformSupportCase[]>([]);
  // A notification or the operating brief may deep-link one case (`?case=`).
  const requestedCaseId = useSearchParams().get("case") ?? undefined;
  const [selectedId, setSelectedId] = useState<string | undefined>(requestedCaseId);
  useEffect(() => { if (requestedCaseId) setSelectedId(requestedCaseId); }, [requestedCaseId]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [retryToken, setRetryToken] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const selected = cases.find((supportCase) => supportCase.id === selectedId) ?? cases[0];

  useEffect(() => {
    setReplyBody("");
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const onError = (reason: unknown) => {
      if (cancelled) return;
      setError(reason instanceof Error ? localizeApiError(reason, locale).message : t("staffTools.support.loadError"));
      setLoading(false);
    };
    void getApi().subscribeSupportCases((next) => {
      if (cancelled) return;
      setCases(next);
      setError(undefined);
      setLoading(false);
    }, onError).then((disposer) => { if (cancelled) disposer(); else unsubscribe = disposer; }).catch(onError);
    return () => { cancelled = true; unsubscribe?.(); };
  }, [retryToken, locale, t]);

  const messages = selected?.messages ?? [];
  const creator = selected?.creatorName ?? selected?.creatorEmail;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("dashboard.today.kind.support_case")}
        description={t("staffTools.support.description")}
        actions={<div className="flex flex-wrap gap-2">{canChangePlan ? <Button asChild variant="secondary"><Link href="/settings?section=subscription&change=plan"><ArrowUpRight className="rtl:-scale-x-100" aria-hidden />{t("commerce.plans.change")}</Link></Button> : null}<Button onClick={() => setCreateOpen(true)}><Plus />{t("staffTools.support.askForHelp")}</Button></div>}
      />
      {error ? <ErrorState title={t("staffTools.support.loadErrorTitle")} description={error} onRetry={() => { setError(undefined); setLoading(true); setRetryToken((value) => value + 1); }} /> : null}
      <section className="panel grid min-h-[540px] overflow-hidden lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label={t("staffTools.support.yourRequests")}>
          <div className="border-b border-line px-4 py-3"><p className="context-label">{t("staffTools.support.yourRequests")}</p></div>
          {loading ? <div className="space-y-3 p-4" role="status" aria-label={t("staffTools.support.loading")}><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : cases.length === 0 ? <EmptyState title={t("staffTools.support.noRequests")} description={t("staffTools.support.noRequestsDescription")} compact className="m-3 border-0" /> : (
            <div className="divide-y divide-line">{cases.map((item) => <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)} className={cn("w-full px-4 py-3 text-start transition-colors hover:bg-sunken/60 cursor-pointer", selected?.id === item.id && "bg-sunken")}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-ink-3" dir="ltr">{item.id}</span><CaseStatusBadge status={item.status} /></div><p className="mt-1.5 text-[13px] font-semibold">{caseSubject(item, t, isolate)}</p><p className="mt-0.5 text-[12px] text-ink-3">{item.priority === "urgent" ? `${t("staffTools.support.urgent")} · ` : ""}{item.updatedAt || item.createdAt ? format.dateTime(item.updatedAt ?? item.createdAt) : t("staffTools.support.creationNotRecorded")}</p></button>)}</div>
          )}
        </aside>
        {!selected ? <div className="flex items-center justify-center p-8 text-center"><div><MessageSquareText className="mx-auto size-6 text-ink-3" aria-hidden /><p className="mt-3 text-[13px] font-medium">{t("staffTools.support.chooseOrAsk")}</p></div></div> : (
          <article className="flex min-w-0 flex-col" aria-label={caseSubject(selected, t, isolate)}>
            <header className="border-b border-line px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">{selected.priority === "urgent" ? <Badge variant="signal">{t("staffTools.support.urgent")}</Badge> : <Badge variant="outline">{t("staffTools.support.normalPriority")}</Badge>}<CaseStatusBadge status={selected.status} /><span className="font-mono text-[11px] text-ink-3" dir="ltr">{selected.id}</span></div>
              <h2 className="mt-2 text-[17px] font-semibold">{caseSubject(selected, t, isolate)}</h2>
              <p className="mt-1 text-[12px] text-ink-3">{selected.createdAt ? t("staffTools.support.created", { date: format.dateTime(selected.createdAt) }) : t("staffTools.support.creationNotRecorded")}{creator ? ` · ${t("staffTools.support.by")} ${creator}` : ""}{selected.branchName ? ` · ${selected.branchName}` : ""}</p>
            </header>
            <div className="flex flex-1 flex-col gap-3 bg-paper/40 p-4 sm:p-5">
              {selected.billing ? <PaymentRequest request={selected.billing} /> : null}
              {messages.length === 0 && !selected.body && !selected.billing ? <StatePanel icon={MessageSquareText} title={t("staffTools.support.noReplies")} description={t("staffTools.support.repliesAppear")} compact className="border-0 bg-transparent" /> : null}
              {messages.length === 0 && selected.body && !selected.billing ? <div className="me-auto max-w-[82%] rounded-md border border-line bg-surface p-3.5"><div className="flex justify-between gap-5"><p className="text-[12px] font-semibold">{creator ?? t("staffTools.support.gymLabel")}</p><span className="text-[12px] text-ink-3">{selected.createdAt ? format.dateTime(selected.createdAt) : t("staffTools.support.creationNotRecorded")}</span></div><p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{selected.body}</p></div> : null}
              {messages.map((message) => <div key={message.id} className={cn("max-w-[82%] rounded-md border p-3.5", message.authorType === "gym" ? "me-auto border-line bg-surface" : "ms-auto border-line-2 bg-sunken")}><div className="flex justify-between gap-5"><p className="text-[12px] font-semibold">{message.authorName}</p><time className="text-[12px] text-ink-3">{format.dateTime(message.createdAt)}</time></div><p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{message.body}</p></div>)}
              {selected.resolutionSummary && !selected.billing ? <div className="rounded-md border border-success/25 bg-success-bg p-3.5"><p className="context-label text-success-deep">{t("staffTools.support.solution")}</p><p className="mt-1.5 text-[13px] text-ink-2">{selected.resolutionSummary}</p></div> : null}
            </div>
            {selected.status === "resolved" ? <div className="border-t border-line bg-surface px-5 py-4 text-[12.5px] text-ink-3">{t("staffTools.support.solved")}</div> : (
              <form className="border-t border-line bg-surface p-4" onSubmit={(event) => { event.preventDefault(); if (!replyBody.trim() || replying) return; setReplying(true); void getApi().replyToSupportCase(selected.id, replyBody.trim()).then((updated) => { setCases((current) => current.map((item) => item.id === updated.id ? updated : item)); setReplyBody(""); toast.success(t("staffTools.support.replySent")); }).catch((reason) => toast.error(reason instanceof Error ? localizeApiError(reason, locale).message : t("staffTools.support.replyFailed"))).finally(() => setReplying(false)); }}>
                <Field label={t("staffTools.support.replyLabel")}><Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={t("staffTools.support.replyPlaceholder")} className="min-h-20" /></Field>
                <div className="mt-3 flex justify-end"><Button type="submit" loading={replying} disabled={!replyBody.trim()}><Send />{t("staffTools.support.sendReply")}</Button></div>
              </form>
            )}
          </article>
        )}
      </section>
      <CreateSupportDialog open={createOpen} onOpenChange={setCreateOpen} email={session?.user.email ?? ""} branches={session?.branches ?? []} onCreated={(supportCase) => { setSelectedId(supportCase.id); setCreateOpen(false); }} />
    </div>
  );
}

function CreateSupportDialog({ open, onOpenChange, email, branches, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; email: string; branches: Array<{ id: string; name: string }>; onCreated: (supportCase: PlatformSupportCase) => void }) {
  const t = useT();
  const { locale } = useLocale();
  const [contactEmail, setContactEmail] = useState(email);
  const [branchId, setBranchId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<CreateSupportCaseInput["priority"]>("normal");
  const [saving, setSaving] = useState(false);
  const canSubmit = Boolean(contactEmail.trim() && subject.trim() && body.trim());
  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const created = await getApi().createSupportCase({ email: contactEmail.trim(), branchId: branchId || undefined, subject: subject.trim(), body: body.trim(), priority, requestType: "general" });
      setSubject(""); setBody(""); setBranchId(""); setPriority("normal");
      onCreated(created);
      toast.success(t("staffTools.support.requestSent"));
    } catch (error) { toast.error(error instanceof Error ? localizeApiError(error, locale).message : t("staffTools.support.requestFailed")); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("staffTools.support.createTitle")}</DialogTitle>
          <DialogDescription>{t("staffTools.support.createDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label={t("staffTools.support.contactEmail")}><Input type="email" inputMode="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></Field>
          <Field label={t("staffTools.support.branchOptional")}><select className={NATIVE_SELECT} value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">{t("staffTools.support.wholeGym")}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
          <Field label={t("staffTools.support.priority")}><select className={NATIVE_SELECT} value={priority} onChange={(event) => setPriority(event.target.value as CreateSupportCaseInput["priority"])}><option value="normal">{t("staffTools.support.normalPriority")}</option><option value="urgent">{t("staffTools.support.urgent")}</option></select></Field>
          <Field label={t("staffTools.support.subject")}><Input value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
          <Field label={t("memberProfile.contact.whatHappened")}><Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-32" /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button loading={saving} disabled={!canSubmit} onClick={() => void submit()}><Send />{t("staffTools.support.sendToRivet")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The title a request shows: a payment the gym sent is named in the reader's language. */
function caseSubject(supportCase: PlatformSupportCase, t: ReturnType<typeof useT>, isolate: (value: string) => string): string {
  const billing = supportCase.billing;
  if (!billing) return supportCase.subject;
  return billing.planTo ? t("commerce.plans.pendingTitle", { plan: isolate(billing.planTo) }) : t("staffTools.support.paymentFor", { id: isolate(paymentNoteReference(billing.invoiceId)) });
}

/** A payment the gym sent, followed from sent to confirmed. */
function PaymentRequest({ request }: { request: SupportPaymentRequest }) {
  const { t } = useLocale();
  if (request.state === "cancelled") return <p className="rounded-md border border-line bg-surface p-3.5 text-[13px] text-ink-2">{t("commerce.progress.cancelled")}</p>;
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <PaymentProgress state={request.state} outcome={request.planTo ? { kind: "upgrade", plan: request.planTo } : { kind: "paid" }} returnReason={request.returnReason} />
      {request.state === "returned" ? <Button asChild size="sm" className="mt-4"><Link href="/billing">{t("commerce.checkout.form.update")}</Link></Button> : null}
    </div>
  );
}
