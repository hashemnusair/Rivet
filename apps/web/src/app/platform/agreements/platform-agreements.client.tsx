"use client";

import { Download, Eye, FileSignature, PenLine, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { PlatformAgreementSummary, ResendAgreementCopiesResult, SubscriptionAgreement } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { formatDateTime } from "@/lib/utils/dates";
import { AGREEMENT_COPY_RECIPIENTS } from "../../../../convex/legalAgreementText";
import { AgreementRecord } from "@/features/legal/agreement-record";
import { SignaturePad, type SignatureValue } from "@/features/legal/signature-pad";
import { flattenSignatureToJpeg } from "@/features/legal/signature-image";
import { downloadAgreementPdf } from "@/features/legal/agreement-pdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Platform console: every signed subscription agreement, with countersigning
 * and an audited reveal of the signatory's ID number.
 */
export function PlatformAgreements() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("agreement");
  const [selectedId, setSelectedId] = useState<string | null>(requested);
  const list = useApiQuery(qk.platformAgreements, (api) => api.listPlatformAgreements());

  useEffect(() => { if (requested) setSelectedId(requested); }, [requested]);

  if (list.isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div>;
  if (list.isError || !list.data) return <QueryErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const rows = list.data;
  const awaiting = rows.filter((row) => row.status === "signed").length;

  return (
    <div className="space-y-5" data-testid="platform-agreements">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="context-label">Legal</p>
          <h1 className="mt-1 font-display text-[26px] font-semibold tracking-tight">Subscription agreements</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-2">Every agreement a gym owner has signed in RIVET. Countersign to complete one; the signatory’s ID number stays masked until you reveal it with a reason.</p>
        </div>
        <Badge variant={awaiting > 0 ? "warning" : "success"} dot>{awaiting > 0 ? `${awaiting} awaiting countersignature` : "All countersigned"}</Badge>
      </header>

      {rows.length === 0 ? <EmptyState icon={FileSignature} title="No agreements signed yet" description="When a gym owner signs during onboarding, the agreement appears here for countersigning." /> : (
        <section className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gym</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-end">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-testid="platform-agreement-row">
                  <TableCell><span className="font-medium">{row.organizationName}</span><span className="block text-[11.5px] text-ink-3">{row.signatoryName}</span></TableCell>
                  <TableCell><span className="font-mono text-[12px]" dir="ltr">{row.reference}</span>{row.hashMatch ? null : <Badge variant="warning" className="ms-2">Fingerprint mismatch</Badge>}</TableCell>
                  <TableCell>{row.plan}{row.termMonths ? ` · ${row.termMonths}m` : ""}</TableCell>
                  <TableCell dir="ltr">{row.startDate}</TableCell>
                  <TableCell>{formatDateTime(row.signedAt)}</TableCell>
                  <TableCell><Badge variant={row.status === "countersigned" ? "success" : "warning"} dot>{row.status === "countersigned" ? "Countersigned" : "Awaiting RIVET"}</Badge></TableCell>
                  <TableCell className="text-end"><Button size="xs" variant="secondary" onClick={() => setSelectedId(row.id)} aria-label={`Open agreement ${row.reference}`}><Eye /> Open</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {selectedId ? <AgreementDialog agreementId={selectedId} summary={rows.find((row) => row.id === selectedId)} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

function AgreementDialog({ agreementId, summary, onClose }: { agreementId: string; summary?: PlatformAgreementSummary; onClose: () => void }) {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const detail = useApiQuery(qk.platformAgreement(agreementId), (api) => api.getPlatformAgreement(agreementId));
  const [title, setTitle] = useState("Co-founder");
  const [typedName, setTypedName] = useState(session?.user.name ?? "");
  const [revealReason, setRevealReason] = useState("");
  const [revealedId, setRevealedId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [countersignKey] = useState(() => newKey("countersign"));
  const [countersignature, setCountersignature] = useState<SignatureValue>({ method: "drawn" });
  const [replacing, setReplacing] = useState(false);
  const [includeSigner, setIncludeSigner] = useState(false);
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
    onSuccess: async () => { toast.success("Agreement countersigned. The signatory will receive the completed copy."); setReplacing(false); await invalidate([qk.platformAgreements, qk.platformAgreement(agreementId)]); },
    onError: (failure) => setError(isApiError(failure) ? failure.message : "Could not countersign."),
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
      if (sent > 0) toast.success(`Queued ${sent} ${sent === 1 ? "copy" : "copies"}. Delivery follows within a minute.`);
      else toast.error("Nothing was sent. Every copy was suppressed; the reason is shown below.");
    },
    onError: (failure) => setError(isApiError(failure) ? failure.message : "Could not re-send the copies."),
  });
  const reveal = useApiMutation((api) => api.revealPlatformAgreementId({ agreementId, reason: revealReason.trim() }), {
    onSuccess: async (result) => { setRevealedId(result.idNumber); await invalidate([qk.platformAgreement(agreementId)]); },
    onError: (failure) => setError(isApiError(failure) ? failure.message : "Could not reveal the ID number."),
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
          <DialogTitle>{summary ? `${summary.organizationName} · ${summary.reference}` : "Subscription agreement"}</DialogTitle>
          <DialogDescription>Countersigning completes the agreement and emails the signatory. Revealing the ID number is audited with your name and reason.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[70vh] space-y-4 overflow-y-auto">
          {detail.isLoading ? <Skeleton className="h-64 w-full" /> : detail.isError || !agreement ? <QueryErrorState error={detail.error} onRetry={() => void detail.refetch()} /> : (
            <>
              <AgreementRecord agreement={agreement} idNumberOverride={revealedId} />
              <div className="grid gap-4 md:grid-cols-2">
                <section className="panel space-y-3 p-4">
                  <p className="context-label">Reveal ID number</p>
                  <p className="text-[12px] text-ink-3">Revealed {agreement.idRevealCount} {agreement.idRevealCount === 1 ? "time" : "times"} so far. Each reveal is written to the platform audit trail.</p>
                  <Field label="Reason" required><Textarea rows={2} value={revealReason} onChange={(event) => setRevealReason(event.target.value)} placeholder="Verifying the signatory before countersigning" data-testid="reveal-reason" /></Field>
                  <Button variant="secondary" size="sm" disabled={revealReason.trim().length < 3} loading={reveal.isPending} onClick={() => reveal.mutate()} data-testid="reveal-id"><Eye /> Reveal ID number</Button>
                </section>
                <section className="panel space-y-3 p-4">
                  <p className="context-label">Countersign for RIVET</p>
                  {agreement.status === "countersigned" && !replacing ? (
                    <>
                      <p className="text-[12.5px] text-ink-2">Countersigned by {agreement.countersign?.byName} ({agreement.countersign?.title}) on {agreement.countersign ? formatDateTime(agreement.countersign.at) : ""}.</p>
                      <Button size="xs" variant="secondary" onClick={() => setReplacing(true)} data-testid="replace-countersignature"><PenLine /> Replace RIVET&apos;s signature</Button>
                    </>
                  ) : (
                    <>
                      {!agreement.hashMatch ? <p className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12px] text-warning-deep">The signer’s browser produced a different document fingerprint from RIVET’s copy. Review before countersigning.</p> : null}
                      {replacing ? <p className="text-[12px] text-ink-3">The new signature replaces the one on the record. The signatory receives a fresh completed copy, and the change is audited.</p> : null}
                      <Field label="Your role at RIVET" required><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
                      <Field label="Type your full name to confirm" required hint="Must match your RIVET account name exactly."><Input value={typedName} onChange={(event) => setTypedName(event.target.value)} data-testid="countersign-name" /></Field>
                      <Field label="Sign for RIVET" required><SignaturePad value={countersignature} onChange={setCountersignature} signatoryName={typedName} /></Field>
                      <Button size="sm" disabled={title.trim().length < 2 || typedName.trim().length < 2 || !countersignatureReady} loading={countersign.isPending} onClick={() => countersign.mutate()} data-testid="countersign"><PenLine /> {replacing ? "Replace the signature" : "Countersign"}</Button>
                      {replacing ? <Button size="xs" variant="ghost" onClick={() => setReplacing(false)}>Cancel</Button> : null}
                    </>
                  )}
                </section>
              </div>
              <section className="panel space-y-3 p-4" data-testid="agreement-copies">
                <p className="context-label">Send the copies again</p>
                <p className="text-[12px] text-ink-3">RIVET always receives a copy at {AGREEMENT_COPY_RECIPIENTS.join(" and ")}, with the agreement attached as a PDF. Use this when the first copies were suppressed, or after the record changed.</p>
                <label className="flex cursor-pointer items-start gap-3 text-[12.5px] text-ink-2">
                  <Checkbox checked={includeSigner} onCheckedChange={(checked) => setIncludeSigner(checked === true)} aria-label="Also send to the signatory" className="mt-0.5" />
                  <span>Also send to the signatory, <span dir="ltr">{agreement.signatory.email}</span></span>
                </label>
                <Button size="sm" variant="secondary" loading={resend.isPending} onClick={() => { setError(null); resend.mutate(); }} data-testid="resend-copies"><Send /> Send the copies</Button>
                {resent ? (
                  <ul className="space-y-1 text-[12px]" data-testid="resend-result">
                    {resent.deliveries.map((delivery) => (
                      <li key={delivery.recipient} className={delivery.status === "queued" ? "text-ink-2" : "text-warning-deep"}>
                        <span dir="ltr">{delivery.recipient}</span>: {delivery.status === "queued" ? "queued for delivery" : `not sent, ${delivery.reason ?? "suppressed"}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={!agreement} onClick={() => { if (agreement) downloadAgreementPdf(agreement); }} data-testid="download-agreement-pdf"><Download /> Download PDF</Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
