"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { Ban, Download, Eye, FileSignature, PenLine, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { localizeApiError } from "@/lib/api/errors";
import type { PlatformAgreementSummary, ResendAgreementCopiesResult, SubscriptionAgreement } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { AGREEMENT_COPY_RECIPIENTS } from "../../../../convex/legalAgreementText";
import { AgreementRecord } from "@/features/legal/agreement-record";
import { SignaturePad, type SignatureValue } from "@/features/legal/signature-pad";
import { flattenSignatureToJpeg } from "@/features/legal/signature-image";
import { downloadAgreementPdf } from "@/features/legal/agreement-pdf";
import { PageHeader } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isCalendarDate } from "@/lib/utils/dates";

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Platform console: every signed subscription agreement, with countersigning
 * and an audited reveal of the signatory's ID number.
 */
export function PlatformAgreements() {
  const t = useT();
  const f = useFormat();
  const searchParams = useSearchParams();
  const requested = searchParams.get("agreement");
  const [selectedId, setSelectedId] = useState<string | null>(requested);
  const list = useApiQuery(qk.platformAgreements, (api) => api.listPlatformAgreements());

  useEffect(() => { if (requested) setSelectedId(requested); }, [requested]);

  if (list.isLoading) return <PlatformPage><div className="space-y-3" role="status" aria-label={t("platformConsole.agreements.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></PlatformPage>;
  if (list.isError || !list.data) return <PlatformPage><QueryErrorState error={list.error} onRetry={() => void list.refetch()} /></PlatformPage>;
  const rows = list.data;
  const awaiting = rows.filter((row) => row.status === "signed").length;

  return (
    <PlatformPage className="space-y-5" data-testid="platform-agreements">
      <PageHeader
        title={t("platformConsole.agreements.title")}
        description={t("platformConsole.agreements.description")}
        actions={<Badge variant={awaiting > 0 ? "warning" : "success"} dot>{awaiting > 0 ? t("platformConsole.agreements.awaitingCount", { count: awaiting }) : t("platformConsole.agreements.allCountersigned")}</Badge>}
      />

      {rows.length === 0 ? <EmptyState layout="page" icon={FileSignature} title={t("platformConsole.agreements.noAgreements")} description={t("platformConsole.agreements.emptyDescription")} /> : (
        <PlatformPanel className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("shell.topbar.gym")}</TableHead>
                <TableHead>{t("platformConsole.agreements.reference")}</TableHead>
                <TableHead>{t("platformConsole.agreements.plan")}</TableHead>
                <TableHead>{t("platformConsole.agreements.starts")}</TableHead>
                <TableHead>{t("platformConsole.agreements.signed")}</TableHead>
                <TableHead>{t("common.label.status")}</TableHead>
                <TableHead className="text-end">{t("dashboard.today.action.open")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="platform-agreement-row">
                  <TableCell><span className="font-medium">{row.organizationName}</span><span className="block text-[12.5px] text-ink-3">{row.signatoryName}</span></TableCell>
                  <TableCell><span className="font-mono text-[12px]" dir="ltr">{row.reference}</span>{row.hashMatch ? null : <Badge variant="warning" className="ms-2">{t("platformConsole.agreements.fingerprintMismatch")}</Badge>}</TableCell>
                  <TableCell dir="auto">{row.plan}{row.termMonths ? ` · ${t("platformConsole.agreements.months", { count: row.termMonths })}` : ""}</TableCell>
                  <TableCell dir="auto">{isCalendarDate(row.startDate) ? f.date(row.startDate) : row.startDate || "—"}</TableCell>
                  <TableCell>{f.dateTime(row.signedAt)}</TableCell>
                  <TableCell><Badge variant={row.status === "void" ? "neutral" : row.status === "countersigned" ? "success" : "warning"} dot>{row.status === "void" ? t("platformConsole.agreements.statusVoid") : row.status === "countersigned" ? t("platformConsole.agreements.countersigned") : t("platformConsole.agreements.awaitingRivet")}</Badge></TableCell>
                  <TableCell className="text-end"><Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)} aria-label={t("platformConsole.agreements.openAgreement", { reference: row.reference })}><Eye />{" "}{t("dashboard.today.action.open")}</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PlatformPanel>
      )}

      {selectedId ? <AgreementDialog agreementId={selectedId} summary={rows.find((row) => row.id === selectedId)} onClose={() => setSelectedId(null)} /> : null}
    </PlatformPage>
  );
}

function AgreementDialog({ agreementId, summary, onClose }: { agreementId: string; summary?: PlatformAgreementSummary; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const { locale, isolate, isolateLtr } = useLocale();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const detail = useApiQuery(qk.platformAgreement(agreementId), (api) => api.getPlatformAgreement(agreementId));
  const [title, setTitle] = useState(() => t("platformConsole.agreements.defaultRivetRole"));
  const [typedName, setTypedName] = useState(session?.user.name ?? "");
  const [revealReason, setRevealReason] = useState("");
  const [revealedId, setRevealedId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [countersignKey] = useState(() => newKey("countersign"));
  const [countersignature, setCountersignature] = useState<SignatureValue>({ method: "drawn" });
  const [replacing, setReplacing] = useState(false);
  const [includeSigner, setIncludeSigner] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [resendKey, setResendKey] = useState(() => newKey("resend"));
  const [resent, setResent] = useState<ResendAgreementCopiesResult>();

  const countersign = useApiMutation((api) => api.countersignPlatformAgreement({
    agreementId,
    title: title.trim(),
    typedName: typedName.trim(),
    signature: countersignature.method === "drawn"
      ? { method: "drawn", imageDataUrl: countersignature.imageDataUrl, printImageDataUrl: countersignature.printImageDataUrl }
      : { method: "typed", typedName: countersignature.typedName?.trim() },
    replace: replacing,
    idempotencyKey: countersignKey,
  }), {
    onSuccess: async () => { toast.success(t("platformConsole.agreements.countersignedToast")); setReplacing(false); await invalidate([qk.platformAgreements, qk.platformAgreement(agreementId)]); },
    onError: (failure) => setError(localizeApiError(failure, locale).message || t("platformConsole.agreements.couldNotCountersign")),
  });
  const voidAgreement = useApiMutation((api) => api.voidPlatformAgreement({ agreementId, reason: voidReason.trim() }), {
    onSuccess: async () => { toast.success(t("platformConsole.agreements.voidedToast")); setVoiding(false); await invalidate([qk.platformAgreements, qk.platformAgreement(agreementId)]); },
    onError: (failure) => setError(localizeApiError(failure, locale).message || t("platformConsole.agreements.couldNotVoid")),
  });
  const attachPrint = useApiMutation((api, input: { target: "signatory" | "countersign"; printImageDataUrl: string }) => api.attachAgreementPrintSignature({ agreementId, ...input }), {
    onSuccess: async () => { await invalidate([qk.platformAgreement(agreementId)]); },
  });
  // Copies are re-rendered from the record as it stands, so a resend carries
  // the countersignature and the PDF even when the first attempt was
  // suppressed because sending was switched off.
  const resend = useApiMutation((api) => api.resendPlatformAgreementCopies({ agreementId, audience: includeSigner ? "all" : "rivet", idempotencyKey: resendKey }), {
    onSuccess: (result) => {
      setResent(result);
      setResendKey(newKey("resend"));
      const sent = result.deliveries.filter((delivery) => delivery.status === "queued").length;
      if (sent > 0) toast.success(t("platformConsole.agreements.copiesQueued", { count: sent }));
      else toast.error(t("platformConsole.agreements.copiesSuppressed"));
    },
    onError: (failure) => setError(localizeApiError(failure, locale).message || t("platformConsole.agreements.couldNotResend")),
  });
  const reveal = useApiMutation((api) => api.revealPlatformAgreementId({ agreementId, reason: revealReason.trim() }), {
    onSuccess: async (result) => { setRevealedId(result.idNumber); await invalidate([qk.platformAgreement(agreementId)]); },
    onError: (failure) => setError(localizeApiError(failure, locale).message || t("platformConsole.agreements.couldNotReveal")),
  });

  const agreement: SubscriptionAgreement | undefined = detail.data;
  const countersignatureReady = countersignature.method === "drawn" ? Boolean(countersignature.imageDataUrl) : Boolean(countersignature.typedName?.trim());

  // A signature captured before the PDF existed has no printable twin. This
  // browser can read the stored PNG, so it fills the gap once and the emailed
  // copies carry the real signature from then on.
  const backfilled = useRef(new Set<string>());
  useEffect(() => {
    if (!agreement) return;
    const targets: Array<{ target: "signatory" | "countersign"; signature?: { method: string; imageDataUrl?: string; printImageDataUrl?: string } }> = [
      { target: "signatory", signature: agreement.signature },
      { target: "countersign", signature: agreement.countersign?.signature },
    ];
    for (const { target, signature } of targets) {
      const key = `${agreement.id}:${target}`;
      if (backfilled.current.has(key)) continue;
      if (signature?.method !== "drawn" || !signature.imageDataUrl || signature.printImageDataUrl) continue;
      backfilled.current.add(key);
      void flattenSignatureToJpeg(signature.imageDataUrl).then((printImageDataUrl) => {
        if (printImageDataUrl) attachPrint.mutate({ target, printImageDataUrl });
      });
    }
  }, [agreement, attachPrint]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle dir="auto">{summary ? `${summary.organizationName} · ${summary.reference}` : t("platformConsole.agreements.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("platformConsole.agreements.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          {detail.isLoading ? <Skeleton className="h-64 w-full" /> : detail.isError || !agreement ? <QueryErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : (
            <>
              <AgreementRecord agreement={agreement} idNumberOverride={revealedId} />
              <div className="grid gap-4 md:grid-cols-2">
                <section className="panel space-y-3 p-4">
                  <p className="context-label">{t("platformConsole.agreements.revealId")}</p>
                  <p className="text-[12px] text-ink-3">{t("platformConsole.agreements.revealCount", { count: agreement.idRevealCount })}</p>
                  <Field label={t("common.label.reason")} required><Textarea rows={2} value={revealReason} onChange={(event) => setRevealReason(event.target.value)} placeholder={t("platformConsole.agreements.verifyingSignatory")} data-testid="reveal-reason" dir="auto" /></Field>
                  <Button variant="secondary" size="sm" disabled={revealReason.trim().length < 3} loading={reveal.isPending} onClick={() => reveal.mutate()} data-testid="reveal-id"><Eye /> {t("platformConsole.agreements.revealId")}</Button>
                </section>
                <section className="panel space-y-3 p-4">
                  <p className="context-label">{t("platformConsole.agreements.countersignForRivet")}</p>
                  {agreement.status === "countersigned" && !replacing ? (
                    <>
                      <p className="text-[12.5px] text-ink-2" dir="auto">{t("platformConsole.agreements.countersignedBy", { name: isolate(agreement.countersign?.byName ?? ""), title: isolate(agreement.countersign?.title ?? ""), date: agreement.countersign ? f.dateTime(agreement.countersign.at) : "" })}</p>
                      <Button size="xs" variant="secondary" onClick={() => setReplacing(true)} data-testid="replace-countersignature"><PenLine /> {t("platformConsole.agreements.replaceRivetSignature")}</Button>
                    </>
                  ) : (
                    <>
                      {!agreement.hashMatch ? <p className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12px] text-warning-deep">{t("platformConsole.agreements.signerFingerprintMismatch")}</p> : null}
                      {replacing ? <p className="text-[12px] text-ink-3">{t("platformConsole.agreements.replacementNotice")}</p> : null}
                      <Field label={t("platformConsole.agreements.roleAtRivet")} required><Input value={title} onChange={(event) => setTitle(event.target.value)} dir="auto" /></Field>
                      <Field label={t("platformConsole.agreements.typeFullName")} required hint={t("platformConsole.agreements.accountNameMatch")}><Input value={typedName} onChange={(event) => setTypedName(event.target.value)} data-testid="countersign-name" dir="auto" /></Field>
                      <Field label={t("platformConsole.agreements.signForRivet")} required><SignaturePad value={countersignature} onChange={setCountersignature} signatoryName={typedName} /></Field>
                      <Button size="sm" disabled={title.trim().length < 2 || typedName.trim().length < 2 || !countersignatureReady} loading={countersign.isPending} onClick={() => countersign.mutate()} data-testid="countersign"><PenLine /> {replacing ? t("platformConsole.agreements.replaceSignature") : t("platformConsole.agreements.countersign")}</Button>
                      {replacing ? <Button size="xs" variant="ghost" onClick={() => setReplacing(false)}>{t("common.action.cancel")}</Button> : null}
                    </>
                  )}
                </section>
              </div>
              <section className="panel space-y-3 p-4" data-testid="agreement-copies">
                <p className="context-label">{t("platformConsole.agreements.sendCopiesAgain")}</p>
                <p className="text-[12px] text-ink-3">{t("platformConsole.agreements.rivetAlwaysGetsCopy", { recipients: isolateLtr(AGREEMENT_COPY_RECIPIENTS.join(", ")) })}</p>
                <label className="flex cursor-pointer items-start gap-3 text-[12.5px] text-ink-2">
                  <Checkbox checked={includeSigner} onCheckedChange={(checked) => setIncludeSigner(checked === true)} aria-label={t("platformConsole.agreements.alsoSendToSigner")} className="mt-0.5" />
                  <span>{t("platformConsole.agreements.alsoSendToSigner")} <span dir="ltr">{agreement.signatory.email}</span></span>
                </label>
                <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => { setError(null); resend.mutate(); }} data-testid="resend-copies"><Send /> {t("platformConsole.agreements.sendCopies")}</Button>
                {resent ? (
                  <ul className="space-y-1 text-[12px]" data-testid="resend-result">
                    {resent.deliveries.map((delivery) => (
                      <li key={delivery.recipient} className={delivery.status === "queued" ? "text-ink-2" : "text-warning-deep"}>
                        <span dir="ltr">{delivery.recipient}</span>: <span dir="auto">{delivery.status === "queued" ? t("platformConsole.agreements.queuedForDelivery") : t("platformConsole.agreements.notSentReason", { reason: delivery.reason ?? t("platformConsole.emailLog.suppressed") })}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              {agreement.status === "void" ? (
                <p className="rounded-md border border-line bg-sunken/40 px-3 py-2 text-[12.5px] text-ink-2" data-testid="agreement-void-notice" dir="auto">{t("platformConsole.agreements.voidNotice", { date: agreement.voidedAt ? ` ${f.dateTime(agreement.voidedAt)}` : "", reason: agreement.voidReason ? `: ${isolate(agreement.voidReason)}` : "" })}</p>
              ) : (
                <section className="panel space-y-3 p-4" data-testid="agreement-void">
                  <p className="context-label">{t("platformConsole.agreements.retireAgreement")}</p>
                  <p className="text-[12px] text-ink-3">{t("platformConsole.agreements.voidExplanation")}</p>
                  {voiding ? (
                    <>
                      <Field label={t("common.label.reason")} required><Textarea rows={2} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder={t("platformConsole.agreements.voidReasonPlaceholder")} data-testid="void-reason" dir="auto" /></Field>
                      <div className="flex gap-2">
                        <Button size="sm" variant="danger" disabled={voidReason.trim().length < 3} loading={voidAgreement.isPending} onClick={() => { setError(null); voidAgreement.mutate(); }} data-testid="void-confirm"><Ban /> {t("platformConsole.agreements.voidAndResign")}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>{t("common.action.cancel")}</Button>
                      </div>
                    </>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setVoiding(true)} data-testid="void-agreement"><Ban /> {t("platformConsole.agreements.voidThis")}</Button>
                  )}
                </section>
              )}
              {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={!agreement} onClick={() => { if (agreement) downloadAgreementPdf(agreement); }} data-testid="download-agreement-pdf"><Download /> {t("platformConsole.agreements.downloadPdf")}</Button>
          <Button variant="secondary" onClick={onClose}>{t("common.action.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
